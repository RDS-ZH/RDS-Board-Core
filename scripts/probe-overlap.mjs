import { launchChromium, BASE_URL } from './lib/browser.mjs';

/**
 * Room bleed / z-fighting probe.
 *
 * Every room tile is exactly 2.84 wide and the board grid steps 2.86, leaving a
 * 0.02 gap. Any geometry that extends past ±1.42 from a room's centre therefore
 * pokes into the neighbour's slab or wall and can z-fight. This probe measures
 * the real merged bounds of every room mesh and reports the offenders.
 */

const BASE = BASE_URL;
const HALF = 2.84 / 2;

const browser = await launchChromium();

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

try {
  await page.goto(`${BASE}?game=betrayal&scenario=exploration`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.click('#boot-enter').catch(() => {});
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const scene = window.__boardGameApp.scene;
    const nodes = window.__boardGameApp.session.getSnapshot().board.mapGraph.nodes;
    const out = [];
    for (const [id, mesh] of scene.nodeMeshes.entries()) {
      if (!nodes[id] || nodes[id].type !== 'ROOM') continue;
      mesh.updateMatrixWorld(true);
      const box = new (window.__three_BOX3 || Object)();
      void box;
      // Compute bounds manually so the page does not need a THREE global.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      mesh.traverse(o => {
        const geo = o.geometry;
        if (!geo) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const m = o.matrixWorld.elements;
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              const x = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
              const y = m[1] * cx + m[5] * cy + m[9] * cz + m[13];
              const z = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              if (z < minZ) minZ = z;
              if (z > maxZ) maxZ = z;
            }
          }
        }
      });
      let worst = null;
      mesh.traverse(o => {
        const geo = o.geometry;
        if (!geo) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const m = o.matrixWorld.elements;
        let ox = 0;
        let oz = 0;
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              const x = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
              const z = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
              ox = Math.max(ox, Math.abs(x - mesh.position.x));
              oz = Math.max(oz, Math.abs(z - mesh.position.z));
            }
          }
        }
        const ext = Math.max(ox, oz);
        if (!worst || ext > worst.ext) {
          const mat = o.material;
          worst = {
            ext,
            color: mat && mat.color ? mat.color.getHexString() : 'multi',
            map: !!(mat && mat.map),
            verts: geo.attributes.position.count, box: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(n => +n.toFixed(3)), world: [m[12], m[13], m[14]].map(n => +n.toFixed(3))
          };
        }
      });
      out.push({
        id,
        name: nodes[id].props.name,
        // The renderer already projected the logical grid into world space, so
        // the mesh position is the authoritative tile centre.
        center: [mesh.position.x, mesh.position.y, mesh.position.z],
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        worst
      });
    }
    return out;
  });

  const HALF = 2.84 / 2;
  let bad = 0;
  console.log(`${report.length} room meshes`);
  for (const room of report) {
    const [cx, cy, cz] = room.center;
    const overX = Math.max(cx - HALF - room.min[0], room.max[0] - (cx + HALF));
    const overZ = Math.max(cz - HALF - room.min[2], room.max[2] - (cz + HALF));
    const over = Math.max(overX, overZ);
    const flag = over > 0.001 ? `BLEED +${over.toFixed(3)}` : 'ok';
    if (over > 0.001) bad += 1;
    console.log(
      `  ${String(room.name).padEnd(6)} y=${cy.toFixed(2)} x[${(room.min[0] - cx).toFixed(3)},${(
        room.max[0] - cx
      ).toFixed(3)}] z[${(room.min[2] - cz).toFixed(3)},${(room.max[2] - cz).toFixed(3)}] ${flag}` +
        (room.worst ? `  worst=#${room.worst.color}${room.worst.map ? '+map' : ''} ext=${room.worst.ext.toFixed(3)}\n      box=${JSON.stringify(room.worst.box)} world=${JSON.stringify(room.worst.world)}` : '')
    );
  }
  console.log(bad === 0 ? '\nNo room bleeds past its tile footprint.' : `\n${bad} rooms bleed past their tile.`);
} finally {
  console.log('ERRORS:', errors.length ? errors.slice(0, 8) : 'none');
  await browser.close();
}
