const path = require('path');
const dbPath = path.join(process.env.USERPROFILE, '.cc-switch', 'cc-switch.db');
const Database = require(path.join(__dirname, '..', 'apps', 'server', 'node_modules', 'better-sqlite3'));
const db = new Database(dbPath, { readonly: true });

const MODEL_CONTEXTS = {
  'deepseek-v4-pro': 1000000,
  'deepseek-v4-flash': 1000000,
  'kimi-for-coding': 131072,
};

// Current session
const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
console.log('Current session ID from env:', sessionId);

// Latest 10 requests - each one is a full round trip of conversation context
const latest = db.prepare(`
  SELECT
    request_id, session_id, model, input_tokens, output_tokens,
    cache_read_tokens, cache_creation_tokens,
    total_cost_usd, created_at
  FROM proxy_request_logs
  WHERE session_id = ?
  ORDER BY created_at DESC
  LIMIT 10
`).all(sessionId || 'dddb4b73-b4bb-46f7-bff2-a8647f0dd54f');

console.log(`\n=== Latest 10 requests for this session ===\n`);
latest.forEach((r, i) => {
  const ctxMax = MODEL_CONTEXTS[r.model] || 1000000;
  // Each request sends full conversation: input_tokens
  // Cache read tokens are what was cached from previous context
  // So context used = input_tokens + cache_read_tokens
  const contextTokens = (r.input_tokens || 0) + (r.cache_read_tokens || 0);
  const pct = Math.round((contextTokens / ctxMax) * 10000) / 100;
  const dt = new Date(r.created_at * 1000).toISOString().slice(11, 19);

  console.log(`#${i+1} [${dt}] model=${r.model}`);
  console.log(`    input=${r.input_tokens?.toLocaleString() || 0} | output=${r.output_tokens || 0} | cache_read=${r.cache_read_tokens?.toLocaleString() || 0}`);
  console.log(`    context=${contextTokens?.toLocaleString() || 0} / ${(ctxMax/1000).toFixed(0)}K = ${pct}%`);
  if (r.total_cost_usd) console.log(`    cost=$${r.total_cost_usd}`);
  console.log(`    request_id: ${r.request_id?.slice(0, 50)}...`);
  console.log('');
});

// Also show most recent request across ALL sessions to see context growth pattern
console.log('=== Context growth over time (recent 20 requests across all sessions) ===\n');
const recentAll = db.prepare(`
  SELECT
    session_id, model, input_tokens, output_tokens, cache_read_tokens,
    total_cost_usd, created_at
  FROM proxy_request_logs
  ORDER BY created_at DESC
  LIMIT 20
`).all();

recentAll.forEach((r, i) => {
  const ctxMax = MODEL_CONTEXTS[r.model] || 1000000;
  const contextTokens = (r.input_tokens || 0) + (r.cache_read_tokens || 0);
  const pct = Math.round((contextTokens / ctxMax) * 10000) / 100;
  const dt = new Date(r.created_at * 1000).toISOString().slice(11, 19);
  const sid = r.session_id?.slice(0, 8) || '?';
  console.log(`${dt} [${sid}] ${r.model?.padEnd(20)} ctx=${String(contextTokens).padStart(8)} / ${(ctxMax/1000).toFixed(0)}K = ${String(pct).padStart(6)}%  cost=$${r.total_cost_usd || '0'}`);
});

db.close();
