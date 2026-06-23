import type { InputEvent, MonitorSnapshot } from '@crm/shared';
import { reduce } from '@crm/state-engine';
import { hookPayloadSchema } from '@crm/shared';

export function handleHook(
  body: unknown,
  currentSnapshot: MonitorSnapshot
): { event: InputEvent; result: ReturnType<typeof reduce> } | { error: string } {
  const parsed = hookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return { error: `Invalid hook payload: ${JSON.stringify(parsed.error.flatten())}` };
  }

  const { type, title, detail, severity, sessionId } = parsed.data;
  const inputEvent: InputEvent = {
    _tag: 'claude_hook',
    type,
    title,
    detail,
    severity,
    raw: body,
  };

  return {
    event: inputEvent,
    result: reduce(currentSnapshot, inputEvent),
  };
}
