import Phaser from 'phaser';
import { ART, PHYSICS, TRUCK } from '../config';
import { PLAYER_TRUCK_KEY, atlasKey } from '../art/trucks';
import { laneDepth, laneProject, laneScale, laneShade } from './Lanes';
import { PLAYER_WHEEL } from './Rival';
import { tireRise, tireSpin } from './Tires';
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

  /** `key` is the body texture of the chosen paint job (`playerTruckKey`). */
  constructor(
    scene: Phaser.Scene,
    private key: string = PLAYER_TRUCK_KEY,
  ) {
    this.wheels = TRUCK.wheels.map(() => scene.add.image(0, 0, 'wheel').setScale(PLAYER_WHEEL));
    const [ox, oy] = bodyOrigin();
    this.body = scene.add.image(0, 0, key).setOrigin(ox, oy);
  }

  /** `lane` is the player's lane position: the truck is drawn higher, smaller and darker further away. */
  update(truck: TruckPhysics, terrain: Terrain, dt: number, lane = 0): void {
    const scale = laneScale(lane);
    const shade = laneShade(lane);
    const tint = Phaser.Display.Color.GetColor(shade, shade, shade);
    const depth = laneDepth(lane, 0.1);
    const gy = terrain.heightAt(truck.x);
    this.body
      .setPosition(truck.x, laneProject(gy, truck.y, lane))
      .setScale(scale)
      .setTint(tint)
      .setDepth(depth);
    placeBody(this.body, this.key, truck.angle);
    this.spin += tireSpin(truck.speed * dt, PLAYER_WHEEL);
    const rise = tireRise(PLAYER_WHEEL); // big tires: the centre sits higher than the physics wheel's
    truck.wheelContacts.forEach((c, i) => {
      // Wheel sits on the ground when compressed; hangs at rest height otherwise.
      const groundY = terrain.heightAt(c.x) - PHYSICS.wheelRadius;
      this.wheels[i]
        .setPosition(c.x, laneProject(gy, Math.min(c.y, groundY) - rise, lane))
        .setRotation(this.spin)
        .setScale(scale * PLAYER_WHEEL)
        .setTint(tint)
        .setDepth(depth + 0.02);
    });
  }

  destroy(): void {
    this.body.destroy();
    this.wheels.forEach((w) => w.destroy());
  }
}
