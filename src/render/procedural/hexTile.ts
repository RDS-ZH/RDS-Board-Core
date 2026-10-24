import * as THREE from 'three';
import { CatanResource } from '../../games/catan/setup';

/**
 * Procedural Catan hex tile builder.
 * All surface art is painted on a canvas at runtime, so the project ships
 * with no external texture files.
 */
export class HexTileBuilder {
  private static textureCache = new Map<string, THREE.CanvasTexture>();

  private static palette: Record<string, { base: string; dark: string; light: string }> = {
    wood: { base: '#23633a', dark: '#123c22', light: '#2f7d49' },
    brick: { base: '#9c3a2a', dark: '#5f1f15', light: '#bf5138' },
    sheep: { base: '#6f9b3c', dark: '#476b24', light: '#8cba52' },
    wheat: { base: '#d8a52a', dark: '#8f6512', light: '#efc45a' },
    ore: { base: '#56656f', dark: '#2f3c44', light: '#7c8d99' },
    desert: { base: '#c4b096', dark: '#8d7a5f', light: '#dccdb6' }
  };

  /**
   * Paints the terrain face of a single hex.
   */
  public static createTerrainTexture(resource: CatanResource | 'desert'): THREE.CanvasTexture {
    const cached = this.textureCache.get(resource);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const scheme = this.palette[resource] || this.palette.desert;

    // Flat base plate
    ctx.fillStyle = scheme.base;
    ctx.fillRect(0, 0, 512, 512);

    // Edge-only shading so the tile reads as a flat plate, not a dome
    const edgeShade = ctx.createRadialGradient(256, 256, 190, 256, 256, 360);
    edgeShade.addColorStop(0, 'rgba(0,0,0,0)');
    edgeShade.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, 512, 512);

    // Paper speckle
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const a = Math.random() * 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.5})`;
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = scheme.dark;
    ctx.fillStyle = scheme.dark;
    ctx.lineJoin = 'round';

    if (resource === 'wood') {
      const trees: [number, number][] = [
        [168, 190], [332, 205], [256, 320], [146, 350], [360, 340]
      ];
      trees.forEach(([x, y]) => {
        ctx.fillStyle = '#12401f';
        ctx.beginPath();
        ctx.moveTo(x, y - 44);
        ctx.lineTo(x - 30, y + 24);
        ctx.lineTo(x + 30, y + 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0d2f17';
        ctx.beginPath();
        ctx.moveTo(x, y - 20);
        ctx.lineTo(x - 24, y + 34);
        ctx.lineTo(x + 24, y + 34);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4e342e';
        ctx.fillRect(x - 5, y + 30, 10, 16);
      });
    } else if (resource === 'wheat') {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(120, 78, 8, 0.55)';
      for (let i = -220; i < 740; i += 26) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 190, 512);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 226, 138, 0.85)';
      for (let i = 0; i < 40; i++) {
        const x = 60 + (i % 10) * 42 + (i > 19 ? 14 : 0);
        const y = 150 + Math.floor(i / 10) * 78;
        ctx.beginPath();
        ctx.ellipse(x, y, 8, 15, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (resource === 'ore') {
      ctx.fillStyle = '#2f3c44';
      ctx.beginPath();
      ctx.moveTo(256, 108);
      ctx.lineTo(150, 372);
      ctx.lineTo(362, 372);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#cfd8dc';
      ctx.beginPath();
      ctx.moveTo(256, 108);
      ctx.lineTo(216, 206);
      ctx.lineTo(296, 206);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(256, 150);
      ctx.lineTo(226, 300);
      ctx.stroke();
    } else if (resource === 'brick') {
      ctx.strokeStyle = 'rgba(255, 205, 190, 0.32)';
      ctx.lineWidth = 3;
      for (let y = 92; y < 440; y += 44) {
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(442, y);
        ctx.stroke();
        const offset = y % 88 === 0 ? 0 : 31;
        for (let x = 70 + offset; x < 442; x += 62) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 44);
          ctx.stroke();
        }
      }
    } else if (resource === 'sheep') {
      const sheep: [number, number][] = [[196, 228], [318, 286], [214, 348]];
      sheep.forEach(([x, y]) => {
        ctx.fillStyle = '#eef3df';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.arc(x + 16, y - 6, 15, 0, Math.PI * 2);
        ctx.arc(x - 16, y - 6, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#232323';
        ctx.beginPath();
        ctx.arc(x + 30, y + 1, 9, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.strokeStyle = 'rgba(120, 96, 62, 0.4)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(256, 300 + i * 14, 150 + i * 8, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      }
    }

    // Frame
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.strokeRect(8, 8, 496, 496);

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.strokeRect(24, 24, 464, 464);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textureCache.set(resource, texture);
    return texture;
  }

  /**
   * Number chit: parchment disc, red for the high-probability 6 and 8.
   */
  public static createNumberChitTexture(number: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f6efd8';
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#4a3a24';
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9bda1';
    ctx.beginPath();
    ctx.arc(128, 128, 102, 0, Math.PI * 2);
    ctx.stroke();

    const isRed = number === 6 || number === 8;
    ctx.fillStyle = isRed ? '#c62828' : '#2b2b2b';
    ctx.font = 'bold 84px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${number}`, 128, 116);

    const dotCount = 6 - Math.abs(7 - number);
    const spacing = 16;
    const startX = 128 - ((dotCount - 1) * spacing) / 2;

    ctx.fillStyle = isRed ? '#c62828' : '#3e2f1e';
    for (let i = 0; i < dotCount; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, 184, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Complete 3D hex tile: extruded plate + optional number chit + robber.
   */
  public static createHexTileMesh(
    radius: number,
    resource: CatanResource | 'desert',
    diceNumber?: number,
    hasRobber?: boolean
  ): THREE.Group {
    const group = new THREE.Group();

    const hexGeom = new THREE.CylinderGeometry(radius, radius * 0.985, 0.25, 6);
    const texture = this.createTerrainTexture(resource);

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.85, metalness: 0.05 });
    const topMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0.03 });

    const hexMesh = new THREE.Mesh(hexGeom, [sideMat, topMat, sideMat]);
    hexMesh.castShadow = true;
    hexMesh.receiveShadow = true;
    // CylinderGeometry(..., 6) top vertices naturally align with pointy-topped hex graph vertices at ±30° and ±90°
    group.add(hexMesh);

    if (diceNumber && diceNumber > 0 && resource !== 'desert') {
      const chitGeom = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.07, 24);
      const chitTexture = this.createNumberChitTexture(diceNumber);
      const chitSideMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb6, roughness: 0.7 });
      const chitTopMat = new THREE.MeshStandardMaterial({ map: chitTexture, roughness: 0.6 });

      const chitMesh = new THREE.Mesh(chitGeom, [chitSideMat, chitTopMat, chitSideMat]);
      chitMesh.position.y = 0.155;
      chitMesh.castShadow = true;
      group.add(chitMesh);
    }

    if (hasRobber) {
      const robberGeom = new THREE.CylinderGeometry(radius * 0.1, radius * 0.17, 0.62, 14);
      const robberMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.55 });
      const robberMesh = new THREE.Mesh(robberGeom, robberMat);
      robberMesh.position.y = 0.42;
      robberMesh.castShadow = true;
      group.add(robberMesh);
    }

    return group;
  }
}
