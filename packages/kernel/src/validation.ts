import { Action } from './types';

/**
 * Lightweight action schema validation.
 *
 * Games may declare per-action schemas. Validation is intentionally structural
 * (types / enums / numeric ranges) — semantic legality stays in `legalActions`.
 * Actions without a schema only get the structural header checks.
 */

export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
  enum?: readonly string[];
  min?: number;
  max?: number;
}

export interface ActionSchema {
  type: string;
  /** Top-level fields on the action. */
  fields?: Record<string, FieldSpec>;
  /** Fields inside `action.payload`. */
  payload?: Record<string, FieldSpec>;
  /** Set false to forbid a payload entirely. */
  allowPayload?: boolean;
}

export type ActionSchemaMap = Record<string, ActionSchema>;

function kindOf(value: unknown): FieldKind {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'object';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value as FieldKind;
}

function checkField(path: string, value: unknown, spec: FieldSpec): string[] {
  const errors: string[] = [];
  const actual = kindOf(value);

  const matches =
    spec.kind === 'number'
      ? actual === 'number' || actual === 'integer'
      : spec.kind === 'integer'
      ? actual === 'integer'
      : actual === spec.kind;

  if (!matches) {
    errors.push(`${path} must be ${spec.kind}, got ${actual}`);
    return errors;
  }

  if (spec.enum && typeof value === 'string' && !spec.enum.includes(value)) {
    errors.push(`${path} must be one of [${spec.enum.join(', ')}]`);
  }
  if (typeof value === 'number') {
    if (spec.min !== undefined && value < spec.min) errors.push(`${path} must be >= ${spec.min}`);
    if (spec.max !== undefined && value > spec.max) errors.push(`${path} must be <= ${spec.max}`);
  }
  return errors;
}

export function validateActionShape(action: Action, schemas: ActionSchemaMap): string[] {
  const errors: string[] = [];

  if (!action || typeof action !== 'object') return ['action must be an object'];
  if (typeof action.type !== 'string' || action.type.length === 0) errors.push('action.type must be a non-empty string');
  if (typeof action.playerId !== 'string' || action.playerId.length === 0) {
    errors.push('action.playerId must be a non-empty string');
  }
  if (action.actorId !== undefined && (typeof action.actorId !== 'string' || action.actorId.length === 0)) {
    errors.push('action.actorId must be a non-empty string');
  }
  if (action.targets !== undefined) {
    if (!Array.isArray(action.targets) || action.targets.some(target => typeof target !== 'string')) {
      errors.push('action.targets must be an array of strings');
    }
  }
  if (errors.length > 0) return errors;

  const schema = schemas[action.type];
  if (!schema) return errors;

  for (const [name, spec] of Object.entries(schema.fields ?? {})) {
    const value = (action as unknown as Record<string, unknown>)[name];
    if (value === undefined) {
      if (spec.required) errors.push(`missing field ${name}`);
      continue;
    }
    errors.push(...checkField(name, value, spec));
  }

  if (schema.allowPayload === false && action.payload !== undefined) {
    errors.push('payload is not allowed for this action');
  }

  if (schema.payload) {
    if (action.payload === undefined) {
      for (const [name, spec] of Object.entries(schema.payload)) {
        if (spec.required) errors.push(`missing payload.${name}`);
      }
    } else if (typeof action.payload !== 'object' || Array.isArray(action.payload)) {
      errors.push('payload must be an object');
    } else {
      for (const [name, spec] of Object.entries(schema.payload)) {
        const value = (action.payload as Record<string, unknown>)[name];
        if (value === undefined) {
          if (spec.required) errors.push(`missing payload.${name}`);
          continue;
        }
        errors.push(...checkField(`payload.${name}`, value, spec));
      }
    }
  }

  return errors;
}
