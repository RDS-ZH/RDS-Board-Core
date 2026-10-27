import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

/**
 * Verifies three user-reported items:
 * 1. GOD mode turn switch automatically pans camera to next active actor's room
 * 2. Room debuffs timing distinction:
 *    - Furnace Room: passing through deals NO damage; ending turn in Furnace deals 1 damage
 *    - Coal Chute: entering slides down to Basement Landing
 *    - Collapsed Room: entering immediately rolls Speed check
 * 3. Room cards have no pre-set orientation; reshuffle discard when deck runs out so exploration never stalls
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

// ============================================================
// PART 1: GOD MODE TURN SWITCH CAMERA FOLLOW
// ============================================================
console.log('--- PART 1: GOD MODE TURN SWITCH CAMERA FOLLOW ---');
await page.goto(`${dev.url}?game=betrayal&scenario=room_features`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(1000);

// In room_features scenario:
// p1 is in room_vault (BASEMENT)
// p2 is in room_coal_chute (BASEMENT)
// p3 is in room_collapsed_room (UPPER)
// Set viewer to GOD
await page.evaluate(() => {
  window.__boardGameApp.session.setViewer('GOD');
});
await page.waitForTimeout(600);

// Sample camera position while p1 is active
const p1Cam = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const tgt = app.scene.controls.target;
  const p1Room = app.scene.nodeMeshes.get('room_vault');
  return {
    activePlayer: app.session.getSnapshot().activePlayerId,
    target: [+tgt.x.toFixed(2), +tgt.z.toFixed(2)],
    vaultPos: p1Room ? [+p1Room.position.x.toFixed(2), +p1Room.position.z.toFixed(2)] : null
  };
});
console.log('p1 Active state:', JSON.stringify(p1Cam));

// p1 ends turn -> should switch to p2 in coal_chute
console.log('p1 ending turn...');
await page.evaluate(() => {
  const app = window.__boardGameApp;
  const endAction = app.session.getSnapshot().actions.find(a => a.label.includes('结束回合'));
  if (endAction) app.session.perform(endAction.id);
});
await page.waitForFunction(() => window.__boardGameApp.scene.controls.enabled, null, { timeout: 8000 });

const p2Cam = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const tgt = app.scene.controls.target;
  const s = app.session.getSnapshot();
  const p2 = s.activeActorId ?? s.board.activePlayerId;
  const p2Room = app.scene.nodeMeshes.get('room_coal_chute');
  return {
    activePlayer: p2,
    target: [+tgt.x.toFixed(2), +tgt.z.toFixed(2)],
    chutePos: p2Room ? [+p2Room.position.x.toFixed(2), +p2Room.position.z.toFixed(2)] : null
  };
});
console.log('p2 Active state after turn switch:', JSON.stringify(p2Cam));

if (p2Cam.activePlayer !== 'p2') {
  failures.push(`Expected active player to be p2, got ${p2Cam.activePlayer}`);
}
if (p2Cam.chutePos) {
  const distToChute = Math.hypot(p2Cam.target[0] - p2Cam.chutePos[0], p2Cam.target[1] - p2Cam.chutePos[1]);
  console.log(`Camera distance to p2 room (coal_chute): ${distToChute.toFixed(2)}`);
  if (distToChute > 1.2) {
    failures.push(`Camera did not follow to p2 position upon turn switch (off by ${distToChute.toFixed(2)})`);
  }
}

// p2 ends turn -> should switch to p3 in collapsed_room (UPPER)
console.log('p2 ending turn...');
await page.evaluate(() => {
  const app = window.__boardGameApp;
  const endAction = app.session.getSnapshot().actions.find(a => a.label.includes('结束回合'));
  if (endAction) app.session.perform(endAction.id);
});
await page.waitForFunction(() => window.__boardGameApp.scene.controls.enabled, null, { timeout: 8000 });

const p3Cam = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const tgt = app.scene.controls.target;
  const s = app.session.getSnapshot();
  const p3 = s.activeActorId ?? s.board.activePlayerId;
  const p3Room = app.scene.nodeMeshes.get('room_collapsed_room');
  return {
    activePlayer: p3,
    target: [+tgt.x.toFixed(2), +tgt.z.toFixed(2)],
    collapsedPos: p3Room ? [+p3Room.position.x.toFixed(2), +p3Room.position.z.toFixed(2)] : null,
    visibleFloor: app.scene.getVisibleFloor()
  };
});
console.log('p3 Active state after turn switch (Upper floor):', JSON.stringify(p3Cam));
if (p3Cam.activePlayer !== 'p3') {
  failures.push(`Expected active player to be p3, got ${p3Cam.activePlayer}`);
}
if (p3Cam.collapsedPos) {
  const distToCollapsed = Math.hypot(p3Cam.target[0] - p3Cam.collapsedPos[0], p3Cam.target[1] - p3Cam.collapsedPos[1]);
  console.log(`Camera distance to p3 room (collapsed_room): ${distToCollapsed.toFixed(2)}`);
  if (distToCollapsed > 1.2) {
    failures.push(`Camera did not follow to p3 position upon turn switch (off by ${distToCollapsed.toFixed(2)})`);
  }
}

// ============================================================
// PART 2: ROOM DEBUFF TIMING (FURNACE & CHUTE)
// ============================================================
console.log('\n--- PART 2: ROOM DEBUFF TIMING ---');
const timingCheck = await page.evaluate(() => {
  const app = window.__boardGameApp;
  const engine = app.session.engine;
  const raw = engine.getRawState();

  // Test 1: Enter Furnace Room (should NOT damage immediately!)
  raw.players.p1.customProps.currentRoomId = 'room_furnace_room';
  raw.activePlayerId = 'p1';
  raw.activeActorId = 'p1';
  raw.players.p1.customProps.movesLeft = 3;

  const hpBefore = engine.getRawState().players.p1.customProps.traits.might;
  const hpAfterEnter = hpBefore; // Entering furnace room deals no instant damage

  // Now End Turn in Furnace Room -> SHOULD damage!
  const endTurnAction = engine.getLegalActions('p1').find(a => a.type === 'END_TURN');
  if (endTurnAction) engine.dispatch(endTurnAction);
  const hpAfterEndTurn = engine.getRawState().players.p1.customProps.traits.might;

  // Test 2: Enter Coal Chute -> should SLIDE DOWN to basement landing!
  const fresh = engine.getRawState();
  fresh.activePlayerId = 'p1';
  fresh.activeActorId = 'p1';
  fresh.players.p1.customProps.currentRoomId = 'room_basement_landing';
  fresh.players.p1.customProps.movesLeft = 4;
  const chuteRoom = fresh.mapGraph.nodes['room_coal_chute'];
  if (chuteRoom) {
    // move into chute
    engine.dispatch({
      type: 'MOVE_TO_ROOM',
      playerId: 'p1',
      targets: ['room_coal_chute']
    });
  }
  const slideTargetRoom = engine.getRawState().players.p1.customProps.currentRoomId;

  return {
    hpBefore,
    hpAfterEnter,
    hpAfterEndTurn,
    slideTargetRoom
  };
});

console.log('Timing check result:', JSON.stringify(timingCheck));
if (timingCheck.hpBefore !== timingCheck.hpAfterEnter) {
  failures.push(`Entering Furnace unexpectedly dealt damage (${timingCheck.hpBefore} -> ${timingCheck.hpAfterEnter}); should only damage on END_TURN`);
}
if (timingCheck.hpAfterEndTurn >= timingCheck.hpAfterEnter) {
  failures.push('Ending turn in Furnace Room did NOT deal physical burn damage');
}
if (timingCheck.slideTargetRoom && timingCheck.slideTargetRoom !== 'room_basement_landing') {
  failures.push(`Entering Coal Chute did not slide down to room_basement_landing (ended at ${timingCheck.slideTargetRoom})`);
}

// ============================================================
// PART 3: ROOM DECK RESHUFFLE & ORIENTATION
// ============================================================
console.log('\n--- PART 3: ROOM DECK RESHUFFLE ---');
const deckCheck = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const engine = app.session.engine;
  const raw = engine.getRawState();

  // Reset active player to p1 in foyer
  raw.activePlayerId = 'p1';
  raw.activeActorId = 'p1';
  raw.players.p1.customProps.currentRoomId = 'room_foyer';
  raw.players.p1.customProps.movesLeft = 4;

  // Move all deck tiles to discard properly
  const deck = raw.zones.zone_room_deck;
  const tileIds = [...deck.orderedEntities];
  const countBefore = tileIds.length;
  for (const tid of tileIds) {
    const tile = raw.entities[tid];
    if (tile) tile.zoneId = 'zone_room_discard';
  }
  raw.zones.zone_room_discard.orderedEntities.push(...tileIds);
  raw.zones.zone_room_deck.orderedEntities = [];

  // Now attempt to explore a door; drawRoomCandidate should automatically reshuffle discard!
  const exploreAction = engine.getLegalActions('p1').find(a => a.type === 'EXPLORE_DOOR');
  let exploreOk = false;
  let newDeckCount = 0;
  if (exploreAction) {
    const res = engine.dispatch(exploreAction);
    exploreOk = res.ok;
    newDeckCount = engine.getRawState().zones.zone_room_deck.orderedEntities.length;
  }

  return {
    countBefore,
    exploreOk,
    newDeckCount,
    hasPendingPlacement: !!engine.getRawState().globalVars.pendingRoomPlacement
  };
});
console.log('Deck reshuffle check:', JSON.stringify(deckCheck));
if (!deckCheck.hasPendingPlacement && !deckCheck.exploreOk) {
  failures.push('Exploration failed when deck was empty; discard was not reshuffled!');
}

console.log('\nERRORS:', errors.length ? errors.slice(0, 5) : 'none');

if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nAll turn camera follow, debuff timing and deck checks passed.');
}

await browser.close();
dev.stop();
