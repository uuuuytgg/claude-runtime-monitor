import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authInternal } from '../auth.js';
import { handleHook, handleStatusline } from '@crm/claude-collector';
import { createInitialSnapshot } from '@crm/state-engine';
import type { MonitorSnapshot } from '@crm/shared';
import { broadcast } from '../ws.js';
import db from '../db.js';

// In-memory snapshot (single user, local-first)
let currentSnapshot: MonitorSnapshot = createInitialSnapshot();
export function getSnapshot(): MonitorSnapshot { return currentSnapshot; }
export function setSnapshot(s: MonitorSnapshot) { currentSnapshot = s; }

export default async function internalRoutes(fastify: FastifyInstance) {
  // Reject non-localhost requests without internal token
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authInternal(req)) {
      reply.code(403).send({ error: 'internal access only' });
    }
  });

  fastify.post('/internal/claude/hook', async (req, reply) => {
    // Instantly recover from terminal states — no waiting for poller tick
    const terminalStates = new Set(['offline', 'completed']);
    if (!currentSnapshot.runtime.online || terminalStates.has(currentSnapshot.runtime.state)) {
      currentSnapshot.runtime.online = true;
      currentSnapshot.runtime.state = 'idle';
      currentSnapshot.runtime.severity = 'info';
      currentSnapshot.animation.coreState = 'breathing';
      currentSnapshot.animation.intensity = 0.3;
    }
    const result = handleHook(req.body, currentSnapshot);
    if ('error' in result) {
      return reply.code(400).send({ error: result.error });
    }
    currentSnapshot = result.result.snapshot;

    if (result.result.event) {
      db.prepare(
        'INSERT INTO runtime_events (source, type, title, detail, severity, raw) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        result.result.event.source,
        result.result.event.type,
        result.result.event.title,
        result.result.event.detail || null,
        result.result.event.severity,
        JSON.stringify(result.result.event.raw ?? {}),
      );
    }
    broadcast({ type: 'snapshot', data: currentSnapshot });
    if (result.result.event) {
      broadcast({ type: 'event', data: result.result.event });
    }
    return { ok: true };
  });

  fastify.post('/internal/claude/statusline', async (req, reply) => {
    // Instantly recover from terminal states — no waiting for poller tick
    const terminalStates = new Set(['offline', 'completed']);
    if (!currentSnapshot.runtime.online || terminalStates.has(currentSnapshot.runtime.state)) {
      currentSnapshot.runtime.online = true;
      currentSnapshot.runtime.state = 'idle';
      currentSnapshot.runtime.severity = 'info';
      currentSnapshot.animation.coreState = 'breathing';
      currentSnapshot.animation.intensity = 0.3;
    }
    const result = handleStatusline(req.body, currentSnapshot);
    if ('error' in result) {
      return reply.code(400).send({ error: result.error });
    }
    currentSnapshot = result.result.snapshot;
    currentSnapshot.runtime.online = true;
    broadcast({ type: 'snapshot', data: currentSnapshot });
    return { ok: true };
  });

  fastify.post('/internal/deepseek/usage', async (req, reply) => {
    const body = req.body as any;
    db.prepare(
      'INSERT INTO api_usage_records (provider, model, tokens_in, tokens_out, cost) VALUES (?, ?, ?, ?, ?)'
    ).run('deepseek', body.model || null, body.tokensIn || 0, body.tokensOut || 0, body.cost || null);
    return { ok: true };
  });

  // Quota 同步：每次 snapshot 请求时从 DB 读取最新余额（任意 provider）
  fastify.get('/internal/sync-quota', async () => {
    const row = db.prepare(
      'SELECT provider, balance, status, currency, created_at FROM quota_snapshots ORDER BY created_at DESC LIMIT 1'
    ).get() as any;
    if (row) {
      currentSnapshot.quota = {
        provider: row.provider,
        balance: row.balance,
        status: row.status,
        lastUpdated: row.created_at,
        currency: row.currency || 'CNY',
      };
    }
    return { ok: true };
  });
}
