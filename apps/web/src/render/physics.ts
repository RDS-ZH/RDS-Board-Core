/**
 * Presentation-only Rapier physics.
 *
 * It is deliberately not part of GameState: no action, slot, ownership or
 * outcome is derived from the simulation. If Rapier fails to initialize the
 * rest of the renderer continues without physics.
 *
 * Rapier is dynamically imported so its WASM chunk is not part of the initial
 * app bundle; the kernel never imports this file.
 */

import type { ColliderDesc, RigidBody, World } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

type RapierModule = typeof import('@dimforge/rapier3d-compat');

export type PhysicsShape =
  | { kind: 'cylinder'; radius: number; halfHeight: number }
  | { kind: 'box'; halfExtents: [number, number, number] };

interface BodyEntry {
  mesh: THREE.Object3D;
  body: RigidBody;
}

export class PresentationPhysics {
  private rapier?: RapierModule;
  private world?: World;
  private readonly bodies = new Map<string, BodyEntry>();
  private readonly pending = new Map<string, { mesh: THREE.Object3D; shape: PhysicsShape }>();
  private accumulator = 0;
  private initialized = false;
  private initializing = false;
  private destroyed = false;

  constructor() {
    // Lazy: Rapier's WASM chunk is only fetched when a physics object appears.
  }

  private async initialize(): Promise<void> {
    if (this.initializing || this.initialized) return;
    this.initializing = true;
    try {
      const rapier = await import('@dimforge/rapier3d-compat');
      await rapier.init();
      if (this.destroyed) return;
      this.rapier = rapier;
      this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
      this.world.timestep = 1 / 60;
      const table = this.world.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(0, -0.06, 0)
      );
      this.world.createCollider(rapier.ColliderDesc.cuboid(32, 0.05, 32), table);
      this.initialized = true;
      for (const [id, entry] of this.pending) this.createBody(id, entry.mesh, entry.shape);
      this.pending.clear();
    } catch (error) {
      console.warn('[physics] Rapier unavailable; falling back to static meshes', error);
    } finally {
      this.initializing = false;
    }
  }

  public add(id: string, mesh: THREE.Object3D, shape: PhysicsShape): void {
    this.remove(id);
    if (!this.initialized) {
      this.pending.set(id, { mesh, shape });
      void this.initialize();
      return;
    }
    this.createBody(id, mesh, shape);
  }

  private createBody(id: string, mesh: THREE.Object3D, shape: PhysicsShape): void {
    const rapier = this.rapier;
    if (!this.world || !rapier) return;
    const body = this.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(mesh.position.x, Math.max(mesh.position.y, 0.08), mesh.position.z)
        .setLinearDamping(0.35)
        .setAngularDamping(0.5)
        .setCcdEnabled(true)
    );
    let collider: ColliderDesc;
    if (shape.kind === 'box') {
      collider = rapier.ColliderDesc.cuboid(...shape.halfExtents);
    } else {
      collider = rapier.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    }
    this.world.createCollider(collider.setFriction(0.75).setRestitution(0.05), body);
    this.bodies.set(id, { mesh, body });
  }

  public remove(id: string): void {
    this.pending.delete(id);
    const entry = this.bodies.get(id);
    if (!entry) return;
    this.world?.removeRigidBody(entry.body);
    this.bodies.delete(id);
  }

  public clear(): void {
    for (const id of [...this.bodies.keys()]) this.remove(id);
    this.pending.clear();
    this.accumulator = 0;
  }

  public step(dt: number): void {
    if (!this.world || this.bodies.size === 0) return;
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    let steps = 0;
    while (this.accumulator >= 1 / 60 && steps < 3) {
      this.world.step();
      this.accumulator -= 1 / 60;
      steps++;
    }
    for (const entry of this.bodies.values()) {
      const position = entry.body.translation();
      const rotation = entry.body.rotation();
      entry.mesh.position.set(position.x, position.y, position.z);
      entry.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
  }

  public get bodyCount(): number {
    return this.bodies.size;
  }

  public dispose(): void {
    this.destroyed = true;
    this.clear();
    this.world?.free();
    this.world = undefined;
    this.rapier = undefined;
  }
}
