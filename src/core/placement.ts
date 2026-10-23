/**
 * Generic placement command helpers.
 *
 * The kernel provides the action contract and occupancy mechanics; modules
 * still decide who may place what, and whether a target slot is legal.
 */

import { OccupancyIndex } from './occupancy';
import { Action, EntityId, GameState } from './types';

export interface PlaceEntityAction extends Action {
  type: 'PLACE_ENTITY';
  entityId: EntityId;
  targetSlotId: string;
}

export function makePlaceEntityAction(
  actorId: string,
  entityId: EntityId,
  slotId: string
): PlaceEntityAction {
  return {
    type: 'PLACE_ENTITY',
    playerId: actorId,
    actorId,
    entityId,
    targetSlotId: slotId
  };
}

/** Apply a placement after the module has accepted the action as legal. */
export function applyPlaceEntityAction(
  state: GameState,
  action: Action
): { ok: boolean; state: GameState; error?: string } {
  if (!action.targetSlotId || !action.entityId) {
    return { ok: false, state, error: 'PLACE_ENTITY requires entityId and targetSlotId' };
  }
  return OccupancyIndex.place(state, action.entityId, action.targetSlotId);
}
