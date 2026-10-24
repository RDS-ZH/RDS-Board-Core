import { launchChromium, BASE_URL } from './lib/browser.mjs';

/**
 * Close-up room captures for modelling review.
 * Usage: node scripts/shoot-rooms.mjs [scenario] [roomId...]
 */

const BASE = BASE_URL;

const scenario = process.argv[2] ?? 'exploration';
const requested = process.argv.slice(3);

const browser = await launchChromium();

const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  await page.goto(`${BASE}?game=betrayal&scenario=${scenario}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2600);
  await page.click('#boot-enter').catch(() => {});
  await page.waitForTimeout(1600);

  const rooms = await page.evaluate(() =>
    Object.values(window.__boardGameApp.session.getSnapshot().board.mapGraph.nodes)
      .filter(n => n.type === 'ROOM')
      .map(n => ({ id: n.id, name: n.props.name, floor: n.props.floor, doors: n.props.doors }))
  );
  console.log('rooms:', rooms.map(r => `${r.id}(${r.floor},${(r.doors || []).join('')})`).join(' '));

  const stats = await page.evaluate(() => window.__boardGameApp.scene.getRenderStats());
  console.log('render stats:', stats);

  const targets = requested.length ? requested.map(r => (r.startsWith('room_') ? r : `room_${r}`)) : rooms.map(r => r.id);

  for (const id of targets) {
    const room = rooms.find(r => r.id === id);
    if (!room) {
      console.log('skip missing room', id);
      continue;
    }
    const ok = await page.evaluate(nodeId => window.__boardGameApp.scene.focusNode(nodeId, 5.6), id);
    if (!ok) {
      console.log('focus failed', id);
      continue;
    }
    await page.waitForTimeout(1100);
    const file = `shots/room-${room.name}-${room.floor.toLowerCase()}.png`;
    await page.screenshot({ path: file });
    console.log('shot', file);
  }

  await page.close();
} finally {
  console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 12), null, 2) : 'none');
  await browser.close();
}
