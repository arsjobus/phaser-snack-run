import Phaser from 'phaser';
import { PHYSICS, TRUCK } from '../config';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';

/** Placeholder visuals for the truck: one body image plus two spinning wheels. */
export class TruckView {
  private body: Phaser.GameObjects.Image;
  private wheels: Phaser.GameObjects.Image[];
  private spin = 0;

  constructor(scene: Phaser.Scene) {
    this.wheels = TRUCK.wheels.map(() => scene.add.image(0, 0, 'wheel').setDepth(2));
    this.body = scene.add
      .image(0, 0, 'truck_body')
      .setOrigin(65 / 130, 38 / 70)
      .setDepth(3);
  }

  update(truck: TruckPhysics, terrain: Terrain, dt: number): void {
    this.body.setPosition(truck.x, truck.y).setRotation(truck.angle);
    this.spin += (truck.speed * dt) / PHYSICS.wheelRadius;
    truck.wheelContacts.forEach((c, i) => {
      // Wheel sits on the ground when compressed; hangs at rest height otherwise.
      const groundY = terrain.heightAt(c.x) - PHYSICS.wheelRadius;
      this.wheels[i].setPosition(c.x, Math.min(c.y, groundY)).setRotation(this.spin);
    });
  }

  destroy(): void {
    this.body.destroy();
    this.wheels.forEach((w) => w.destroy());
  }
}
