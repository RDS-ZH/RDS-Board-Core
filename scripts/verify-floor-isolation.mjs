import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

/**
 * Verifies floor isolation (AI-21/AI-27):
 * 1. Minimap renders 3 architectural floors with SVG blueprints and room counts
 * 2. Switching to a single floor (GROUND) isolates that floor:
 *    - other floor rooms & decor are set to visible = false
 *    - draw calls drop significantly
 *    - hidden floor objects cannot be picked by raycaster
 *    - minimap and floor-tabs stay in 100% sync
 * 3. Switching back to ALL restores visibility and full draw calls
 */
const dev = await ensureSoloServer();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

const failures = [];

await page.goto(`${dev.url}?game=betrayal&scenario=exploration`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(1000);

// 1. Initial State: All floors visible
const bootState = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const minimap = document.querySelector('#mansion-minimap');
  const cards = minimap ? [...minimap.querySelectorAll('.mm-floor-card')].map(c => ({
    floor: c.dataset.floor,
    name: c.querySelector('.mm-name')?.textContent,
    count: c.querySelector('.mm-count')?.textContent,
    active: c.classList.contains('active'),
    inView: c.classList.contains('in-view'),
    hasSvg: !!c.querySelector('.mm-floor-svg')
  })) : [];

  const stats = app.scene.getRenderStats();
  const visibleFloor = app.scene.getVisibleFloor();

  return {
    minimapVisible: minimap ? getComputedStyle(minimap).display !== 'none' : false,
    cards,
    stats,
    visibleFloor
  };
});

console.log('Boot Minimap:', JSON.stringify(bootState.cards, null, 2));
console.log(`Boot stats (ALL): calls=${bootState.stats.calls}, triangles=${bootState.stats.triangles}`);

if (!bootState.minimapVisible) failures.push('Minimap is not visible on boot');
if (bootState.cards.length !== 3) failures.push(`Expected 3 floor cards in minimap, got ${bootState.cards.length}`);
if (bootState.visibleFloor !== 'ALL') failures.push(`Expected visibleFloor to be 'ALL', got ${bootState.visibleFloor}`);

await page.screenshot({ path: 'shots/floor-isolation-all.png' });

// 2. Click Ground Floor in Minimap
console.log('\n--- Switching to GROUND floor ---');
await page.click('.mm-floor-card[data-floor="GROUND"]');
await page.waitForTimeout(1000);

const groundState = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const scene = app.scene;
  const nodes = app.session.getSnapshot().board.mapGraph.nodes;

  // Check visibility of rooms per floor
  const roomVisibilities = Object.values(nodes).filter(n => n.type === 'ROOM').map(n => {
    const mesh = scene.nodeMeshes.get(n.id);
    return {
      id: n.id,
      name: n.props?.name,
      floor: n.props?.floor,
      visible: mesh ? mesh.visible : false
    };
  });

  const stats = scene.getRenderStats();
  const visibleFloor = scene.getVisibleFloor();
  const groundTabActive = document.querySelector('.floor-tab[data-floor="GROUND"]')?.classList.contains('active');
  const allTabActive = document.querySelector('.floor-tab[data-floor="ALL"]')?.classList.contains('active');
  const mmGroundActive = document.querySelector('.mm-floor-card[data-floor="GROUND"]')?.classList.contains('active');

  // Try to pick a basement room via raycaster
  const basementMesh = scene.nodeMeshes.get('room_catacombs');
  const catacombsPickable = basementMesh ? !!app.scene.raycaster.isHierarchyVisible?.(basementMesh) : true;

  return {
    visibleFloor,
    stats,
    groundTabActive,
    allTabActive,
    mmGroundActive,
    catacombsPickable,
    groundRooms: roomVisibilities.filter(r => r.floor === 'GROUND'),
    otherRooms: roomVisibilities.filter(r => r.floor !== 'GROUND')
  };
});

console.log(`GROUND isolated stats: calls=${groundState.stats.calls}, triangles=${groundState.stats.triangles}`);
console.log(`Ground rooms all visible: ${groundState.groundRooms.every(r => r.visible)}`);
console.log(`Other floor rooms all hidden: ${groundState.otherRooms.every(r => !r.visible)}`);
console.log(`Basement room pickable: ${groundState.catacombsPickable}`);

if (groundState.visibleFloor !== 'GROUND') failures.push(`Expected visibleFloor to be 'GROUND', got ${groundState.visibleFloor}`);
if (!groundState.groundRooms.every(r => r.visible)) failures.push('Some GROUND rooms are unexpectedly hidden');
if (!groundState.otherRooms.every(r => !r.visible)) failures.push('Some non-GROUND rooms are unexpectedly visible');
if (groundState.stats.calls >= bootState.stats.calls) {
  failures.push(`Draw calls did not decrease when isolating GROUND (${bootState.stats.calls} -> ${groundState.stats.calls})`);
}
if (!groundState.groundTabActive) failures.push('Dock GROUND floor-tab is not active');
if (groundState.allTabActive) failures.push('Dock ALL floor-tab is still active');
if (!groundState.mmGroundActive) failures.push('Minimap GROUND card is not active');
if (groundState.catacombsPickable) failures.push('Hidden basement room is still pickable/visible in hierarchy');

await page.screenshot({ path: 'shots/floor-isolation-ground.png' });

// 3. Switch to UPPER floor via dock tab
console.log('\n--- Switching to UPPER floor via dock tab ---');
await page.click('.floor-tab[data-floor="UPPER"]');
await page.waitForTimeout(1000);

const upperState = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const scene = app.scene;
  const nodes = app.session.getSnapshot().board.mapGraph.nodes;

  const roomVisibilities = Object.values(nodes).filter(n => n.type === 'ROOM').map(n => {
    const mesh = scene.nodeMeshes.get(n.id);
    return {
      id: n.id,
      floor: n.props?.floor,
      visible: mesh ? mesh.visible : false
    };
  });

  const stats = scene.getRenderStats();
  const visibleFloor = scene.getVisibleFloor();
  const mmUpperActive = document.querySelector('.mm-floor-card[data-floor="UPPER"]')?.classList.contains('active');

  return {
    visibleFloor,
    stats,
    mmUpperActive,
    upperRooms: roomVisibilities.filter(r => r.floor === 'UPPER'),
    otherRooms: roomVisibilities.filter(r => r.floor !== 'UPPER')
  };
});

console.log(`UPPER isolated stats: calls=${upperState.stats.calls}, triangles=${upperState.stats.triangles}`);
console.log(`Upper rooms all visible: ${upperState.upperRooms.every(r => r.visible)}`);
console.log(`Other floor rooms all hidden: ${upperState.otherRooms.every(r => !r.visible)}`);

if (upperState.visibleFloor !== 'UPPER') failures.push(`Expected visibleFloor to be 'UPPER', got ${upperState.visibleFloor}`);
if (!upperState.upperRooms.every(r => r.visible)) failures.push('Some UPPER rooms are unexpectedly hidden');
if (!upperState.otherRooms.every(r => !r.visible)) failures.push('Some non-UPPER rooms are unexpectedly visible');
if (!upperState.mmUpperActive) failures.push('Minimap UPPER card is not active');

await page.screenshot({ path: 'shots/floor-isolation-upper.png' });

// 4. Switch back to ALL via minimap ALL button
console.log('\n--- Switching back to ALL floors ---');
await page.click('.mm-btn-all');
await page.waitForTimeout(1000);

const allRestoredState = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const scene = app.scene;
  const nodes = app.session.getSnapshot().board.mapGraph.nodes;

  const allRoomsVisible = Object.values(nodes).filter(n => n.type === 'ROOM').every(n => {
    const mesh = scene.nodeMeshes.get(n.id);
    return mesh ? mesh.visible : false;
  });

  const stats = scene.getRenderStats();
  const visibleFloor = scene.getVisibleFloor();
  const allTabActive = document.querySelector('.floor-tab[data-floor="ALL"]')?.classList.contains('active');
  const mmAllActive = document.querySelector('.mm-btn-all')?.classList.contains('active');

  return {
    visibleFloor,
    stats,
    allRoomsVisible,
    allTabActive,
    mmAllActive
  };
});

console.log(`ALL restored stats: calls=${allRestoredState.stats.calls}, triangles=${allRestoredState.stats.triangles}`);
console.log(`All rooms visible again: ${allRestoredState.allRoomsVisible}`);

if (allRestoredState.visibleFloor !== 'ALL') failures.push(`Expected visibleFloor to be 'ALL', got ${allRestoredState.visibleFloor}`);
if (!allRestoredState.allRoomsVisible) failures.push('Not all rooms are visible after restoring ALL floors');
if (!allRestoredState.allTabActive) failures.push('Dock ALL tab is not active after restoring ALL floors');
if (!allRestoredState.mmAllActive) failures.push('Minimap ALL button is not active after restoring ALL floors');
if (allRestoredState.stats.calls < groundState.stats.calls) {
  failures.push('Draw calls did not recover after restoring ALL floors');
}

console.log('\nERRORS:', errors.length ? errors.slice(0, 5) : 'none');

if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nFloor isolation and minimap checks passed.');
}

await browser.close();
dev.stop();
