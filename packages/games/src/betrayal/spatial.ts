/**
 * Betrayal spatial semantics.
 *
 * The kernel stores only the room graph. Doors, one-way drops, floor layers,
 * monster wall-phasing and movement costs live here (module side), exposed
 * through the generic SpatialQuery contract.
 */

import { SpatialQuery } from '@rds/kernel/module';
import { GameState, NodeId } from '@rds/kernel/types';
import { movementCost, nodeGrid, sameFloorLine } from './helpers';

function isIncorporealNpc(state: GameState, actorId?: string): boolean {
  if (!actorId) return false;
  const npc = state.npcs?.[actorId];
  const entity = npc?.entityId ? state.entities[npc.entityId] : undefined;
  return !!entity?.components.custom?.incorporeal;
}

export const BETRAYAL_SPATIAL: SpatialQuery = {
  neighbors(state: GameState, nodeId: NodeId, actorId?: string): NodeId[] {
    const node = state.mapGraph.nodes[nodeId];
    if (!node) return [];
    if (!isIncorporealNpc(state, actorId)) return [...node.neighbors];

    // The phantom drifts through walls: same-floor grid cells are adjacent even
    // when no door/edge exists.
    const grid = nodeGrid(node);
    if (!grid) return [...node.neighbors];
    return Object.values(state.mapGraph.nodes)
      .filter(other => {
        const otherGrid = nodeGrid(other);
        if (!otherGrid || otherGrid.floor !== grid.floor) return false;
        return Math.abs(otherGrid.col - grid.col) + Math.abs(otherGrid.row - grid.row) === 1;
      })
      .map(other => other.id);
  },

  cost(state: GameState, from: NodeId, to: NodeId, actorId?: string): number {
    const node = state.mapGraph.nodes[from];
    if (!node) return Infinity;
    const adjacent = this.neighbors(state, from, actorId).includes(to);
    if (!adjacent) return Infinity;
    const npc = actorId ? state.npcs?.[actorId] : undefined;
    if (npc) return 1;
    return actorId ? movementCost(state, actorId, from) : 1;
  },

  distance(state: GameState, from: NodeId, to: NodeId, actorId?: string): number {
    return this.reachable!(state, from, Infinity, actorId).get(to) ?? Infinity;
  },

  reachable(state: GameState, from: NodeId, budget: number, actorId?: string): Map<NodeId, number> {
    const distances = new Map<NodeId, number>();
    if (!state.mapGraph.nodes[from]) return distances;
    distances.set(from, 0);
    const queue: NodeId[] = [from];

    while (queue.length > 0) {
      queue.sort((a, b) => (distances.get(a) ?? 0) - (distances.get(b) ?? 0));
      const current = queue.shift()!;
      const currentCost = distances.get(current)!;
      for (const to of this.neighbors(state, current, actorId)) {
        const step = this.cost(state, current, to, actorId);
        if (!Number.isFinite(step) || step <= 0) continue;
        const next = currentCost + step;
        if (next > budget) continue;
        if (next < (distances.get(to) ?? Infinity)) {
          distances.set(to, next);
          queue.push(to);
        }
      }
    }
    return distances;
  },

  lineOfSight(state: GameState, from: NodeId, to: NodeId): boolean {
    return from === to || sameFloorLine(state, from, to);
  },

  floorAt(state: GameState, nodeId: NodeId): string | undefined {
    const node = state.mapGraph.nodes[nodeId];
    return node?.layer ?? (node?.props?.floor as string | undefined);
  }
};
