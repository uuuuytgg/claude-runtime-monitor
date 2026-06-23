import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import db, { initDb, cleanupOld } from './db.js';
import { getSnapshot, setSnapshot } from './routes/internal.js';
import { reduce } from '@crm/state-engine';
import { broadcast } from './ws.js';
import { pollLatestRequest } from './cc-switch-poller.js';
import healthRoutes from './routes/health.js';
import wsRoutes from './ws.js';
import { execSync } from 'node:child_process';

const fastify = Fastify({ logger: true });
let lastCcSwitchRequestId: string | null = null;
let isClaudeProcessAlive = false;

function checkClaudeProcess(): boolean {
  try {
    // Claude Code runs as claude.exe on Windows
    const stdout = execSync('tasklist /NH /FI "IMAGENAME eq claude.exe"', {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
    });
    // tasklist returns "INFO: No tasks are running..." when not found
    return !stdout.includes('No tasks');
  } catch {
    return false;
  }
}

function persistRuntimeEvent(event: NonNullable<ReturnType<typeof reduce>['event']>): void {
  const lastEvent = db.prepare(
    'SELECT source, type, title FROM runtime_events ORDER BY id DESC LIMIT 1'
  ).get() as { source: string; type: string; title: string } | undefined;
  if (
    lastEvent
    && event.source === 'system'
    && event.type === 'session_end'
    && event.title === 'Claude 已离线'
    && lastEvent.source === event.source
    && lastEvent.type === event.type
    && lastEvent.title === event.title
  ) {
    return;
  }

  db.prepare(
    'INSERT INTO runtime_events (source, type, title, detail, severity, raw) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    event.source,
    event.type,
    event.title,
    event.detail || null,
    event.severity,
    JSON.stringify(event.raw ?? {}),
  );
}

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);

  initDb();
  cleanupOld();

  await fastify.register(healthRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(import('./routes/internal.js'));
  await fastify.register(import('./routes/quota.js'));
  await fastify.register(import('./routes/snapshot.js'));
  await fastify.register(import('./routes/watch.js'));
  await fastify.register(import('./routes/codex-pets.js'));

  // Serve built web dashboard as static files
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { dirname } = await import('node:path');
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const distPath = join(serverDir, '..', '..', 'web', 'dist');
  if (existsSync(distPath)) {
    await fastify.register(import('@fastify/static'), {
      root: distPath,
      prefix: '/',
    });
    fastify.setNotFoundHandler((req, reply) => {
      reply.sendFile('index.html');
    });
    console.log(`Static files served from ${distPath}`);
  }

  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    try {
      await fastify.close();
      db.close();
      fastify.log.info('Server closed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error('Error during shutdown: ' + message);
    }
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await fastify.listen({ host: config.host, port: config.port });
  console.log(`CRM Server running on http://${config.host}:${config.port}`);

  // Auto-fetch all configured providers on startup
  setTimeout(() => {
    fetch(`http://127.0.0.1:${config.port}/api/quota/fetch-all`).catch(() => {});
    setTimeout(() => {
      fetch(`http://127.0.0.1:${config.port}/api/quota/fetch-all`).catch(() => {});
    }, 2000);
  }, 500);

  // Main poller: every 10s, check Claude process + update cc-switch data
  setInterval(() => {
    const processAlive = checkClaudeProcess();

    if (processAlive) {
      // Claude process is running → ensure online
      isClaudeProcessAlive = true;
      const snapshot = getSnapshot();
      if (!snapshot.runtime.online || snapshot.runtime.state === 'offline') {
        snapshot.runtime.online = true;
        snapshot.runtime.state = 'idle';
        snapshot.runtime.severity = 'info';
        snapshot.animation.coreState = 'breathing';
        snapshot.animation.intensity = 0.3;
        setSnapshot(snapshot);
        broadcast({ type: 'snapshot', data: snapshot });
      }
    } else {
      // Claude process is gone → mark offline (once)
      if (isClaudeProcessAlive) {
        isClaudeProcessAlive = false;
        const prev = getSnapshot();
        const { snapshot: next } = reduce(prev, {
          _tag: 'claude_inactive',
          reason: 'Claude Code process exited',
        });
        setSnapshot(next);
        broadcast({ type: 'snapshot', data: next });
      }
      return; // skip cc-switch poll when Claude is not running
    }

    // --- cc-switch data updates ---
    const data = pollLatestRequest();
    if (!data.available) return;

    const requestId = data.requestId || data.requestCreatedAt;
    const isNewRequest = !!requestId && requestId !== lastCcSwitchRequestId;
    const prev = getSnapshot();
    const { snapshot: next, event } = reduce(prev, {
      _tag: 'ccswitch_poll',
      model: data.model || undefined,
      contextUsed: data.contextUsed ?? undefined,
      contextMax: data.contextMax ?? undefined,
      cost: data.cost || undefined,
      sessionCostTotal: data.sessionCostTotal || undefined,
      sessionId: data.sessionId || undefined,
      requestId: isNewRequest ? data.requestId || undefined : undefined,
      requestCreatedAt: isNewRequest ? data.requestCreatedAt || undefined : undefined,
      requestsInSession: data.requestsInSession,
    });
    setSnapshot(next);
    broadcast({ type: 'snapshot', data: next });
    if (isNewRequest && event) {
      lastCcSwitchRequestId = requestId;
      persistRuntimeEvent(event);
      broadcast({ type: 'event', data: event });
    }
  }, 10_000);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
