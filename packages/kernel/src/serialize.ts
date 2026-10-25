import { GameState } from './types';

/**
 * Canonical serialization + hashing.
 *
 * The kernel forbids functions, class instances, Date objects and other
 * non-JSON values inside `GameState`. Canonicalization sorts object keys so
 * that a state and its round-tripped copy hash identically.
 */

export function canonicalize(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): string => {
    if (v === null) return 'null';

    const t = typeof v;
    if (t === 'number') {
      if (!Number.isFinite(v as number)) throw new Error('Non-finite number in state');
      return (v as number).toString();
    }
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return JSON.stringify(v);
    if (t === 'undefined') return 'null';
    if (t === 'function') throw new Error('Function found in state (state must be plain JSON)');
    if (t === 'symbol' || t === 'bigint') throw new Error(`Unsupported value type in state: ${t}`);

    const obj = v as object;
    if (seen.has(obj)) throw new Error('Cyclic reference found in state');
    seen.add(obj);

    let out: string;
    if (Array.isArray(obj)) {
      out = `[${obj.map(item => walk(item)).join(',')}]`;
    } else {
      const keys = Object.keys(obj as Record<string, unknown>).sort();
      const parts = keys
        .filter(key => (obj as Record<string, unknown>)[key] !== undefined)
        .map(key => `${JSON.stringify(key)}:${walk((obj as Record<string, unknown>)[key])}`);
      out = `{${parts.join(',')}}`;
    }

    seen.delete(obj);
    return out;
  };

  return walk(value);
}

/** FNV-1a 64-bit hash rendered as 16 hex chars. */
export function hashString(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

export function hashState(state: GameState): string {
  return hashString(canonicalize(state));
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function isSerializableState(state: GameState): { ok: boolean; error?: string } {
  try {
    const text = JSON.stringify(state);
    if (typeof text !== 'string') return { ok: false, error: 'not serializable' };
    const roundTrip = JSON.parse(text) as GameState;
    const a = canonicalize(state);
    const b = canonicalize(roundTrip);
    if (a !== b) return { ok: false, error: 'state changes across JSON round-trip' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
