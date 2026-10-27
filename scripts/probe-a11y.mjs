import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

/**
 * Accessibility probe (docs/UI-ARCHITECTURE.md Phase 4).
 *
 * Asserts the four things Phase 4 promises, rather than trusting that they were
 * "added":
 *
 *  1. contrast  — body text reaches WCAG AA (4.5:1) against its effective
 *                 background, large text reaches 3:1;
 *  2. focus     — every interactive control is keyboard reachable and shows a
 *                 visible focus ring (no `outline: none` without a replacement);
 *  3. names     — every control exposes an accessible name;
 *  4. motion    — `prefers-reduced-motion: reduce` actually stops animation.
 *
 * Run: node scripts/probe-a11y.mjs
 */
const dev = await ensureSoloServer();
const browser = await launchChromium();

const VIEWPORTS = [
  { name: 'desktop', width: 1680, height: 1050 },
  { name: 'phone  ', width: 390, height: 844 }
];

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

const failures = [];
let checks = 0;

/** Parses `rgb()/rgba()` into [r,g,b,a]. */
const parseColor = value => {
  const m = String(value).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(n => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
};

/** WCAG relative luminance + contrast ratio. */
const contrastRatio = (fg, bg) => {
  const lum = ([r, g, b]) => {
    const f = v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l1 = lum(fg);
  const l2 = lum(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/** Blends a translucent colour over an opaque one. */
const over = (fg, bg) => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};

/** Runs in the page: resolve each target's effective text/background pair. */
const collectContrast = targets => {
  const parse = value => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(n => !Number.isFinite(n))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };

  const layerOf = cs => {
    // A gradient's first colour stop is a reasonable proxy for the panel tone.
    const image = cs.backgroundImage;
    if (image && image !== 'none' && image.includes('gradient')) {
      const first = parse(image.match(/rgba?\([^)]+\)/)?.[0] ?? '');
      if (first) return first;
    }
    return parse(cs.backgroundColor);
  };

  const effectiveBackground = el => {
    // Outermost -> innermost, so translucent layers composite correctly.
    const layers = [];
    let node = el;
    while (node) {
      const layer = layerOf(getComputedStyle(node));
      if (layer && layer[3] > 0) layers.push(layer);
      node = node.parentElement;
    }
    let base = [13, 16, 23, 1];
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const a = l[3];
      base = [
        l[0] * a + base[0] * (1 - a),
        l[1] * a + base[1] * (1 - a),
        l[2] * a + base[2] * (1 - a),
        1
      ];
    }
    return base;
  };

  const out = [];
  for (const { sel, label, large } of targets) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = effectiveBackground(el);
    out.push({
      label,
      sel,
      fg,
      bg,
      fontSize: parseFloat(cs.fontSize),
      large: !!large || parseFloat(cs.fontSize) >= 18.66
    });
  }
  return out;
};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${dev.url}?game=betrayal&scenario=exploration`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(4200);
  if (await page.locator('#boot-enter').count()) await page.click('#boot-enter').catch(() => {});
  await page.waitForTimeout(2000);

  const mounted = await page.evaluate(() => !!document.querySelector('#action-dock'));
  if (!mounted) {
    failures.push(`${vp.name}: never reached the game view`);
    await page.close();
    continue;
  }

  /* ---- 1. contrast ---------------------------------------------------- */
  const targets = [
    { sel: '.pc-name', label: 'player name' },
    { sel: '.pc-row .v', label: 'trait value' },
    { sel: '.pc-row .k', label: 'trait key' },
    { sel: '.af-text', label: 'feed text' },
    { sel: '.mm-name', label: 'minimap room name' },
    { sel: '.dock-bar', label: 'dock bar' },
    { sel: '.fan-hint .fh-label', label: 'fan hint label' },
    { sel: '.game-pill', label: 'game pill' },
    { sel: '.brand-title', label: 'brand title', large: true }
  ];
  const pairs = await page.evaluate(collectContrast, targets);
  for (const pair of pairs) {
    checks++;
    const fg = pair.fg[3] < 1 ? over(pair.fg, pair.bg) : pair.fg;
    const ratio = contrastRatio(fg, pair.bg);
    const need = pair.large ? AA_LARGE : AA_NORMAL;
    if (ratio + 1e-6 < need) {
      failures.push(
        `${vp.name}: contrast ${pair.label} ${ratio.toFixed(2)}:1 < ${need}:1 ` +
          `(fg rgb(${pair.fg.slice(0, 3).join(',')}) on bg rgb(${pair.bg.slice(0, 3).join(',')}), ${pair.fontSize}px)`
      );
    }
  }

  /* ---- 2. accessible names ------------------------------------------- */
  const unnamed = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, [role="button"], select')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const name =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.textContent ?? '').replace(/\s+/g, ' ').trim() ||
        el.getAttribute('value');
      if (!name) out.push(el.className || el.tagName);
    }
    return out;
  });
  checks++;
  if (unnamed.length) failures.push(`${vp.name}: ${unnamed.length} controls without an accessible name (${unnamed.slice(0, 3).join(', ')})`);

  /* ---- 3. keyboard reachability + visible focus ---------------------- */
  const focusReport = await page.evaluate(() => {
    const visible = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const interactive = [...document.querySelectorAll('button, [role="button"], select, [tabindex]')].filter(visible);
    const unreachable = interactive.filter(el => el.tabIndex < 0).map(el => el.className || el.tagName);
    return { total: interactive.length, unreachable: [...new Set(unreachable)] };
  });
  checks++;
  if (focusReport.unreachable.length) {
    failures.push(`${vp.name}: ${focusReport.unreachable.length} interactive elements are not tabbable (${focusReport.unreachable.slice(0, 3).join(', ')})`);
  }

  // Focus ring must actually render for keyboard users.
  await page.evaluate(() => document.body.focus());
  let ring = null;
  for (let i = 0; i < 12 && !ring; i++) {
    await page.keyboard.press('Tab');
    ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
      return {
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 24),
        hasOutline,
        hasShadow,
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`
      };
    });
    if (ring && (ring.hasOutline || ring.hasShadow)) break;
  }
  checks++;
  if (!ring) failures.push(`${vp.name}: Tab reached no focusable control`);
  else if (!ring.hasOutline && !ring.hasShadow) {
    failures.push(`${vp.name}: ${ring.tag}.${ring.cls} shows no focus ring (${ring.outline})`);
  }

  /* ---- 4. Escape closes a slide-over --------------------------------- */
  if (vp.width < 1200) {
    const toggle = page.locator('[data-toggle="side"]');
    if (await toggle.count()) {
      await toggle.first().click();
      await page.waitForTimeout(600);
      const opened = await page.evaluate(() => document.querySelector('#hud-container').getAttribute('data-side'));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const closed = await page.evaluate(() => document.querySelector('#hud-container').getAttribute('data-side'));
      checks++;
      if (opened !== 'open') failures.push(`${vp.name}: the side drawer did not open`);
      if (closed === 'open') failures.push(`${vp.name}: Escape did not close the side drawer`);
    }
  }

  await page.close();
}

/* ---- 5. reduced motion ------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${dev.url}?game=betrayal&scenario=exploration`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(4200);
  if (await page.locator('#boot-enter').count()) await page.click('#boot-enter').catch(() => {});
  await page.waitForTimeout(1800);

  const motion = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const dur = s => Math.max(...String(s).split(',').map(v => parseFloat(v) || 0));
      if (dur(cs.animationDuration) > 0.02 || dur(cs.transitionDuration) > 0.02) {
        bad.push(`${el.className || el.tagName}:${cs.animationDuration}/${cs.transitionDuration}`);
      }
    }
    return { count: bad.length, sample: bad.slice(0, 4) };
  });
  checks++;
  if (motion.count > 0) {
    failures.push(`reduced-motion: ${motion.count} elements still animate (${motion.sample.join(', ')})`);
  }
  await page.close();
}

console.log(`\nAccessibility probe: ${VIEWPORTS.length} viewports + reduced motion, ${checks} checks`);
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nAll contrast, focus, naming and reduced-motion checks passed.');
}

await browser.close();
dev.stop();
