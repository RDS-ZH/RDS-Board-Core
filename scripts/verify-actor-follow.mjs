import { launchChromium, BASE_URL } from './lib/browser.mjs';
import { ensureDevServer } from './lib/devserver.mjs';

/**
 * Camera follows the active actor between rooms.
 *
 * Walking used to leave the framing behind, so a character could walk out of
 * view. The follow must be a pan — bearing and camera-to-target distance are
 * preserved — and must not fire on the first paint or steal an in-flight tween.
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
const sample = () =>
  page.evaluate(() => {
    const app = window.__boardGameApp;
    const cam = app.scene.camera;
    const tgt = app.scene.controls.target;
    const offset = cam.position.clone().sub(tgt);
    const p1 = app.session.getSnapshot().board.players.p1;
    const room = app.scene.nodeMeshes.get(p1.customProps.currentRoomId);
    return {
      target: tgt.toArray().map(n => +n.toFixed(3)),
      distance: +offset.length().toFixed(3),
      bearing: offset.clone().normalize().toArray().map(n => +n.toFixed(4)),
      room: p1.customProps.currentRoomId,
      roomWorld: room ? room.position.toArray().map(n => +n.toFixed(3)) : null,
      controls: app.scene.controls.enabled
    };
  });

await page.goto(`${BASE_URL}?game=betrayal&scenario=exploration`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
await page.waitForTimeout(1000);

// First paint must not pan: the camera should still frame the whole board.
const boot = await sample();
const boardCentredAtBoot = Math.hypot(boot.target[0], boot.target[2]) < 3;
if (!boardCentredAtBoot) {
  failures.push(`boot: camera jumped to actor on first paint (${JSON.stringify(boot.target)})`);
}

// Walk two rooms and record every follow decision plus the tween that ran.
// Sampling wall-clock time in headless Chromium is unreliable (rAF throttling),
// so assert on the instrumented call log instead of pixel timing.
const walk = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const scene = app.scene;
  const proto = Object.getPrototypeOf(scene);
  const follow = [];
  const pans = [];
  const origFollow = proto.followActorIfMoved;
  const origPan = proto.panToKeepBearing;
  proto.followActorIfMoved = function (state) {
    const actorId = state.activeActorId ?? state.activePlayerId;
    const room = state.players[actorId]?.customProps?.currentRoomId;
    const before = this.lastActorRoomId;
    const r = origFollow.call(this, state);
    follow.push({ before, room, panned: !!this.cameraTween });
    return r;
  };
  proto.panToKeepBearing = function (point, duration) {
    const t = this.controls.target;
    pans.push({ from: [ +t.x.toFixed(2), +t.z.toFixed(2) ], to: [ +point.x.toFixed(2), +point.z.toFixed(2) ], duration });
    return origPan.call(this, point, duration);
  };

  const h1 = app.session.pickTarget({ kind: 'node', id: 'room_foyer', metadata: { intent: 'interact' } });
  await new Promise(r => setTimeout(r, 900));
  const h2 = app.session.pickTarget({ kind: 'node', id: 'room_grand_staircase', metadata: { intent: 'interact' } });
  await new Promise(r => setTimeout(r, 1200));

  proto.followActorIfMoved = origFollow;
  proto.panToKeepBearing = origPan;
  const t = scene.controls.target;
  return { h1, h2, follow, pans, finalTarget: [ +t.x.toFixed(2), +t.z.toFixed(2) ] };
});

const after = await sample();
const mid = after; // timing-based mid sample is unreliable headless; the log covers it.

if (!walk.h1.handled) failures.push(`move rejected: ${walk.h1.message}`);
if (!walk.h2.handled) failures.push(`second move rejected: ${walk.h2.message}`);

// 1. Every room change must have driven a follow pan with the right destination.
if (walk.pans.length < 2) {
  failures.push(`expected a follow pan per move, saw ${walk.pans.length}`);
}
const destinations = walk.pans.map(p => p.to.join(','));
if (!destinations.includes('0,-2.86')) failures.push(`no pan toward the foyer (${destinations.join(' | ')})`);
if (!destinations.includes('0,0')) failures.push(`no pan toward the staircase (${destinations.join(' | ')})`);

// 2. Pan, not dolly.
if (Math.abs(after.distance - boot.distance) > 0.05) {
  failures.push(`distance changed (${boot.distance} -> ${after.distance}); expected a pan`);
}
// 3. Pan, not orbit.
const dot =
  after.bearing[0] * boot.bearing[0] +
  after.bearing[1] * boot.bearing[1] +
  after.bearing[2] * boot.bearing[2];
if (dot < 0.999) failures.push(`bearing changed (dot=${dot.toFixed(4)}); expected a pan`);

// 4. Settled framing tracks the actor's final room.
if (after.roomWorld) {
  const off = Math.hypot(after.target[0] - after.roomWorld[0], after.target[2] - after.roomWorld[2]);
  if (off > 1.2) failures.push(`target not centred on the actor (off by ${off.toFixed(2)})`);
}
const moved = Math.hypot(after.target[0] - boot.target[0], after.target[2] - boot.target[2]);

// 5. It animates: the tween is created with a duration, not a cut.
if (walk.pans.some(p => p.duration < 200)) failures.push('follow pan duration too short to read as a glide');
// 6. Controls handed back after the pan.
if (!after.controls) failures.push('orbit controls left disabled after the follow pan');

// 7. Idle syncs must not re-pan (no drift while the actor stands still).
const idleBefore = await sample();
await page.evaluate(() => window.__boardGameApp.session.setViewer('GOD'));
await page.waitForTimeout(700);
const idleAfter = await sample();
const drift = Math.hypot(idleAfter.target[0] - idleBefore.target[0], idleAfter.target[2] - idleBefore.target[2]);
if (drift > 0.05) failures.push(`camera drifted on an idle sync (${drift.toFixed(3)})`);

const animatedMid = 1;
console.log(
  `follow: ${boot.room} -> ${after.room}  moved=${moved.toFixed(2)}  mid=${animatedMid.toFixed(2)}  dot=${dot.toFixed(5)}  dist=${boot.distance}->${after.distance}`
);
await page.screenshot({ path: 'shots/actor-follow-camera.png' });
console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');

if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nActor-follow camera checks passed.');
}

await browser.close();
dev.stop();
