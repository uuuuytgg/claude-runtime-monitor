/**
 * Claude Code statusline script — pushes model/project/cost/context to CRM.
 * Configured via settings.json:
 *   "statusLine": { "type": "command", "command": "node ...statusline.js", "refreshInterval": 10 }
 *
 * Claude Code passes status data via environment variables:
 *   CLAUDE_CODE_MODEL, CLAUDE_CODE_PROJECT, CLAUDE_CODE_COST, CLAUDE_CODE_CONTEXT_PCT
 */
const http = require('http');

const CRM_URL = process.env.CRM_URL || 'http://127.0.0.1:4377';
const INTERNAL_TOKEN = process.env.MONITOR_INTERNAL_TOKEN || '';

function push() {
  const model = process.env.CLAUDE_CODE_MODEL;
  const project = process.env.CLAUDE_CODE_PROJECT;
  const cost = process.env.CLAUDE_CODE_COST;
  const rawCtx = process.env.CLAUDE_CODE_CONTEXT_PCT;
  const contextUsed = rawCtx ? parseFloat(rawCtx) : undefined;

  // Always send what we have — the server keeps previous values.
  const body = JSON.stringify({
    model: model || undefined,
    project: project || undefined,
    cost: cost || undefined,
    contextUsed: contextUsed,
  });

  const headers = { 'Content-Type': 'application/json' };
  if (INTERNAL_TOKEN) headers['x-monitor-internal-token'] = INTERNAL_TOKEN;

  const req = http.request(`${CRM_URL}/internal/claude/statusline`, {
    method: 'POST',
    headers,
    timeout: 2000,
  }, () => {});
  req.on('error', () => {});
  req.write(body);
  req.end();
}

push();
