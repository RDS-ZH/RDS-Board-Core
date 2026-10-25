/**
 * UI-side spatial projection.
 *
 * Core nodes carry high-dimensional logical coordinates. This module is the
 * only place that maps them to three.js world positions. It deliberately
 * separates layers along a chosen axis so two logical planes cannot visually
 * overlap after projection.
 */

import { MapGraphNode, TopologySpec } from '@rds/kernel/types';

export interface SpatialProjectionOptions {
  /** Override the layer axis for a specific view. */
  layerAxis?: 'x' | 'y' | 'z';
  /** Override layer spacing for a specific view. */
  layerSpacing?: number;
  /** Per-layer offsets computed from the current floor bounds (auto layout). */
  layerOffsets?: Record<number, number>;
}

export interface ProjectedPosition {
  x: number;
  y: number;
  z: number;
}

/** Project a node's high-dimensional coordinate into renderer world space. */
export function projectNodePosition(
  node: MapGraphNode,
  topology?: TopologySpec,
  options: SpatialProjectionOptions = {}
): ProjectedPosition {
  const p = node.position;
  const spec = topology?.geometrySpec;
  const space = node.positionSpace ?? 'world';

  if (space === 'grid' && p.length >= 3) {
    const cell = spec?.cellSize ?? 2.86;
    const [col, row, layerIndex] = p;
    const [cx, cy] = spec?.gridOrigin ?? [2, 2];
    const origin = spec?.origin ?? [0, 0.05, 0];
    const axis = options.layerAxis ?? spec?.layerAxis ?? 'x';
    const spacing = options.layerSpacing ?? spec?.layerSpacing ?? 9.6;
    const layerOffset = options.layerOffsets?.[layerIndex] ?? (layerIndex - 1) * spacing;
    const baseX = origin[0] + (col - cx) * cell;
    const baseZ = origin[2] + (row - cy) * cell;
    const baseY = origin[1];
    if (axis === 'x') return { x: baseX + layerOffset, y: baseY, z: baseZ };
    if (axis === 'y') return { x: baseX, y: baseY + layerOffset, z: baseZ };
    return { x: baseX, y: baseY, z: baseZ + layerOffset };
  }

  if (space === 'ring' && p.length >= 1) {
    const spec = topology?.geometrySpec;
    const index = p[0];
    const angle = index * (Math.PI / 2);
    const radiusX = spec?.radiusX ?? 8.9;
    const radiusZ = spec?.radiusZ ?? 5.6;
    return {
      x: Math.sin(angle) * radiusX,
      y: spec?.origin?.[1] ?? 0.1,
      z: Math.cos(angle) * radiusZ
    };
  }

  // Hex dual / ring / world positions already carry world coordinates.
  return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
}

export function projectNodeTuple(
  node: MapGraphNode,
  topology?: TopologySpec,
  options: SpatialProjectionOptions = {}
): [number, number, number] {
  const p = projectNodePosition(node, topology, options);
  return [p.x, p.y, p.z];
}
