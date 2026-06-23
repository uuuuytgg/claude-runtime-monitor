import type { RuntimeState, CoreState } from './types.js';

export const RUNTIME_STATES: readonly RuntimeState[] = [
  'offline', 'idle', 'preparing', 'thinking',
  'reading_file', 'editing_file', 'running_command', 'testing',
  'waiting_permission', 'waiting_user', 'rate_limited', 'low_balance',
  'error', 'completed',
] as const;

export const STATE_TO_CORE: Record<RuntimeState, CoreState> = {
  offline: 'sleep',
  idle: 'breathing',
  preparing: 'breathing',
  thinking: 'thinking',
  reading_file: 'data_in',
  editing_file: 'editing',
  running_command: 'command',
  testing: 'command',
  waiting_permission: 'warning',
  waiting_user: 'warning',
  rate_limited: 'warning',
  low_balance: 'warning',
  error: 'error',
  completed: 'success',
};

export function stateSeverity(state: RuntimeState): 'info' | 'warning' | 'critical' | 'success' {
  switch (state) {
    case 'error': return 'critical';
    case 'rate_limited':
    case 'low_balance':
    case 'waiting_permission':
    case 'waiting_user': return 'warning';
    case 'completed': return 'success';
    default: return 'info';
  }
}
