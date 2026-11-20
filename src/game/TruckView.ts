import Phaser from 'phaser';
import { ART, PHYSICS, TRUCK } from '../config';
import { PLAYER_TRUCK_KEY, atlasKey } from '../art/trucks';
import { PLAYER_WHEEL } from './Rival';
import { rotationFrame } from './Rotation';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';

/**
 * Visuals for a truck: a pre-rendered body (nearest rotation frame) plus two spinning wheels drawn
 * in front of it, so the tires sit in the body's wheel wells.
 */
export function placeBody(
  body: Phaser.GameObjects.Image,
  key: string,
  angle: number,
  extraRotation = 0,
): void {
  if (ART.rotationFrames > 0) {
    body.setTexture(atlasKey(key), String(rotationFrame(angle, ART.rotationFrames))).setRotation(extraRotation);
  } else {
    body.setTexture(key).setRotation(angle + extraRotation);
  }
}

/** Anchor of a body image: the chassis centre (frames are centred, the plain sprite is not). */
export function bodyOrigin(): [number, number] {
  return ART.rotationFrames > 0 ? [0.5, 0.5] : [ART.truckCx / ART.truckW, ART.truckCy / ART.truckH];
}

export class TruckView {
  private body: Phaser.GameObjects.Image;
  private wheels: Phaser.GameObjects.Image[];
  private spin = 0;

  constructor(scene: Phaser.Scene) {
    this.wheels = TRUCK.wheels.map(() => scene.add.image(0, 0, 'wheel').setDepth(3.1).setScale(PLAYER_WHEEL));
    const [ox, oy] = bodyOrigin();
    this.body = scene.add.image(0, 0, PLAYER_TRUCK_KEY).setOrigin(ox, oy).setDepth(3);
  }

  update(truck: TruckPhysics, terrain: Terrain, dt: number): void {
    this.body.setPosition(truck.x, truck.y);
    placeBody(this.body, PLAYER_TRUCK_KEY, truck.angle);
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
