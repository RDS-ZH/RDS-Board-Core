import { UniversalGameEngine } from '@rds/kernel/engine';
import { DeterministicPRNG } from '@rds/kernel/prng';
import { Action, PlayerId } from '@rds/kernel/types';
import { withDefaultPayload } from '@rds/kernel/actionPayload';

/**
 * Minimal agent interface for kernel testing and AI integration.
 * A policy only sees legal actions and the projected state — never raw state.
 */
export interface BotPolicy {
  id: string;
  choose(engine: UniversalGameEngine, playerId: PlayerId): Action | null;
}

export class RandomPolicy implements BotPolicy {
  public readonly id: string;
  private rngState: number;

  constructor(seed = 1, id = 'random') {
    this.rngState = seed >>> 0;
    this.id = id;
  }

  public choose(engine: UniversalGameEngine, playerId: PlayerId): Action | null {
    const legal = engine.getLegalActions(playerId);
    if (legal.length === 0) return null;
    const { value, nextSeed } = DeterministicPRNG.next(this.rngState);
    this.rngState = nextSeed;
    return withDefaultPayload(legal[Math.floor(value * legal.length) % legal.length]);
  }
}

export interface BotRunReport {
  steps: number;
  errors: string[];
  finished: boolean;
}

/**
 * Plays focus players in seat order until `maxSteps` or game over.
 * All policies share the kernel's strict validation, so an illegal choice is
 * reported instead of silently corrupting the state.
 */
export function runPolicies(
  engine: UniversalGameEngine,
  policies: Record<PlayerId, BotPolicy>,
  maxSteps = 100
): BotRunReport {
  const errors: string[] = [];
  let steps = 0;

  while (steps < maxSteps && !engine.getRawState().gameOver) {
    const focus = engine.getFocusActors();
    if (focus.length === 0) break;

    let progressed = false;
    for (const actorId of focus) {
      const npc = engine.getRawState().npcs?.[actorId];
      const policy = policies[actorId] ?? (npc?.controllerId ? policies[npc.controllerId] : undefined);
      const fallback = engine.getLegalActions(actorId)[0];
      const action = policy
        ? policy.choose(engine, actorId)
        : fallback
        ? withDefaultPayload(fallback)
        : null;
      if (!action) continue;

      const result = engine.dispatch(action);
      if (!result.ok) {
        errors.push(`${actorId}:${action.type}: ${result.error}`);
      } else {
        steps++;
      }
      progressed = true;
      break;
    }

    if (!progressed) break;
  }

  return { steps, errors, finished: engine.getRawState().gameOver };
}
