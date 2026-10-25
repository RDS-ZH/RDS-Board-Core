/**
 * Shared type stack for every canvas-painted surface (cards, tiles, sprites).
 *
 * The DOM loads Alibaba PuHuiTi through `@font-face` in styles.css; canvas
 * drawing reads the same family so painted text and HUD text match. Because
 * canvas silently falls back to a system face when the webfont is not yet
 * decoded, `ensureCanvasFontsReady()` must resolve before the first paint.
 */

export const UI_FONT_FAMILY = 'AlibabaPuHuiTi';

/** Full stack for canvas `ctx.font`, webfont first. */
export const CANVAS_FONT_STACK = `"AlibabaPuHuiTi", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`;

/** Serif stack kept for card titles that intentionally read as engraved print. */
export const CANVAS_SERIF_STACK = `"AlibabaPuHuiTi", "Songti SC", "Iowan Old Style", Georgia, serif`;

let readyPromise: Promise<void> | null = null;

/**
 * Resolve once the UI webfont can be used by canvas.
 *
 * `document.fonts.load` only starts the request; awaiting `ready` guarantees the
 * glyphs are decoded. Both are best-effort: a missing font must never block boot.
 */
export function ensureCanvasFontsReady(): Promise<void> {
  if (readyPromise) return readyPromise;

  const fallback = () => new Promise<void>(resolve => window.setTimeout(resolve, 400));

  if (typeof document === 'undefined' || !document.fonts) {
    readyPromise = fallback();
    return readyPromise;
  }

  readyPromise = Promise.race([
    document.fonts
      .load(`600 16px "${UI_FONT_FAMILY}"`)
      .then(() => document.fonts.ready)
      .then(() => undefined)
      .catch(() => undefined),
    // A 6 MB CJK face must not stall the board on a slow link: after 2 s we
    // paint with the system fallback rather than hold the table hostage.
    new Promise<void>(resolve => window.setTimeout(resolve, 2000))
  ]).then(() => undefined);

  return readyPromise;
}
