/**
 * Presentation-only card grouping.
 *
 * Entities are never merged in GameState. A group is a view over individual
 * cards with the same definition/face/owner/visibility inside one zone.
 */

import { Entity, Zone } from '@rds/kernel/types';

export interface CardGroup {
  id: string;
  zoneId: string;
  key: string;
  defId: string;
  faceUp: boolean;
  ownerId?: string;
  entityIds: string[];
  topId: string;
  count: number;
}

function faceUp(entity: Entity): boolean {
  return !(entity as Entity & { isMasked?: boolean }).isMasked;
}

function visibilityKey(entity: Entity): string {
  return JSON.stringify(entity.visibility ?? { type: 'PUBLIC' });
}

function definitionKey(entity: Entity): string {
  const custom = entity.components.custom ?? {};
  // Group by the visible card identity. Internal variant ids may differ while
  // the card is still the same pile type (e.g. reprints with different effects).
  return String(
    custom.zh ??
      entity.components.cardFace?.title ??
      custom.name ??
      custom.defId ??
      custom.cardType ??
      entity.id
  );
}

export function cardGroupKey(entity: Entity): string {
  return [
    definitionKey(entity),
    faceUp(entity) ? 'UP' : 'DOWN',
    entity.ownerId ?? '',
    visibilityKey(entity)
  ].join('|');
}

export function buildCardGroups(zone: Zone, entities: Record<string, Entity>): CardGroup[] {
  const buckets = new Map<string, Entity[]>();
  for (const id of zone.orderedEntities) {
    const entity = entities[id];
    if (!entity) continue;
    const key = cardGroupKey(entity);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entity);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    id: `group:${zone.id}:${key}`,
    zoneId: zone.id,
    key,
    defId: definitionKey(bucket[0]),
    faceUp: faceUp(bucket[0]),
    ownerId: bucket[0].ownerId,
    entityIds: bucket.map(entity => entity.id),
    topId: bucket[bucket.length - 1].id,
    count: bucket.length
  }));
}

export function entitiesInGroup(group: CardGroup): string[] {
  return [...group.entityIds];
}
