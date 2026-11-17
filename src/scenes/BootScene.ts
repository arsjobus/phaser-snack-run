import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { Rng } from '../game/Rng';

/**
 * Phase 1 uses procedurally generated placeholder art so the repo has zero binary assets.
 * Phase 5 replaces these with real sprites; keep the texture keys stable.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeSky();
    this.makeClouds();
    this.makeHills();
    this.makeTreeLine('trees_mid', 200, 0x2f5d34, 0x24492a, 26, 70, 7);
    this.makeBushes();
    this.makeTruck();
    this.makeWheel();
    this.scene.start('Game');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  private makeSky(): void {
    const g = this.gfx();
    g.fillGradientStyle(0x4f93d6, 0x4f93d6, 0xcfe8f7, 0xcfe8f7, 1);
    g.fillRect(0, 0, 8, VIEW_H);
    g.generateTexture('sky', 8, VIEW_H);
    g.destroy();
  }

  private makeClouds(): void {
    const g = this.gfx();
    const puff = (cx: number, cy: number, s: number) => {
      for (const [dx, dy, r] of [
        [0, 0, 26],
        [28, 6, 20],
        [-28, 8, 18],
        [10, -12, 20],
      ]) {
        g.fillStyle(0xffffff, 0.92);
        g.fillCircle(cx + dx * s, cy + dy * s, r * s);
      }
    };
    for (const [x, y, s] of [
      [140, 60, 1.1],
      [430, 100, 0.8],
      [700, 50, 1.3],
      [880, 110, 0.7],
    ]) {
      for (const off of [-VIEW_W, 0, VIEW_W]) puff(x + off, y, s); // wrap for seamless tiling
    }
    g.generateTexture('clouds', VIEW_W, 170);
    g.destroy();
  }

  private makeHills(): void {
    const g = this.gfx();
    const h = 240;
    g.fillStyle(0x7ea88a, 1);
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= VIEW_W; x += 8) {
      const y =
        110 +
        28 * Math.sin((2 * Math.PI * 2 * x) / VIEW_W) +
        14 * Math.sin((2 * Math.PI * 5 * x) / VIEW_W + 1);
      g.lineTo(x, y);
    }
    g.lineTo(VIEW_W, h);
    g.closePath();
    g.fillPath();
    g.generateTexture('hills_far', VIEW_W, h);
    g.destroy();
  }

  private makeTreeLine(
    key: string,
    h: number,
    c1: number,
    c2: number,
    minW: number,
    maxH: number,
    seed: number,
  ): void {
    const rng = new Rng(seed);
    const g = this.gfx();
    g.fillStyle(c2, 1);
    g.fillRect(0, h - 40, VIEW_W, 40); // solid base so parallax movement never shows a gap
    let x = 0;
    while (x < VIEW_W + 60) {
      const w = minW + rng.range(0, 22);
      const th = maxH * rng.range(0.6, 1);
      const base = h - 30;
      for (const off of [-VIEW_W, 0, VIEW_W]) {
        const cx = x + off;
        g.fillStyle(c1, 1);
        g.fillTriangle(cx - w / 2, base, cx + w / 2, base, cx, base - th);
        g.fillTriangle(
          cx - w / 2.6,
          base - th * 0.35,
          cx + w / 2.6,
          base - th * 0.35,
          cx,
          base - th * 1.1,
        );
      }
      x += w * rng.range(0.5, 0.9);
    }
    g.generateTexture(key, VIEW_W, h);
    g.destroy();
  }

  private makeBushes(): void {
    const rng = new Rng(21);
    const g = this.gfx();
    const h = 150;
    g.fillStyle(0x1d4023, 1);
    g.fillRect(0, h - 50, VIEW_W, 50);
    let x = 0;
    while (x < VIEW_W + 80) {
      const r = rng.range(26, 52);
      for (const off of [-VIEW_W, 0, VIEW_W]) {
        g.fillStyle(0x28552e, 1);
        g.fillCircle(x + off, h - 50, r);
        g.fillStyle(0x1d4023, 1);
        g.fillCircle(x + off + r * 0.4, h - 44, r * 0.7);
      }
      x += r * rng.range(0.9, 1.6);
    }
    g.generateTexture('bushes_near', VIEW_W, h);
    g.destroy();
  }

  /** Placeholder truck body, drawn facing right with the chassis centre at (65, 38). */
  private makeTruck(): void {
    const g = this.gfx();
    const ox = 65;
    const oy = 38;
    g.fillStyle(0x111111, 1); // outline
    g.fillRoundedRect(ox - 60, oy - 8, 120, 34, 8);
    g.fillRoundedRect(ox - 36, oy - 32, 48, 28, 8);
    g.fillStyle(0xf2c200, 1); // body
    g.fillRoundedRect(ox - 58, oy - 6, 116, 30, 7);
    g.fillRoundedRect(ox - 34, oy - 30, 44, 26, 7);
    g.fillStyle(0xb83a1a, 1); // stripe
    g.fillRect(ox - 58, oy + 8, 116, 5);
    g.fillStyle(0x9fd4f2, 1); // window
    g.fillRoundedRect(ox - 28, oy - 25, 32, 15, 4);
    g.fillStyle(0xfff7c2, 1); // headlight
    g.fillRect(ox + 52, oy - 2, 6, 7);
    g.fillStyle(0x333333, 1); // roof rack
    g.fillRect(ox - 30, oy - 34, 36, 3);
    g.generateTexture('truck_body', 130, 70);
    g.destroy();
  }

  private makeWheel(): void {
    const g = this.gfx();
    g.fillStyle(0x161616, 1);
    g.fillCircle(20, 20, 20);
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(20, 20, 14);
    g.fillStyle(0xcfcfcf, 1);
    g.fillCircle(20, 20, 6);
    g.lineStyle(3, 0x8a8a8a, 1); // spokes make rotation visible
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3;
      g.lineBetween(20, 20, 20 + Math.cos(a) * 13, 20 + Math.sin(a) * 13);
    }
    g.generateTexture('wheel', 40, 40);
    g.destroy();
  }
}
