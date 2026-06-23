/**
 * Claude Code hook script — sends events to CRM server.
 * Configure in .claude/settings.json:
 *   "hooks": { "PostToolUse": [{ "command": "node D:\\ClaudeData\\claude-runtime-monitor\\scripts\\claude-hooks\\claude-hook.js" }] }
 */
const http = require('http');

const CRM_URL = process.env.CRM_URL || 'http://127.0.0.1:4377';

// Read hook payload from stdin
let data = '';
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(data);
    // Claude Code hook_event_name values:
    // https://docs.anthropic.com/en/docs/claude-code/settings#hooks-supported-events
    const hookType = mapHookType(payload.hook_event_name);
    const body = JSON.stringify({
      type: hookType,
      title: payload.hook_event_name || 'hook event',
      detail: [
        payload.tool_name,
        payload.tool_input?.file_path || payload.tool_input?.path || payload.tool_input?.command || '',
      ].filter(Boolean).join(': ') || payload.hook_event_name,
      sessionId: payload.session_id,
    });

    const req = http.request(`${CRM_URL}/internal/claude/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 2000,
    }, () => { /* fire-and-forget */ });
    req.on('error', () => { /* silent — server not running */ });
    req.write(body);
    req.end();
  } catch {
    // Never crash Claude Code
  }
});

function mapHookType(name) {
  const map = {
    'PreToolUse': 'tool_start',
    'PostToolUse': 'tool_end',
    'Notification': 'recovery',
    'Stop': 'session_end',
    'UserPromptSubmit': 'permission_request',
    'PreCompact': 'permission_request',
  };
  return map[name] || 'recovery';
}
