import Phaser from 'phaser';
import { SCROLL_Y0, VIEW_W } from '../config';

interface Layer {
  sprite: Phaser.GameObjects.TileSprite;
  /** Horizontal and vertical camera-follow factors (0 = fixed to screen, 1 = moves with world). */
  fx: number;
  fy: number;
  /** Screen y of the layer's bottom edge when the camera is at its reference position. */
  bottom: number;
  /** Constant horizontal drift in px/s (clouds). */
  drift: number;
}

/** Four tiling layers behind the terrain. Seamless because every texture wraps. */
export class Parallax {
  private layers: Layer[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene) {
    scene.add
      .image(0, 0, 'sky')
      .setOrigin(0, 0)
      .setDisplaySize(VIEW_W, 540)
      .setScrollFactor(0)
      .setDepth(-10);
    this.add(scene, 'clouds', 170, 0.04, 0.03, 170, 6, -9);
    this.add(scene, 'hills_far', 240, 0.1, 0.1, 400, 0, -8);
    this.add(scene, 'trees_mid', 200, 0.28, 0.25, 400, 0, -7);
    this.add(scene, 'bushes_near', 150, 0.55, 0.45, 420, 0, -6);
  }

  private add(
    scene: Phaser.Scene,
    key: string,
    h: number,
    fx: number,
    fy: number,
    bottom: number,
    drift: number,
    depth: number,
  ): void {
    const sprite = scene.add
      .tileSprite(0, bottom, VIEW_W, h, key)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(depth);
    this.layers.push({ sprite, fx, fy, bottom, drift });
  }

  update(scrollX: number, scrollY: number, dt: number): void {
    this.t += dt;
    for (const l of this.layers) {
      l.sprite.tilePositionX = scrollX * l.fx + this.t * l.drift;
      l.sprite.y = l.bottom + (SCROLL_Y0 - scrollY) * l.fy;
    }
  }
}
