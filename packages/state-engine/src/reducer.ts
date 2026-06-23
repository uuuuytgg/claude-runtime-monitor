import type {
  MonitorSnapshot,
  InputEvent,
  RuntimeState,
  RuntimeEvent,
  EventType,
} from '@crm/shared';
import { STATE_TO_CORE, stateSeverity } from '@crm/shared';

function defaultSnapshot(): MonitorSnapshot {
  return {
    timestamp: new Date().toISOString(),
    runtime: { online: true, state: 'idle', severity: 'info' },
    claude: {
      project: null,
      model: null,
      sessionId: null,
      contextUsed: null,
      contextMax: null,
      cost: null,
      sessionCostTotal: null,
    },
    quota: {
      provider: 'deepseek',
      balance: null,
      status: 'unknown',
      lastUpdated: null,
      currency: 'CNY',
    },
    animation: { coreState: 'breathing', intensity: 0.3 },
  };
}

function mapHookTypeToState(type: EventType): RuntimeState | null {
  const m: Partial<Record<EventType, RuntimeState>> = {
    session_start: 'idle',
    session_end: 'completed',
    tool_start: 'running_command',
    tool_end: 'idle',
    permission_request: 'waiting_permission',
    error: 'error',
    recovery: 'idle',
  };
  return m[type] ?? null;
}

export function createInitialSnapshot(): MonitorSnapshot {
  return defaultSnapshot();
}

export function reduce(
  prev: MonitorSnapshot,
  event: InputEvent
): { snapshot: MonitorSnapshot; event: RuntimeEvent | null } {
  const now = new Date().toISOString();
  const next: MonitorSnapshot = {
    ...prev,
    timestamp: now,
    claude: { ...prev.claude },
    quota: { ...prev.quota },
    runtime: { ...prev.runtime },
    animation: { ...prev.animation },
  };

  let runtimeEvent: RuntimeEvent | null = null;

  switch (event._tag) {
    case 'claude_hook': {
      const newState = mapHookTypeToState(event.type);
      if (newState) {
        next.runtime.state = newState;
        next.runtime.severity = stateSeverity(newState);
      }
      if (event.type === 'session_start' && event.raw && typeof event.raw === 'object' && 'sessionId' in event.raw) {
        next.claude.sessionId = (event.raw as any).sessionId;
      }
      if (event.type === 'session_end') {
        next.claude.sessionId = null;
      }
      next.animation.coreState = STATE_TO_CORE[next.runtime.state];
      runtimeEvent = {
        source: 'claude_hook',
        type: event.type,
        title: event.title,
        detail: event.detail,
        severity: event.severity || stateSeverity(next.runtime.state),
        raw: event.raw,
        timestamp: now,
      };
      break;
    }

    case 'claude_statusline': {
      if (event.model !== undefined) next.claude.model = event.model;
      if (event.project !== undefined) next.claude.project = event.project;
      if (event.contextUsed !== undefined) next.claude.contextUsed = event.contextUsed;
      if (event.cost !== undefined) next.claude.cost = event.cost;

      // Statusline arriving means Claude process is alive — reset terminal states
      const terminalStates = new Set(['offline', 'completed']);
      if (terminalStates.has(next.runtime.state)) {
        next.runtime.state = 'idle';
        next.runtime.severity = 'info';
        next.animation.coreState = 'breathing';
        next.animation.intensity = 0.3;
      }

      if (event.contextUsed !== undefined) {
        if (event.contextUsed > 90) {
          next.runtime.state = 'rate_limited';
          next.runtime.severity = 'warning';
          next.animation.coreState = 'warning';
        } else if (event.contextUsed > 70 && next.runtime.state !== 'error') {
          next.runtime.severity = 'warning';
        }
      }
      break;
    }

    case 'deepseek_quota': {
      next.quota = {
        ...next.quota,
        balance: event.balance,
        status: event.status,
        lastUpdated: now,
        currency: event.currency || 'CNY',
      };
      if (event.status === 'critical' || event.status === 'error') {
        next.runtime.state = 'low_balance';
        next.runtime.severity = 'critical';
        next.animation.coreState = 'error';
      }
      runtimeEvent = {
        source: 'deepseek_api',
        type: 'quota_update',
        title: `DeepSeek quota: ${event.balance ?? 'unknown'}`,
        severity: event.status === 'ok' ? 'info' : 'warning',
        timestamp: now,
      };
      break;
    }

    case 'deepseek_usage': {
      runtimeEvent = {
        source: 'deepseek_api',
        type: 'tool_end',
        title: `Usage: ${event.model ?? 'unknown'} in=${event.tokensIn ?? 0} out=${event.tokensOut ?? 0}`,
        severity: 'info',
        timestamp: now,
      };
      break;
    }

    case 'system_error': {
      next.runtime.state = 'error';
      next.runtime.severity = 'critical';
      next.animation.coreState = 'error';
      runtimeEvent = {
        source: 'system',
        type: 'error',
        title: event.title,
        detail: event.detail,
        severity: 'critical',
        timestamp: now,
      };
      break;
    }

    case 'claude_inactive': {
      next.runtime.online = false;
      next.runtime.state = 'offline';
      next.runtime.severity = 'info';
      next.animation.coreState = 'sleep';
      next.animation.intensity = 0;
      runtimeEvent = null;
      break;
    }

    case 'session_start': {
      next.claude.sessionId = event.sessionId;
      break;
    }

    case 'session_end': {
      next.claude.sessionId = null;
      break;
    }

    case 'ccswitch_poll': {
      if (event.model) next.claude.model = event.model;
      if (event.contextUsed !== undefined) next.claude.contextUsed = event.contextUsed;
      if (event.contextMax !== undefined) next.claude.contextMax = event.contextMax;
      if (event.cost !== undefined) next.claude.cost = event.cost;
      if (event.sessionCostTotal !== undefined) next.claude.sessionCostTotal = event.sessionCostTotal;
      if (event.sessionId) next.claude.sessionId = event.sessionId;

      next.runtime.online = true;

      // Recover from any inactive/terminal state when a new request arrives
      const terminalStates = new Set(['offline', 'completed', 'idle']);
      if (terminalStates.has(next.runtime.state)) {
        next.runtime.state = 'idle';
        next.runtime.severity = 'info';
        next.animation.coreState = 'breathing';
        next.animation.intensity = 0.3;
      }

      if (event.contextUsed !== undefined) {
        if (event.contextUsed > 90) {
          next.runtime.state = 'rate_limited';
          next.runtime.severity = 'warning';
          next.animation.coreState = 'warning';
        } else if (event.contextUsed > 70 && next.runtime.state !== 'error') {
          next.runtime.severity = 'warning';
        }
      }

      if (event.requestId || event.requestCreatedAt) {
        const parts = [
          event.model,
          event.contextUsed !== undefined ? `上下文 ${event.contextUsed}%` : null,
          event.cost ? `本次 ${event.cost}` : null,
          event.sessionCostTotal ? `会话 ${event.sessionCostTotal}` : null,
        ].filter(Boolean);

        runtimeEvent = {
          source: 'claude_statusline',
          type: 'tool_end',
          title: '请求完成',
          detail: parts.join(' · '),
          severity: event.contextUsed !== undefined && event.contextUsed > 90
            ? 'warning'
            : 'info',
          raw: {
            requestId: event.requestId,
            requestCreatedAt: event.requestCreatedAt,
            sessionId: event.sessionId,
            requestsInSession: event.requestsInSession,
          },
          timestamp: now,
        };
      }
      break;
    }
  }

  return { snapshot: next, event: runtimeEvent };
}
