import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

/**
 * Layout probe (docs/UI-ARCHITECTURE.md §5).
 *
 * The UI matrix only proves the page opens and clicks work; it cannot catch an
 * overlapping panel, a zero-width dock or 10px body text. This probe asserts
 * the geometry and readability floors across the aspect ratios the product
 * targets: 16:9, 16:10, 3:2 and 4:3, plus a phone and a tablet.
 *
 * Run: node scripts/probe-ui-layout.mjs
 */
// Solo mode: a Hub-backed shell would show the lobby and never mount the game.
const dev = await ensureSoloServer();
const browser = await launchChromium();

/** Aspect-ratio matrix: same panel must survive all four targets. */
const VIEWPORTS = [
  { name: '16:9  desktop', w: 1920, h: 1080 },
  { name: '16:10 desktop', w: 1680, h: 1050 },
  { name: '3:2   laptop ', w: 1440, h: 960 },
  { name: '4:3   monitor', w: 1280, h: 960 },
  { name: '4:3   small  ', w: 1024, h: 768 },
  { name: '3:2   tablet ', w: 820, h: 1180 },
  { name: 'phone      ', w: 390, h: 844 }
];

const MIN_FONT_PX = 12;
const MIN_TOUCH_PX = 44;
const OVERLAP_TOLERANCE = 4;

const failures = [];
let checked = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errors = [];
  const isEnvNoise = t => /\/healthz/i.test(t) || /status of 502/i.test(t);
  page.on('pageerror', e => {
    if (!isEnvNoise(e.message)) errors.push(e.message);
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (isEnvNoise(m.text())) return;
    errors.push(m.text());
  });

  try {
    await page.goto(`${dev.url}?game=betrayal&scenario=exploration`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForTimeout(4200);
    if (await page.locator('#boot-enter').count()) await page.click('#boot-enter').catch(() => {});
    await page.waitForTimeout(2000);

    // Guard against the lobby: without this, a Hub-backed shell would leave the
    // game DOM unmounted and every geometry assertion below would pass vacuously.
    const mounted = await page.evaluate(() => ({
      dock: !!document.querySelector('#action-dock'),
      canvas: !!document.querySelector('canvas'),
      lobbyVisible: (() => {
        const l = document.querySelector('#lobby-root');
        return l ? !l.hidden : false;
      })()
    }));
    if (!mounted.dock || !mounted.canvas || mounted.lobbyVisible) {
      failures.push(`${vp.name}: never reached the game view (dock=${mounted.dock} canvas=${mounted.canvas} lobby=${mounted.lobbyVisible})`);
      await page.close();
      continue;
    }

    const report = await page.evaluate(
      ({ minFont, minTouch, tol }) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const box = el => {
          const r = el.getBoundingClientRect();
          return { t: r.top, l: r.left, w: r.width, h: r.height, b: r.bottom, r: r.right };
        };
        const panels = {};
        for (const [key, sel] of Object.entries({
          rail: '#player-rail',
          room: '#room-card',
          mini: '#mansion-minimap',
          feed: '#activity-feed',
          dock: '#action-dock'
        })) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const b = box(el);
          if (b.w < 1 || b.h < 1) continue;
          panels[key] = b;
        }

        // 1) no panel may leave the viewport
        const overflow = [];
        for (const [k, b] of Object.entries(panels)) {
          if (b.l < -1 || b.r > vw + 1) overflow.push(`${k}:x`);
          if (b.t < -1 || b.b > vh + 1) overflow.push(`${k}:y`);
        }

        // 2) no two panels may overlap
        const overlaps = [];
        const keys = Object.keys(panels);
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            const a = panels[keys[i]];
            const b = panels[keys[j]];
            const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            if (oy > tol && ox > tol) {
              overlaps.push(`${keys[i]}x${keys[j]}(${Math.round(ox)}x${Math.round(oy)})`);
            }
          }
        }

        // 3) every visible text node respects the floor
        const small = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (!text) continue;
          const parent = node.parentElement;
          if (!parent) continue;
          if (seen.has(parent)) continue;
          seen.add(parent);
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
          const rect = parent.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) continue;
          const size = parseFloat(style.fontSize);
          if (Number.isFinite(size) && size < minFont - 0.01) {
            small.push(`${parent.className || parent.tagName}:${size}px`);
          }
        }

        // 4) touch targets on narrow screens
        const tiny = [];
        const narrow = vw < 900;
        for (const el of document.querySelectorAll('button, [role="button"]')) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.height < minTouch || r.width < minTouch) {
            tiny.push(`${el.className || el.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }

        const dock = panels.dock ?? null;
        return {
          vw,
          vh,
          ratio: +(vw / vh).toFixed(3),
          panels,
          overflow,
          overlaps,
          small: [...new Set(small)].slice(0, 12),
          smallCount: small.length,
          tiny: narrow ? [...new Set(tiny)].slice(0, 8) : [],
          tinyCount: narrow ? tiny.length : 0,
          dockZero: !!dock && (dock.w < 40 || dock.h < 40)
        };
      },
      { minFont: MIN_FONT_PX, minTouch: MIN_TOUCH_PX, tol: OVERLAP_TOLERANCE }
    );

    checked++;
    const tag = `${vp.name} ${vp.w}x${vp.h} (${report.ratio})`;
    const problems = [];
    if (report.overflow.length) problems.push(`overflow ${report.overflow.join(',')}`);
    if (report.overlaps.length) problems.push(`overlap ${report.overlaps.join(',')}`);
    if (report.dockZero) problems.push('dock collapsed');
    if (report.smallCount) problems.push(`${report.smallCount} small fonts (${report.small.slice(0, 5).join(', ')})`);
    if (report.tinyCount) problems.push(`${report.tinyCount} small touch targets`);

    if (problems.length) {
      failures.push(`${tag}: ${problems.join(' | ')}`);
      console.log(`  ✗ ${tag}`);
      for (const p of problems) console.log(`      ${p}`);
    } else {
      console.log(`  ✓ ${tag}`);
    }
    if (errors.length) failures.push(`${tag}: console ${errors.slice(0, 2).join(' | ')}`);
  } catch (error) {
    failures.push(`${vp.name}: threw — ${error?.message ?? error}`);
  }
  await page.close();
}

console.log(`\nUI layout probe: ${checked}/${VIEWPORTS.length} viewports`);
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nAll layout, readability and touch-target checks passed.');
}

await browser.close();
dev.stop();
