import { describe, it, expect } from 'vitest';
import { createInitialSnapshot, reduce } from './reducer.js';
import type { InputEvent } from '@crm/shared';

describe('state engine reducer', () => {
  it('starts in idle', () => {
    const snap = createInitialSnapshot();
    expect(snap.runtime.state).toBe('idle');
    expect(snap.animation.coreState).toBe('breathing');
  });

  it('transitions to command on claude_hook tool_start', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'claude_hook',
      type: 'tool_start',
      title: 'Read file',
      detail: 'reading CLAUDE.md',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.runtime.state).toBe('running_command');
    expect(snapshot.animation.coreState).toBe('command');
  });

  it('transitions to waiting_permission', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'claude_hook',
      type: 'permission_request',
      title: 'Permission needed',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.runtime.state).toBe('waiting_permission');
    expect(snapshot.runtime.severity).toBe('warning');
  });

  it('transitions to error on system_error', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'system_error',
      title: 'DeepSeek API unavailable',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.runtime.state).toBe('error');
    expect(snapshot.runtime.severity).toBe('critical');
    expect(snapshot.animation.coreState).toBe('error');
  });

  it('updates claude info from statusline', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'claude_statusline',
      model: 'claude-opus-4-8',
      project: 'D:\\ClaudeData',
      contextUsed: 45,
      cost: '$2.34',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.claude.model).toBe('claude-opus-4-8');
    expect(snapshot.claude.project).toBe('D:\\ClaudeData');
    expect(snapshot.claude.contextUsed).toBe(45);
    expect(snapshot.claude.cost).toBe('$2.34');
  });

  it('flags high context usage as rate_limited', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'claude_statusline',
      contextUsed: 95,
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.runtime.state).toBe('rate_limited');
    expect(snapshot.runtime.severity).toBe('warning');
  });

  it('updates quota', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'deepseek_quota',
      balance: '42.50',
      status: 'ok',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.quota.balance).toBe('42.50');
    expect(snapshot.quota.status).toBe('ok');
  });

  it('flags low_balance on critical quota', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'deepseek_quota',
      balance: '0.03',
      status: 'critical',
    };
    const { snapshot } = reduce(prev, event);
    expect(snapshot.runtime.state).toBe('low_balance');
    expect(snapshot.runtime.severity).toBe('critical');
  });

  it('handles session lifecycle', () => {
    const prev = createInitialSnapshot();
    const { snapshot: s1 } = reduce(prev, {
      _tag: 'session_start',
      sessionId: 'abc-123',
    });
    expect(s1.claude.sessionId).toBe('abc-123');

    const { snapshot: s2 } = reduce(s1, { _tag: 'session_end' });
    expect(s2.claude.sessionId).toBeNull();
  });

  it('emits readable request events from cc-switch polling when the request changes', () => {
    const prev = createInitialSnapshot();
    const event: InputEvent = {
      _tag: 'ccswitch_poll',
      model: 'claude-opus-4-8',
      contextUsed: 100,
      contextMax: 200_000,
      cost: '¥0.65',
      sessionCostTotal: '¥35.00',
      sessionId: 'session-1',
      requestId: 'req-1',
      requestCreatedAt: '2026-06-15T14:20:00.000Z',
      requestsInSession: 12,
    };

    const { snapshot, event: runtimeEvent } = reduce(prev, event);

    expect(snapshot.claude.model).toBe('claude-opus-4-8');
    expect(snapshot.runtime.state).toBe('rate_limited');
    expect(runtimeEvent).toMatchObject({
      source: 'claude_statusline',
      type: 'tool_end',
      title: '请求完成',
      detail: 'claude-opus-4-8 · 上下文 100% · 本次 ¥0.65 · 会话 ¥35.00',
      severity: 'warning',
    });
  });

  it('marks Claude offline and clears current conversation metrics when inactive', () => {
    const active = reduce(createInitialSnapshot(), {
      _tag: 'ccswitch_poll',
      model: 'claude-opus-4-8',
      contextUsed: 100,
      contextMax: 200_000,
      cost: '¥0.65',
      sessionCostTotal: '¥35.00',
      sessionId: 'session-1',
      requestId: 'req-1',
    }).snapshot;

    const { snapshot, event } = reduce(active, {
      _tag: 'claude_inactive',
      reason: 'No Claude activity for 120s',
    });

    expect(snapshot.runtime).toMatchObject({
      online: false,
      state: 'offline',
      severity: 'info',
    });
    expect(snapshot.animation.coreState).toBe('sleep');
    expect(snapshot.claude.sessionId).toBeNull();
    expect(snapshot.claude.contextUsed).toBeNull();
    expect(snapshot.claude.cost).toBeNull();
    expect(snapshot.claude.sessionCostTotal).toBeNull();
    expect(event).toMatchObject({
      source: 'system',
      type: 'session_end',
      title: 'Claude 已离线',
      detail: 'No Claude activity for 120s',
    });
  });
});
