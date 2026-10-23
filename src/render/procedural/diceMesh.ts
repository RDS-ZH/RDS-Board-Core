import * as THREE from 'three';

export class DiceMeshBuilder {
  private static diceFaceTextures: THREE.CanvasTexture[] = [];

  public static getDiceFaceTexture(value: number): THREE.CanvasTexture {
    if (this.diceFaceTextures[value]) {
      return this.diceFaceTextures[value];
    }

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Rounded ivory background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 120);

    // Draw pips (dots)
    const pipColor = value === 1 ? '#d32f2f' : '#212121';
    ctx.fillStyle = pipColor;

    const drawPip = (x: number, y: number, r: number = 10) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    switch (value) {
      case 1:
        drawPip(64, 64, 16);
        break;
      case 2:
        drawPip(36, 36);
        drawPip(92, 92);
        break;
      case 3:
        drawPip(32, 32);
        drawPip(64, 64);
        drawPip(96, 96);
        break;
      case 4:
        drawPip(36, 36);
        drawPip(92, 36);
        drawPip(36, 92);
        drawPip(92, 92);
        break;
      case 5:
        drawPip(34, 34);
        drawPip(94, 34);
        drawPip(64, 64);
        drawPip(34, 94);
        drawPip(94, 94);
        break;
      case 6:
        drawPip(36, 30);
        drawPip(36, 64);
        drawPip(36, 98);
        drawPip(92, 30);
        drawPip(92, 64);
        drawPip(92, 98);
        break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.diceFaceTextures[value] = texture;
    return texture;
  }

  /**
   * Create 3D D6 Mesh
   */
  public static createDiceMesh(size: number = 0.5): THREE.Mesh {
    const geom = new THREE.BoxGeometry(size, size, size);

    // Standard dice arrangement: opposite sides sum to 7
    // [right: 1, left: 6, top: 2, bottom: 5, front: 3, back: 4]
    const materials = [
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(1), roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(6), roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(2), roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(5), roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(3), roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: this.getDiceFaceTexture(4), roughness: 0.3 })
    ];

    const mesh = new THREE.Mesh(geom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Set dice rotation so the requested value faces upward (+Y)
   */
  public static setFaceUp(mesh: THREE.Mesh, value: number): void {
    switch (value) {
      case 1:
        mesh.rotation.set(0, 0, Math.PI / 2);
        break;
      case 2:
        mesh.rotation.set(0, 0, 0); // Top is 2
        break;
      case 3:
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        break;
      case 4:
        mesh.rotation.set(Math.PI / 2, 0, 0);
        break;
      case 5:
        mesh.rotation.set(Math.PI, 0, 0);
        break;
      case 6:
        mesh.rotation.set(0, 0, -Math.PI / 2);
        break;
    }
  }
}
