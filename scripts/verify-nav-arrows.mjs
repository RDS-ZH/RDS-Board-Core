import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

const dev = await ensureSoloServer();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log('--- Testing Betrayal In-World Floor Navigation Arrows ---');
await page.goto(`${dev.url}?game=betrayal&scenario=exploration`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1400);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(600);

const step1 = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const p1 = app.session.getSnapshot().board.players.p1;
  const currentRoom = p1.customProps.currentRoomId;
  const movesLeft = p1.customProps.movesLeft;
  const arrowsCount = app.scene.navArrowMeshes.length;

  return { currentRoom, movesLeft, arrowsCount };
});
console.log('Initial step 1:', step1);

await page.screenshot({ path: 'shots/betrayal-nav-arrow-ballroom.png' });
console.log('Saved shots/betrayal-nav-arrow-ballroom.png');

// Find the screen coordinate of the navigation arrow pointing to Foyer (East door of Ballroom)
const clickNavResult = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const scene = app.scene;
  const camera = scene.camera;
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();

  // Find the nav arrow registered for room_foyer
  const arrowEntry = scene.navArrowMeshes.find(item => {
    return item.group.children.some(c => c.material?.color?.getHex?.() === 0x22dd77);
  });

  if (!arrowEntry) return { ok: false, error: 'Nav arrow not found in scene' };

  // Project arrow world position to screen coordinates
  const worldPos = arrowEntry.group.position.clone();
  worldPos.project(camera);

  const screenX = rect.left + ((worldPos.x + 1) * rect.width) / 2;
  const screenY = rect.top + ((-worldPos.y + 1) * rect.height) / 2;

  // Perform pickTarget on the arrow via session
  const pickRes = app.session.pickTarget({
    kind: 'node',
    id: 'room_ballroom:nav:room_foyer',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_ballroom',
      targetRoomId: 'room_foyer',
      targetName: '前厅',
      direction: 'E',
      intent: 'interact'
    }
  });

  return { ok: pickRes.handled, screenX, screenY };
});

console.log('Nav arrow click result:', clickNavResult);
await page.waitForTimeout(800);

const step2 = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const p1 = app.session.getSnapshot().board.players.p1;
  const currentRoom = p1.customProps.currentRoomId;
  const movesLeft = p1.customProps.movesLeft;
  const arrowsCount = app.scene.navArrowMeshes.length;

  return { currentRoom, movesLeft, arrowsCount };
});
console.log('Step 2 (after moving into Foyer):', step2);

await page.screenshot({ path: 'shots/betrayal-nav-arrow-foyer.png' });
console.log('Saved shots/betrayal-nav-arrow-foyer.png');

// Move from Foyer into Entrance Hall (North door)
const clickNav2 = await page.evaluate(() => {
  const app = window.__boardGameApp;
  return app.session.pickTarget({
    kind: 'node',
    id: 'room_foyer:nav:room_entrance_hall',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_foyer',
      targetRoomId: 'room_entrance_hall',
      targetName: '门厅',
      direction: 'N',
      intent: 'interact'
    }
  });
});
console.log('Move to Entrance Hall result:', clickNav2);
await page.waitForTimeout(800);

const step3 = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const p1 = app.session.getSnapshot().board.players.p1;
  const currentRoom = p1.customProps.currentRoomId;
  const movesLeft = p1.customProps.movesLeft;

  return { currentRoom, movesLeft };
});
console.log('Step 3 (after moving into Entrance Hall):', step3);

console.log('ERRORS:', errors.length ? errors : 'none');

await browser.close();
dev.stop();
