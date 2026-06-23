import { z } from 'zod';

export const runtimeStateSchema = z.enum([
  'offline', 'idle', 'preparing', 'thinking',
  'reading_file', 'editing_file', 'running_command', 'testing',
  'waiting_permission', 'waiting_user', 'rate_limited', 'low_balance',
  'error', 'completed',
]);

export const hookPayloadSchema = z.object({
  type: z.enum([
    'session_start', 'session_end', 'tool_start', 'tool_end',
    'permission_request', 'permission_granted', 'permission_denied',
    'error', 'recovery',
  ]),
  title: z.string().min(1),
  detail: z.string().optional(),
  severity: z.enum(['info', 'warning', 'critical', 'success']).optional(),
  sessionId: z.string().optional(),
});

export const statuslinePayloadSchema = z.object({
  model: z.string().optional(),
  project: z.string().optional(),
  contextUsed: z.coerce.number().min(0).max(100).optional(),
  cost: z.string().optional(),
});

export const quotaPayloadSchema = z.object({
  balance: z.string().nullable(),
  status: z.enum(['ok', 'low', 'critical', 'error', 'unknown']),
  currency: z.string().optional().default('CNY'),
});
