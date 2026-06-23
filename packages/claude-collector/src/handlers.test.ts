import { describe, it, expect } from 'vitest';
import { handleHook } from './hook-handler.js';
import { handleStatusline } from './statusline-handler.js';
import { createInitialSnapshot } from '@crm/state-engine';

describe('hook-handler', () => {
  const snap = createInitialSnapshot();

  it('processes valid hook payload', () => {
    const res = handleHook({
      type: 'tool_start',
      title: 'Edit file',
      detail: 'editing config.ts',
    }, snap);
    expect('event' in res).toBe(true);
    if ('event' in res) {
      expect(res.event._tag).toBe('claude_hook');
      expect(res.result.snapshot.runtime.state).toBe('running_command');
    }
  });

  it('rejects invalid hook payload', () => {
    const res = handleHook({ type: 'invalid_type', title: '' }, snap);
    expect('error' in res).toBe(true);
  });
});

describe('statusline-handler', () => {
  const snap = createInitialSnapshot();

  it('processes valid statusline', () => {
    const res = handleStatusline({
      model: 'claude-opus-4-8',
      contextUsed: 50,
    }, snap);
    expect('event' in res).toBe(true);
    if ('event' in res) {
      expect(res.result.snapshot.claude.model).toBe('claude-opus-4-8');
      expect(res.result.snapshot.claude.contextUsed).toBe(50);
    }
  });

  it('rejects bad contextUsed', () => {
    const res = handleStatusline({ contextUsed: 150 }, snap);
    expect('error' in res).toBe(true);
  });
});
