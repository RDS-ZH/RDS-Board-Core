import * as THREE from 'three';
import { CardFace } from '../../core/types';

/**
 * Procedural card builder.
 * Front faces are painted on a 512x768 canvas: header band, suit/rank,
 * cost chips, central emblem and rules text. Backs get an ornamental
 * damask pattern. No image assets are required.
 */
export class CardMeshBuilder {
  private static faceCache = new Map<string, THREE.CanvasTexture>();
  private static backTexture: THREE.CanvasTexture | null = null;

  private static tierColor(type?: string): string {
    if (type === 'TIER_1') return '#2f7d49';
    if (type === 'TIER_2') return '#a8791f';
    if (type === 'TIER_3') return '#245f9e';
    if (type === 'ARMOR') return '#4a5b6a';
    if (type === 'WEAPON') return '#7a4a2a';
    if (type === 'TRICK') return '#5b3f86';
    if (type === 'OMEN') return '#5e2740';
    if (type === 'NOBLE') return '#7a5a1f';
    return '#2b2b2b';
  }

  private static drawGem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
    const facets: [string, number][] = [
      ['#ffffff', 0.35],
      [color, 0.95],
      ['rgba(0,0,0,0.35)', 1]
    ];
    // Outer hexagonal gem
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.05]);
    }

    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = facets[1][0];
    ctx.fill();

    // Top facet highlight
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.86);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.28);
    ctx.lineTo(cx, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.5, cy - r * 0.28);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.28);
    ctx.lineTo(cx, cy + r * 0.05);
    ctx.lineTo(cx, cy + r * 0.9);
    ctx.lineTo(cx - r * 0.86, cy + r * 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }

  private static drawEmblem(ctx: CanvasRenderingContext2D, type: string | undefined, cx: number, cy: number, color: string) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'TIER_1' || type === 'TIER_2' || type === 'TIER_3') {
      this.drawGem(ctx, 0, 0, 88, color);
    } else if (type === 'BASIC') {
      // Crossed blades
      ctx.strokeStyle = color;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-52, -58);
      ctx.lineTo(48, 54);
      ctx.moveTo(52, -58);
      ctx.lineTo(-48, 54);
      ctx.stroke();
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-64, 44);
      ctx.lineTo(-40, 68);
      ctx.moveTo(64, 44);
      ctx.lineTo(40, 68);
      ctx.stroke();
    } else if (type === 'TRICK') {
      // Scroll
      ctx.fillStyle = '#e8dcc0';
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(-78, -54, 156, 108, 10);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-52, i * 26);
        ctx.lineTo(52, i * 26);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-78, -54, 14, 0, Math.PI * 2);
      ctx.arc(78, 54, 14, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'ARMOR') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -66);
      ctx.lineTo(62, -42);
      ctx.lineTo(54, 32);
      ctx.quadraticCurveTo(28, 66, 0, 76);
      ctx.quadraticCurveTo(-28, 66, -54, 32);
      ctx.lineTo(-62, -42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e6c976';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(0, 52);
      ctx.moveTo(-38, -16);
      ctx.lineTo(38, -16);
      ctx.stroke();
    } else if (type === 'WEAPON') {
      ctx.strokeStyle = '#cfd8e2';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(0, -74);
      ctx.lineTo(0, 46);
      ctx.stroke();
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-32, 28);
      ctx.lineTo(32, 28);
      ctx.moveTo(0, 46);
      ctx.lineTo(0, 70);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -86);
      ctx.lineTo(12, -64);
      ctx.lineTo(-12, -64);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'OMEN') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 74, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f6efd8';
      ctx.beginPath();
      ctx.arc(-8, -8, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'NOBLE') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-62, 34);
      ctx.lineTo(-62, -26);
      ctx.lineTo(-30, 0);
      ctx.lineTo(0, -46);
      ctx.lineTo(30, 0);
      ctx.lineTo(62, -26);
      ctx.lineTo(62, 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f0d38a';
      ctx.fillRect(-62, 34, 124, 12);
    } else {
      this.drawGem(ctx, 0, 0, 74, color);
    }

    ctx.restore();
  }

  public static getCardBackTexture(): THREE.CanvasTexture {
    if (this.backTexture) return this.backTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 512, 768);
    grad.addColorStop(0, '#101d2c');
    grad.addColorStop(0.5, '#182a3d');
    grad.addColorStop(1, '#0d1724');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 768);

    // Gold double frame
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 12;
    ctx.strokeRect(18, 18, 476, 732);
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 34, 444, 700);

    // Damask lattice
    ctx.save();
    ctx.translate(256, 384);
    ctx.strokeStyle = 'rgba(201, 162, 74, 0.22)';
    ctx.lineWidth = 2;
    for (let r = 0; r < 10; r++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.strokeRect(-96, -96, 192, 192);
    }
    for (let r = 0; r < 6; r++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.arc(0, 0, 150, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Central medallion
    ctx.fillStyle = '#0d1724';
    ctx.beginPath();
    ctx.arc(256, 384, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#c9a24a';
    ctx.font = 'italic 74px "Iowan Old Style", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G', 256, 390);

    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(201,162,74,0.65)';
    ctx.fillText('UNIVERSAL ENGINE', 256, 700);

    this.backTexture = new THREE.CanvasTexture(canvas);
    this.backTexture.colorSpace = THREE.SRGBColorSpace;
    return this.backTexture;
  }

  public static createCardFaceTexture(face: CardFace, isMasked = false): THREE.CanvasTexture {
    const key = `${face.title}|${face.suit}|${face.rank}|${isMasked}|${JSON.stringify(face.cost || {})}|${face.type}|${face.score}`;
    const cached = this.faceCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d')!;

    if (isMasked) {
      ctx.fillStyle = '#1a2230';
      ctx.fillRect(0, 0, 512, 768);
      ctx.strokeStyle = '#2f3d52';
      ctx.lineWidth = 12;
      ctx.strokeRect(16, 16, 480, 736);

      // Question-mark seal
      ctx.strokeStyle = '#4e6482';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(256, 336, 74, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#8fa6c4';
      ctx.font = 'bold 86px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 256, 340);

      ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#5f748f';
      ctx.fillText('HIDDEN BY O(s, i)', 256, 470);
      ctx.font = '17px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#4b5d75';
      ctx.fillText('virtual id • anti-cheat scrub', 256, 506);

      const maskedTexture = new THREE.CanvasTexture(canvas);
      maskedTexture.colorSpace = THREE.SRGBColorSpace;
      this.faceCache.set(key, maskedTexture);
      return maskedTexture;
    }

    const accent = face.color || this.tierColor(face.type);

    // Parchment
    ctx.fillStyle = '#f7f1e1';
    ctx.fillRect(0, 0, 512, 768);

    // Accent wash so gem/tier cards read by colour from across the table
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 512, 768);
    ctx.restore();

    // Large faint gem watermark
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.translate(256, 330);
    ctx.rotate(-0.18);
    this.drawGem(ctx, 0, 0, 180, accent);
    ctx.restore();

    // Paper grain
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 768;
      const a = Math.random() * 0.028;
      ctx.fillStyle = `rgba(90,70,40,${a})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Border
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 484, 740);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.strokeRect(28, 28, 456, 712);

    // Header band
    ctx.fillStyle = accent;
    ctx.fillRect(28, 28, 456, 86);

    // Header sheen
    const sheen = ctx.createLinearGradient(0, 28, 0, 114);
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = sheen;
    ctx.fillRect(28, 28, 456, 86);

    ctx.fillStyle = '#ffffff';
    let titleSize = 34;
    ctx.font = `700 ${titleSize}px "Segoe UI", "PingFang SC", sans-serif`;
    while (ctx.measureText(face.title).width > 416 && titleSize > 16) {
      titleSize -= 2;
      ctx.font = `700 ${titleSize}px "Segoe UI", "PingFang SC", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(face.title, 256, 72);

    // Suit / rank corners
    if (face.suit && face.rank) {
      const isRed = face.suit === '\u2665' || face.suit === '\u2666';
      ctx.fillStyle = isRed ? '#b3261e' : '#22262b';
      ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${face.rank}`, 40, 158);
      ctx.font = '34px "Segoe UI Symbol", Arial, sans-serif';
      ctx.fillText(face.suit, 40, 194);

      ctx.textAlign = 'right';
      ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${face.rank}`, 472, 158);
      ctx.font = '34px "Segoe UI Symbol", Arial, sans-serif';
      ctx.fillText(face.suit, 472, 194);
    }

    // Type badge
    if (face.type) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(176, 128, 160, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(face.type, 256, 146);
    }

    // Emblem area
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(60, 186, 392, 262, 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    this.drawEmblem(ctx, face.type, 256, 318, accent);

    // Cost chips (Splendor)
    if (face.cost) {
      const gemColors: Record<string, string> = {
        diamond: '#d9e2e8',
        sapphire: '#2f6fc0',
        emerald: '#2f7d49',
        ruby: '#b3261e',
        onyx: '#2b2b2b'
      };
      const entries = Object.entries(face.cost).filter(([, v]) => (v as number) > 0);
      let cy = 214;
      entries.forEach(([gem, req]) => {
        const color = gemColors[gem] || '#6b7280';
        ctx.beginPath();
        ctx.arc(94, cy, 21, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = gem === 'diamond' ? '#2b2b2b' : '#ffffff';
        ctx.font = '700 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${req}`, 94, cy);
        cy += 48;
      });
    }

    // VP badge
    if (typeof face.score === 'number' && face.score > 0) {
      ctx.beginPath();
      ctx.arc(428, 214, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a24a';
      ctx.fill();
      ctx.strokeStyle = '#fff8e1';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#231a08';
      ctx.font = '700 30px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${face.score}`, 428, 216);
    }

    // Rules panel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.roundRect(44, 470, 424, 244, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#2b2b2b';
    ctx.font = '600 20px "Segoe UI", "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let lines = this.wrapText(ctx, face.desc || '', 380);
    if (lines.length > 8) {
      // Long item/event text: shrink once so the full effect is readable.
      ctx.font = '500 17px "Segoe UI", "PingFang SC", sans-serif';
      lines = this.wrapText(ctx, face.desc || '', 380);
    }
    lines.slice(0, 10).forEach((line, i) => ctx.fillText(line, 64, 492 + i * 23));

    // Bottom rule
    ctx.fillStyle = accent;
    ctx.fillRect(28, 722, 456, 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.faceCache.set(key, texture);
    return texture;
  }

  private static wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const result: string[] = [];
    let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth) {
        if (line) result.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
    return result;
  }

  /**
   * Builds the complete card mesh. The top face is oriented so that a camera
   * looking from +Z reads the card upright.
   */
  public static createCardMesh(
    face: CardFace,
    width = 1.4,
    height = 2.1,
    isMasked = false
  ): THREE.Mesh {
    const geom = new THREE.BoxGeometry(width, 0.02, height);

    const faceTexture = this.createCardFaceTexture(face, isMasked);
    const backTexture = this.getCardBackTexture();

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.85 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.55, metalness: 0.02 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.6, metalness: 0.05 });

    // Box material order: +X, -X, +Y, -Y, +Z, -Z
    const materials = [edgeMat, edgeMat, faceMat, backMat, edgeMat, edgeMat];
    const mesh = new THREE.Mesh(geom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }
}
