import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';
const __solo = await ensureSoloServer();

/**
 * Captures the card detail sheet by driving the real presenter path: pick an
 * entity with a card face, which emits a notice carrying a `card` payload.
 */
const BASE = __solo.url;

const browser = await launchChromium();

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

try {
  await page.goto(`${BASE}?game=betrayal&scenario=omen_ready`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);
  if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
  await page.waitForTimeout(700);

  for (const kind of ['OMEN', 'ITEM', 'EVENT']) {
    const found = await page.evaluate(target => {
      const app = window.__boardGameApp;
      const board = app.session.getSnapshot().board;
      const entity = Object.values(board.entities).find(
        e => e.components?.cardFace && e.components?.custom?.cardType === target
      );
      if (!entity) return null;
      app.session.pickTarget({ kind: 'entity', id: entity.id });
      return entity.id;
    }, kind);
    if (!found) {
      console.log(`skip ${kind}: no visible card`);
      continue;
    }
    await page.waitForTimeout(500);
    const open = await page.locator('.card-sheet-layer.open .card-sheet').count();
    console.log(`${kind}: entity=${found} sheet=${open ? 'open' : 'MISSING'}`);
    await page.screenshot({ path: `shots/card-sheet-${kind.toLowerCase()}.png` });
    await page.locator('.cs-close').click().catch(() => {});
    await page.waitForTimeout(200);
  }
} finally {
  console.log('ERRORS:', errors.length ? errors.slice(0, 6) : 'none');
  await browser.close();
}
