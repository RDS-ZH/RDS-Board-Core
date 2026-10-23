import * as THREE from 'three';

export interface RoomTileOptions {
  floor?: 'GROUND' | 'UPPER' | 'BASEMENT' | string;
  special?: string | null;
  tags?: string[];
  symbol?: string | null;
  isPreview?: boolean;
}

/**
 * Betrayal at House on the Hill - 2.5D Tactical Room Tile Builder.
 * Features cutaway perimeter walls with open doorway arches, authentic
 * floorboards/flagstones, and room-specific 3D architectural furnishings
 * (Escape from Duckov / tactical diorama aesthetic).
 */
export class RoomTileBuilder {
  private static roomTextureCache = new Map<string, THREE.CanvasTexture>();

  // Shared reusable materials for 3D architectural details to keep draw calls low
  private static woodWallMat = new THREE.MeshStandardMaterial({
    color: 0x241a14,
    roughness: 0.85,
    metalness: 0.1
  });
  private static stoneWallMat = new THREE.MeshStandardMaterial({
    color: 0x1f2429,
    roughness: 0.9,
    metalness: 0.05
  });
  private static upperWallMat = new THREE.MeshStandardMaterial({
    color: 0x2a1f2e,
    roughness: 0.85,
    metalness: 0.1
  });
  private static brassTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc49a45,
    roughness: 0.35,
    metalness: 0.8
  });
  private static ironTrimMat = new THREE.MeshStandardMaterial({
    color: 0x363a40,
    roughness: 0.6,
    metalness: 0.7
  });
  private static redFabricMat = new THREE.MeshStandardMaterial({
    color: 0x7a1818,
    roughness: 0.9,
    metalness: 0.05
  });
  private static stonePropMat = new THREE.MeshStandardMaterial({
    color: 0x3a4045,
    roughness: 0.92,
    metalness: 0.05
  });
  private static mahoganyMat = new THREE.MeshStandardMaterial({
    color: 0x3d1c10,
    roughness: 0.7,
    metalness: 0.15
  });
  private static glowEmberMat = new THREE.MeshBasicMaterial({
    color: 0xff6622
  });
  private static candleFlameMat = new THREE.MeshBasicMaterial({
    color: 0xffcc44
  });
  private static glasswareMat = new THREE.MeshStandardMaterial({
    color: 0x66ddcc,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7
  });

  public static createRoomTexture(
    name: string,
    color: string = '#3e2723',
    doors: ('N' | 'S' | 'E' | 'W')[] = [],
    floor: string = 'GROUND'
  ): THREE.CanvasTexture {
    const key = `${name}_${color}_${[...doors].sort().join('')}_${floor}`;
    const cached = this.roomTextureCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 1. Base floor tone based on mansion floor
    const isBasement = floor === 'BASEMENT';
    const isUpper = floor === 'UPPER';

    if (isBasement) {
      // Cold damp flagstone masonry floor
      ctx.fillStyle = '#1c2229';
      ctx.fillRect(0, 0, 512, 512);

      // Stone tiles grid
      const tileSize = 64;
      for (let x = 0; x < 512; x += tileSize) {
        for (let y = 0; y < 512; y += tileSize) {
          const varR = Math.floor((Math.sin(x * 12.3 + y * 7.1) + 1) * 6);
          ctx.fillStyle = `rgb(${28 + varR}, ${34 + varR}, ${42 + varR})`;
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          // Tile grout
          ctx.strokeStyle = '#0f1317';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, tileSize, tileSize);

          // Crack details
          if ((x + y) % 192 === 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 10, y + 10);
            ctx.lineTo(x + 32, y + 28);
            ctx.lineTo(x + 48, y + 42);
            ctx.stroke();
          }
        }
      }
    } else {
      // Rich wood planks (Ground: Victorian polished walnut / Upper: Aged creaky oak)
      ctx.fillStyle = color || (isUpper ? '#3b2536' : '#3e2723');
      ctx.fillRect(0, 0, 512, 512);

      const plankH = 51.2;
      for (let row = 0; row < 10; row++) {
        const y = row * plankH;
        const shade = row % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        ctx.fillStyle = shade;
        ctx.fillRect(0, y, 512, plankH);

        ctx.strokeStyle = 'rgba(0,0,0,0.42)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();

        // Wood grain streaks
        for (let i = 0; i < 7; i++) {
          const gy = y + 6 + Math.random() * (plankH - 12);
          ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
          ctx.lineWidth = 1 + Math.random() * 1.5;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(140, gy + (Math.random() - 0.5) * 6, 360, gy + (Math.random() - 0.5) * 6, 512, gy);
          ctx.stroke();
        }

        // Plank staggered joints
        const joint1 = (row * 163) % 512;
        const joint2 = (joint1 + 256) % 512;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(joint1, y);
        ctx.lineTo(joint1, y + plankH);
        ctx.moveTo(joint2, y);
        ctx.lineTo(joint2, y + plankH);
        ctx.stroke();
      }

      // Elegant Persian carpet runner in entrance / dining / ballroom / master bedroom
      if (
        name.includes('门厅') ||
        name.includes('前厅') ||
        name.includes('大楼梯') ||
        name.includes('舞厅') ||
        name.includes('餐厅') ||
        name.includes('主卧')
      ) {
        ctx.fillStyle = 'rgba(120, 20, 20, 0.42)';
        ctx.beginPath();
        ctx.roundRect(100, 100, 312, 312, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(217, 180, 91, 0.55)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(217, 180, 91, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(114, 114, 284, 284);
      }
    }

    // 2. Vintage dark vignette
    const vig = ctx.createRadialGradient(256, 256, 120, 256, 256, 360);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,0.3)');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 512, 512);

    // 3. Brass / Stone floor border trim
    ctx.strokeStyle = isBasement ? '#15191d' : '#171412';
    ctx.lineWidth = 28;
    ctx.strokeRect(14, 14, 484, 484);

    ctx.strokeStyle = isBasement ? 'rgba(120,140,160,0.35)' : 'rgba(201,162,74,0.42)';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, 448, 448);

    // 4. Doorway floor plates with directional arrows
    const drawDoorPlate = (x: number, y: number, w: number, h: number, dir: string) => {
      // Threshold metal plate
      ctx.fillStyle = isBasement ? '#4a5460' : '#c9a24a';
      ctx.fillRect(x, y, w, h);

      // Inlay recess
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8));

      // Doorway chevrons
      ctx.fillStyle = isBasement ? '#8ea0b5' : '#edd287';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dir === 'N' ? '▲' : dir === 'S' ? '▼' : dir === 'W' ? '◀' : '▶', x + w / 2, y + h / 2);
    };

    if (doors.includes('N')) drawDoorPlate(186, 8, 140, 28, 'N');
    if (doors.includes('S')) drawDoorPlate(186, 476, 140, 28, 'S');
    if (doors.includes('W')) drawDoorPlate(8, 186, 28, 140, 'W');
    if (doors.includes('E')) drawDoorPlate(476, 186, 28, 140, 'E');

    // 5. Gothic Ornamental Nameplate
    ctx.fillStyle = 'rgba(10, 8, 7, 0.88)';
    ctx.beginPath();
    ctx.roundRect(46, 206, 420, 100, 10);
    ctx.fill();

    ctx.strokeStyle = isBasement ? '#70869d' : '#c9a24a';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(201, 162, 74, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(52, 212, 408, 88);

    // Room Name
    ctx.fillStyle = '#f5ecd5';
    let size = 32;
    ctx.font = `700 ${size}px "Segoe UI", "PingFang SC", "Songti SC", sans-serif`;
    while (ctx.measureText(name).width > 360 && size > 16) {
      size -= 2;
      ctx.font = `700 ${size}px "Segoe UI", "PingFang SC", "Songti SC", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 256);

    // Decorative underline with center diamond
    ctx.strokeStyle = isBasement ? 'rgba(120,150,180,0.6)' : 'rgba(201,162,74,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(140, 286);
    ctx.lineTo(246, 286);
    ctx.moveTo(266, 286);
    ctx.lineTo(372, 286);
    ctx.stroke();

    ctx.fillStyle = isBasement ? '#9ab5d4' : '#e6c875';
    ctx.beginPath();
    ctx.arc(256, 286, 4, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.roomTextureCache.set(key, texture);
    return texture;
  }

  /**
   * Constructs the complete 2.5D Room Mesh:
   * - Floor base slab with detailed procedural floor texture
   * - 2.5D Cutaway walls (North/West back walls taller, South/East front walls low)
   * - Open door gaps framed by brass/stone lintels
   * - Room-specific 3D procedural props (furnishings, architectural features)
   */
  public static createRoomMesh(
    name: string,
    size: number = 2.84,
    color: string = '#3e2723',
    doors: ('N' | 'S' | 'E' | 'W')[] = [],
    options?: RoomTileOptions
  ): THREE.Group {
    const group = new THREE.Group();
    const floor = options?.floor || 'GROUND';
    const isBasement = floor === 'BASEMENT';
    const isUpper = floor === 'UPPER';
    const isPreview = options?.isPreview ?? false;

    // 1. Floor Base
    const floorH = 0.12;
    const geom = new THREE.BoxGeometry(size, floorH, size);
    const texture = this.createRoomTexture(name, color, doors, floor);

    const sideMat = isBasement
      ? this.stoneWallMat
      : isUpper
      ? this.upperWallMat
      : this.woodWallMat;
    const topMat = new THREE.MeshBasicMaterial({ map: texture });

    const floorMesh = new THREE.Mesh(geom, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    floorMesh.position.y = floorH / 2;
    floorMesh.castShadow = true;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Skip heavy 3D geometry in ghost previews for lightness
    if (isPreview) return group;

    // 2. Cutaway 2.5D Walls
    // In 2.5D tactical view, the camera views from south-east (+X, +Z) looking towards origin.
    // Therefore, North and West are back walls (height 0.38), South and East are cutaway (height 0.16).
    const wallMat = sideMat;
    const wallThick = 0.10;
    const halfSize = size / 2;
    const doorW = 0.96;
    const sideW = (size - doorW) / 2;

    const backH = 0.38;
    const frontH = 0.16;

    // Helper to build wall segment with door opening
    const addWall = (
      dir: 'N' | 'S' | 'E' | 'W',
      hasDoor: boolean,
      wallHeight: number
    ) => {
      const wallY = floorH + wallHeight / 2;
      if (!hasDoor) {
        // Solid wall
        const isHoriz = dir === 'N' || dir === 'S';
        const wGeom = new THREE.BoxGeometry(
          isHoriz ? size : wallThick,
          wallHeight,
          isHoriz ? wallThick : size
        );
        const wMesh = new THREE.Mesh(wGeom, wallMat);
        const zPos = dir === 'N' ? -halfSize + wallThick / 2 : dir === 'S' ? halfSize - wallThick / 2 : 0;
        const xPos = dir === 'W' ? -halfSize + wallThick / 2 : dir === 'E' ? halfSize - wallThick / 2 : 0;
        wMesh.position.set(xPos, wallY, zPos);
        wMesh.castShadow = true;
        wMesh.receiveShadow = true;
        group.add(wMesh);
      } else {
        // Wall with center doorway opening (two segments + brass doorframe posts)
        const isHoriz = dir === 'N' || dir === 'S';
        const segGeom = new THREE.BoxGeometry(
          isHoriz ? sideW : wallThick,
          wallHeight,
          isHoriz ? wallThick : sideW
        );

        // Segment 1
        const w1 = new THREE.Mesh(segGeom, wallMat);
        // Segment 2
        const w2 = new THREE.Mesh(segGeom, wallMat);

        const zPos = dir === 'N' ? -halfSize + wallThick / 2 : dir === 'S' ? halfSize - wallThick / 2 : 0;
        const xPos = dir === 'W' ? -halfSize + wallThick / 2 : dir === 'E' ? halfSize - wallThick / 2 : 0;

        if (isHoriz) {
          w1.position.set(-halfSize + sideW / 2, wallY, zPos);
          w2.position.set(halfSize - sideW / 2, wallY, zPos);
        } else {
          w1.position.set(xPos, wallY, -halfSize + sideW / 2);
          w2.position.set(xPos, wallY, halfSize - sideW / 2);
        }
        w1.castShadow = true;
        w2.castShadow = true;
        group.add(w1);
        group.add(w2);

        // Door frame brass posts
        const postGeom = new THREE.BoxGeometry(0.08, wallHeight + 0.04, 0.08);
        const p1 = new THREE.Mesh(postGeom, this.brassTrimMat);
        const p2 = new THREE.Mesh(postGeom, this.brassTrimMat);

        if (isHoriz) {
          p1.position.set(-doorW / 2, floorH + (wallHeight + 0.04) / 2, zPos);
          p2.position.set(doorW / 2, floorH + (wallHeight + 0.04) / 2, zPos);
        } else {
          p1.position.set(xPos, floorH + (wallHeight + 0.04) / 2, -doorW / 2);
          p2.position.set(xPos, floorH + (wallHeight + 0.04) / 2, doorW / 2);
        }
        group.add(p1);
        group.add(p2);
      }
    };

    addWall('N', doors.includes('N'), backH);
    addWall('W', doors.includes('W'), backH);
    addWall('S', doors.includes('S'), frontH);
    addWall('E', doors.includes('E'), frontH);

    // 3. Four Corner Pillars
    const pillarGeom = new THREE.BoxGeometry(0.14, backH + 0.06, 0.14);
    const pCapGeom = new THREE.BoxGeometry(0.18, 0.04, 0.18);
    const cornerOffsets: [number, number][] = [
      [-halfSize + 0.07, -halfSize + 0.07],
      [halfSize - 0.07, -halfSize + 0.07],
      [-halfSize + 0.07, halfSize - 0.07],
      [halfSize - 0.07, halfSize - 0.07]
    ];

    cornerOffsets.forEach(([cx, cz]) => {
      const pillar = new THREE.Mesh(pillarGeom, wallMat);
      pillar.position.set(cx, floorH + (backH + 0.06) / 2, cz);
      pillar.castShadow = true;
      group.add(pillar);

      const cap = new THREE.Mesh(pCapGeom, this.brassTrimMat);
      cap.position.set(cx, floorH + backH + 0.08, cz);
      group.add(cap);
    });

    // 4. Room-Specific 3D Procedural Furnishings & Props
    const special = options?.special;
    const tags = options?.tags ?? [];

    this.addRoomDecorations(group, name, special, tags, floorH, size);

    return group;
  }

  /**
   * Adds themed 3D props matching the room's narrative identity.
   */
  private static addRoomDecorations(
    group: THREE.Group,
    name: string,
    special: string | null | undefined,
    tags: string[],
    floorH: number,
    size: number
  ): void {
    const baseY = floorH;

    // --- A. Grand Front Door Archway ---
    if (special === 'FRONT_DOOR' || name.includes('门厅')) {
      const doorGroup = new THREE.Group();
      // Wooden double door
      const d1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.06), this.mahoganyMat);
      const d2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.06), this.mahoganyMat);
      d1.position.set(-0.20, baseY + 0.325, size / 2 - 0.08);
      d2.position.set(0.20, baseY + 0.325, size / 2 - 0.08);
      doorGroup.add(d1, d2);

      // Heavy Iron Knocker rings
      const knockerGeom = new THREE.TorusGeometry(0.04, 0.012, 6, 12);
      const k1 = new THREE.Mesh(knockerGeom, this.ironTrimMat);
      const k2 = new THREE.Mesh(knockerGeom, this.ironTrimMat);
      k1.position.set(-0.16, baseY + 0.40, size / 2 - 0.04);
      k2.position.set(0.16, baseY + 0.40, size / 2 - 0.04);
      doorGroup.add(k1, k2);

      group.add(doorGroup);
      return;
    }

    // --- B. Grand Staircase / Landings ---
    if (special === 'STAIRS' || name.includes('楼梯') || name.includes('梯厅')) {
      const stairsGroup = new THREE.Group();
      const numSteps = 4;
      const stepW = 1.0;
      const stepH = 0.08;
      const stepD = 0.22;

      for (let s = 0; s < numSteps; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH * (s + 1), stepD), this.mahoganyMat);
        step.position.set(0, baseY + (stepH * (s + 1)) / 2, -0.6 + s * stepD);
        step.castShadow = true;
        stairsGroup.add(step);

        // Carpet runner
        const runner = new THREE.Mesh(new THREE.BoxGeometry(stepW * 0.7, 0.01, stepD), this.redFabricMat);
        runner.position.set(0, baseY + stepH * (s + 1) + 0.005, -0.6 + s * stepD);
        stairsGroup.add(runner);
      }

      // Handrails
      const rail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), this.brassTrimMat);
      rail1.rotation.x = Math.PI / 4;
      rail1.position.set(-stepW / 2 - 0.03, baseY + 0.35, -0.3);
      const rail2 = rail1.clone();
      rail2.position.x = stepW / 2 + 0.03;
      stairsGroup.add(rail1, rail2);

      group.add(stairsGroup);
      return;
    }

    // --- C. Library / Study ---
    if (name.includes('书') || name.includes('研究') || name.includes('图书')) {
      const libGroup = new THREE.Group();
      // Tall mahogany bookcase along north wall
      const caseW = 1.6;
      const caseH = 0.65;
      const caseD = 0.28;
      const bookcase = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, caseD), this.mahoganyMat);
      bookcase.position.set(0, baseY + caseH / 2, -size / 2 + caseD / 2 + 0.1);
      bookcase.castShadow = true;
      libGroup.add(bookcase);

      // Books inside shelves (different colored rows)
      const bookColors = [0x7a1818, 0x1f4e38, 0x1d365d, 0x7a5a1f];
      for (let i = 0; i < 12; i++) {
        const bCol = bookColors[i % bookColors.length];
        const bMat = new THREE.MeshStandardMaterial({ color: bCol, roughness: 0.8 });
        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.2), bMat);
        bMesh.position.set(-0.65 + i * 0.12, baseY + 0.35, -size / 2 + caseD / 2 + 0.12);
        libGroup.add(bMesh);
      }

      // Small scholar desk with inkpot
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.26, 0.38), this.woodWallMat);
      desk.position.set(0.6, baseY + 0.13, 0.5);
      desk.castShadow = true;
      libGroup.add(desk);

      // Brass candle on desk
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08), this.brassTrimMat);
      candle.position.set(0.55, baseY + 0.30, 0.5);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), this.candleFlameMat);
      flame.position.set(0.55, baseY + 0.35, 0.5);
      libGroup.add(candle, flame);

      group.add(libGroup);
      return;
    }

    // --- D. Laboratory & Operating Lab ---
    if (tags.includes('science') || name.includes('实验') || name.includes('手术')) {
      const labGroup = new THREE.Group();
      // Stone/Iron lab workbench
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.5), this.stonePropMat);
      bench.position.set(-0.35, baseY + 0.16, -0.6);
      bench.castShadow = true;
      labGroup.add(bench);

      // Glassware distillation flasks
      const flask1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.14, 8), this.glasswareMat);
      flask1.position.set(-0.65, baseY + 0.39, -0.6);
      const flask2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this.glasswareMat);
      flask2.position.set(-0.45, baseY + 0.38, -0.55);
      labGroup.add(flask1, flask2);

      // Operating table or dissection bed
      if (name.includes('手术')) {
        const opTable = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 1.1), this.ironTrimMat);
        opTable.position.set(0.5, baseY + 0.17, 0.2);
        opTable.castShadow = true;
        labGroup.add(opTable);

        // Overhead lamp
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.06, 0.12, 10), this.brassTrimMat);
        lamp.position.set(0.5, baseY + 0.72, 0.2);
        labGroup.add(lamp);
      }

      group.add(labGroup);
      return;
    }

    // --- E. Crypt, Catacombs, Pentagram Chamber ---
    if (tags.includes('crypt') || tags.includes('pentagram') || name.includes('石棺') || name.includes('地窖')) {
      const cryptGroup = new THREE.Group();
      // Ancient Stone Sarcophagus
      const sarcBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 1.25), this.stonePropMat);
      sarcBase.position.set(0, baseY + 0.16, 0);
      sarcBase.castShadow = true;
      cryptGroup.add(sarcBase);

      const sarcLid = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 1.32), this.stonePropMat);
      sarcLid.position.set(0, baseY + 0.36, 0);
      cryptGroup.add(sarcLid);

      // Ceremonial Red Altar Cloth on lid
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.015, 0.8), this.redFabricMat);
      cloth.position.set(0, baseY + 0.405, 0);
      cryptGroup.add(cloth);

      // Altar Candles
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12), this.brassTrimMat);
      c1.position.set(-0.25, baseY + 0.47, -0.45);
      const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), this.candleFlameMat);
      f1.position.set(-0.25, baseY + 0.54, -0.45);
      const c2 = c1.clone();
      c2.position.x = 0.25;
      const f2 = f1.clone();
      f2.position.x = 0.25;
      cryptGroup.add(c1, f1, c2, f2);

      group.add(cryptGroup);
      return;
    }

    // --- F. Furnace Room ---
    if (special === 'FURNACE' || name.includes('熔炉') || name.includes('火')) {
      const furnaceGroup = new THREE.Group();
      // Cast-iron boiler kiln
      const kiln = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.65, 12), this.ironTrimMat);
      kiln.position.set(0, baseY + 0.325, -0.4);
      kiln.castShadow = true;
      furnaceGroup.add(kiln);

      // Glowing Fire Grate
      const fireGrate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), this.glowEmberMat);
      fireGrate.position.set(0, baseY + 0.22, -0.4 + 0.48);
      furnaceGroup.add(fireGrate);

      // Exhaust pipe
      const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8), this.ironTrimMat);
      flue.position.set(0, baseY + 0.75, -0.4);
      furnaceGroup.add(flue);

      // Coal pile
      const coal = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.2, 8), this.woodWallMat);
      coal.position.set(0.7, baseY + 0.1, 0.4);
      furnaceGroup.add(coal);

      group.add(furnaceGroup);
      return;
    }

    // --- G. Vault Room ---
    if (special === 'VAULT' || name.includes('金库') || name.includes('藏宝')) {
      const vaultGroup = new THREE.Group();
      // Heavy Vault Door Frame
      const safeFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.35), this.ironTrimMat);
      safeFrame.position.set(0, baseY + 0.325, -size / 2 + 0.25);
      safeFrame.castShadow = true;
      vaultGroup.add(safeFrame);

      // Heavy round dial wheel
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), this.brassTrimMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0, baseY + 0.35, -size / 2 + 0.43);
      vaultGroup.add(dial);

      // Spoke handles
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.04), this.brassTrimMat);
      handle.position.set(0, baseY + 0.35, -size / 2 + 0.47);
      vaultGroup.add(handle);

      group.add(vaultGroup);
      return;
    }

    // --- H. Dining Room & Kitchen ---
    if (name.includes('餐') || name.includes('厨') || tags.includes('food')) {
      const diningGroup = new THREE.Group();
      // Banquet Table
      const table = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 1.4), this.mahoganyMat);
      table.position.set(0, baseY + 0.14, 0);
      table.castShadow = true;
      diningGroup.add(table);

      // High-backed dining chairs
      const chairGeom = new THREE.BoxGeometry(0.32, 0.45, 0.3);
      const ch1 = new THREE.Mesh(chairGeom, this.mahoganyMat);
      ch1.position.set(-0.55, baseY + 0.225, 0);
      const ch2 = new THREE.Mesh(chairGeom, this.mahoganyMat);
      ch2.position.set(0.55, baseY + 0.225, 0);
      diningGroup.add(ch1, ch2);

      // Fireplace hearth at North wall
      const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.48, 0.26), this.stonePropMat);
      hearth.position.set(0, baseY + 0.24, -size / 2 + 0.2);
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.15), this.glowEmberMat);
      ember.position.set(0, baseY + 0.12, -size / 2 + 0.22);
      diningGroup.add(hearth, ember);

      group.add(diningGroup);
      return;
    }

    // --- I. Wine Cellar, Storeroom, Larder ---
    if (name.includes('酒') || name.includes('储藏') || name.includes('食品') || name.includes('杂物')) {
      const cellarGroup = new THREE.Group();
      // 2 Oak Barrels
      const barrelGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.52, 10);
      const b1 = new THREE.Mesh(barrelGeom, this.woodWallMat);
      b1.position.set(-0.6, baseY + 0.26, -0.6);
      b1.castShadow = true;

      const b2 = new THREE.Mesh(barrelGeom, this.woodWallMat);
      b2.position.set(-0.6, baseY + 0.26, 0.1);
      b2.castShadow = true;

      // Iron hoops on barrels
      const hoopGeom = new THREE.TorusGeometry(0.245, 0.015, 4, 12);
      const h1 = new THREE.Mesh(hoopGeom, this.ironTrimMat);
      h1.rotation.x = Math.PI / 2;
      h1.position.set(-0.6, baseY + 0.15, -0.6);
      const h2 = h1.clone();
      h2.position.y = baseY + 0.38;
      cellarGroup.add(b1, b2, h1, h2);

      // Wooden shipping crates
      const crateGeom = new THREE.BoxGeometry(0.38, 0.38, 0.38);
      const c1 = new THREE.Mesh(crateGeom, this.mahoganyMat);
      c1.position.set(0.6, baseY + 0.19, -0.5);
      const c2 = new THREE.Mesh(crateGeom, this.mahoganyMat);
      c2.position.set(0.6, baseY + 0.19, 0.0);
      cellarGroup.add(c1, c2);

      group.add(cellarGroup);
      return;
    }

    // --- J. Master Bedroom / Bedroom / Nursery ---
    if (name.includes('卧') || name.includes('客房') || name.includes('育婴')) {
      const bedGroup = new THREE.Group();
      // Four-poster Bed
      const bedBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 1.25), this.mahoganyMat);
      bedBase.position.set(-0.35, baseY + 0.11, -0.3);
      bedBase.castShadow = true;
      bedGroup.add(bedBase);

      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.95), this.redFabricMat);
      blanket.position.set(-0.35, baseY + 0.24, -0.15);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 }));
      pillow.position.set(-0.35, baseY + 0.25, -0.75);
      bedGroup.add(blanket, pillow);

      // Nightstand
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), this.woodWallMat);
      stand.position.set(0.4, baseY + 0.125, -0.75);
      bedGroup.add(stand);

      group.add(bedGroup);
      return;
    }

    // --- K. Collapsed Room Pit ---
    if (special === 'COLLAPSED' || name.includes('坍塌')) {
      const pitGroup = new THREE.Group();
      const pit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, 0.16, 12),
        new THREE.MeshBasicMaterial({ color: 0x050505 })
      );
      pit.position.set(0, baseY + 0.04, 0);
      pitGroup.add(pit);

      // Jagged broken floor planks around pit
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.14), this.woodWallMat);
        plank.position.set(Math.cos(angle) * 0.72, baseY + 0.07, Math.sin(angle) * 0.72);
        plank.rotation.y = angle;
        plank.rotation.z = (Math.random() - 0.5) * 0.2;
        pitGroup.add(plank);
      }

      group.add(pitGroup);
      return;
    }
  }
}
