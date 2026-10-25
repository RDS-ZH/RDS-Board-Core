/**
 * Pluggable presentation projection.
 *
 * A port converts one logical node into renderer-local world space. The
 * registry applies frame transforms and a final visual-only collision offset.
 * No game rules or state mutation happens here.
 */

import type {
  ProjectedTransform,
  ProjectionContext,
  ProjectionPort
} from '@rds/app/contracts';
import type { MapGraphNode, SpatialFrame } from '@rds/kernel/types';
import { projectNodePosition } from './spatialProjection';

export interface ProjectedNodeEntry {
  id: string;
  node: MapGraphNode;
  transform: ProjectedTransform;
  /** Deterministic offset applied because another node projected to the same XZ. */
  overlapOffset?: [number, number];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Apply a frame chain to a point; frames are local-to-parent transforms. */
export function applyFrameTransform(
  point: [number, number, number],
  frameId: string | undefined,
  frames: Record<string, SpatialFrame> | undefined,
  seen: Set<string> = new Set()
): [number, number, number] {
  if (!frameId || !frames?.[frameId]) return point;
  if (seen.has(frameId)) return point;
  seen.add(frameId);

  const frame = frames[frameId];
  const scale = frame.scale ?? 1;
  const angle = frame.rotationY ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point[0] * scale;
  const z = point[2] * scale;
  const rotated: [number, number, number] = [
    x * cos + z * sin,
    point[1] * scale,
    -x * sin + z * cos
  ];
  const origin = frame.origin ?? [0, 0, 0];
  const local: [number, number, number] = [
    rotated[0] + origin[0],
    rotated[1] + origin[1],
    rotated[2] + origin[2]
  ];
  return applyFrameTransform(local, frame.parentId, frames, seen);
}

/** Default port: world / grid / ring / stack; unknown spaces fall back to world. */
export class DefaultProjectionPort implements ProjectionPort {
  public readonly id = 'default';

  public project(node: MapGraphNode, context: ProjectionContext): ProjectedTransform {
    if (node.positionSpace === 'stack') {
      const spec = context.topology?.geometrySpec;
      const cell = spec?.cellSize ?? 2.86;
      const [col, row, level = 0] = node.position;
      const [cx, cy] = spec?.gridOrigin ?? [2, 2];
      const origin = spec?.origin ?? [0, 0.05, 0];
      return {
        position: [
          origin[0] + (col - cx) * cell,
          origin[1] + level * (spec?.stackHeight ?? 1),
          origin[2] + (row - cy) * cell
        ]
      };
    }

    const p = projectNodePosition(node, context.topology, {
      layerOffsets: context.layerOffsets
    });
    return { position: [p.x, p.y, p.z] };
  }
}

/**
 * Registry + collision resolver.
 *
 * Collision resolution is deliberately world-space and deterministic, not a
 * screen-space postprocess: two logical nodes (e.g. stack levels) that project
 * to the same XZ receive a small radial offset so the upper one remains visible.
 */
export class ProjectionRegistry {
  private readonly defaultPort: ProjectionPort;
  private readonly ports = new Map<string, ProjectionPort>();

  constructor(defaultPort: ProjectionPort = new DefaultProjectionPort()) {
    this.defaultPort = defaultPort;
  }

  public register(space: string, port: ProjectionPort): this {
    this.ports.set(space, port);
    return this;
  }

  public resolve(space: string | undefined): ProjectionPort {
    return this.ports.get(space ?? 'world') ?? this.defaultPort;
  }

  public project(node: MapGraphNode, context: ProjectionContext): ProjectedTransform {
    const port = this.resolve(node.positionSpace ?? 'world');
    const local = port.project(node, context);
    const position = applyFrameTransform(local.position, node.frameId, context.frames);
    return { ...local, position };
  }

  public projectAll(
    nodes: Record<string, MapGraphNode>,
    context: ProjectionContext
  ): Record<string, ProjectedTransform> {
    const layerOffsets = computeAutoLayerOffsets(nodes, context);
    const effectiveContext = layerOffsets ? { ...context, layerOffsets } : context;
    const entries: ProjectedNodeEntry[] = Object.entries(nodes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, node]) => ({ id, node, transform: this.project(node, effectiveContext) }));

    const groups = new Map<string, ProjectedNodeEntry[]>();
    for (const entry of entries) {
      const [x, , z] = entry.transform.position;
      // 0.02 world units: stack levels and duplicated frames collide exactly;
      // distinct room cells are >= 2.8 units apart.
      const key = `${Math.round(x * 50)}:${Math.round(z * 50)}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (let index = 1; index < group.length; index++) {
        const entry = group[index];
        const angle = (index - 1) * GOLDEN_ANGLE;
        const ring = Math.floor((index - 1) / 6);
        const radius = 0.42 + ring * 0.22;
        const ox = Math.cos(angle) * radius;
        const oz = Math.sin(angle) * radius;
        entry.transform.position = [
          entry.transform.position[0] + ox,
          entry.transform.position[1] + index * 0.012,
          entry.transform.position[2] + oz
        ];
        entry.overlapOffset = [ox, oz];
      }
    }

    return Object.fromEntries(entries.map(entry => [entry.id, entry.transform]));
  }
}

export function createDefaultProjectionRegistry(): ProjectionRegistry {
  return new ProjectionRegistry();
}

/**
 * Auto floor layout: keep each layer's current occupied X range separated by
 * the configured gap. Rooms added, removed or moved therefore reflow without
 * sharing the same UI plane.
 */
export function computeAutoLayerOffsets(
  nodes: Record<string, MapGraphNode>,
  context: ProjectionContext
): Record<number, number> | undefined {
  const spec = context.topology?.geometrySpec;
  if (spec?.layerMode !== 'auto') return undefined;
  const cell = spec.cellSize ?? 2.86;
  const [cx] = spec.gridOrigin ?? [2, 2];
  const originX = spec.origin?.[0] ?? 0;
  const ranges = new Map<number, { min: number; max: number }>();

  for (const node of Object.values(nodes)) {
    if (node.positionSpace !== 'grid' || node.position.length < 3) continue;
    const [col, , layer] = node.position;
    const x = originX + (col - cx) * cell;
    const range = ranges.get(layer) ?? { min: x, max: x };
    range.min = Math.min(range.min, x);
    range.max = Math.max(range.max, x);
    ranges.set(layer, range);
  }
  if (ranges.size < 2) return undefined;

  const indices = [...ranges.keys()].sort((a, b) => a - b);
  const ground = indices.includes(1) ? 1 : indices[0];
  const gap = Math.max(spec.layerSpacing ?? 3, 1);
  const width = (index: number) => {
    const range = ranges.get(index)!;
    return Math.max(cell, range.max - range.min + cell);
  };
  const center = (index: number) => {
    const range = ranges.get(index)!;
    return (range.min + range.max) / 2;
  };

  const offsets: Record<number, number> = { [ground]: 0 };
  let previous = ground;
  for (const index of indices.filter(value => value > ground)) {
    const desired = center(previous) + offsets[previous] + width(previous) / 2 + gap + width(index) / 2;
    offsets[index] = desired - center(index);
    previous = index;
  }
  previous = ground;
  for (const index of indices.filter(value => value < ground).reverse()) {
    const desired = center(previous) + offsets[previous] - width(previous) / 2 - gap - width(index) / 2;
    offsets[index] = desired - center(index);
    previous = index;
  }
  return offsets;
}
