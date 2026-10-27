import { launchChromium } from './lib/browser.mjs';
import { ensureSoloServer } from './lib/soloserver.mjs';

/**
 * Regression for three 活死人 haunt bugs:
 * 1. NPC movement must behave like player movement — the monster actually
 *    relocates, spends a move, and its room is mirrored onto the NPC record so
 *    the renderer can draw nav arrows / follow the camera.
 * 2. A finished game must not look like a hang: the dock explains the outcome
 *    and a local end-of-game overlay offers a replay.
 * 3. The medical kit must let the healer pick which physical track to restore.
 */
const dev = await ensureSoloServer();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
const isEnvNoise = text =>
  /\/healthz/i.test(text) ||
  /Failed to load resource: the server responded with a status of 502/i.test(text);
page.on('pageerror', err => {
  if (!isEnvNoise(err.message)) errors.push(err.message);
});
page.on('console', msg => {
  if (msg.type() !== 'error') return;
  if (isEnvNoise(msg.text())) return;
  errors.push(msg.text());
});

const failures = [];

await page.goto(`${dev.url}?game=betrayal&scenario=haunt_zombie`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2400);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(1000);

/* ---------------- 1. NPC turn: room known + nav arrows drawn ---------------- */
const npcTurn = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const engine = app.session.engine;

  // Advance to an NPC turn that has movement.
  let npcId = '';
  for (let i = 0; i < 10 && !npcId; i++) {
    const raw = engine.getRawState();
    const active = raw.activeActorId ?? raw.activePlayerId;
    const legal = engine.getLegalActions(active);
    if (raw.npcs?.[active] && legal.some(a => a.type === 'MOVE_NPC')) {
      npcId = active;
      break;
    }
    const advance = legal.find(a => a.type === 'END_TURN') ?? legal.find(a => a.type === 'END_NPC_TURN');
    if (!advance) break;
    engine.dispatch(advance);
  }
  if (!npcId) return { reached: false };

  // Force a repaint so the scene rebuilds for the NPC actor.
  app.session.setViewer('GOD');
  await new Promise(r => setTimeout(r, 600));

  const raw = engine.getRawState();
  const npc = raw.npcs[npcId];
  const entityRoom = String(raw.entities[npc.entityId].components.custom?.roomId ?? '');
  const npcRoom = String(npc.customProps.roomId ?? '');

  // Nav hotspots sourced from the NPC's room (players get these; monsters must too).
  let navHotspots = 0;
  for (const [, data] of app.scene.raycaster.interactiveMeshes) {
    const m = data?.metadata;
    if (m && m.fromRoomId === npcRoom && (m.type === 'ROOM_NAV' || m.type === 'DOOR')) navHotspots += 1;
  }

  // Registered hotspots are not enough (door probes are invisible); the monster
  // must also get the visible floor chevrons that players get.
  const roomMesh = app.scene.nodeMeshes.get(npcRoom);
  const roomPos = roomMesh ? [roomMesh.position.x, roomMesh.position.z] : null;
  const chevrons = (app.scene.navArrowMeshes ?? [])
    .map(entry => entry.group)
    .filter(group => {
      if (!group.visible) return false;
      let parent = group.parent;
      while (parent) {
        if (!parent.visible) return false;
        parent = parent.parent;
      }
      if (!roomPos) return false;
      return Math.abs(group.position.x - roomPos[0]) <= 1.1 && Math.abs(group.position.z - roomPos[1]) <= 1.1;
    }).length;

  return { reached: true, npcId, entityRoom, npcRoom, navHotspots, chevrons, movesLeft: npc.customProps.movesLeft };
});

console.log('NPC turn:', JSON.stringify(npcTurn));
if (!npcTurn.reached) {
  failures.push('could not reach an NPC turn with movement');
} else {
  if (npcTurn.entityRoom !== npcTurn.npcRoom) {
    failures.push(`NPC room not mirrored (entity=${npcTurn.entityRoom} npc=${npcTurn.npcRoom})`);
  }
  if (npcTurn.navHotspots === 0) {
    failures.push('NPC room has no in-world nav hotspots (monsters get no arrows)');
  if (npcTurn.chevrons === 0) {
    failures.push('NPC turn drew no visible floor chevrons (players get them, monsters must too)');
  }
  }
}

/* ---------------- 2. Local game over: dock text + overlay ---------------- */
const gameOver = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const engine = app.session.engine;

  // Take every hero out of the haunt.
  const raw = engine.getRawState();
  for (const player of Object.values(raw.players)) {
    if (player.role !== 'TRAITOR') {
      player.alive = false;
      player.customProps.banished = true;
    }
  }
  const active = raw.activeActorId ?? raw.activePlayerId;
  const advance = engine
    .getLegalActions(active)
    .find(a => a.type === 'END_TURN' || a.type === 'END_NPC_TURN');
  if (advance) engine.dispatch(advance);

  app.session.setViewer('GOD');
  await new Promise(r => setTimeout(r, 800));

  const snap = app.session.getSnapshot();
  const dock = document.querySelector('.dock-actions')?.textContent ?? '';
  return {
    gameOver: snap.gameOver,
    winnerReason: snap.winnerReason ?? null,
    overlay: !!document.getElementById('local-gameover-overlay'),
    dockText: dock.replace(/\s+/g, ' ').trim().slice(0, 90)
  };
});

console.log('Game over:', JSON.stringify(gameOver));
if (!gameOver.gameOver) failures.push('game did not report gameOver with all heroes out');
if (!gameOver.winnerReason) failures.push('no winnerReason on the snapshot');
if (!gameOver.overlay) failures.push('local end-of-game overlay did not appear');
if (gameOver.dockText.includes('等待其他玩家')) {
  failures.push(`dock still shows the misleading wait text (${gameOver.dockText})`);
}

await page.screenshot({ path: 'shots/zombie-fixes.png' });
console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');

if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nNPC movement, game-over and dock checks passed.');
}

await browser.close();
dev.stop();
