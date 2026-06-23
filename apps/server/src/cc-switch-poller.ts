/**
 * cc-switch.db poller.
 *
 * cc-switch records proxied agent API calls. This monitor is scoped to Claude
 * Code, so Codex/opencode rows must never drive the current Claude status.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';

const CC_SWITCH_DB = path.join(process.env.USERPROFILE || '', '.cc-switch', 'cc-switch.db');
const CLAUDE_APP_TYPE = 'claude';
const USD_TO_CNY = 7.25;

const MODEL_CONTEXTS: Record<string, number> = {
  'deepseek-v4-pro': 1_000_000,
  'deepseek-v4-flash': 1_000_000,
  'deepseek-v4-pro[1M]': 1_000_000,
  'deepseek-v4-flash[1M]': 1_000_000,
  'claude-opus-4-8[1M]': 1_000_000,
  'claude-opus-4-8': 1_000_000,
  'claude-sonnet-4-6[1M]': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'gpt-5.5': 200_000,
  'kimi-for-coding': 131_072,
  'mimo-v2.5-pro': 200_000,
};

let ccDb: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (ccDb) {
    try {
      ccDb.prepare('SELECT 1').get();
      return ccDb;
    } catch {
      ccDb = null;
    }
  }

  if (!existsSync(CC_SWITCH_DB)) return null;

  try {
    ccDb = new Database(CC_SWITCH_DB, { readonly: true });
    ccDb.pragma('journal_mode = WAL');
    return ccDb;
  } catch {
    return null;
  }
}

export interface CcSwitchPollResult {
  requestId: string | null;
  requestCreatedAt: string | null;
  latestRequestAgeMs: number | null;
  model: string | null;
  contextUsed: number | null;
  contextTokens: number | null;
  contextMax: number | null;
  cost: string | null;
  sessionCostTotal: string | null;
  sessionId: string | null;
  requestsInSession: number;
  available: boolean;
}

function emptyResult(available: boolean): CcSwitchPollResult {
  return {
    requestId: null,
    requestCreatedAt: null,
    latestRequestAgeMs: null,
    model: null,
    contextUsed: null,
    contextTokens: null,
    contextMax: null,
    cost: null,
    sessionCostTotal: null,
    sessionId: null,
    requestsInSession: 0,
    available,
  };
}

export function pollLatestRequest(): CcSwitchPollResult {
  const db = getDb();
  if (!db) return emptyResult(false);

  try {
    return readLatestClaudeRequestFromDb(db, Date.now());
  } catch {
    try {
      ccDb?.close();
    } catch {}
    ccDb = null;
    return emptyResult(false);
  }
}

export function readLatestClaudeRequestFromDb(
  db: Database.Database,
  nowMs = Date.now(),
): CcSwitchPollResult {
  const latest = db.prepare(`
    SELECT
      request_id,
      app_type,
      model,
      request_model,
      input_tokens,
      cache_read_tokens,
      total_cost_usd,
      session_id,
      created_at
    FROM proxy_request_logs
    WHERE status_code = 200
      AND app_type = ?
      AND input_tokens > 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(CLAUDE_APP_TYPE) as any;

  if (!latest) return emptyResult(true);

  const displayModel = latest.request_model || latest.model || null;
  // Prefer request_model (the actual Claude model) over model (may be proxy alias)
  const contextModel = latest.request_model || latest.model || null;
  const ctxMax = contextModel ? MODEL_CONTEXTS[contextModel] || 200_000 : 200_000;
  const contextTokens = (latest.input_tokens || 0) + (latest.cache_read_tokens || 0);
  const contextPct = Math.min(Math.round((contextTokens / ctxMax) * 100), 100);
  const requestCreatedAt = latest.created_at !== undefined && latest.created_at !== null
    ? String(latest.created_at)
    : null;
  const requestCreatedAtMs = parseCreatedAtMs(requestCreatedAt);

  const costNum = latest.total_cost_usd ? parseFloat(latest.total_cost_usd) * USD_TO_CNY : 0;
  const costStr = costNum > 0.001 ? `¥${costNum.toFixed(2)}` : null;

  const sessionTotals = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_cost_usd) as total_cost
    FROM proxy_request_logs
    WHERE session_id = ?
      AND app_type = ?
      AND total_cost_usd IS NOT NULL
  `).get(latest.session_id, CLAUDE_APP_TYPE) as any;

  const sessionTotalNum = sessionTotals?.total_cost
    ? parseFloat(sessionTotals.total_cost) * USD_TO_CNY
    : 0;
  const sessionCostTotal = sessionTotalNum > 0.001
    ? `¥${sessionTotalNum.toFixed(2)}`
    : null;

  return {
    requestId: latest.request_id !== undefined
      ? String(latest.request_id)
      : `${latest.session_id}:${latest.created_at}`,
    requestCreatedAt,
    latestRequestAgeMs: requestCreatedAtMs === null ? null : nowMs - requestCreatedAtMs,
    model: displayModel,
    contextUsed: contextPct,
    contextTokens,
    contextMax: ctxMax,
    cost: costStr,
    sessionCostTotal,
    sessionId: latest.session_id,
    requestsInSession: sessionTotals?.count || 0,
    available: true,
  };
}

function parseCreatedAtMs(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
