import { UniversalGameEngine, ExportedLog, ReplayReport } from '../core/engine';
import { GameModule } from '../core/module';
import { Action, DispatchResult, PlayerId, ProjectedGameState } from '../core/types';
import { applyPatch, diffJson, PatchOp } from './patch';

/**
 * Server-authoritative room adapter.
 *
 * The room owns one engine instance and never hands raw state to clients:
 * each viewer receives its own projection O(s, i) plus incremental patches.
 * This is the seam where a Durable Object / Phoenix Channel / Tokio actor
 * would sit; the kernel itself stays transport-agnostic.
 */

export interface RoomUpdate {
  viewer: PlayerId | 'GOD';
  revision: number;
  baseRevision: number;
  full: boolean;
  state?: ProjectedGameState;
  patches: PatchOp[];
}

interface ViewerCache {
  revision: number;
  projection: unknown;
}

export interface RoomJoinOptions {
  token?: string;
}

export type RoomAuthorizer = (viewer: PlayerId | 'GOD', token?: string) => boolean;

/** Transport-neutral room port; HTTP/WebSocket adapters implement the same shape. */
export interface RoomTransport {
  join(viewer: PlayerId | 'GOD', token?: string): RoomUpdate;
  leave(viewer: PlayerId | 'GOD'): void;
  submit(action: Action): DispatchResult;
  snapshot(viewer: PlayerId | 'GOD'): RoomUpdate;
  delta(viewer: PlayerId | 'GOD'): RoomUpdate;
}

export class GameRoom implements RoomTransport {
  public readonly engine: UniversalGameEngine;
  private revision = 0;
  private caches = new Map<string, ViewerCache>();
  private authorizer?: RoomAuthorizer;

  constructor(module: GameModule, seed = 1, authorizer?: RoomAuthorizer, scenario?: string) {
    this.engine = new UniversalGameEngine(module, seed, scenario ? { scenario } : undefined);
    this.authorizer = authorizer;
  }

  public getRevision(): number {
    return this.revision;
  }

  public join(viewer: PlayerId | 'GOD', token?: string): RoomUpdate {
    if (this.authorizer && !this.authorizer(viewer, token)) {
      throw new Error(`unauthorized room viewer: ${viewer}`);
    }
    this.caches.set(viewer, {
      revision: this.revision,
      projection: this.projectionJson(viewer)
    });
    return {
      viewer,
      revision: this.revision,
      baseRevision: this.revision,
      full: true,
      state: this.engine.getProjectedStateFor(viewer),
      patches: []
    };
  }

  public leave(viewer: PlayerId | 'GOD'): void {
    this.caches.delete(viewer);
  }

  public submit(action: Action): DispatchResult {
    const result = this.engine.dispatch(action);
    if (result.ok) this.revision += 1;
    return result;
  }

  /** Projection for a specific viewer without changing the room's own viewer. */
  public snapshot(viewer: PlayerId | 'GOD'): RoomUpdate {
    const state = this.engine.getProjectedStateFor(viewer);
    return {
      viewer,
      revision: this.revision,
      baseRevision: this.revision,
      full: true,
      state,
      patches: []
    };
  }

  /** Legal actions for a room client; clients still map these to UiAction DTOs. */
  public actions(viewer: PlayerId | 'GOD'): Action[] {
    return this.engine.getProjectedStateFor(viewer).legalActions;
  }

  /**
   * Incremental update o_{i,t-1} → o_{i,t}.
   * Hidden information never appears in a patch because the diff is computed on
   * the scrubbed projection, not on the raw state.
   */
  public delta(viewer: PlayerId | 'GOD'): RoomUpdate {
    const current = this.projectionJson(viewer);
    const cache = this.caches.get(viewer);

    if (!cache) {
      this.caches.set(viewer, { revision: this.revision, projection: current });
      return {
        viewer,
        revision: this.revision,
        baseRevision: this.revision,
        full: true,
        state: this.engine.getProjectedStateFor(viewer),
        patches: []
      };
    }

    const patches = diffJson(cache.projection, current);
    const baseRevision = cache.revision;

    if (patches.length > 0) {
      this.caches.set(viewer, { revision: this.revision, projection: current });
    }

    return {
      viewer,
      revision: this.revision,
      baseRevision,
      full: false,
      patches
    };
  }

  /** Applies a delta exactly as a client would, for tests and replay tooling. */
  public applyClientDelta(previous: unknown, update: RoomUpdate): unknown {
    return applyPatch(previous, update.patches);
  }

  /** Serializable room checkpoint: seed + append-only action log. */
  public exportState(): ExportedLog & { revision: number } {
    return { ...this.engine.exportLog(), revision: this.revision };
  }

  /** Restore a room from a checkpoint (replay-through, not a raw state dump). */
  public restore(payload: ExportedLog & { revision?: number }): ReplayReport {
    const report = this.engine.loadLog({
      moduleId: payload.moduleId,
      seed: payload.seed,
      scenario: payload.scenario,
      actions: payload.actions,
      stateHash: payload.stateHash,
      schemaVersion: payload.schemaVersion,
      engineVersion: payload.engineVersion
    });
    this.revision = payload.revision ?? payload.actions.length;
    this.caches.clear();
    return report;
  }

  private projectionJson(viewer: PlayerId | 'GOD'): unknown {
    return JSON.parse(JSON.stringify(this.engine.getProjectedStateFor(viewer)));
  }
}
