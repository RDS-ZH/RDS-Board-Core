/**
 * Layout probe: reports which props each room accepts, and whether any prop
 * blocks a doorway. Run with: node scripts/probe-layout.mjs
 */
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { layoutRoom, hashString } = await server.ssrLoadModule('/apps/web/src/render/procedural/roomLayout.ts');
const { ROOM_DEFS } = await server.ssrLoadModule('/packages/games/src/betrayal/cards.ts');

const { ROOM_PROPS } = await server
  .ssrLoadModule('/apps/web/src/render/procedural/roomTile.ts')
  .catch(() => ({ ROOM_PROPS: null }));

let table = ROOM_PROPS;
if (!table) {
  // roomTile imports three + DOM helpers; derive the table from source instead.
  const fs = await import('node:fs');
  const src = fs.readFileSync('apps/web/src/render/procedural/roomTile.ts', 'utf8');
  const block = src.slice(src.indexOf('const ROOM_PROPS'), src.indexOf('/** Rooms whose solid walls'));
  const body = block.slice(block.indexOf('{'), block.lastIndexOf('}') + 1);
  table = new Function(`return (${body});`)();
}

const INNER = 2.84 / 2 - 0.1;
let totalPlaced = 0;
let totalRejected = 0;

for (const [id, def] of Object.entries(ROOM_DEFS)) {
  const wish = table[id] ?? [];
  if (!wish.length) continue;
  const res = layoutRoom({
    inner: INNER,
    doors: def.doors,
    wanted: wish,
    seed: hashString(`${id}|${def.name}|${def.doors.join('')}`),
    doorHalf: 0.46
  });
  totalPlaced += res.placed.length;
  totalRejected += res.rejected.length;

  // Door corridor intrusion check.
  const offenders = [];
  for (const p of res.placed) {
    if (p.spec.decal || p.spec.ceiling || p.spec.wallMounted) continue;
    for (const door of def.doors) {
      const horiz = door === 'N' || door === 'S';
      const vx = door === 'E' ? 1 : door === 'W' ? -1 : 0;
      const vz = door === 'N' ? -1 : door === 'S' ? 1 : 0;
      const approach = 0.58;
      const cw = horiz ? 0.46 * 2 : approach;
      const cd = horiz ? approach : 0.46 * 2;
      const cx = vx * (INNER - approach / 2);
      const cz = vz * (INNER - approach / 2);
      const overlapX = Math.abs(p.rect.x - cx) < (p.rect.w + cw) / 2;
      const overlapZ = Math.abs(p.rect.z - cz) < (p.rect.d + cd) / 2;
      if (overlapX && overlapZ) offenders.push(`${p.spec.id}@${door}`);
    }
  }
  const list = res.placed.map(p => `${p.spec.id}${p.wall ? ':' + p.wall : ''}`);
  console.log(
    `${id.padEnd(20)} ${def.floor.padEnd(8)} doors=${def.doors.join('')} placed=${res.placed.length} rejected=${
      res.rejected.length
    }${offenders.length ? '  !!DOOR:' + offenders.join(',') : ''}`
  );
  console.log(`  ${list.join(', ')}`);
  if (res.rejected.length) console.log(`  rejected: ${res.rejected.join(', ')}`);
}

console.log(`\ntotal placed=${totalPlaced} rejected=${totalRejected}`);
await server.close();
