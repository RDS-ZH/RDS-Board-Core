/**
 * Pure screen-space label layout.
 *
 * This module has no DOM/Three dependency, so it can be unit-tested. The
 * overlay measures/projects anchors and feeds them in; the layout returns
 * non-overlapping placements with enough information to draw leader lines.
 */

export interface LabelAnchor {
  id: string;
  text: string;
  x: number;
  y: number;
  priority: number;
  kind?: string;
  count?: number;
  interactive?: boolean;
  groupId?: string;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelPlacement extends LabelAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const PADDING = 4;
const OFFSET = 12;
const MIN_HEIGHT = 24;

/** Rough advance width per glyph for the fallback estimate. */
const ESTIMATED_CHAR_WIDTH = 12;
/** Chip horizontal padding (8px each side) plus 1px border on both sides. */
const CHIP_CHROME = 18;

/**
 * Width of one label's text in CSS pixels.
 *
 * The overlay injects a canvas-backed measurer so CJK and Latin text get exact
 * widths; the fallback estimate keeps this module DOM-free for unit tests.
 */
export type TextMeasurer = (text: string) => number;

export function measureLabel(
  anchor: LabelAnchor,
  measure?: TextMeasurer
): { width: number; height: number } {
  const text = anchor.count && anchor.count > 1 ? `${anchor.text} ×${anchor.count}` : anchor.text;
  const textWidth = measure ? measure(text) : [...text].length * ESTIMATED_CHAR_WIDTH;
  return {
    width: Math.min(300, Math.max(40, Math.ceil(textWidth) + CHIP_CHROME)),
    height: MIN_HEIGHT
  };
}

function intersects(a: ScreenRect, b: ScreenRect): boolean {
  return !(
    a.x + a.width + PADDING <= b.x ||
    b.x + b.width + PADDING <= a.x ||
    a.y + a.height + PADDING <= b.y ||
    b.y + b.height + PADDING <= a.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Place labels by descending priority. All labels are movable; if none of the
 * candidates fit, lower-priority labels are dropped rather than overlapped.
 */
export function layoutLabels(
  anchors: LabelAnchor[],
  viewport: Viewport,
  obstacles: ScreenRect[] = [],
  measure?: TextMeasurer
): LabelPlacement[] {
  const placed: LabelPlacement[] = [];
  const occupied: ScreenRect[] = [...obstacles];
  const sorted = [...anchors].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  for (const anchor of sorted) {
    if (anchor.x < 0 || anchor.y < 0 || anchor.x > viewport.width || anchor.y > viewport.height) {
      continue;
    }
    const { width, height } = measureLabel(anchor, measure);
    const candidates = [
      { left: anchor.x - width / 2, top: anchor.y - height - OFFSET },
      { left: anchor.x - width / 2, top: anchor.y + OFFSET },
      { left: anchor.x + OFFSET, top: anchor.y - height / 2 },
      { left: anchor.x - width - OFFSET, top: anchor.y - height / 2 },
      { left: anchor.x + OFFSET, top: anchor.y - height - OFFSET },
      { left: anchor.x - width - OFFSET, top: anchor.y - height - OFFSET },
      { left: anchor.x + OFFSET, top: anchor.y + OFFSET },
      { left: anchor.x - width - OFFSET, top: anchor.y + OFFSET }
    ];

    let chosen: ScreenRect | null = null;
    for (const candidate of candidates) {
      const rect = {
        x: clamp(candidate.left, PADDING, viewport.width - width - PADDING),
        y: clamp(candidate.top, PADDING, viewport.height - height - PADDING),
        width,
        height
      };
      if (!occupied.some(other => intersects(rect, other))) {
        chosen = rect;
        break;
      }
    }

    if (!chosen) continue;
    occupied.push(chosen);
    placed.push({
      ...anchor,
      left: chosen.x,
      top: chosen.y,
      width,
      height,
      anchorX: anchor.x,
      anchorY: anchor.y
    });
  }

  return placed;
}
