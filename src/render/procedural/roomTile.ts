import * as THREE from 'three';

/**
 * Betrayal at House on the Hill - room tile builder.
 * Wooden plank floor, brass doorways, parchment nameplate.
 */
export class RoomTileBuilder {
  private static roomTextureCache = new Map<string, THREE.CanvasTexture>();

  public static createRoomTexture(
    name: string,
    color: string = '#3e2723',
    doors: ('N' | 'S' | 'E' | 'W')[] = []
  ): THREE.CanvasTexture {
    const key = `${name}_${color}_${[...doors].sort().join('')}`;
    const cached = this.roomTextureCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base floor
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);

    // Wooden planks
    const plankH = 64;
    for (let row = 0; row < 512 / plankH; row++) {
      const y = row * plankH;
      const shade = row % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
      ctx.fillStyle = shade;
      ctx.fillRect(0, y, 512, plankH);

      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();

      // Grain streaks
      for (let i = 0; i < 9; i++) {
        const gy = y + 8 + Math.random() * (plankH - 16);
        ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.07})`;
        ctx.lineWidth = 1 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(150, gy + (Math.random() - 0.5) * 8, 360, gy + (Math.random() - 0.5) * 8, 512, gy);
        ctx.stroke();
      }

      // Plank joints
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 3;
      const joint = (row * 173) % 512;
      ctx.beginPath();
      ctx.moveTo(joint, y);
      ctx.lineTo(joint, y + plankH);
      ctx.stroke();
    }

    // Vignette
    const vig = ctx.createRadialGradient(256, 256, 140, 256, 256, 350);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 512, 512);

    // Stone wall border
    ctx.strokeStyle = '#171412';
    ctx.lineWidth = 26;
    ctx.strokeRect(13, 13, 486, 486);
    ctx.strokeStyle = 'rgba(201,162,74,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 34, 444, 444);

    // Doorways
    const drawDoor = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = '#d9b45b';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8));
    };
    if (doors.includes('N')) drawDoor(178, 15, 156, 26);
    if (doors.includes('S')) drawDoor(178, 471, 156, 26);
    if (doors.includes('W')) drawDoor(15, 178, 26, 156);
    if (doors.includes('E')) drawDoor(471, 178, 26, 156);

    // Nameplate
    ctx.fillStyle = 'rgba(12, 10, 8, 0.82)';
    ctx.beginPath();
    ctx.roundRect(46, 206, 420, 100, 8);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f0e3c2';
    let size = 34;
    ctx.font = `600 ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    while (ctx.measureText(name).width > 370 && size > 16) {
      size -= 2;
      ctx.font = `600 ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 258);

    // Decorative under-line
    ctx.strokeStyle = 'rgba(201,162,74,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 288);
    ctx.lineTo(362, 288);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.roomTextureCache.set(key, texture);
    return texture;
  }

  public static createRoomMesh(
    name: string,
    size: number = 2.84,
    color: string = '#3e2723',
    doors: ('N' | 'S' | 'E' | 'W')[] = []
  ): THREE.Group {
    const group = new THREE.Group();

    const geom = new THREE.BoxGeometry(size, 0.12, size);
    const texture = this.createRoomTexture(name, color, doors);

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.85 });
    // The board is read at a distance and under a dark horror palette, so the
    // printed tile face is unlit (full texture brightness) while the rim keeps
    // the 3D shading.
    const topMat = new THREE.MeshBasicMaterial({ map: texture });

    const mesh = new THREE.Mesh(geom, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }
}
