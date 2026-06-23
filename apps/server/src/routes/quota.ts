import { FastifyInstance } from 'fastify';
import { fetchBalanceWithRetry, fetchGenericBalanceWithRetry, fetchMimoBalance, MIMO_PRICING } from '@crm/quota-providers';
import type { ProviderConfig } from '@crm/quota-providers';
import path from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { config } from '../config.js';
import db from '../db.js';
import { getSnapshot, setSnapshot } from './internal.js';

const require = createRequire(import.meta.url);

/** Seed the DeepSeek provider from env var if no DB entry exists */
function seedDeepSeekFromEnv(): void {
  if (!config.deepseekApiKey) return;
  const existing = db.prepare('SELECT id FROM provider_api_keys WHERE provider = ?').get('deepseek');
  if (!existing) {
    db.prepare(
      'INSERT INTO provider_api_keys (provider, api_key, label, base_url, balance_endpoint) VALUES (?, ?, ?, ?, ?)'
    ).run('deepseek', config.deepseekApiKey, 'DeepSeek', 'https://api.deepseek.com', '/user/balance');
    console.log('[quota] Seeded DeepSeek provider from DEEPSEEK_API_KEY env var');
  }
}

/** Seed Xiaomi Mimo provider from cc-switch DB if no DB entry exists and not blacklisted */
function seedMimoFromCcSwitch(): void {
  // Check seed blacklist first — if user explicitly deleted this provider, don't re-seed
  const blacklisted = db.prepare('SELECT provider FROM seed_blacklist WHERE provider = ?').get('xiaomi-mimo');
  if (blacklisted) {
    console.log('[quota] Xiaomi MiMo is blacklisted from auto-seed, skipping');
    return;
  }

  const existing = db.prepare('SELECT id FROM provider_api_keys WHERE provider = ?').get('xiaomi-mimo');
  if (existing) return;

  try {
    const ccSwitchDb = require('path').join(process.env.USERPROFILE || '', '.cc-switch', 'cc-switch.db');
    const { existsSync } = require('fs');
    if (!existsSync(ccSwitchDb)) return;

    const Database = require('better-sqlite3');
    const ccDb = new Database(ccSwitchDb, { readonly: true });

    // Find provider by name containing "mimo" or "MiMo", or by endpoint URL
    const provider = ccDb.prepare(
      `SELECT id, name, settings_config FROM providers WHERE name LIKE '%MiMo%' OR name LIKE '%mimo%' ORDER BY created_at DESC LIMIT 1`
    ).get() as any;

    // Also check endpoints for base URL
    let baseUrl = 'https://api.xiaomimimo.com/v1';
    let apiKey = '';

    if (provider) {
      try {
        const settings = JSON.parse(provider.settings_config || '{}');
        apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN || settings.env?.MIMO_API_KEY || '';
      } catch {}

      const endpoint = ccDb.prepare(
        "SELECT url FROM provider_endpoints WHERE provider_id = ? AND url LIKE '%xiaomimimo%' LIMIT 1"
      ).get(provider.id) as any;
      if (endpoint?.url) baseUrl = endpoint.url;
    }

    ccDb.close();

    if (!apiKey) return; // No key found, skip seeding

    db.prepare(
      'INSERT INTO provider_api_keys (provider, api_key, label, base_url, balance_endpoint) VALUES (?, ?, ?, ?, ?)'
    ).run('xiaomi-mimo', apiKey, 'Xiaomi MiMo', baseUrl, '/user/balance');
    console.log(`[quota] Seeded Xiaomi MiMo provider from cc-switch (baseUrl: ${baseUrl})`);
  } catch (err) {
    console.warn('[quota] Could not seed MiMo from cc-switch:', (err as Error).message);
  }
}

/** Load all provider configs from DB */
function loadAllProviders(): ProviderConfig[] {
  const rows = db.prepare('SELECT provider, api_key, base_url, balance_endpoint FROM provider_api_keys').all() as any[];
  return rows.map(r => ({
    provider: r.provider,
    apiKey: r.api_key,
    baseUrl: r.base_url || undefined,
    balanceEndpoint: r.balance_endpoint || undefined,
  }));
}

/** Load a single provider config from DB */
function loadProvider(provider: string): ProviderConfig | null {
  const row = db.prepare('SELECT provider, api_key, base_url, balance_endpoint FROM provider_api_keys WHERE provider = ?').get(provider) as any;
  if (!row) return null;
  return {
    provider: row.provider,
    apiKey: row.api_key,
    baseUrl: row.base_url || undefined,
    balanceEndpoint: row.balance_endpoint || undefined,
  };
}

/** Persist a quota fetch result into quota_snapshots and sync to in-memory snapshot */
function persistQuota(quota: { provider: string; balance: string | null; status: string; currency: string }, raw: any): void {
  db.prepare(
    'INSERT INTO quota_snapshots (provider, balance, status, currency, raw) VALUES (?, ?, ?, ?, ?)'
  ).run(quota.provider, quota.balance, quota.status, quota.currency, JSON.stringify(raw));

  // Sync to in-memory snapshot (the most recently fetched provider)
  const snap = getSnapshot();
  snap.quota = {
    provider: quota.provider,
    balance: quota.balance,
    status: quota.status as any,
    lastUpdated: new Date().toISOString(),
    currency: quota.currency,
  };
  setSnapshot(snap);
}

/** Fetch balance for a given provider config, using the specialized DeepSeek fetcher when appropriate */
async function fetchForProvider(cfg: ProviderConfig) {
  // Use the specialized DeepSeek fetcher for 'deepseek' provider with the official base URL
  if (cfg.provider === 'deepseek' && (!cfg.baseUrl || cfg.baseUrl.includes('api.deepseek.com'))) {
    return fetchBalanceWithRetry(cfg.apiKey);
  }
  // Xiaomi Mimo: tries balance API first, falls back to cc-switch usage tracking
  if (cfg.provider === 'xiaomi-mimo' || cfg.baseUrl?.includes('xiaomimimo.com')) {
    return fetchMimoWithCcSwitchFallback(cfg.apiKey);
  }
  return fetchGenericBalanceWithRetry(cfg);
}

/** Xiaomi Mimo: try balance API, then fall back to cc-switch proxy_request_logs for usage tracking */
async function fetchMimoWithCcSwitchFallback(apiKey: string): Promise<{ quota: any; raw: any }> {
  // Try balance API
  const balanceResult = await fetchMimoBalance(apiKey);
  if (balanceResult) return balanceResult;

  // Fallback: read usage from cc-switch DB
  const ccSwitchDbPath = path.join(process.env.USERPROFILE || '', '.cc-switch', 'cc-switch.db');
  if (!existsSync(ccSwitchDbPath)) {
    return {
      quota: { provider: 'xiaomi-mimo', balance: null, status: 'unknown', lastUpdated: new Date().toISOString(), currency: 'CNY' },
      raw: { error: 'cc-switch DB not available' },
    };
  }

  try {
    const Database = require('better-sqlite3');
    const ccDb = new Database(ccSwitchDbPath, { readonly: true });

    // Use official MIMO_PRICING (CNY per million tokens)
    const pricing: Record<string, { input: number; output: number; cacheRead: number }> = {};
    for (const [k, v] of Object.entries(MIMO_PRICING)) {
      (pricing as any)[k] = v;
    }

    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const logs = ccDb.prepare(
      `SELECT model, input_tokens, output_tokens, cache_read_tokens, created_at
       FROM proxy_request_logs
       WHERE model LIKE 'mimo%' AND created_at >= ?
       ORDER BY created_at ASC`
    ).all(since) as any[];
    ccDb.close();

    if (logs.length === 0) {
      return {
        quota: { provider: 'xiaomi-mimo', balance: '¥0.00', status: 'ok', lastUpdated: new Date().toISOString(), currency: 'CNY' },
        raw: { type: 'usage_tracking', totalCost: 0, requestCount: 0 },
      };
    }

    let totalCost = 0;
    const breakdown: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number }> = {};

    for (const log of logs) {
      const p = pricing[log.model] || (MIMO_PRICING as any)['mimo-v2.5-pro'] || { input: 3.15, output: 6.3, cacheRead: 0.026 };
      const rowCost = (log.input_tokens || 0) / 1e6 * p.input
                    + (log.output_tokens || 0) / 1e6 * p.output
                    + (log.cache_read_tokens || 0) / 1e6 * p.cacheRead;
      totalCost += rowCost;
      if (!breakdown[log.model]) breakdown[log.model] = { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
      breakdown[log.model].cost += rowCost;
      breakdown[log.model].requests += 1;
      breakdown[log.model].inputTokens += log.input_tokens || 0;
      breakdown[log.model].outputTokens += log.output_tokens || 0;
    }

    const spendStr = `¥${(Math.round(totalCost * 100) / 100).toFixed(2)}`;
    return {
      quota: { provider: 'xiaomi-mimo', balance: spendStr, status: 'ok', lastUpdated: new Date().toISOString(), currency: 'CNY' },
      raw: { type: 'usage_tracking', totalCostCny: Math.round(totalCost * 100) / 100, requestCount: logs.length, modelBreakdown: breakdown },
    };
  } catch (err) {
    return {
      quota: { provider: 'xiaomi-mimo', balance: null, status: 'error', lastUpdated: new Date().toISOString(), currency: 'CNY' },
      raw: { error: (err as Error).message },
    };
  }
}

export default async function quotaRoutes(fastify: FastifyInstance) {
  seedDeepSeekFromEnv();
  seedMimoFromCcSwitch();

  // ── GET /api/quota/providers — list all configured providers with latest snapshot ──
  fastify.get('/api/quota/providers', async () => {
    const providers = db.prepare(
      'SELECT provider, label, base_url, balance_endpoint, created_at, updated_at FROM provider_api_keys ORDER BY provider'
    ).all() as any[];

    const enriched = providers.map(p => {
      const snap = db.prepare(
        'SELECT balance, status, currency, created_at FROM quota_snapshots WHERE provider = ? ORDER BY created_at DESC LIMIT 1'
      ).get(p.provider) as any;
      return {
        provider: p.provider,
        label: p.label,
        baseUrl: p.base_url,
        balanceEndpoint: p.balance_endpoint,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        latestBalance: snap ? { balance: snap.balance, status: snap.status, currency: snap.currency, fetchedAt: snap.created_at } : null,
      };
    });

    return { providers: enriched };
  });

  // ── POST /api/quota/providers — add or update a provider ──
  fastify.post('/api/quota/providers', async (req, reply) => {
    const body = req.body as any;
    const { provider, apiKey, label, baseUrl, balanceEndpoint } = body;

    if (!provider || !apiKey) {
      return reply.code(400).send({ error: 'provider and apiKey are required' });
    }

    const existing = db.prepare('SELECT id FROM provider_api_keys WHERE provider = ?').get(provider);
    if (existing) {
      db.prepare(
        "UPDATE provider_api_keys SET api_key = ?, label = ?, base_url = ?, balance_endpoint = ?, updated_at = datetime('now') WHERE provider = ?"
      ).run(apiKey, label || null, baseUrl || null, balanceEndpoint || null, provider);
      // Remove from seed blacklist if manually re-added
      db.prepare('DELETE FROM seed_blacklist WHERE provider = ?').run(provider);
    } else {
      db.prepare(
        'INSERT INTO provider_api_keys (provider, api_key, label, base_url, balance_endpoint) VALUES (?, ?, ?, ?, ?)'
      ).run(provider, apiKey, label || null, baseUrl || null, balanceEndpoint || null);
      // Remove from seed blacklist if manually re-added
      db.prepare('DELETE FROM seed_blacklist WHERE provider = ?').run(provider);
    }

    return { ok: true, provider, action: existing ? 'updated' : 'created' };
  });

  // ── DELETE /api/quota/providers/:provider — remove a provider and blacklist from re-seeding ──
  fastify.delete('/api/quota/providers/:provider', async (req, reply) => {
    const { provider } = req.params as any;
    const result = db.prepare('DELETE FROM provider_api_keys WHERE provider = ?').run(provider);
    if (result.changes === 0) {
      return reply.code(404).send({ error: `Provider '${provider}' not found` });
    }
    // Blacklist from auto-seed so it doesn't come back on restart
    db.prepare('INSERT OR IGNORE INTO seed_blacklist (provider) VALUES (?)').run(provider);
    return { ok: true, provider, deleted: true };
  });

  // ── POST /api/quota/active — switch which provider is shown in the main snapshot ──
  fastify.post('/api/quota/active', async (req, reply) => {
    const { provider } = req.body as any;
    if (!provider) return reply.code(400).send({ error: 'provider is required' });

    // Get latest snapshot for this provider
    const snap = db.prepare(
      'SELECT balance, status, currency FROM quota_snapshots WHERE provider = ? ORDER BY created_at DESC LIMIT 1'
    ).get(provider) as any;

    if (!snap) {
      return reply.code(404).send({ error: `No snapshot found for '${provider}'. Fetch balance first.` });
    }

    // Update in-memory snapshot
    const current = getSnapshot();
    current.quota = {
      provider,
      balance: snap.balance,
      status: snap.status,
      lastUpdated: new Date().toISOString(),
      currency: snap.currency,
    };
    setSnapshot(current);

    return { ok: true, provider, balance: snap.balance, status: snap.status };
  });

  // ── GET /api/quota/fetch/:provider — trigger balance fetch for a specific provider ──
  fastify.get('/api/quota/fetch/:provider', async (req, reply) => {
    const { provider } = req.params as any;
    const cfg = loadProvider(provider);
    if (!cfg) {
      return reply.code(404).send({ error: `Provider '${provider}' not found. Add it via POST /api/quota/providers first.` });
    }

    try {
      const { quota, raw } = await fetchForProvider(cfg);
      persistQuota(quota, raw);
      return quota;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(502).send({
        provider,
        balance: null,
        status: 'error',
        lastUpdated: new Date().toISOString(),
        currency: 'CNY',
        error: message,
      });
    }
  });

  // ── GET /api/quota/fetch-all — fetch all providers ──
  fastify.get('/api/quota/fetch-all', async () => {
    const providers = loadAllProviders();
    const results: any[] = [];

    for (const cfg of providers) {
      try {
        const { quota, raw } = await fetchForProvider(cfg);
        persistQuota(quota, raw);
        results.push(quota);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({
          provider: cfg.provider,
          balance: null,
          status: 'error',
          lastUpdated: new Date().toISOString(),
          currency: 'CNY',
          error: message,
        });
      }
    }

    return { results };
  });

  // ── GET /api/quota/deepseek — backwards-compatible single-DeepSeek route ──
  fastify.get('/api/quota/deepseek', async (req, reply) => {
    const cfg = loadProvider('deepseek');
    // If no DB entry and no env var, return error
    if (!cfg && !config.deepseekApiKey) {
      return reply.code(502).send({
        provider: 'deepseek',
        balance: null,
        status: 'error',
        lastUpdated: new Date().toISOString(),
        currency: 'CNY',
        error: 'No DeepSeek API key configured. Set DEEPSEEK_API_KEY env var or add via POST /api/quota/providers.',
      });
    }

    const effectiveCfg: ProviderConfig = cfg ?? {
      provider: 'deepseek',
      apiKey: config.deepseekApiKey,
      baseUrl: 'https://api.deepseek.com',
      balanceEndpoint: '/user/balance',
    };

    try {
      const { quota, raw } = await fetchForProvider(effectiveCfg);
      persistQuota(quota, raw);
      return quota;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(502).send({
        provider: 'deepseek',
        balance: null,
        status: 'error',
        lastUpdated: new Date().toISOString(),
        currency: 'CNY',
        error: message,
      });
    }
  });
}
