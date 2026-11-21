import Phaser from 'phaser';
import { PHYSICS, TRUCK } from '../config';
import { rivalTruckKey } from '../art/trucks';
import { laneDepth, laneProject, laneScale, laneShade } from './Lanes';
import { RIVAL_STYLES, type Rival } from './Rival';
import type { Terrain } from './Terrain';
import { bodyOrigin, placeBody } from './TruckView';

/**
 * Visuals for one rival: livery body plus two spinning wheels. In a far lane the truck is drawn
 * higher, smaller and a shade darker, and behind nearer lanes (the original's pseudo-3D depth).
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
    const f = r.laneF; // animated during a swerve
    const scale = laneScale(f);
    const gy = terrain.heightAt(t.x);
    const place = (x: number, y: number) => ({ x, y: laneProject(gy, y, f) });
    const depth = laneDepth(f, 0.06);
    const shade = laneShade(f);
    const tint = Phaser.Display.Color.GetColor(shade, shade, Math.min(255, shade + 8));

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
        .setDepth(depth + 0.02)
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
