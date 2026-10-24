import { launchChromium, BASE_URL } from './lib/browser.mjs';
import { ensureDevServer } from './lib/devserver.mjs';

/**
 * Special traversal: stairs across floors, the balcony drop and the observatory
 * lift. These are edges the door grid cannot express, so they get their own
 * in-world badges; this script drives each one and asserts where the actor ends.
 */
const dev = await ensureDevServer();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

const failures = [];

await page.goto(`${BASE_URL}?game=betrayal&scenario=exploration`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2400);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(900);

const where = () =>
  page.evaluate(() => {
    const p = window.__boardGameApp.session.getSnapshot().board.players.p1;
    return { room: p.customProps.currentRoomId, floor: p.customProps.floor, moves: p.customProps.movesLeft };
  });

/** Count in-world hotspots whose metadata matches a predicate. */
const hotspots = () =>
  page.evaluate(() => {
    const app = window.__boardGameApp;
    const here = app.session.getSnapshot().board.players.p1.customProps.currentRoomId;
    const map = app.scene.raycaster.interactiveMeshes;
    const out = [];
    for (const [, data] of map) {
      const m = data?.metadata;
      // Only badges sourced from the actor's current room count.
      if (m && m.fromRoomId === here && (m.type === 'SPECIAL_MOVE' || m.type === 'ROOM_NAV')) {
        out.push(`${m.type}/${m.action ?? 'nav'}>${m.targetRoomId ?? ''}`);
      }
    }
    return [...new Set(out)];
  });

/* ------------------------------ stairs ------------------------------ */
// One click per turn of the event loop: a second pick inside the same tick
// would read the pre-move legal list.
await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({ kind: 'node', id: 'room_foyer', metadata: { intent: 'interact' } })
);
await page.waitForTimeout(450);
await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_grand_staircase',
    metadata: { intent: 'interact' }
  })
);
await page.waitForTimeout(500);

const stairSpots = await hotspots();
const hasUp = stairSpots.some(s => s.includes('>room_upper_landing'));
const hasDown = stairSpots.some(s => s.includes('>room_basement_landing'));
if (!hasUp || !hasDown) failures.push(`stairs: missing cross-floor badges (${stairSpots.join(', ')})`);

const upstairs = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_grand_staircase:special:nav:room_upper_landing',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_grand_staircase',
      targetRoomId: 'room_upper_landing',
      targetName: '二楼平台',
      intent: 'interact'
    }
  })
);
await page.waitForTimeout(500);
const atUpper = await where();
if (!upstairs.handled || atUpper.room !== 'room_upper_landing' || atUpper.floor !== 'UPPER') {
  failures.push(`stairs: climb failed (${JSON.stringify(upstairs)} -> ${JSON.stringify(atUpper)})`);
}
console.log(`stairs: badges=${stairSpots.length} up=${hasUp} down=${hasDown} -> ${atUpper.room}/${atUpper.floor}`);
await page.screenshot({ path: 'shots/special-stairs.png' });

/* ------------------------------ balcony ----------------------------- */
// The kernel requires movement left to declare a fall (mirrors the rule test),
// so hand p1 a fresh pool the same way the engine suite does.
await page.evaluate(() => {
  const app = window.__boardGameApp;
  const raw = app.session.engine.getRawState();
  raw.players.p1.customProps.movesLeft = 3;
  // Force a rebuild + repaint through a public presenter path.
  app.session.setViewer('GOD');
});
await page.waitForTimeout(400);

await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({ kind: 'node', id: 'room_balcony', metadata: { intent: 'interact' } })
);
await page.waitForTimeout(500);
const atBalcony = await where();

const balconySpots = await hotspots();
const hasJump = balconySpots.some(s => s.startsWith('SPECIAL_MOVE/JUMP_DOWN'));
if (!hasJump) failures.push(`balcony: no JUMP_DOWN badge (${balconySpots.join(', ')})`);

const jumped = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_balcony:special:JUMP_DOWN:room_ballroom',
    metadata: {
      type: 'SPECIAL_MOVE',
      action: 'JUMP_DOWN',
      fromRoomId: 'room_balcony',
      targetRoomId: 'room_ballroom',
      targetName: '舞厅',
      intent: 'interact'
    }
  })
);
await page.waitForTimeout(600);
const atBallroom = await where();
if (!jumped.handled || atBallroom.room !== 'room_ballroom') {
  failures.push(`balcony: jump failed (${JSON.stringify(jumped)} -> ${JSON.stringify(atBallroom)})`);
}
console.log(
  `balcony: reached=${atBalcony.room} jumpBadge=${hasJump} -> ${atBallroom.room}/${atBallroom.floor}`
);
await page.screenshot({ path: 'shots/special-balcony-jump.png' });

/* ------------------------------ elevator ---------------------------- */
// No scenario ships the observatory lift, so graft it on like the kernel suite
// does. Scope note: this asserts the dock arm path (the lift's real entry
// point); the in-world badge for the lift is not covered here.
const lift = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const raw = app.session.engine.getRawState();
  const basement = Object.values(raw.mapGraph.nodes).find(n => n.props?.floor === 'BASEMENT');
  if (!basement) return { ok: false, reason: 'no basement room to host the lift' };

  raw.mapGraph.nodes[basement.id].props.special = 'ELEVATOR';
  raw.players.p1.customProps.currentRoomId = basement.id;
  raw.players.p1.customProps.movesLeft = 3;
  app.session.setViewer('GOD');
  await new Promise(r => setTimeout(r, 200));

  const snap = app.session.getSnapshot();
  const elevator = snap.actions.find(a => a.label.includes('电梯'));
  if (!elevator) return { ok: false, reason: 'lift action missing' };
  const res = app.session.perform(elevator.id);
  const targets = elevator.highlightIds?.length ?? 0;
  return { ok: res.ok && targets > 0, targets, label: elevator.label };
});
if (!lift.ok) failures.push(`elevator: ${lift.reason ?? 'arm failed'}`);
console.log(`elevator: armed=${lift.ok} targets=${lift.targets ?? 0} label="${lift.label ?? ''}"`);

console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nAll special-traversal checks passed.');
}

await browser.close();
dev.stop();
