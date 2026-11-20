import Phaser from 'phaser';
import { PHYSICS, RIVALS, TRUCK } from '../config';
import { rivalTruckKey } from '../art/trucks';
import { RIVAL_STYLES, type Rival } from './Rival';
import type { Terrain } from './Terrain';
import { bodyOrigin, placeBody } from './TruckView';

/**
 * Visuals for one rival: livery body plus two spinning wheels. In the far lane the truck is drawn
 * higher, smaller and a shade darker, and behind the player (the original's pseudo-3D depth).
 */
export class RivalView {
  private body: Phaser.GameObjects.Image;
  private wheels: Phaser.GameObjects.Image[];
  private spin = 0;
  private readonly key: string;
  private readonly tire: number;

  constructor(
    scene: Phaser.Scene,
    readonly rival: Rival,
  ) {
    this.key = rivalTruckKey(rival.style);
    this.tire = RIVAL_STYLES[rival.style % RIVAL_STYLES.length].wheel;
    this.wheels = TRUCK.wheels.map(() => scene.add.image(0, 0, 'wheel'));
    const [ox, oy] = bodyOrigin();
    this.body = scene.add.image(0, 0, this.key).setOrigin(ox, oy);
  }

  update(terrain: Terrain, dt: number): void {
    const r = this.rival;
    const t = r.truck;
    const far = r.laneBlend; // 0 near .. 1 far, animated during a swerve
    const scale = 1 - (1 - RIVALS.farScale) * far;
    const lift = RIVALS.farOffset * far;
    // Anchor the lane offset at the ground below the truck so the whole truck scales together.
    const gy = terrain.heightAt(t.x);
    const place = (x: number, y: number) => ({ x, y: gy + (y - gy) * scale - lift });
    const depth = far > 0.5 ? 1.6 : 2.6;
    const tint = Phaser.Display.Color.GetColor(255 - 55 * far, 255 - 55 * far, 255 - 40 * far);

    const bp = place(t.x, t.y);
    this.body.setPosition(bp.x, bp.y).setScale(scale).setDepth(depth).setTint(tint);
    placeBody(this.body, this.key, t.angle);
    this.spin += (t.speed * dt) / PHYSICS.wheelRadius;
    // Bigger tires stay on the ground: lift their centre by the extra radius.
    const rise = PHYSICS.wheelRadius * (this.tire - 1);
    t.wheelContacts.forEach((c, i) => {
      const groundY = terrain.heightAt(c.x) - PHYSICS.wheelRadius;
      const p = place(c.x, Math.min(c.y, groundY) - rise);
      this.wheels[i]
        .setPosition(p.x, p.y)
        .setRotation(this.spin)
        .setScale(scale * this.tire)
        .setDepth(depth + 0.1)
        .setTint(tint);
    });
  }

  /** World position of the truck's centre as drawn (for smoke and effects). */
  get drawX(): number {
    return this.body.x;
  }

  get drawY(): number {
    return this.body.y;
  }

  destroy(): void {
    this.body.destroy();
    this.wheels.forEach((w) => w.destroy());
  }
}
