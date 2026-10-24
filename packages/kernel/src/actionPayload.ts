import { Action } from './types';

/**
 * Fill an action's declarative fields with their defaults.
 * Used by bots and tests: UI forms do the same job interactively.
 */
export function withDefaultPayload(action: Action): Action {
  if (!action.fields?.length) return action;

  const payload: Record<string, unknown> = { ...(action.payload ?? {}) };
  for (const field of action.fields) {
    if (payload[field.key] !== undefined) continue;
    if (field.dependsOn) {
      const dependency = payload[field.dependsOn.key];
      const visible =
        field.dependsOn.truthy !== undefined
          ? Boolean(dependency) === field.dependsOn.truthy
          : field.dependsOn.equals !== undefined
          ? String(dependency) === String(field.dependsOn.equals)
          : true;
      if (!visible) continue;
    }
    if (field.kind === 'selection') continue;
    if (field.default !== undefined) {
      payload[field.key] = field.default;
    } else if (field.kind === 'enum') {
      payload[field.key] = field.options?.[0]?.value;
    } else if (field.kind === 'boolean') {
      payload[field.key] = false;
    } else if (field.kind === 'string') {
      payload[field.key] = '';
    } else if (field.kind === 'json') {
      payload[field.key] = {};
    } else {
      payload[field.key] = field.min ?? 0;
    }
  }

  return { ...action, payload };
}
