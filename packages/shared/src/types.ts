// Runtime states as defined in the spec
export type RuntimeState =
  | 'offline'
  | 'idle'
  | 'preparing'
  | 'thinking'
  | 'reading_file'
  | 'editing_file'
  | 'running_command'
  | 'testing'
  | 'waiting_permission'
  | 'waiting_user'
  | 'rate_limited'
  | 'low_balance'
  | 'error'
  | 'completed';

export type Severity = 'info' | 'warning' | 'critical' | 'success';

export type EventSource = 'claude_hook' | 'claude_statusline' | 'deepseek_api' | 'system';

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'tool_start'
  | 'tool_end'
  | 'permission_request'
  | 'permission_granted'
  | 'permission_denied'
  | 'quota_update'
  | 'error'
  | 'recovery';

// Animation state per spec patch
export type CoreState =
  | 'sleep'
  | 'breathing'
  | 'thinking'
  | 'data_in'
  | 'editing'
  | 'command'
  | 'warning'
  | 'error'
  | 'success';

export interface ClaudeInfo {
  project: string | null;
  model: string | null;
  sessionId: string | null;
  contextUsed: number | null;  // 0-100 percent
  contextMax: number | null;   // max context window in tokens
  cost: string | null;
  sessionCostTotal: string | null;  // cumulative session cost
}

export interface QuotaInfo {
  provider: string;
  balance: string | null;
  status: 'ok' | 'low' | 'critical' | 'error' | 'unknown';
  lastUpdated: string | null;
  currency: string;
}

export interface AnimationState {
  coreState: CoreState;
  intensity: number;
}

export interface MonitorSnapshot {
  timestamp: string;
  runtime: {
    online: boolean;
    state: RuntimeState;
    severity: Severity;
  };
  claude: ClaudeInfo;
  quota: QuotaInfo;
  animation: AnimationState;
}

export interface RuntimeEvent {
  id?: number;
  source: EventSource;
  type: EventType;
  title: string;
  detail?: string;
  severity: Severity;
  raw?: unknown;
  timestamp: string;
}

// Input events accepted by the reducer
export type InputEvent =
  | { _tag: 'claude_hook'; type: EventType; title: string; detail?: string; severity?: Severity; raw?: unknown }
  | { _tag: 'claude_statusline'; model?: string; project?: string; contextUsed?: number; cost?: string }
  | { _tag: 'deepseek_quota'; balance: string | null; status: QuotaInfo['status']; currency?: string }
  | { _tag: 'deepseek_usage'; model?: string; tokensIn?: number; tokensOut?: number; cost?: string }
  | { _tag: 'system_error'; title: string; detail?: string }
  | { _tag: 'claude_inactive'; reason?: string }
  | { _tag: 'session_start'; sessionId: string }
  | { _tag: 'session_end' }
  | {
      _tag: 'ccswitch_poll';
      model?: string;
      contextUsed?: number;
      contextMax?: number;
      cost?: string;
      sessionCostTotal?: string;
      sessionId?: string;
      requestId?: string;
      requestCreatedAt?: string;
      latestRequestAgeMs?: number;
      requestsInSession?: number;
    };
