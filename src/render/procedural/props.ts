import * as THREE from 'three';
import { MAT } from './materials';

/**
 * Procedural furniture & set-dressing library for the Betrayal mansion.
 *
 * Every builder returns a `THREE.Group` standing on the floor plane (y = 0),
 * with its "front" facing +Z and its back resting against -Z. The layout
 * engine rotates the group around Y so the back always hugs a wall.
 *
 * All meshes share `MAT` singleton materials, which lets the room builder merge
 * geometry per material and keep the draw-call count flat.
 */

export type PropAnchor = 'N' | 'S' | 'E' | 'W' | 'CENTER';

export interface PropSpec {
  id: string;
  build: () => THREE.Group;
  /** Footprint along X (before rotation). */
  width: number;
  /** Footprint along Z (before rotation). */
  depth: number;
  /** Visual height, used for label/occlusion heuristics. */
  height: number;
  /** Preferred placement family. */
  anchor: PropAnchor;
  /** Hangs from the ceiling, contributes no floor footprint. */
  ceiling?: boolean;
  /** Wall-mounted decal, contributes no floor footprint. */
  wallMounted?: boolean;
  /** Flat floor decal (rug, ritual circle, puddle): never blocks a doorway. */
  decal?: boolean;
  /** Prefers to cluster around the room's main centrepiece. */
  satellite?: boolean;
  /** Extra clearance to the centrepiece when acting as a satellite. */
  satelliteGap?: number;
}

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                          */
/* -------------------------------------------------------------------------- */

function shadow(mesh: THREE.Mesh, cast = true): THREE.Mesh {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  ry = 0,
  cast = true
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return shadow(m, cast);
}

function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  segments = 12,
  cast = true
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat);
  m.position.set(x, y, z);
  return shadow(m, cast);
}

function sph(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, cast = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
  m.position.set(x, y, z);
  return shadow(m, cast);
}

function torus(
  r: number,
  tube: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = Math.PI / 2,
  cast = false
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 18), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return shadow(m, cast);
}

function plane(w: number, h: number, mat: THREE.Material, x = 0, y = 0.001, z = 0, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  if (ry) m.rotation.z = ry;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const child of children) g.add(child);
  return g;
}

/** A candle: wax stick, wick, and a hot emissive tip. */
function candle(h: number, x: number, y: number, z: number, radius = 0.016): THREE.Group {
  return group(
    cyl(radius, radius * 1.08, h, MAT.wax, x, y + h / 2, z, 8, false),
    sph(radius * 0.85, MAT.flame, x, y + h + radius * 0.7, z)
  );
}

/** A graduated stack of "books" standing on a shelf. */
function bookRow(length: number, y: number, z: number, x0: number): THREE.Group {
  const g = new THREE.Group();
  const palette = [MAT.crimsonVelvet, MAT.emeraldVelvet, MAT.plumVelvet, MAT.leather, MAT.ebony, MAT.oak];
  let cursor = x0;
  let i = 0;
  while (cursor < x0 + length - 0.03) {
    const w = 0.028 + ((i * 37) % 11) * 0.005;
    const h = 0.13 + ((i * 53) % 9) * 0.012;
    g.add(box(w, h, 0.11, palette[i % palette.length], cursor + w / 2, y + h / 2, z, 0, false));
    cursor += w + 0.006;
    i += 1;
  }
  return g;
}

/* -------------------------------------------------------------------------- */
/* Bedroom                                                                     */
/* -------------------------------------------------------------------------- */

const fourPosterBed = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.86;
  const D = 0.9;
  // Frame
  g.add(box(W, 0.055, D, MAT.mahogany, 0, 0.11, 0));
  g.add(box(W - 0.06, 0.09, D - 0.06, MAT.ebony, 0, 0.055, 0));
  // Mattress + bedding
  g.add(box(W - 0.1, 0.075, D - 0.16, MAT.linen, 0, 0.175, 0.02));
  g.add(box(W - 0.12, 0.05, D * 0.6, MAT.crimsonVelvet, 0, 0.215, 0.15));
  // Turned-down sheet band and folded top edge
  g.add(box(W - 0.11, 0.035, 0.1, MAT.linen, 0, 0.232, -0.03, 0, false));
  g.add(box(W - 0.12, 0.02, 0.05, MAT.wineVelvet, 0, 0.243, 0.02, 0, false));
  // Quilt creases across the blanket
  for (const dz of [0.08, 0.19, 0.3]) {
    g.add(box(W - 0.13, 0.012, 0.016, MAT.wineVelvet, 0, 0.241, dz, 0, false));
  }
  // Pillows with a slight gap and shadow line
  g.add(box(0.29, 0.06, 0.15, MAT.linen, -0.17, 0.224, -D / 2 + 0.17));
  g.add(box(0.29, 0.06, 0.15, MAT.linen, 0.17, 0.224, -D / 2 + 0.17));
  g.add(box(0.06, 0.055, 0.14, MAT.agedLinen, 0, 0.222, -D / 2 + 0.17, 0, false));
  // Footboard
  g.add(box(W + 0.02, 0.14, 0.04, MAT.mahogany, 0, 0.19, D / 2 + 0.01));
  g.add(box(W - 0.06, 0.02, 0.05, MAT.brass, 0, 0.265, D / 2 + 0.01, 0, false));
  // Pillows
  g.add(box(0.3, 0.055, 0.16, MAT.linen, -0.17, 0.222, -D / 2 + 0.16));
  g.add(box(0.3, 0.055, 0.16, MAT.linen, 0.17, 0.222, -D / 2 + 0.16));
  // Headboard
  g.add(box(W + 0.02, 0.26, 0.05, MAT.mahogany, 0, 0.29, -D / 2 - 0.01));
  g.add(box(W - 0.08, 0.1, 0.03, MAT.wineVelvet, 0, 0.33, -D / 2 + 0.02, 0, false));
  // Four posts with finials
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.017, 0.019, 0.5, MAT.mahogany, (sx * (W - 0.03)) / 2, 0.25, (sz * (D - 0.03)) / 2, 8));
      g.add(sph(0.026, MAT.brass, (sx * (W - 0.03)) / 2, 0.52, (sz * (D - 0.03)) / 2));
    }
  }
  // Canopy rails
  g.add(box(W - 0.03, 0.014, 0.014, MAT.brass, 0, 0.5, -D / 2 + 0.015, 0, false));
  g.add(box(W - 0.03, 0.014, 0.014, MAT.brass, 0, 0.5, D / 2 - 0.015, 0, false));
  return g;
};

const singleBed = (): THREE.Group => {
  const W = 0.55;
  const D = 0.88;
  return group(
    box(W, 0.05, D, MAT.oak, 0, 0.1, 0),
    box(W - 0.06, 0.07, D - 0.12, MAT.agedLinen, 0, 0.16, 0.02),
    box(W - 0.08, 0.04, D * 0.6, MAT.emeraldVelvet, 0, 0.2, 0.14),
    box(W, 0.2, 0.045, MAT.oak, 0, 0.24, -D / 2 - 0.01),
    box(0.24, 0.05, 0.14, MAT.linen, 0, 0.2, -D / 2 + 0.14),
    box(0.05, 0.1, 0.05, MAT.oak, -W / 2 + 0.04, 0.05, D / 2 - 0.05, 0, false),
    box(0.05, 0.1, 0.05, MAT.oak, W / 2 - 0.04, 0.05, D / 2 - 0.05, 0, false)
  );
};

const wardrobe = (): THREE.Group => {
  const W = 0.58;
  const H = 0.56;
  const D = 0.26;
  const g = new THREE.Group();
  g.add(box(W, H, D, MAT.mahogany, 0, H / 2 + 0.04, 0));
  g.add(box(W + 0.06, 0.05, D + 0.05, MAT.ebony, 0, H + 0.075, 0));
  g.add(box(W + 0.02, 0.05, D + 0.02, MAT.ebony, 0, 0.03, 0));
  // Doors
  g.add(box(W / 2 - 0.03, H - 0.1, 0.015, MAT.walnut, -W / 4, H / 2 + 0.04, D / 2 + 0.005));
  g.add(box(W / 2 - 0.03, H - 0.1, 0.015, MAT.walnut, W / 4, H / 2 + 0.04, D / 2 + 0.005));
  // Recessed panels
  for (const sx of [-1, 1]) {
    g.add(box(W / 2 - 0.1, H * 0.5, 0.008, MAT.ebony, (sx * W) / 4, H * 0.62, D / 2 + 0.013, 0, false));
    g.add(box(W / 2 - 0.1, H * 0.16, 0.008, MAT.ebony, (sx * W) / 4, H * 0.3, D / 2 + 0.013, 0, false));
  }
  // Brass knobs
  g.add(sph(0.014, MAT.brass, -0.026, H * 0.5, D / 2 + 0.024));
  g.add(sph(0.014, MAT.brass, 0.026, H * 0.5, D / 2 + 0.024));
  return g;
};

const nightstand = (): THREE.Group =>
  group(
    box(0.2, 0.22, 0.2, MAT.mahogany, 0, 0.13, 0),
    box(0.23, 0.02, 0.23, MAT.ebony, 0, 0.245, 0),
    box(0.16, 0.07, 0.008, MAT.walnut, 0, 0.18, 0.101, 0, false),
    sph(0.01, MAT.brass, 0, 0.18, 0.108),
    candle(0.1, 0.03, 0.255, -0.02)
  );

const cradle = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.34, 0.16, 0.22, MAT.oak, 0, 0.16, 0));
  g.add(box(0.3, 0.04, 0.18, MAT.linen, 0, 0.23, 0, 0, false));
  // Rockers
  g.add(box(0.05, 0.02, 0.3, MAT.walnut, -0.15, 0.06, 0));
  g.add(box(0.05, 0.02, 0.3, MAT.walnut, 0.15, 0.06, 0));
  // Hood
  g.add(box(0.34, 0.2, 0.02, MAT.oak, 0, 0.28, -0.1));
  return g;
};

const rockingHorse = (): THREE.Group =>
  group(
    box(0.3, 0.12, 0.1, MAT.paleOak, 0, 0.2, 0),
    box(0.1, 0.14, 0.09, MAT.paleOak, 0.19, 0.24, 0),
    box(0.05, 0.1, 0.06, MAT.oak, 0.24, 0.17, 0),
    box(0.03, 0.1, 0.02, MAT.ebony, 0.21, 0.34, 0, 0, false),
    box(0.03, 0.22, 0.03, MAT.oak, -0.1, 0.1, 0.05),
    box(0.03, 0.22, 0.03, MAT.oak, -0.1, 0.1, -0.05),
    box(0.03, 0.22, 0.03, MAT.oak, 0.1, 0.1, 0.05),
    box(0.03, 0.22, 0.03, MAT.oak, 0.1, 0.1, -0.05),
    box(0.4, 0.02, 0.03, MAT.walnut, 0, 0.02, 0.09),
    box(0.4, 0.02, 0.03, MAT.walnut, 0, 0.02, -0.09)
  );

const toyChest = (): THREE.Group =>
  group(
    box(0.34, 0.2, 0.24, MAT.oak, 0, 0.11, 0),
    box(0.36, 0.05, 0.26, MAT.walnut, 0, 0.235, 0),
    box(0.34, 0.16, 0.008, MAT.walnut, 0, 0.13, 0.124, 0, false),
    box(0.05, 0.03, 0.02, MAT.brass, 0, 0.16, 0.13, 0, false),
    // Spilled blocks
    box(0.06, 0.06, 0.06, MAT.crimsonVelvet, 0.26, 0.035, 0.14, 0.4, false),
    box(0.055, 0.055, 0.055, MAT.emeraldVelvet, 0.34, 0.03, 0.05, -0.3, false)
  );

/* -------------------------------------------------------------------------- */
/* Study / parlour                                                            */
/* -------------------------------------------------------------------------- */

const bookshelf = (): THREE.Group => {
  const W = 0.84;
  const H = 0.62;
  const D = 0.26;
  const g = new THREE.Group();
  // Carcass
  g.add(box(W, H, 0.02, MAT.mahogany, 0, H / 2 + 0.03, -D / 2 + 0.01));
  g.add(box(0.035, H, D, MAT.mahogany, -W / 2 + 0.017, H / 2 + 0.03, 0));
  g.add(box(0.035, H, D, MAT.mahogany, W / 2 - 0.017, H / 2 + 0.03, 0));
  g.add(box(W, 0.03, D, MAT.ebony, 0, H + 0.045, 0));
  g.add(box(W, 0.04, D + 0.02, MAT.ebony, 0, 0.02, 0));
  // Shelves + books
  const shelfY = [0.14, 0.3, 0.46];
  for (const y of shelfY) {
    g.add(box(W - 0.06, 0.018, D - 0.03, MAT.walnut, 0, y, 0, 0, false));
    g.add(bookRow(W - 0.12, y + 0.01, 0.01, -W / 2 + 0.06));
  }
  return g;
};

const writingDesk = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.66, 0.04, 0.34, MAT.mahogany, 0, 0.235, 0));
  // Drawer pedestal
  g.add(box(0.22, 0.22, 0.3, MAT.walnut, 0.19, 0.115, 0));
  for (const y of [0.06, 0.13, 0.2]) {
    g.add(box(0.17, 0.05, 0.008, MAT.ebony, 0.19, y, 0.152, 0, false));
    g.add(sph(0.008, MAT.brass, 0.19, y, 0.159));
  }
  // Legs
  g.add(box(0.035, 0.235, 0.035, MAT.mahogany, -0.3, 0.117, 0.14));
  g.add(box(0.035, 0.235, 0.035, MAT.mahogany, -0.3, 0.117, -0.14));
  // Desk items
  g.add(box(0.16, 0.006, 0.11, MAT.paper, -0.12, 0.258, 0.02, 0.1, false));
  g.add(cyl(0.022, 0.026, 0.035, MAT.glassDark, -0.26, 0.275, -0.06, 8, false));
  g.add(box(0.13, 0.012, 0.014, MAT.ebony, 0.02, 0.262, -0.1, 0.2, false));
  g.add(candle(0.09, 0.26, 0.256, -0.02));
  return g;
};

const grandfatherClock = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.24, 0.9, 0.18, MAT.mahogany, 0, 0.45, 0));
  g.add(box(0.28, 0.05, 0.22, MAT.ebony, 0, 0.92, 0));
  // Face
  g.add(cyl(0.08, 0.08, 0.012, MAT.porcelain, 0, 0.79, 0.092, 16, false));
  g.add(torus(0.082, 0.008, MAT.brass, 0, 0.79, 0.098));
  // Hands
  g.add(box(0.006, 0.06, 0.004, MAT.ebony, 0, 0.815, 0.1, 0, false));
  g.add(box(0.04, 0.006, 0.004, MAT.ebony, 0.018, 0.79, 0.1, 0, false));
  // Pendulum window + bob
  g.add(box(0.13, 0.3, 0.012, MAT.glassDark, 0, 0.5, 0.092, 0, false));
  g.add(cyl(0.05, 0.05, 0.008, MAT.brass, 0, 0.44, 0.086, 12, false));
  g.add(box(0.008, 0.2, 0.006, MAT.agedBrass, 0, 0.56, 0.086, 0, false));
  // Feet
  g.add(box(0.07, 0.06, 0.06, MAT.ebony, -0.09, 0.03, 0));
  g.add(box(0.07, 0.06, 0.06, MAT.ebony, 0.09, 0.03, 0));
  return g;
};

const piano = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.86;
  const H = 0.44;
  g.add(box(W, 0.36, 0.24, MAT.ebony, 0, H - 0.14, -0.03));
  g.add(box(W + 0.04, 0.04, 0.28, MAT.ebony, 0, H + 0.04, -0.03));
  // Keyboard
  g.add(box(W - 0.12, 0.035, 0.14, MAT.linen, 0, H - 0.16, 0.14, 0, false));
  for (let i = 0; i < 14; i += 1) {
    g.add(box(0.012, 0.026, 0.09, MAT.ebony, -W / 2 + 0.09 + i * 0.05, H - 0.15, 0.13, 0, false));
  }
  // Music stand
  g.add(box(W - 0.2, 0.13, 0.015, MAT.ebony, 0, H + 0.1, 0.02, 0, false));
  g.add(box(0.24, 0.17, 0.008, MAT.paper, -0.1, H + 0.1, 0.03, 0, false));
  // Legs + pedals
  g.add(box(0.05, H - 0.16, 0.05, MAT.ebony, -W / 2 + 0.06, (H - 0.16) / 2, 0.08));
  g.add(box(0.05, H - 0.16, 0.05, MAT.ebony, W / 2 - 0.06, (H - 0.16) / 2, 0.08));
  g.add(box(0.05, H - 0.16, 0.05, MAT.ebony, -W / 2 + 0.06, (H - 0.16) / 2, -0.12));
  g.add(box(0.05, H - 0.16, 0.05, MAT.ebony, W / 2 - 0.06, (H - 0.16) / 2, -0.12));
  for (const x of [-0.06, 0, 0.06]) g.add(box(0.035, 0.012, 0.08, MAT.brass, x, 0.04, 0.16));
  return g;
};

const sofa = (): THREE.Group => {
  const W = 0.78;
  const g = new THREE.Group();
  g.add(box(W, 0.1, 0.34, MAT.plumVelvet, 0, 0.18, 0));
  g.add(box(W, 0.2, 0.09, MAT.plumVelvet, 0, 0.30, -0.14));
  g.add(box(0.09, 0.17, 0.34, MAT.plumVelvet, -W / 2 + 0.045, 0.235, 0));
  g.add(box(0.09, 0.17, 0.34, MAT.plumVelvet, W / 2 - 0.045, 0.235, 0));
  // Cushions
  g.add(box(W - 0.24, 0.07, 0.26, MAT.wineVelvet, 0, 0.245, 0.015, 0, false));
  // Feet
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.016, 0.02, 0.14, MAT.ebony, (sx * (W - 0.08)) / 2, 0.07, sz * 0.13, 6));
    }
  }
  return g;
};

const armchair = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.4, 0.09, 0.38, MAT.emeraldVelvet, 0, 0.18, 0));
  g.add(box(0.4, 0.26, 0.08, MAT.emeraldVelvet, 0, 0.32, -0.15));
  g.add(box(0.08, 0.16, 0.36, MAT.emeraldVelvet, -0.16, 0.24, 0));
  g.add(box(0.08, 0.16, 0.36, MAT.emeraldVelvet, 0.16, 0.24, 0));
  g.add(box(0.24, 0.06, 0.3, MAT.wineVelvet, 0, 0.235, 0.01, 0, false));
  return g;
};

const sideTable = (): THREE.Group =>
  group(
    cyl(0.16, 0.16, 0.025, MAT.mahogany, 0, 0.27, 0, 16),
    cyl(0.03, 0.04, 0.26, MAT.mahogany, 0, 0.13, 0, 8),
    cyl(0.11, 0.13, 0.02, MAT.ebony, 0, 0.02, 0, 16, false),
    cyl(0.035, 0.03, 0.09, MAT.glassDark, 0, 0.33, 0, 10, false),
    candle(0.07, 0.02, 0.34, 0.06)
  );

const globeStand = (): THREE.Group =>
  group(
    cyl(0.1, 0.13, 0.02, MAT.mahogany, 0, 0.01, 0, 14, false),
    cyl(0.02, 0.024, 0.3, MAT.mahogany, 0, 0.16, 0, 8),
    sph(0.13, MAT.paleOak, 0, 0.36, 0, true),
    torus(0.14, 0.006, MAT.brass, 0, 0.36, 0, Math.PI / 2),
    cyl(0.008, 0.008, 0.1, MAT.brass, 0, 0.36, 0, 6, false)
  );

const fireplace = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.78;
  // Mantel + surround
  g.add(box(W, 0.1, 0.2, MAT.paleStone, 0, 0.5, -0.02));
  g.add(box(W + 0.1, 0.03, 0.24, MAT.marble, 0, 0.56, -0.01));
  g.add(box(0.1, 0.46, 0.18, MAT.paleStone, -W / 2 + 0.05, 0.25, -0.02));
  g.add(box(0.1, 0.46, 0.18, MAT.paleStone, W / 2 - 0.05, 0.25, -0.02));
  // Firebox
  g.add(box(W - 0.2, 0.4, 0.1, MAT.ebony, 0, 0.2, -0.09));
  g.add(box(W - 0.26, 0.16, 0.05, MAT.ember, 0, 0.09, 0.0, 0, false));
  g.add(box(W - 0.4, 0.07, 0.03, MAT.flame, 0, 0.12, 0.03, 0, false));
  // Hearth stones
  g.add(box(W + 0.16, 0.02, 0.16, MAT.granite, 0, 0.01, 0.1, 0, false));
  // Mantel clutter
  g.add(candle(0.09, -0.3, 0.575, -0.01));
  g.add(candle(0.07, -0.2, 0.575, -0.01));
  g.add(cyl(0.07, 0.07, 0.004, MAT.brass, 0.25, 0.578, -0.01, 14, false));
  return g;
};

const mirrorStand = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.3, 0.42, 0.03, MAT.ebony, 0, 0.44, -0.04));
  g.add(box(0.32, 0.04, 0.05, MAT.gold, 0, 0.66, -0.04, 0, false));
  // Tarnished reflective pane
  g.add(box(0.22, 0.32, 0.006, MAT.glassDark, 0, 0.44, -0.022, 0, false));
  g.add(box(0.3, 0.06, 0.14, MAT.ebony, 0, 0.03, 0));
  g.add(box(0.05, 0.2, 0.05, MAT.ebony, -0.11, 0.14, -0.02, 0, false));
  g.add(box(0.05, 0.2, 0.05, MAT.ebony, 0.11, 0.14, -0.02, 0, false));
  return g;
};

/* -------------------------------------------------------------------------- */
/* Dining / kitchen                                                           */
/* -------------------------------------------------------------------------- */

const diningTable = (): THREE.Group => {
  const W = 1.02;
  const D = 0.46;
  const g = new THREE.Group();
  g.add(box(W, 0.045, D, MAT.mahogany, 0, 0.28, 0));
  g.add(box(W + 0.04, 0.02, D + 0.04, MAT.ebony, 0, 0.257, 0, 0, false));
  // Turned legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.022, 0.026, 0.26, MAT.mahogany, (sx * (W - 0.08)) / 2, 0.13, (sz * (D - 0.08)) / 2, 8));
      g.add(cyl(0.03, 0.03, 0.02, MAT.brass, (sx * (W - 0.08)) / 2, 0.02, (sz * (D - 0.08)) / 2, 8, false));
    }
  }
  // Table runner, candelabra, place settings
  g.add(box(0.22, 0.006, D - 0.06, MAT.crimsonVelvet, 0, 0.306, 0, 0, false));
  g.add(cyl(0.016, 0.03, 0.14, MAT.brass, 0, 0.375, 0, 8, false));
  for (const x of [-0.075, 0, 0.075]) {
    g.add(cyl(0.01, 0.012, 0.14, MAT.brass, x, 0.44, 0, 6, false));
    g.add(sph(0.014, MAT.flame, x, 0.52, 0));
  }
  for (const sx of [-1, 1]) {
    g.add(cyl(0.055, 0.055, 0.006, MAT.porcelain, sx * 0.28, 0.308, 0.1, 14, false));
    g.add(cyl(0.055, 0.055, 0.006, MAT.porcelain, sx * 0.28, 0.308, -0.1, 14, false));
  }
  return g;
};

const diningChair = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.22, 0.03, 0.22, MAT.mahogany, 0, 0.22, 0));
  g.add(box(0.22, 0.05, 0.2, MAT.crimsonVelvet, 0, 0.245, 0, 0, false));
  // Back posts + spindles
  g.add(box(0.026, 0.34, 0.026, MAT.mahogany, -0.095, 0.4, -0.1));
  g.add(box(0.026, 0.34, 0.026, MAT.mahogany, 0.095, 0.4, -0.1));
  g.add(box(0.21, 0.03, 0.026, MAT.mahogany, 0, 0.53, -0.1));
  for (let i = 0; i < 3; i += 1) {
    g.add(cyl(0.008, 0.008, 0.28, MAT.mahogany, -0.05 + i * 0.05, 0.37, -0.1, 6, false));
  }
  // Legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.024, 0.22, 0.024, MAT.mahogany, sx * 0.085, 0.11, sz * 0.085, 0, false));
    }
  }
  return g;
};

const kitchenCounter = (): THREE.Group => {
  const W = 0.9;
  const g = new THREE.Group();
  g.add(box(W, 0.28, 0.32, MAT.paleOak, 0, 0.14, 0));
  g.add(box(W + 0.04, 0.035, 0.36, MAT.paleStone, 0, 0.295, 0));
  // Cabinet doors
  for (let i = 0; i < 3; i += 1) {
    g.add(box(W / 3 - 0.03, 0.2, 0.008, MAT.walnut, -W / 3 + (i * W) / 3, 0.14, 0.163, 0, false));
    g.add(sph(0.009, MAT.brass, -W / 3 + (i * W) / 3, 0.14, 0.17));
  }
  // Sink
  g.add(box(0.26, 0.05, 0.2, MAT.darkIron, -0.18, 0.3, 0, 0, false));
  g.add(box(0.22, 0.02, 0.16, MAT.water, -0.18, 0.315, 0, 0, false));
  g.add(cyl(0.012, 0.012, 0.1, MAT.brass, -0.18, 0.35, -0.1, 6, false));
  // Crockery
  g.add(cyl(0.06, 0.05, 0.05, MAT.porcelain, 0.22, 0.33, 0, 12, false));
  g.add(cyl(0.035, 0.045, 0.1, MAT.porcelain, 0.34, 0.35, 0.02, 10, false));
  return g;
};

const hangingPots = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.7, 0.02, 0.02, MAT.darkIron, 0, 0.72, 0, 0, false));
  for (const x of [-0.24, -0.08, 0.08, 0.24]) {
    g.add(cyl(0.006, 0.006, 0.1, MAT.darkIron, x, 0.67, 0, 5, false));
    g.add(cyl(0.055, 0.04, 0.06, MAT.iron, x, 0.6, 0, 10, false));
    g.add(cyl(0.005, 0.005, 0.13, MAT.agedBrass, x + 0.05, 0.6, 0, 4, false));
  }
  return g;
};

const pantryShelf = (): THREE.Group => {
  const W = 0.7;
  const g = new THREE.Group();
  for (const y of [0.1, 0.26, 0.42]) {
    g.add(box(W, 0.02, 0.22, MAT.paleOak, 0, y, 0, 0, false));
    // jars
    for (let i = 0; i < 5; i += 1) {
      const x = -W / 2 + 0.08 + i * 0.13;
      g.add(cyl(0.03, 0.03, 0.08, MAT.glassDark, x, y + 0.05, 0.01, 8, false));
      g.add(cyl(0.032, 0.032, 0.008, MAT.rust, x, y + 0.094, 0.01, 8, false));
    }
  }
  g.add(box(0.03, 0.5, 0.22, MAT.paleOak, -W / 2, 0.26, 0));
  g.add(box(0.03, 0.5, 0.22, MAT.paleOak, W / 2, 0.26, 0));
  return g;
};

const barrelStack = (): THREE.Group => {
  const g = new THREE.Group();
  const barrel = (x: number, z: number, scale = 1) => {
    const h = 0.34 * scale;
    const r = 0.13 * scale;
    g.add(cyl(r * 0.86, r * 0.86, h, MAT.oak, x, h / 2, z, 12));
    g.add(cyl(r, r, h * 0.55, MAT.oak, x, h / 2, z, 12));
    for (const dy of [-0.32, 0.32]) g.add(torus(r * 0.96, 0.008, MAT.iron, x, h / 2 + dy * h, z));
    g.add(cyl(r * 0.9, r * 0.9, 0.008, MAT.walnut, x, h + 0.004, z, 12, false));
  };
  barrel(-0.1, -0.08);
  barrel(0.13, 0.12, 0.9);
  barrel(-0.05, 0.2, 0.75);
  return g;
};

const crateStack = (): THREE.Group => {
  const g = new THREE.Group();
  const crate = (x: number, y: number, z: number, s: number, ry = 0) => {
    g.add(box(s, s, s, MAT.plywood, x, y + s / 2, z, ry));
    // Plank seams + strapping
    g.add(box(s + 0.006, 0.02, s + 0.006, MAT.walnut, x, y + s * 0.5, z, ry, false));
    g.add(box(s + 0.006, 0.02, 0.012, MAT.rust, x, y + s * 0.85, z + s / 2 + 0.004, ry, false));
    g.add(box(s + 0.006, 0.02, 0.012, MAT.rust, x, y + s * 0.15, z + s / 2 + 0.004, ry, false));
  };
  crate(-0.1, 0, -0.05, 0.26);
  crate(0.16, 0, 0.1, 0.2, 0.3);
  crate(-0.06, 0.26, -0.05, 0.2, 0.15);
  return g;
};

const wineRack = (): THREE.Group => {
  const W = 0.5;
  const g = new THREE.Group();
  g.add(box(W, 0.55, 0.06, MAT.walnut, 0, 0.3, -0.11));
  for (const y of [0.06, 0.19, 0.32, 0.45, 0.56]) {
    g.add(box(W, 0.025, 0.2, MAT.walnut, 0, y, 0, 0, false));
  }
  g.add(box(0.025, 0.56, 0.2, MAT.walnut, -W / 2 + 0.012, 0.3, 0));
  g.add(box(0.025, 0.56, 0.2, MAT.walnut, W / 2 - 0.012, 0.3, 0));
  // Bottles lying in the racks
  for (let row = 0; row < 4; row += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = -W / 2 + 0.1 + i * 0.15;
      const y = 0.085 + row * 0.13;
      g.add(cyl(0.024, 0.026, 0.16, MAT.glassDark, x, y, 0.01, 8, false));
      g.add(cyl(0.008, 0.008, 0.05, MAT.glassDark, x, y, 0.11, 6, false));
    }
  }
  return g;
};

/* -------------------------------------------------------------------------- */
/* Laboratory / workshop                                                      */
/* -------------------------------------------------------------------------- */

const labBench = (): THREE.Group => {
  const W = 0.92;
  const g = new THREE.Group();
  g.add(box(W, 0.05, 0.36, MAT.marble, 0, 0.33, 0));
  g.add(box(W - 0.06, 0.05, 0.3, MAT.paleStone, 0, 0.29, 0, 0, false));
  g.add(box(0.06, 0.3, 0.3, MAT.darkIron, -W / 2 + 0.06, 0.16, 0));
  g.add(box(0.06, 0.3, 0.3, MAT.darkIron, W / 2 - 0.06, 0.16, 0));
  g.add(box(W - 0.2, 0.02, 0.26, MAT.iron, 0, 0.08, 0, 0, false));
  // Distillation train
  g.add(cyl(0.05, 0.06, 0.12, MAT.glass, -0.32, 0.415, 0, 10, false));
  g.add(cyl(0.026, 0.026, 0.16, MAT.glass, -0.32, 0.55, 0, 8, false));
  g.add(sph(0.055, MAT.glass, -0.19, 0.44, 0, false));
  g.add(cyl(0.03, 0.03, 0.1, MAT.glass, -0.19, 0.52, 0, 8, false));
  g.add(sph(0.045, MAT.sicklyGlow, -0.32, 0.4, 0, false));
  // Burner
  g.add(cyl(0.045, 0.05, 0.05, MAT.iron, 0.05, 0.38, 0, 10, false));
  g.add(sph(0.02, MAT.flame, 0.05, 0.41, 0));
  g.add(cyl(0.055, 0.055, 0.1, MAT.glass, 0.05, 0.46, 0, 10, false));
  // Rack of test tubes
  g.add(box(0.2, 0.02, 0.1, MAT.oak, 0.3, 0.37, 0, 0, false));
  for (let i = 0; i < 4; i += 1) {
    g.add(cyl(0.012, 0.012, 0.12, MAT.glass, 0.24 + i * 0.04, 0.43, 0, 6, false));
    g.add(cyl(0.012, 0.012, 0.05, MAT.sicklyGlow, 0.24 + i * 0.04, 0.395, 0, 6, false));
  }
  return g;
};

const operatingTable = (): THREE.Group => {
  const g = new THREE.Group();
  const D = 0.78;
  g.add(box(0.42, 0.06, D, MAT.steel, 0, 0.36, 0));
  g.add(box(0.36, 0.03, D - 0.06, MAT.agedLinen, 0, 0.4, 0, 0, false));
  // Tapered base
  g.add(box(0.14, 0.3, 0.3, MAT.iron, 0, 0.17, 0));
  g.add(box(0.34, 0.03, 0.42, MAT.iron, 0, 0.03, 0, 0, false));
  // Straps
  for (const z of [-0.24, 0.0, 0.24]) {
    g.add(box(0.44, 0.014, 0.06, MAT.leather, 0, 0.395, z, 0, false));
  }
  // Headrest + instrument tray
  g.add(box(0.26, 0.05, 0.1, MAT.agedLinen, 0, 0.42, -D / 2 + 0.05, 0, false));
  g.add(box(0.22, 0.012, 0.14, MAT.steel, 0.3, 0.42, 0.1, 0, false));
  g.add(box(0.009, 0.012, 0.1, MAT.steel, 0.24, 0.432, 0.1, 0.3, false));
  g.add(box(0.008, 0.008, 0.09, MAT.steel, 0.31, 0.432, 0.12, -0.4, false));
  // Overhead surgical lamp
  g.add(cyl(0.008, 0.008, 0.3, MAT.iron, 0.3, 0.56, -0.2, 6, false));
  g.add(cyl(0.11, 0.05, 0.09, MAT.steel, 0.24, 0.66, -0.16, 12));
  g.add(cyl(0.09, 0.09, 0.006, MAT.lampGlow, 0.24, 0.612, -0.16, 12, false));
  return g;
};

const specimenShelf = (): THREE.Group => {
  const W = 0.64;
  const g = new THREE.Group();
  g.add(box(W, 0.03, 0.2, MAT.iron, 0, 0.06, 0, 0, false));
  g.add(box(W, 0.03, 0.2, MAT.iron, 0, 0.26, 0, 0, false));
  g.add(box(W, 0.03, 0.2, MAT.iron, 0, 0.46, 0, 0, false));
  g.add(box(0.03, 0.52, 0.2, MAT.iron, -W / 2, 0.28, 0));
  g.add(box(0.03, 0.52, 0.2, MAT.iron, W / 2, 0.28, 0));
  // Jars with specimens
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = -W / 2 + 0.11 + i * 0.2;
      const y = 0.08 + row * 0.2;
      g.add(cyl(0.045, 0.045, 0.11, MAT.glass, x, y + 0.06, 0, 10, false));
      g.add(cyl(0.038, 0.038, 0.075, MAT.sicklyGlow, x, y + 0.055, 0, 10, false));
      if (row === 1 && i === 1) g.add(sph(0.026, MAT.bone, x, y + 0.07, 0, false));
      g.add(cyl(0.047, 0.047, 0.012, MAT.rust, x, y + 0.122, 0, 10, false));
    }
  }
  return g;
};

const workbench = (): THREE.Group => {
  const W = 0.86;
  const g = new THREE.Group();
  g.add(box(W, 0.05, 0.38, MAT.plywood, 0, 0.3, 0));
  g.add(box(0.06, 0.3, 0.36, MAT.oak, -W / 2 + 0.05, 0.15, 0));
  g.add(box(0.06, 0.3, 0.36, MAT.oak, W / 2 - 0.05, 0.15, 0));
  g.add(box(W - 0.2, 0.03, 0.3, MAT.oak, 0, 0.12, 0, 0, false));
  // Pegboard with tools
  g.add(box(W - 0.1, 0.34, 0.02, MAT.plywood, 0, 0.52, -0.16));
  for (let i = 0; i < 5; i += 1) {
    g.add(box(0.014, 0.1, 0.012, MAT.steel, -W / 2 + 0.16 + i * 0.14, 0.5, -0.145, 0, false));
  }
  // Vise + timber
  g.add(box(0.1, 0.06, 0.08, MAT.rust, -0.32, 0.36, 0.06));
  g.add(box(0.3, 0.03, 0.06, MAT.paleOak, 0.16, 0.34, 0.02, 0.1, false));
  // Sawdust / shavings
  g.add(box(0.14, 0.008, 0.1, MAT.paleOak, 0.2, 0.31, 0.12, 0.4, false));
  return g;
};

/* -------------------------------------------------------------------------- */
/* Wall decoration (no floor footprint)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Gilded portrait. Hung at canvas centre height ~0.15 above the tile floor so
 * it sits inside the tall cutaway wall without reaching the crown moulding.
 */
const portrait = (): THREE.Group => {
  const g = new THREE.Group();
  const cy = 0.16;
  const W = 0.3;
  const H = 0.24;
  // Frame: outer gilt moulding with a dark inner rebate
  g.add(box(W, H, 0.028, MAT.gold, 0, cy, 0));
  g.add(box(W - 0.035, H - 0.035, 0.032, MAT.ebony, 0, cy, 0.002, 0, false));
  // Canvas ground, darker toward the edges
  g.add(box(W - 0.06, H - 0.06, 0.01, MAT.walnut, 0, cy, 0.016, 0, false));
  // Sitter: shoulders, head, and a sliver of collar
  g.add(box(W * 0.42, H * 0.3, 0.008, MAT.plumVelvet, 0, cy - 0.05, 0.023, 0, false));
  g.add(sph(0.032, MAT.agedLinen, 0, cy + 0.045, 0.023, false));
  g.add(box(W * 0.2, 0.014, 0.006, MAT.porcelain, 0, cy - 0.018, 0.026, 0, false));
  // Highlight rim on the frame's top edge
  g.add(box(W, 0.008, 0.032, MAT.brass, 0, cy + H / 2 - 0.004, 0, 0, false));
  return g;
};

/** Brass wall sconce with a live candle. */
const sconce = (): THREE.Group => {
  const g = new THREE.Group();
  const cy = 0.2;
  // Back plate
  g.add(box(0.06, 0.1, 0.014, MAT.agedBrass, 0, cy, 0.007, 0, false));
  // Arm curving out into the room
  g.add(box(0.012, 0.012, 0.09, MAT.agedBrass, 0, cy - 0.02, 0.05, 0, false));
  g.add(cyl(0.026, 0.018, 0.02, MAT.agedBrass, 0, cy + 0.005, 0.095, 10, false));
  // Candle + flame
  g.add(cyl(0.013, 0.014, 0.08, MAT.wax, 0, cy + 0.055, 0.095, 8, false));
  g.add(sph(0.014, MAT.flame, 0, cy + 0.105, 0.095));
  // Warm halo on the wall behind
  g.add(sph(0.03, MAT.lampGlow, 0, cy + 0.1, 0.02, false));
  return g;
};

/** Embroidered tapestry hanging from a rod. */
const tapestry = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.26;
  const H = 0.3;
  const top = 0.33;
  // Horizontal hanging rod running along the wall
  const rod = cyl(0.008, 0.008, W + 0.06, MAT.brass, 0, top, 0.03, 6, false);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);
  g.add(sph(0.014, MAT.brass, -(W + 0.06) / 2, top, 0.03, false));
  g.add(sph(0.014, MAT.brass, (W + 0.06) / 2, top, 0.03, false));
  // Cloth
  g.add(box(W, H, 0.008, MAT.wineVelvet, 0, top - H / 2 - 0.005, 0.026, 0, false));
  g.add(box(W - 0.04, H - 0.05, 0.01, MAT.crimsonVelvet, 0, top - H / 2 - 0.005, 0.028, 0, false));
  // Heraldic lozenges
  for (const dx of [-0.05, 0.05]) {
    g.add(box(0.05, 0.05, 0.012, MAT.gold, dx, top - 0.11, 0.031, Math.PI / 4, false));
  }
  g.add(box(0.04, 0.04, 0.014, MAT.ebony, 0, top - 0.2, 0.032, Math.PI / 4, false));
  return g;
};

/* -------------------------------------------------------------------------- */
/* Occult / crypt                                                             */
/* -------------------------------------------------------------------------- */

const sarcophagus = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.5;
  const D = 0.95;
  g.add(box(W, 0.26, D, MAT.paleStone, 0, 0.13, 0));
  g.add(box(W + 0.06, 0.07, D + 0.06, MAT.paleStone, 0, 0.295, 0));
  g.add(box(W + 0.1, 0.03, D + 0.1, MAT.stone, 0, 0.345, 0));
  // Carved head end (narrower)
  g.add(box(W - 0.08, 0.3, 0.14, MAT.paleStone, 0, 0.16, -D / 2 - 0.04));
  g.add(sph(0.09, MAT.marble, 0, 0.35, -D / 2 - 0.04, true));
  // Hieroglyph bands
  for (let i = 0; i < 5; i += 1) {
    g.add(box(W + 0.062, 0.012, 0.03, MAT.gold, 0, 0.2 + (i % 2) * 0.02, -D / 2 + 0.14 + i * 0.16, 0, false));
  }
  // Bound linen wraps peeking from the lid
  g.add(box(W - 0.14, 0.02, 0.3, MAT.agedLinen, 0, 0.335, 0, 0, false));
  return g;
};

const coffin = (): THREE.Group => {
  const g = new THREE.Group();
  // Hexagonal coffin: two tapered boxes
  g.add(box(0.36, 0.14, 0.4, MAT.ebony, 0, 0.2, -0.12));
  g.add(box(0.28, 0.14, 0.28, MAT.ebony, 0, 0.2, 0.2));
  g.add(box(0.3, 0.03, 0.36, MAT.walnut, 0, 0.275, -0.12, 0, false));
  // Brass cross on lid
  g.add(box(0.02, 0.008, 0.22, MAT.agedBrass, 0, 0.283, -0.12, 0, false));
  g.add(box(0.12, 0.008, 0.02, MAT.agedBrass, 0, 0.283, -0.18, 0, false));
  // Trestles
  g.add(box(0.44, 0.03, 0.06, MAT.ebony, 0, 0.13, -0.3));
  g.add(box(0.42, 0.03, 0.06, MAT.ebony, 0, 0.13, 0.28));
  g.add(box(0.04, 0.13, 0.04, MAT.ebony, -0.16, 0.065, -0.3));
  g.add(box(0.04, 0.13, 0.04, MAT.ebony, 0.16, 0.065, -0.3));
  g.add(box(0.04, 0.13, 0.04, MAT.ebony, -0.15, 0.065, 0.28));
  g.add(box(0.04, 0.13, 0.04, MAT.ebony, 0.15, 0.065, 0.28));
  return g;
};

const altar = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.7;
  g.add(box(W, 0.3, 0.3, MAT.paleStone, 0, 0.15, 0));
  g.add(box(W + 0.06, 0.04, 0.36, MAT.marble, 0, 0.32, 0));
  // Draped cloth
  g.add(box(W - 0.02, 0.01, 0.32, MAT.wineVelvet, 0, 0.345, 0, 0, false));
  g.add(box(W - 0.04, 0.14, 0.012, MAT.wineVelvet, 0, 0.27, 0.155, 0, false));
  // Ritual bowl with arcane light
  g.add(cyl(0.07, 0.05, 0.045, MAT.brass, 0, 0.37, 0, 12, false));
  g.add(cyl(0.058, 0.058, 0.006, MAT.arcaneGlow, 0, 0.385, 0, 12, false));
  // Candelabra
  g.add(cyl(0.012, 0.02, 0.09, MAT.brass, -0.24, 0.385, 0, 6, false));
  g.add(box(0.16, 0.008, 0.008, MAT.brass, -0.24, 0.43, 0, 0, false));
  for (const dx of [-0.08, 0, 0.08]) {
    g.add(cyl(0.008, 0.008, 0.06, MAT.brass, -0.24 + dx, 0.46, 0, 5, false));
    g.add(sph(0.012, MAT.flame, -0.24 + dx, 0.495, 0));
  }
  // Open grimoire
  g.add(box(0.14, 0.012, 0.1, MAT.paper, 0.2, 0.352, 0.02, 0.2, false));
  g.add(box(0.07, 0.016, 0.1, MAT.leather, 0.2, 0.352, 0.02, 0.2, false));
  return g;
};

const candelabra = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.07, 0.02, MAT.brass, 0, 0.01, 0, 12, false));
  g.add(cyl(0.014, 0.018, 0.34, MAT.brass, 0, 0.18, 0, 8));
  g.add(box(0.3, 0.012, 0.012, MAT.brass, 0, 0.36, 0, 0, false));
  for (const dx of [-0.14, -0.07, 0, 0.07, 0.14]) {
    const y = 0.36 + (dx === 0 ? 0.05 : 0.02);
    g.add(cyl(0.008, 0.008, 0.07, MAT.brass, dx, y + 0.035, 0, 5, false));
    g.add(cyl(0.011, 0.012, 0.09, MAT.wax, dx, y + 0.11, 0, 6, false));
    g.add(sph(0.013, MAT.flame, dx, y + 0.165, 0));
  }
  return g;
};

const ritualCircle = (): THREE.Group => {
  const g = new THREE.Group();
  const R = 0.62;
  // Outer double ring
  g.add(torus(R, 0.012, MAT.waxBlack, 0, 0.004, 0, Math.PI / 2, false));
  g.add(torus(R * 0.86, 0.008, MAT.waxBlack, 0, 0.004, 0, Math.PI / 2, false));
  // Pentagram: five chords between circle points
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return new THREE.Vector2(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
  });
  for (let i = 0; i < 5; i += 1) {
    const a = pts[i];
    const b = pts[(i + 2) % 5];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    const m = box(0.012, 0.004, len, MAT.waxBlack, (a.x + b.x) / 2, 0.004, (a.y + b.y) / 2, Math.atan2(dx, dz), false);
    g.add(m);
  }
  // Candles at the points
  for (const p of pts) g.add(candle(0.09, p.x, 0.005, p.y, 0.014));
  return g;
};

const bonePile = (): THREE.Group => {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i += 1) {
    const a = (i * 2.4) % (Math.PI * 2);
    const r = 0.05 + ((i * 7) % 5) * 0.03;
    g.add(
      cyl(0.008, 0.01, 0.1, MAT.bone, Math.cos(a) * r, 0.02 + (i % 3) * 0.012, Math.sin(a) * r, 5, false)
    );
  }
  g.add(sph(0.045, MAT.bone, 0.03, 0.045, -0.02, false));
  g.add(sph(0.036, MAT.bone, -0.06, 0.035, 0.06, false));
  return g;
};

const skullStack = (): THREE.Group => {
  const g = new THREE.Group();
  const skull = (x: number, y: number, z: number, ry = 0) => {
    const s = new THREE.Group();
    s.add(sph(0.042, MAT.bone, 0, 0, 0, false));
    s.add(box(0.045, 0.03, 0.035, MAT.bone, 0, -0.028, 0.012, 0, false));
    s.add(box(0.014, 0.014, 0.012, MAT.ebony, -0.016, 0.004, 0.036, 0, false));
    s.add(box(0.014, 0.014, 0.012, MAT.ebony, 0.016, 0.004, 0.036, 0, false));
    s.position.set(x, y, z);
    s.rotation.y = ry;
    g.add(s);
  };
  skull(-0.05, 0.05, 0.02, 0.2);
  skull(0.06, 0.05, -0.02, -0.4);
  skull(0.0, 0.055, 0.09, 0.8);
  skull(0.0, 0.13, 0.02, -0.1);
  return g;
};

const statue = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.26, 0.12, 0.26, MAT.paleStone, 0, 0.06, 0));
  g.add(box(0.3, 0.03, 0.3, MAT.marble, 0, 0.13, 0, 0, false));
  // Robed figure
  g.add(cyl(0.055, 0.1, 0.34, MAT.marble, 0, 0.31, 0, 10));
  g.add(box(0.14, 0.06, 0.09, MAT.marble, 0, 0.5, 0, 0, false));
  g.add(sph(0.055, MAT.marble, 0, 0.57, 0, true));
  // One arm raised
  g.add(cyl(0.016, 0.016, 0.16, MAT.marble, 0.07, 0.54, 0.02, 6, false));
  return g;
};

const armorStand = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(box(0.22, 0.03, 0.22, MAT.oak, 0, 0.02, 0, 0, false));
  g.add(cyl(0.02, 0.02, 0.16, MAT.oak, 0, 0.11, 0, 6, false));
  // Breastplate
  g.add(box(0.24, 0.22, 0.15, MAT.steel, 0, 0.32, 0));
  g.add(box(0.26, 0.03, 0.16, MAT.iron, 0, 0.44, 0, 0, false));
  // Pauldrons + arms
  g.add(sph(0.05, MAT.steel, -0.14, 0.42, 0, false));
  g.add(sph(0.05, MAT.steel, 0.14, 0.42, 0, false));
  g.add(cyl(0.022, 0.022, 0.2, MAT.steel, -0.15, 0.3, 0, 6, false));
  g.add(cyl(0.022, 0.022, 0.2, MAT.steel, 0.15, 0.3, 0, 6, false));
  // Helm with visor slit
  g.add(sph(0.06, MAT.iron, 0, 0.53, 0, true));
  g.add(box(0.1, 0.012, 0.02, MAT.ebony, 0, 0.53, 0.052, 0, false));
  return g;
};

/* -------------------------------------------------------------------------- */
/* Basement industrial                                                        */
/* -------------------------------------------------------------------------- */

const furnace = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(cyl(0.19, 0.22, 0.44, MAT.rust, 0, 0.22, -0.02, 14));
  g.add(torus(0.2, 0.014, MAT.iron, 0, 0.16, -0.02));
  g.add(torus(0.19, 0.014, MAT.iron, 0, 0.3, -0.02));
  // Fire door + glowing grate
  g.add(box(0.2, 0.16, 0.03, MAT.darkIron, 0, 0.18, 0.18));
  g.add(box(0.14, 0.1, 0.01, MAT.ember, 0, 0.18, 0.196, 0, false));
  g.add(box(0.05, 0.08, 0.05, MAT.flame, 0, 0.19, 0.2, 0, false));
  // Flue
  g.add(cyl(0.07, 0.08, 0.34, MAT.darkIron, 0, 0.58, -0.02, 10));
  g.add(cyl(0.09, 0.07, 0.05, MAT.iron, 0, 0.76, -0.02, 10, false));
  // Pipes to the wall
  g.add(cyl(0.022, 0.022, 0.3, MAT.rust, -0.16, 0.5, -0.12, 6, false));
  // Ash shovel
  g.add(box(0.02, 0.02, 0.26, MAT.iron, 0.26, 0.12, 0.12, 0.3, false));
  return g;
};

const coalPile = (): THREE.Group => {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i += 1) {
    const a = (i * 1.9) % (Math.PI * 2);
    const r = 0.02 + ((i * 5) % 6) * 0.03;
    g.add(
      box(
        0.045,
        0.045,
        0.045,
        i % 3 === 0 ? MAT.ebony : MAT.granite,
        Math.cos(a) * r,
        0.02 + (i % 4) * 0.018,
        Math.sin(a) * r,
        a,
        false
      )
    );
  }
  return g;
};

const boiler = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(cyl(0.13, 0.13, 0.5, MAT.copper, 0, 0.27, 0, 14));
  g.add(sph(0.13, MAT.copper, 0, 0.52, 0, true));
  for (const y of [0.12, 0.3, 0.48]) g.add(torus(0.135, 0.008, MAT.agedBrass, 0, y, 0));
  g.add(cyl(0.016, 0.016, 0.22, MAT.agedBrass, 0.12, 0.4, 0, 6, false));
  g.add(cyl(0.03, 0.03, 0.03, MAT.iron, 0.12, 0.5, 0, 8, false));
  g.add(cyl(0.02, 0.02, 0.16, MAT.rust, -0.12, 0.2, 0.06, 6, false));
  return g;
};

const cage = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.32;
  const H = 0.44;
  g.add(box(W, 0.03, W, MAT.iron, 0, 0.015, 0, 0, false));
  g.add(box(W, 0.03, W, MAT.iron, 0, H, 0, 0, false));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.015, H, 0.015, MAT.iron, (sx * W) / 2, H / 2, (sz * W) / 2, 0, false));
    }
  }
  for (let i = 0; i < 3; i += 1) {
    g.add(box(0.01, H, 0.01, MAT.rust, -W / 2 + 0.08 + i * 0.08, H / 2, W / 2, 0, false));
    g.add(box(0.01, H, 0.01, MAT.rust, -W / 2 + 0.08 + i * 0.08, H / 2, -W / 2, 0, false));
  }
  // Chained shackles inside
  g.add(cyl(0.008, 0.008, 0.16, MAT.rust, 0, 0.2, 0, 4, false));
  g.add(torus(0.03, 0.008, MAT.rust, 0, 0.12, 0));
  return g;
};

const waterPool = (): THREE.Group => {
  const g = new THREE.Group();
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), MAT.water);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.004;
  puddle.receiveShadow = true;
  g.add(puddle);
  return g;
};

const stalagmites = (): THREE.Group => {
  const g = new THREE.Group();
  const spec: [number, number, number, number][] = [
    [0.0, 0.0, 0.2, 0.055],
    [0.14, 0.1, 0.13, 0.04],
    [-0.12, 0.08, 0.1, 0.032],
    [0.03, -0.14, 0.08, 0.028]
  ];
  for (const [x, z, h, r] of spec) {
    g.add(cyl(0.002, r, h, MAT.granite, x, h / 2, z, 8));
  }
  return g;
};

/* -------------------------------------------------------------------------- */
/* Grand features                                                             */
/* -------------------------------------------------------------------------- */

const grandStaircase = (): THREE.Group => {
  const g = new THREE.Group();
  const steps = 5;
  const stepW = 0.92;
  const stepH = 0.075;
  const stepD = 0.15;
  for (let i = 0; i < steps; i += 1) {
    g.add(box(stepW, stepH * (i + 1), stepD, MAT.mahogany, 0, (stepH * (i + 1)) / 2, -0.3 + i * stepD));
    // Runner
    g.add(box(stepW * 0.62, 0.006, stepD - 0.01, MAT.crimsonVelvet, 0, stepH * (i + 1) + 0.003, -0.3 + i * stepD, 0, false));
  }
  // Newel posts
  for (const sx of [-1, 1]) {
    g.add(box(0.05, 0.14, 0.05, MAT.mahogany, (sx * (stepW + 0.02)) / 2, 0.07, -0.3 + steps * stepD - 0.04));
    g.add(sph(0.03, MAT.brass, (sx * (stepW + 0.02)) / 2, 0.15, -0.3 + steps * stepD - 0.04));
    // Balusters + handrail
    for (let i = 0; i < 4; i += 1) {
      const z = -0.3 + i * stepD + 0.03;
      const y = stepH * (i + 1) + 0.075;
      g.add(cyl(0.009, 0.009, 0.16, MAT.mahogany, (sx * (stepW + 0.02)) / 2, y, z, 5, false));
    }
    g.add(box(0.028, 0.028, steps * stepD + 0.04, MAT.mahogany, (sx * (stepW + 0.02)) / 2, stepH * steps + 0.1, -0.3 + (steps * stepD) / 2 - 0.02, 0, false));
  }
  return g;
};

const chandelier = (): THREE.Group => {
  const g = new THREE.Group();
  const y0 = 0.95;
  g.add(cyl(0.008, 0.008, 0.32, MAT.darkIron, 0, y0 + 0.16, 0, 4, false));
  g.add(torus(0.16, 0.012, MAT.agedBrass, 0, y0, 0));
  g.add(torus(0.09, 0.01, MAT.agedBrass, 0, y0 + 0.05, 0));
  g.add(cyl(0.03, 0.05, 0.1, MAT.agedBrass, 0, y0 - 0.03, 0, 10, false));
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * 0.16;
    const z = Math.sin(a) * 0.16;
    g.add(cyl(0.008, 0.008, 0.06, MAT.agedBrass, x, y0 + 0.03, z, 5, false));
    g.add(cyl(0.01, 0.011, 0.07, MAT.wax, x, y0 + 0.1, z, 6, false));
    g.add(sph(0.012, MAT.flame, x, y0 + 0.145, z));
  }
  return g;
};

const vaultDoor = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.66;
  g.add(box(W + 0.1, 0.62, 0.06, MAT.stone, 0, 0.33, -0.06));
  g.add(box(W, 0.54, 0.09, MAT.iron, 0, 0.31, 0.02));
  g.add(box(W - 0.06, 0.48, 0.02, MAT.darkIron, 0, 0.31, 0.075, 0, false));
  // Dial + locking bars
  g.add(cyl(0.075, 0.075, 0.03, MAT.brass, 0, 0.31, 0.085, 14));
  g.add(cyl(0.02, 0.02, 0.055, MAT.brass, 0, 0.31, 0.11, 8, false));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    g.add(box(0.16, 0.018, 0.014, MAT.agedBrass, 0, 0.31, 0.09, a, false));
  }
  return g;
};

const telescope = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(cyl(0.11, 0.13, 0.02, MAT.oak, 0, 0.01, 0, 12, false));
  // Tripod
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    const leg = cyl(0.012, 0.016, 0.42, MAT.brass, Math.cos(a) * 0.09, 0.21, Math.sin(a) * 0.09, 6);
    leg.rotation.z = Math.cos(a) * 0.14;
    leg.rotation.x = -Math.sin(a) * 0.14;
    g.add(leg);
  }
  // Optical tube
  const tube = new THREE.Group();
  tube.add(cyl(0.05, 0.062, 0.4, MAT.copper, 0, 0, 0, 14));
  tube.add(cyl(0.066, 0.066, 0.02, MAT.brass, 0, -0.1, 0, 14, false));
  tube.add(cyl(0.068, 0.068, 0.02, MAT.brass, 0, 0.06, 0, 14, false));
  tube.add(cyl(0.03, 0.03, 0.06, MAT.brass, 0, 0.21, 0, 10, false));
  tube.position.set(0, 0.5, 0);
  tube.rotation.x = -Math.PI / 3.4;
  g.add(tube);
  return g;
};

const gardenBench = (): THREE.Group => {
  const g = new THREE.Group();
  const W = 0.76;
  g.add(box(W, 0.04, 0.28, MAT.paleOak, 0, 0.19, 0));
  g.add(box(W, 0.05, 0.05, MAT.paleOak, 0, 0.29, -0.13));
  g.add(box(W, 0.05, 0.05, MAT.paleOak, 0, 0.37, -0.14));
  // Iron end frames
  for (const sx of [-1, 1]) {
    g.add(box(0.03, 0.42, 0.03, MAT.iron, (sx * (W - 0.06)) / 2, 0.21, -0.13));
    g.add(box(0.03, 0.19, 0.03, MAT.iron, (sx * (W - 0.06)) / 2, 0.095, 0.11));
    g.add(box(0.03, 0.03, 0.26, MAT.iron, (sx * (W - 0.06)) / 2, 0.02, -0.01, 0, false));
  }
  return g;
};

const planter = (): THREE.Group => {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.075, 0.14, MAT.paleStone, 0, 0.07, 0, 10));
  g.add(cyl(0.095, 0.095, 0.015, MAT.marble, 0, 0.145, 0, 10, false));
  g.add(cyl(0.07, 0.07, 0.01, MAT.earth, 0, 0.14, 0, 10, false));
  // Withered stems
  for (let i = 0; i < 5; i += 1) {
    const a = (i * 1.7) % (Math.PI * 2);
    const stem = cyl(0.004, 0.005, 0.16, MAT.granite, Math.cos(a) * 0.03, 0.22, Math.sin(a) * 0.03, 4, false);
    stem.rotation.z = Math.cos(a) * 0.35;
    g.add(stem);
  }
  return g;
};

const specimenJarsSmall = (): THREE.Group => {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const x = -0.12 + i * 0.12;
    g.add(cyl(0.04, 0.04, 0.1, MAT.glass, x, 0.06, 0, 10, false));
    g.add(cyl(0.034, 0.034, 0.07, MAT.sicklyGlow, x, 0.05, 0, 10, false));
  }
  return g;
};

const debrisPile = (): THREE.Group => {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const a = (i * 2.2) % (Math.PI * 2);
    const r = 0.03 + ((i * 6) % 5) * 0.025;
    g.add(
      box(
        0.05 + (i % 3) * 0.02,
        0.012,
        0.03 + (i % 2) * 0.02,
        i % 2 ? MAT.plywood : MAT.walnut,
        Math.cos(a) * r,
        0.01 + (i % 3) * 0.008,
        Math.sin(a) * r,
        a * 2,
        false
      )
    );
  }
  return g;
};

const cobweb = (): THREE.Group => {
  // An eight-strand corner web: radial threads plus two connecting arcs, all
  // lying in the XY plane so the group can be rotated into a wall corner.
  const g = new THREE.Group();
  const silk = new THREE.MeshBasicMaterial({
    color: 0xd8d2c4,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  silk.userData.shared = true;
  const spokes = 8;
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * (Math.PI / 2);
    const len = 0.16;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.006, len), silk);
    spoke.position.set(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, 0);
    spoke.rotation.z = a - Math.PI / 2;
    g.add(spoke);
  }
  for (const radius of [0.06, 0.105, 0.145]) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.004, 10, 1, 0, Math.PI / 2), silk);
    g.add(arc);
  }
  return g;
};

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export const PROPS: Record<string, PropSpec> = {
  fourPosterBed: { id: 'fourPosterBed', build: fourPosterBed, width: 0.9, depth: 0.96, height: 0.55, anchor: 'N' },
  singleBed: { id: 'singleBed', build: singleBed, width: 0.58, depth: 0.92, height: 0.35, anchor: 'N' },
  wardrobe: { id: 'wardrobe', build: wardrobe, width: 0.62, depth: 0.3, height: 0.66, anchor: 'N' },
  nightstand: { id: 'nightstand', build: nightstand, width: 0.24, depth: 0.24, height: 0.34, anchor: 'N' },
  cradle: { id: 'cradle', build: cradle, width: 0.38, depth: 0.34, height: 0.4, anchor: 'N' },
  rockingHorse: { id: 'rockingHorse', build: rockingHorse, width: 0.46, depth: 0.24, height: 0.38, anchor: 'CENTER' },
  toyChest: { id: 'toyChest', build: toyChest, width: 0.4, depth: 0.28, height: 0.28, anchor: 'N' },

  bookshelf: { id: 'bookshelf', build: bookshelf, width: 0.88, depth: 0.28, height: 0.68, anchor: 'N' },
  writingDesk: { id: 'writingDesk', build: writingDesk, width: 0.7, depth: 0.4, height: 0.4, anchor: 'N' },
  grandfatherClock: { id: 'grandfatherClock', build: grandfatherClock, width: 0.3, depth: 0.24, height: 0.96, anchor: 'N' },
  piano: { id: 'piano', build: piano, width: 0.9, depth: 0.34, height: 0.6, anchor: 'N' },
  sofa: { id: 'sofa', build: sofa, width: 0.82, depth: 0.4, height: 0.45, anchor: 'N' },
  armchair: { id: 'armchair', build: armchair, width: 0.44, depth: 0.42, height: 0.46, anchor: 'CENTER' },
  sideTable: { id: 'sideTable', build: sideTable, width: 0.34, depth: 0.34, height: 0.44, anchor: 'CENTER' },
  globeStand: { id: 'globeStand', build: globeStand, width: 0.32, depth: 0.32, height: 0.5, anchor: 'CENTER' },
  fireplace: { id: 'fireplace', build: fireplace, width: 0.9, depth: 0.26, height: 0.62, anchor: 'N' },
  mirrorStand: { id: 'mirrorStand', build: mirrorStand, width: 0.34, depth: 0.22, height: 0.7, anchor: 'N' },

  diningTable: { id: 'diningTable', build: diningTable, width: 1.06, depth: 0.5, height: 0.55, anchor: 'CENTER' },
  diningChair: {
    id: 'diningChair',
    build: diningChair,
    width: 0.26,
    depth: 0.26,
    height: 0.56,
    anchor: 'CENTER',
    satellite: true,
    satelliteGap: 0.13
  },
  kitchenCounter: { id: 'kitchenCounter', build: kitchenCounter, width: 0.94, depth: 0.36, height: 0.44, anchor: 'N' },
  hangingPots: { id: 'hangingPots', build: hangingPots, width: 0.7, depth: 0.1, height: 0.74, anchor: 'N', ceiling: true },
  pantryShelf: { id: 'pantryShelf', build: pantryShelf, width: 0.72, depth: 0.24, height: 0.52, anchor: 'N' },
  barrelStack: { id: 'barrelStack', build: barrelStack, width: 0.42, depth: 0.42, height: 0.36, anchor: 'CENTER' },
  crateStack: { id: 'crateStack', build: crateStack, width: 0.46, depth: 0.36, height: 0.46, anchor: 'CENTER' },
  wineRack: { id: 'wineRack', build: wineRack, width: 0.54, depth: 0.24, height: 0.58, anchor: 'N' },

  labBench: { id: 'labBench', build: labBench, width: 0.96, depth: 0.4, height: 0.62, anchor: 'N' },
  operatingTable: { id: 'operatingTable', build: operatingTable, width: 0.52, depth: 0.84, height: 0.7, anchor: 'CENTER' },
  specimenShelf: { id: 'specimenShelf', build: specimenShelf, width: 0.66, depth: 0.22, height: 0.56, anchor: 'N' },
  workbench: { id: 'workbench', build: workbench, width: 0.88, depth: 0.4, height: 0.7, anchor: 'N' },

  sarcophagus: { id: 'sarcophagus', build: sarcophagus, width: 0.54, depth: 1.0, height: 0.42, anchor: 'CENTER' },
  coffin: { id: 'coffin', build: coffin, width: 0.46, depth: 0.9, height: 0.32, anchor: 'CENTER' },
  altar: { id: 'altar', build: altar, width: 0.74, depth: 0.36, height: 0.52, anchor: 'N' },
  candelabra: { id: 'candelabra', build: candelabra, width: 0.3, depth: 0.3, height: 0.55, anchor: 'CENTER' },
  ritualCircle: {
    id: 'ritualCircle',
    build: ritualCircle,
    width: 1.26,
    depth: 1.26,
    height: 0.1,
    anchor: 'CENTER',
    decal: true
  },
  bonePile: { id: 'bonePile', build: bonePile, width: 0.24, depth: 0.24, height: 0.12, anchor: 'CENTER' },
  skullStack: { id: 'skullStack', build: skullStack, width: 0.22, depth: 0.22, height: 0.18, anchor: 'CENTER' },
  statue: { id: 'statue', build: statue, width: 0.3, depth: 0.3, height: 0.62, anchor: 'CENTER' },
  armorStand: { id: 'armorStand', build: armorStand, width: 0.3, depth: 0.26, height: 0.6, anchor: 'N' },

  furnace: { id: 'furnace', build: furnace, width: 0.44, depth: 0.42, height: 0.8, anchor: 'N' },
  coalPile: { id: 'coalPile', build: coalPile, width: 0.3, depth: 0.3, height: 0.1, anchor: 'CENTER' },
  boiler: { id: 'boiler', build: boiler, width: 0.3, depth: 0.3, height: 0.66, anchor: 'N' },
  cage: { id: 'cage', build: cage, width: 0.34, depth: 0.34, height: 0.48, anchor: 'CENTER' },
  waterPool: { id: 'waterPool', build: waterPool, width: 0.6, depth: 0.6, height: 0.01, anchor: 'CENTER', decal: true },
  stalagmites: { id: 'stalagmites', build: stalagmites, width: 0.34, depth: 0.34, height: 0.22, anchor: 'CENTER' },

  grandStaircase: {
    id: 'grandStaircase',
    build: grandStaircase,
    width: 0.86,
    depth: 0.8,
    height: 0.5,
    anchor: 'N'
  },
  chandelier: { id: 'chandelier', build: chandelier, width: 0.34, depth: 0.34, height: 1.1, anchor: 'CENTER', ceiling: true },
  vaultDoor: { id: 'vaultDoor', build: vaultDoor, width: 0.76, depth: 0.16, height: 0.66, anchor: 'N', wallMounted: true },
  telescope: { id: 'telescope', build: telescope, width: 0.32, depth: 0.32, height: 0.75, anchor: 'CENTER' },
  gardenBench: { id: 'gardenBench', build: gardenBench, width: 0.8, depth: 0.34, height: 0.42, anchor: 'N' },
  planter: { id: 'planter', build: planter, width: 0.22, depth: 0.22, height: 0.3, anchor: 'CENTER' },
  specimenJarsSmall: { id: 'specimenJarsSmall', build: specimenJarsSmall, width: 0.3, depth: 0.12, height: 0.12, anchor: 'CENTER' },
  debrisPile: { id: 'debrisPile', build: debrisPile, width: 0.26, depth: 0.26, height: 0.06, anchor: 'CENTER' },
  cobweb: { id: 'cobweb', build: cobweb, width: 0.2, depth: 0.2, height: 0.34, anchor: 'N', wallMounted: true },
  portrait: { id: 'portrait', build: portrait, width: 0.32, depth: 0.06, height: 0.3, anchor: 'N', wallMounted: true },
  sconce: { id: 'sconce', build: sconce, width: 0.1, depth: 0.12, height: 0.32, anchor: 'N', wallMounted: true },
  tapestry: { id: 'tapestry', build: tapestry, width: 0.3, depth: 0.08, height: 0.34, anchor: 'N', wallMounted: true }
};

export type PropId = keyof typeof PROPS;
