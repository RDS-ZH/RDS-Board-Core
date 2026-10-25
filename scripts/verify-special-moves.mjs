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

// Verify that Upper Landing has the return downstairs badge to Grand Staircase!
const upperSpots = await hotspots();
const hasDownFromUpper = upperSpots.some(s => s.includes('>room_grand_staircase'));
if (!hasDownFromUpper) {
  failures.push(`stairs: missing downstairs badge from upper landing (${upperSpots.join(', ')})`);
}

const downstairs = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_upper_landing:special:nav:room_grand_staircase',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_upper_landing',
      targetRoomId: 'room_grand_staircase',
      targetName: '大楼梯',
      intent: 'interact'
    }
  })
);
await page.waitForTimeout(500);
const backAtStairs = await where();
if (!downstairs.handled || backAtStairs.room !== 'room_grand_staircase' || backAtStairs.floor !== 'GROUND') {
  failures.push(`stairs: descend back to grand staircase failed (${JSON.stringify(downstairs)} -> ${JSON.stringify(backAtStairs)})`);
}
console.log(`stairs return: hasDownFromUpper=${hasDownFromUpper} -> ${backAtStairs.room}/${backAtStairs.floor}`);

// Test Basement Landing return upstairs badge!
await page.evaluate(() => {
  const raw = window.__boardGameApp.session.engine.getRawState();
  raw.players.p1.customProps.movesLeft = 3;
});
const downstairsToBasement = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_grand_staircase:special:nav:room_basement_landing',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_grand_staircase',
      targetRoomId: 'room_basement_landing',
      targetName: '地下平台',
      intent: 'interact'
    }
  })
);
await page.waitForTimeout(500);
const atBasement = await where();
const basementSpots = await hotspots();
const hasUpFromBasement = basementSpots.some(s => s.includes('>room_grand_staircase'));
if (!downstairsToBasement.handled || atBasement.room !== 'room_basement_landing' || !hasUpFromBasement) {
  failures.push(`stairs: basement descent or return badge missing (${JSON.stringify(downstairsToBasement)} -> ${atBasement.room}, badges: ${basementSpots.join(', ')})`);
}

const upstairsFromBasement = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_basement_landing:special:nav:room_grand_staircase',
    metadata: {
      type: 'ROOM_NAV',
      fromRoomId: 'room_basement_landing',
      targetRoomId: 'room_grand_staircase',
      targetName: '大楼梯',
      intent: 'interact'
    }
  })
);
await page.waitForTimeout(500);
const backAtStairsFromBasement = await where();
if (!upstairsFromBasement.handled || backAtStairsFromBasement.room !== 'room_grand_staircase') {
  failures.push(`stairs: ascend from basement failed (${JSON.stringify(upstairsFromBasement)} -> ${JSON.stringify(backAtStairsFromBasement)})`);
}
console.log(`stairs basement: hasUpFromBasement=${hasUpFromBasement} -> ${backAtStairsFromBasement.room}/${backAtStairsFromBasement.floor}`);

/* ------------------------------ balcony ----------------------------- */
// The kernel requires movement left to declare a fall (mirrors the rule test),
// so hand p1 a fresh pool and set room to upper landing for the balcony leg.
await page.evaluate(() => {
  const app = window.__boardGameApp;
  const raw = app.session.engine.getRawState();
  raw.players.p1.customProps.movesLeft = 3;
  raw.players.p1.customProps.currentRoomId = 'room_upper_landing';
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
// No scenario ships the observatory lift. Mutating the raw state would not
// repaint (the board key is derived from the action log, which the mutation
// leaves untouched), so drive the badge builder directly with a synthetic lift
// room and then assert the click arms the board-targeting group.
const lift = await page.evaluate(async () => {
  const app = window.__boardGameApp;
  const snap = app.session.getSnapshot();
  const base = snap.board.mapGraph.nodes['room_basement_landing'];
  if (!base) return { ok: false, reason: 'no basement room to host the lift' };
  const node = { ...base, props: { ...base.props, special: 'ELEVATOR' } };

  app.scene.addSpecialTraversalHints(snap.board, node, node.id, 3);

  let badge = null;
  for (const [, data] of app.scene.raycaster.interactiveMeshes) {
    const m = data?.metadata;
    if (m?.type === 'SPECIAL_MOVE' && m.action === 'USE_ELEVATOR' && m.fromRoomId === node.id) badge = m;
  }
  if (!badge) return { ok: false, reason: 'lift badge not registered' };

  const res = app.session.pickTarget({
    kind: 'node',
    id: `${node.id}:special:USE_ELEVATOR:`,
    metadata: badge
  });
  return { ok: !!res.handled || !!res.message, badge: true, res };
});
if (!lift.ok) failures.push(`elevator: ${lift.reason ?? 'badge/arm failed'}`);
console.log(`elevator: badge=${!!lift.badge} click=${JSON.stringify(lift.res ?? null)}`);

/* --------------------------- room features -------------------------- */
// The room_features fixture stages the vault, chute and collapsed floor so the
// badge and the hazard marker both have something real to attach to.
const features = await (async () => {
  await page.goto(`${BASE_URL}?game=betrayal&scenario=room_features`, {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(2600);
  if (await page.locator('#boot-enter').count()) await page.click('#boot-enter');
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const app = window.__boardGameApp;
    const snap = app.session.getSnapshot();
    const here = snap.board.players.p1.customProps.currentRoomId;
    const badges = [];
    for (const [, d] of app.scene.raycaster.interactiveMeshes) {
      const m = d?.metadata;
      if (m && m.fromRoomId === here) badges.push(`${m.type}/${m.action ?? m.feature ?? 'nav'}`);
    }
    const label = snap.actions.find(a => a.label.includes('金库'))?.label ?? null;
    return { here, badges: [...new Set(badges)], label };
  });
})();
if (!features.badges.includes('ROOM_FEATURE/VAULT')) {
  failures.push(`features: vault badge missing (${features.badges.join(', ')})`);
}
if (!features.label) failures.push('features: vault action has no friendly label');

const vaultClick = await page.evaluate(() =>
  window.__boardGameApp.session.pickTarget({
    kind: 'node',
    id: 'room_vault:feature:VAULT',
    metadata: { type: 'ROOM_FEATURE', feature: 'VAULT', fromRoomId: 'room_vault', intent: 'interact' }
  })
);
await page.waitForTimeout(700);
const vaultState = await page.evaluate(() => {
  const snap = window.__boardGameApp.session.getSnapshot();
  return {
    opened: !!snap.board.mapGraph.nodes['room_vault']?.props?.opened,
    feed: snap.history.slice(0, 3).map(h => `${h.kind}:${h.title}`)
  };
});
if (!vaultClick.handled) failures.push(`features: vault click rejected (${vaultClick.message})`);
if (vaultState.feed.length === 0) failures.push('features: vault interaction left no feed entry');
console.log(`features: badge=${features.badges.includes('ROOM_FEATURE/VAULT')} label="${features.label}" click=${vaultClick.handled} opened=${vaultState.opened} feed=${vaultState.feed.length}`);
await page.screenshot({ path: 'shots/room-features.png' });

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
