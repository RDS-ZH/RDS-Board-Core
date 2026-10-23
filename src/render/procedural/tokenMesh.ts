import * as THREE from 'three';
import { GEM_COLORS, GemType } from '../../games/splendor/setup';

export class TokenMeshBuilder {
  /**
   * Create a Splendor Gem Token (Poker chip style with faceted gem emblem)
   */
  public static createGemTokenMesh(gem: GemType | 'gold', radius: number = 0.4): THREE.Group {
    const group = new THREE.Group();
    const hexColor = GEM_COLORS[gem] || '#ffb300';

    // Base chip cylinder
    const chipGeom = new THREE.CylinderGeometry(radius, radius, 0.08, 32);
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      roughness: 0.3,
      metalness: 0.2
    });
    const chipMesh = new THREE.Mesh(chipGeom, chipMat);
    chipMesh.castShadow = true;
    group.add(chipMesh);

    // Inner gem colored ring
    const ringGeom = new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.085, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      roughness: 0.2,
      metalness: 0.5
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    group.add(ringMesh);

    // Center faceted gem shape (octahedron)
    const gemGeom = new THREE.OctahedronGeometry(radius * 0.38);
    const gemMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      roughness: 0.1,
      metalness: 0.8
    });
    const gemMesh = new THREE.Mesh(gemGeom, gemMat);
    gemMesh.position.y = 0.06;
    gemMesh.rotation.y = Math.PI / 4;
    group.add(gemMesh);

    return group;
  }

  /**
   * Create Catan Settlement House
   */
  public static createSettlementMesh(color: string = '#e53935'): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.4,
      metalness: 0.1
    });

    // Base cube
    const baseGeom = new THREE.BoxGeometry(0.52, 0.36, 0.52);
    const baseMesh = new THREE.Mesh(baseGeom, mat);
    baseMesh.position.y = 0.18;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Peaked roof (triangular prism via 3-sided cylinder)
    const roofGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.56, 3);
    const roofMesh = new THREE.Mesh(roofGeom, mat);
    roofMesh.rotation.z = Math.PI / 2;
    roofMesh.rotation.x = Math.PI / 6;
    roofMesh.position.y = 0.48;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    return group;
  }

  /**
   * Create Catan City Castle
   */
  public static createCityMesh(color: string = '#e53935'): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.4,
      metalness: 0.1
    });

    // Main hall base
    const hallGeom = new THREE.BoxGeometry(0.88, 0.46, 0.58);
    const hallMesh = new THREE.Mesh(hallGeom, mat);
    hallMesh.position.set(0, 0.23, 0);
    hallMesh.castShadow = true;
    group.add(hallMesh);

    // Tall Tower
    const towerGeom = new THREE.BoxGeometry(0.48, 0.86, 0.58);
    const towerMesh = new THREE.Mesh(towerGeom, mat);
    towerMesh.position.set(-0.22, 0.43, 0);
    towerMesh.castShadow = true;
    group.add(towerMesh);

    // Tower peak
    const peakGeom = new THREE.ConeGeometry(0.36, 0.4, 4);
    const peakMesh = new THREE.Mesh(peakGeom, mat);
    peakMesh.position.set(-0.22, 1.06, 0);
    peakMesh.rotation.y = Math.PI / 4;
    peakMesh.castShadow = true;
    group.add(peakMesh);

    return group;
  }

  /**
   * Create Catan Road Bar
   */
  public static createRoadMesh(color: string = '#e53935', length: number = 2.0): THREE.Mesh {
    const geom = new THREE.BoxGeometry(0.26, 0.14, length);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * Create Classic Board Game Meeple Pawn
   */
  public static createMeepleMesh(color: string = '#ffffff'): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.4,
      metalness: 0.1
    });

    // Head
    const headGeom = new THREE.SphereGeometry(0.18, 16, 16);
    const head = new THREE.Mesh(headGeom, mat);
    head.position.y = 0.72;
    head.castShadow = true;
    group.add(head);

    // Torso / body cone
    const bodyGeom = new THREE.CylinderGeometry(0.16, 0.32, 0.55, 16);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = 0.35;
    body.castShadow = true;
    group.add(body);

    return group;
  }
}
