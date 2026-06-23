/**
 * Debug hook — logs the full payload from Claude Code to a file.
 * Configure as PostToolUse hook to inspect what data is available.
 */
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'hook-payload.log');

let data = '';
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(data);
    // Log all fields for inspection
    const line = JSON.stringify({
      time: new Date().toISOString(),
      keys: Object.keys(payload),
      summary: {
        hook_event_name: payload.hook_event_name,
        tool_name: payload.tool_name,
        tool_use_id: payload.tool_use_id,
        session_id: payload.session_id,
        has_input: !!payload.tool_input,
        has_result: !!payload.tool_result,
      },
      // Include the full payload so we can see ALL fields
      full: payload,
    }, null, 2);
    fs.appendFileSync(logFile, line + '\n---\n');
  } catch {}
});
