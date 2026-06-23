import type { InputEvent, MonitorSnapshot } from '@crm/shared';
import { reduce } from '@crm/state-engine';
import { statuslinePayloadSchema } from '@crm/shared';

export function handleStatusline(
  body: unknown,
  currentSnapshot: MonitorSnapshot
): { event: InputEvent; result: ReturnType<typeof reduce> } | { error: string } {
  const parsed = statuslinePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return { error: `Invalid statusline payload: ${JSON.stringify(parsed.error.flatten())}` };
  }

  const inputEvent: InputEvent = {
    _tag: 'claude_statusline',
    model: parsed.data.model,
    project: parsed.data.project,
    contextUsed: parsed.data.contextUsed,
    cost: parsed.data.cost,
  };

  return {
    event: inputEvent,
    result: reduce(currentSnapshot, inputEvent),
  };
}
