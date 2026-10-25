/**
 * Generic slot occupancy helpers.
 *
 * Occupancy is derived from Entity.components.spatial.slotId; it is not a
 * second mutable index in GameState. This keeps replay/serialization simple
 * and lets modules own the actual placement rules.
 */

import { EntityId, GameState, PlacementSlot } from './types';

export interface SlotOccupants {
  slot: PlacementSlot;
  entities: EntityId[];
}

export class OccupancyIndex {
  public static from(state: GameState): Map<string, EntityId[]> {
    const index = new Map<string, EntityId[]>();
    for (const entity of Object.values(state.entities)) {
      const slotId = entity.components.spatial?.slotId;
      if (!slotId) continue;
      const list = index.get(slotId) ?? [];
      list.push(entity.id);
      index.set(slotId, list);
    }
    for (const [slotId, ids] of index) {
      const slot = state.mapGraph.slots?.[slotId];
      if (!slot) continue;
      ids.sort((a, b) => {
        const ai = state.entities[a]?.components.spatial?.slotIndex;
        const bi = state.entities[b]?.components.spatial?.slotIndex;
        return (ai ?? 0) - (bi ?? 0) || a.localeCompare(b);
      });
    }
    return index;
  }

  public static occupants(state: GameState, slotId: string): EntityId[] {
    return this.from(state).get(slotId) ?? [];
  }

  public static canPlace(state: GameState, entityId: EntityId, slotId: string): string[] {
    const errors: string[] = [];
    const entity = state.entities[entityId];
    const slot = state.mapGraph.slots?.[slotId];
    if (!entity) return [`entity ${entityId} does not exist`];
    if (!slot) return [`slot ${slotId} does not exist`];
    if (slot.nodeId && !state.mapGraph.nodes[slot.nodeId]) {
      errors.push(`slot ${slotId} references missing node ${slot.nodeId}`);
    }
    if (slot.edgeId && !state.mapGraph.edges[slot.edgeId]) {
      errors.push(`slot ${slotId} references missing edge ${slot.edgeId}`);
    }
    if (slot.zoneId && !state.zones[slot.zoneId]) {
      errors.push(`slot ${slotId} references missing zone ${slot.zoneId}`);
    }
    if (slot.accepts?.entityTypes && !slot.accepts.entityTypes.includes(entity.type)) {
      errors.push(`entity ${entityId} type ${entity.type} is not accepted by ${slotId}`);
    }
    const tags = (entity.components.custom?.tags as string[] | undefined) ?? [];
    if (slot.accepts?.tags && !slot.accepts.tags.some(tag => tags.includes(tag))) {
      errors.push(`entity ${entityId} tags are not accepted by ${slotId}`);
    }
    const capacity = slot.capacity ?? 1;
    const occupants = this.occupants(state, slotId).filter(id => id !== entityId);
    if (occupants.length >= capacity) {
      errors.push(`slot ${slotId} is full (${occupants.length}/${capacity})`);
    }
    return errors;
  }

  /** Place or move an entity. Caller must run module legality first. */
  public static place(
    state: GameState,
    entityId: EntityId,
    slotId: string
  ): { ok: boolean; state: GameState; error?: string } {
    const errors = this.canPlace(state, entityId, slotId);
    if (errors.length > 0) return { ok: false, state, error: errors.join('; ') };

    const slot = state.mapGraph.slots![slotId];
    const entity = state.entities[entityId];
    const occupants = this.occupants(state, slotId).filter(id => id !== entityId);
    const spatial = {
      ...(entity.components.spatial ?? { x: 0, y: 0, z: 0 }),
      ...(slot.local?.position ? { x: slot.local.position[0], y: slot.local.position[1], z: slot.local.position[2] } : {}),
      ...(slot.nodeId ? { nodeId: slot.nodeId } : {}),
      slotId,
      slotIndex: occupants.length
    };

    return {
      ok: true,
      state: {
        ...state,
        entities: {
          ...state.entities,
          [entityId]: {
            ...entity,
            components: { ...entity.components, spatial }
          }
        }
      }
    };
  }

  public static remove(state: GameState, entityId: EntityId): GameState {
    const entity = state.entities[entityId];
    if (!entity?.components.spatial?.slotId) return state;
    const spatial = { ...entity.components.spatial };
    delete spatial.slotId;
    delete spatial.slotIndex;
    return {
      ...state,
      entities: {
        ...state.entities,
        [entityId]: {
          ...entity,
          components: { ...entity.components, spatial }
        }
      }
    };
  }

  public static validate(state: GameState): string[] {
    const errors: string[] = [];
    const index = this.from(state);
    for (const [slotId, ids] of index) {
      const slot = state.mapGraph.slots?.[slotId];
      if (!slot) {
        errors.push(`slot ${slotId} is referenced by ${ids.join(', ')} but not declared`);
        continue;
      }
      const capacity = slot.capacity ?? 1;
      if (ids.length > capacity) {
        errors.push(`slot ${slotId} overflow (${ids.length}/${capacity})`);
      }
    }
    return errors;
  }
}
