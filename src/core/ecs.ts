import { Entity, EntityId, GameState, PlayerId, VisibilityRule, Zone, ZoneId, ZoneType } from './types';

/**
 * ECS (Entity-Component-System) & Zone Management
 * Pure state transformations on (Entities, Zones)
 */

export class ECSManager {
  public static createZone(
    state: GameState,
    zoneId: ZoneId,
    name: string,
    type: ZoneType,
    visibility: VisibilityRule = { type: 'PUBLIC' },
    ownerId?: PlayerId,
    spatialLayout?: Zone['spatialLayout'],
    anchorPosition?: [number, number, number]
  ): GameState {
    const zone: Zone = {
      id: zoneId,
      name,
      type,
      visibility,
      ownerId,
      orderedEntities: [],
      spatialLayout: spatialLayout || 'ROW',
      anchorPosition: anchorPosition || [0, 0, 0]
    };

    return {
      ...state,
      zones: {
        ...state.zones,
        [zoneId]: zone
      }
    };
  }

  public static addEntity(state: GameState, entity: Entity): GameState {
    const zone = state.zones[entity.zoneId];
    if (!zone) {
      console.warn(`Zone ${entity.zoneId} does not exist when adding entity ${entity.id}`);
    }

    const updatedZone: Zone = zone
      ? {
          ...zone,
          orderedEntities: [...zone.orderedEntities, entity.id]
        }
      : {
          id: entity.zoneId,
          name: entity.zoneId,
          type: 'BOARD',
          visibility: { type: 'PUBLIC' },
          orderedEntities: [entity.id]
        };

    return {
      ...state,
      entities: {
        ...state.entities,
        [entity.id]: entity
      },
      zones: {
        ...state.zones,
        [entity.zoneId]: updatedZone
      }
    };
  }

  public static moveEntity(
    state: GameState,
    entityId: EntityId,
    targetZoneId: ZoneId,
    targetIndex?: number
  ): GameState {
    const entity = state.entities[entityId];
    if (!entity) return state;

    const sourceZoneId = entity.zoneId;
    const sourceZone = state.zones[sourceZoneId];
    const targetZone = state.zones[targetZoneId];

    if (!targetZone) {
      console.error(`Target zone ${targetZoneId} not found`);
      return state;
    }

    // Remove from source zone (also handles moving within the same zone)
    const sourceEntities = sourceZone
      ? sourceZone.orderedEntities.filter(id => id !== entityId)
      : [];

    // Insert into target zone; when source === target use the already-filtered list
    const sameZone = sourceZoneId === targetZoneId;
    const baseTarget = sameZone ? sourceEntities : targetZone.orderedEntities;
    const targetEntities = [...baseTarget];
    if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= targetEntities.length) {
      targetEntities.splice(targetIndex, 0, entityId);
    } else {
      targetEntities.push(entityId);
    }

    // Update entity zoneId
    const updatedEntity: Entity = {
      ...entity,
      zoneId: targetZoneId
    };

    return {
      ...state,
      entities: {
        ...state.entities,
        [entityId]: updatedEntity
      },
      zones: {
        ...state.zones,
        ...(sourceZone ? { [sourceZoneId]: { ...sourceZone, orderedEntities: sourceEntities } } : {}),
        [targetZoneId]: { ...targetZone, orderedEntities: targetEntities }
      }
    };
  }

  public static updateEntityComponents(
    state: GameState,
    entityId: EntityId,
    components: Partial<Entity['components']>
  ): GameState {
    const entity = state.entities[entityId];
    if (!entity) return state;

    return {
      ...state,
      entities: {
        ...state.entities,
        [entityId]: {
          ...entity,
          components: {
            ...entity.components,
            ...components
          }
        }
      }
    };
  }

  public static getEntitiesInZone(state: GameState, zoneId: ZoneId): Entity[] {
    const zone = state.zones[zoneId];
    if (!zone) return [];
    return zone.orderedEntities.map(id => state.entities[id]).filter(Boolean);
  }
}
