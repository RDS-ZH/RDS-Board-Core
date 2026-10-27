import {
  ActorId,
  GameState,
  RollWindow,
  RollWindowResult,
  RollWindowSlot
} from './types';

/**
 * Two-phase check window (K4).
 *
 * A trait/dice check used to be a single atomic dispatch: any "luck" item was
 * spent automatically by an internal policy, so the player never got to decide
 * after seeing the roll. This primitive splits a check into the two moments the
 * tabletop actually has:
 *
 *   DECLARE  → modifiers are chosen *before* the dice are thrown
 *   REACT    → responses are chosen *after* the result is known
 *   RESOLVED → the module applies the final total
 *
 * The kernel owns only the lifecycle and the bookkeeping: option ids and their
 * effects stay module-side, so no game semantics leak into `core`.
 */

export interface RollWindowMutation {
  state: GameState;
  ok: boolean;
  error?: string;
}

/** Every option id picked across the slots of one phase. */
function flatten(slots: RollWindowSlot[]): string[] {
  return slots.flatMap(slot => slot.picked);
}

export class RollWindowManager {
  /** Push a window; the module is responsible for starting it in DECLARE. */
  public static open(state: GameState, window: RollWindow): GameState {
    return { ...state, rollWindows: [...(state.rollWindows ?? []), window] };
  }

  /** Innermost open window, or null. */
  public static current(state: GameState): RollWindow | null {
    const windows = state.rollWindows ?? [];
    return windows.length === 0 ? null : windows[windows.length - 1];
  }

  /** Options the actor may still pick in the window's current phase. */
  public static optionsFor(window: RollWindow, actorId: ActorId): string[] {
    const slots = window.phase === 'DECLARE' ? window.declares : window.phase === 'REACT' ? window.reacts : [];
    const slot = slots.find(entry => entry.actorId === actorId);
    if (!slot) return [];
    return slot.options.filter(option => !slot.picked.includes(option));
  }

  /** Everyone who may act in the current phase. */
  public static actorsFor(window: RollWindow): ActorId[] {
    const slots = window.phase === 'DECLARE' ? window.declares : window.phase === 'REACT' ? window.reacts : [];
    return slots.map(slot => slot.actorId);
  }

  /** Pick a modifier/reaction in the current phase. */
  public static pick(
    state: GameState,
    actorId: ActorId,
    optionId: string
  ): RollWindowMutation {
    const window = this.current(state);
    if (!window) return { state, ok: false, error: 'no roll window is open' };
    if (window.phase === 'RESOLVED') return { state, ok: false, error: 'roll window already resolved' };

    const key = window.phase === 'DECLARE' ? 'declares' : 'reacts';
    const slots = window[key];
    const index = slots.findIndex(slot => slot.actorId === actorId);
    if (index < 0) return { state, ok: false, error: `${actorId} may not act in ${window.phase}` };

    const slot = slots[index];
    if (!slot.options.includes(optionId)) {
      return { state, ok: false, error: `${optionId} is not offered to ${actorId}` };
    }
    if (slot.picked.includes(optionId)) {
      return { state, ok: false, error: `${optionId} was already picked` };
    }

    const nextSlots = slots.map((entry, i) =>
      i === index ? { ...entry, picked: [...entry.picked, optionId] } : entry
    );
    const updated: RollWindow = { ...window, [key]: nextSlots } as RollWindow;
    return { state: this.replace(state, updated), ok: true };
  }

  /**
   * Record the thrown dice and move DECLARE → REACT.
   *
   * Rolling is a module concern (it owns the PRNG and the dice spec); the kernel
   * only stores the outcome and advances the phase.
   */
  public static record(state: GameState, result: RollWindowResult): RollWindowMutation {
    const window = this.current(state);
    if (!window) return { state, ok: false, error: 'no roll window is open' };
    if (window.phase !== 'DECLARE') {
      return { state, ok: false, error: `cannot roll during ${window.phase}` };
    }
    const updated: RollWindow = { ...window, phase: 'REACT', result };
    return { state: this.replace(state, updated), ok: true };
  }

  /**
   * Amend the stored result in place (a reaction such as a reroll or +1).
   * Stays in REACT so several responses can stack.
   */
  public static amend(state: GameState, result: RollWindowResult): RollWindowMutation {
    const window = this.current(state);
    if (!window) return { state, ok: false, error: 'no roll window is open' };
    if (window.phase !== 'REACT') {
      return { state, ok: false, error: `cannot amend during ${window.phase}` };
    }
    return { state: this.replace(state, { ...window, result }), ok: true };
  }

  /**
   * Close the window and hand the collected choices back to the module.
   *
   * Resolution is legal from any phase: a caller with nothing to declare or
   * react to must always be able to finish, otherwise the table deadlocks.
   */
  public static resolve(state: GameState): {
    state: GameState;
    window: RollWindow | null;
    declared: string[];
    reacted: string[];
  } {
    const window = this.current(state);
    if (!window) return { state, window: null, declared: [], reacted: [] };

    const resolved: RollWindow = { ...window, phase: 'RESOLVED' };
    const windows = (state.rollWindows ?? []).slice(0, -1);
    return {
      state: { ...state, rollWindows: windows },
      window: resolved,
      declared: flatten(resolved.declares),
      reacted: flatten(resolved.reacts)
    };
  }

  public static isPending(state: GameState): boolean {
    const window = this.current(state);
    return !!window && window.phase !== 'RESOLVED';
  }

  private static replace(state: GameState, window: RollWindow): GameState {
    const windows = [...(state.rollWindows ?? [])];
    windows[windows.length - 1] = window;
    return { ...state, rollWindows: windows };
  }
}
