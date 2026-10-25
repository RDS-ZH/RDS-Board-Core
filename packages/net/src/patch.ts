import { JsonValue } from '@rds/kernel/types';

/**
 * Minimal RFC 6902-style JSON Patch used to sync the projected state o_{i,t}
 * to browsers. Arrays are replaced wholesale, which keeps the implementation
 * small and still yields correct, minimal-enough patches for board states.
 */

export type PatchOp =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'replace'; path: string; value: JsonValue }
  | { op: 'remove'; path: string };

function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffJson(before: unknown, after: unknown, path = ''): PatchOp[] {
  const ops: PatchOp[] = [];

  if (same(before, after)) return ops;

  if (isPlainObject(before) && isPlainObject(after)) {
    for (const key of Object.keys(before)) {
      if (!(key in after)) {
        ops.push({ op: 'remove', path: `${path}/${escapeToken(key)}` });
      }
    }
    for (const key of Object.keys(after)) {
      const nextPath = `${path}/${escapeToken(key)}`;
      if (!(key in before)) {
        ops.push({ op: 'add', path: nextPath, value: after[key] as JsonValue });
      } else {
        ops.push(...diffJson(before[key], after[key], nextPath));
      }
    }
    return ops;
  }

  if (path === '') {
    if (isPlainObject(after)) {
      ops.push({ op: 'replace', path: '/', value: after as JsonValue });
    } else {
      ops.push({ op: 'replace', path: '/', value: after as JsonValue });
    }
    return ops;
  }

  ops.push({ op: 'replace', path, value: after as JsonValue });
  return ops;
}

function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function applyPatch<T>(document: T, operations: PatchOp[]): T {
  const clone = JSON.parse(JSON.stringify(document)) as unknown;

  for (const operation of operations) {
    const tokens = operation.path.split('/').slice(1).map(unescapeToken);
    if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === '')) {
      return operation.op === 'remove' ? (undefined as T) : (operation.value as T);
    }

    let parent: any = clone;
    for (let i = 0; i < tokens.length - 1; i++) {
      parent = parent?.[tokens[i]];
      if (parent === undefined) throw new Error(`Patch path not found: ${operation.path}`);
    }

    const key = tokens[tokens.length - 1];
    if (operation.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else {
      parent[key] = operation.value;
    }
  }

  return clone as T;
}
