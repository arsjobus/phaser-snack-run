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
    this.makeTrees('trees_mid', 200, 7);
    this.makeBushes();
    this.makeTruck();
    this.makeWheel();
    this.makeSnack();
    this.makeFuelCan();
    this.makeStartGate();
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

  /** Round deciduous tree line, like the reference's painted backdrop. Wraps seamlessly. */
  private makeTrees(key: string, h: number, seed: number): void {
    const rng = new Rng(seed);
    const g = this.gfx();
    const base = h - 30;
    g.fillStyle(0x2c5a2a, 1);
    g.fillRect(0, base - 6, VIEW_W, 36); // solid base so parallax never shows a gap
    const greens = [0x3f7d36, 0x377030, 0x4a8a3c, 0x2f6a2c];
    let x = 0;
    while (x < VIEW_W + 60) {
      const r = rng.range(22, 38);
      const top = base - rng.range(26, 62);
      const color = greens[rng.int(0, greens.length - 1)];
      for (const off of [-VIEW_W, 0, VIEW_W]) {
        const cx = x + off;
        g.fillStyle(0x4a3220, 1); // trunk
        g.fillRect(cx - 3, top + r * 0.6, 6, base - top);
        g.fillStyle(0x1f4a20, 1); // shadow side
        g.fillCircle(cx + 4, top + 5, r);
        g.fillStyle(color, 1);
        g.fillCircle(cx, top, r);
        g.fillCircle(cx - r * 0.6, top + r * 0.45, r * 0.7);
        g.fillCircle(cx + r * 0.6, top + r * 0.4, r * 0.72);
        g.fillStyle(0xffffff, 0.08); // sun highlight
        g.fillCircle(cx - r * 0.3, top - r * 0.35, r * 0.45);
      }
      x += r * rng.range(0.9, 1.4);
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

  /** Placeholder truck body (lifted SUV), drawn facing right with the chassis centre at (65, 38). */
  private makeTruck(): void {
    const g = this.gfx();
    const ox = 65;
    const oy = 38;
    g.fillStyle(0x111111, 1); // outline
    g.fillRoundedRect(ox - 60, oy - 10, 120, 36, 7);
    g.fillRoundedRect(ox - 44, oy - 34, 62, 30, 7);
    g.fillStyle(0xf2c200, 1); // body
    g.fillRoundedRect(ox - 58, oy - 8, 116, 32, 6);
    g.fillRoundedRect(ox - 42, oy - 32, 58, 28, 6);
    g.fillStyle(0xffe066, 1); // roof / hood highlight
    g.fillRect(ox - 38, oy - 31, 50, 3);
    g.fillRect(ox + 20, oy - 8, 36, 3);
    g.fillStyle(0xb83a1a, 1); // stripe
    g.fillRect(ox - 58, oy + 10, 116, 5);
    g.fillStyle(0x1b2b4a, 1); // windows (dark glass, pillar between)
    g.fillRoundedRect(ox - 36, oy - 27, 24, 15, 3);
    g.fillRoundedRect(ox - 8, oy - 27, 20, 15, 3);
    g.fillStyle(0x6fa8d6, 1);
    g.fillRect(ox - 34, oy - 25, 8, 4);
    g.fillRect(ox - 6, oy - 25, 8, 4);
    g.fillStyle(0xffffff, 1); // number roundel on the door
    g.fillCircle(ox - 20, oy + 4, 8);
    g.fillStyle(0xb83a1a, 1);
    g.fillCircle(ox - 20, oy + 4, 5);
    g.fillStyle(0xfff7c2, 1); // headlight
    g.fillRect(ox + 52, oy - 2, 6, 8);
    g.fillStyle(0x333333, 1); // bumper + roof rack + spotlights
    g.fillRect(ox + 50, oy + 16, 10, 6);
    g.fillRect(ox - 60, oy + 16, 8, 6);
    g.fillRect(ox - 40, oy - 36, 54, 3);
    g.fillStyle(0xfff7c2, 1);
    g.fillRect(ox - 34, oy - 40, 6, 4);
    g.fillRect(ox - 18, oy - 40, 6, 4);
    g.generateTexture('truck_body', 130, 70);
    g.destroy();
  }

  /** Snack box (original brand: "Crunch Crackers"): orange box with a cracker window. */
  private makeSnack(): void {
    const g = this.gfx();
    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(0, 0, 30, 36, 4);
    g.fillStyle(0xe8742a, 1);
    g.fillRoundedRect(2, 2, 26, 32, 3);
    g.fillStyle(0xf9a23c, 1);
    g.fillRect(2, 2, 26, 6);
    g.fillStyle(0xfff2c9, 1); // label
    g.fillRoundedRect(5, 11, 20, 14, 2);
    g.fillStyle(0xd9a441, 1); // cracker with grid
    g.fillRect(8, 13, 14, 10);
    g.lineStyle(1, 0x9a6b1f, 1);
    for (const o of [11, 15, 19]) {
      g.lineBetween(o, 13, o, 23);
      g.lineBetween(8, o - 1, 22, o - 1);
    }
    g.fillStyle(0xb83a1a, 1);
    g.fillRect(5, 28, 20, 4);
    g.generateTexture('snack', 30, 36);
    g.destroy();
  }

  private makeFuelCan(): void {
    const g = this.gfx();
    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(0, 4, 34, 38, 5);
    g.fillRect(4, 0, 12, 8);
    g.fillStyle(0xd23a2a, 1);
    g.fillRoundedRect(2, 6, 30, 34, 4);
    g.fillStyle(0xf26b55, 1);
    g.fillRect(4, 8, 6, 30);
    g.fillStyle(0x8f2318, 1);
    g.fillRect(5, 1, 10, 6);
    g.lineStyle(2, 0x8f2318, 1); // cross brace
    g.lineBetween(8, 12, 28, 34);
    g.lineBetween(28, 12, 8, 34);
    g.fillStyle(0xffe066, 1); // label
    g.fillRoundedRect(11, 18, 14, 10, 2);
    g.fillStyle(0x111111, 1);
    g.fillRect(15, 20, 6, 6);
    g.generateTexture('fuel_can', 34, 42);
    g.destroy();
  }

  /** Start gate: pole with a checkered banner, like the reference's. Origin = bottom centre. */
  private makeStartGate(): void {
    const g = this.gfx();
    g.fillStyle(0x222222, 1);
    g.fillRect(84, 0, 8, 210);
    g.fillStyle(0xf2c200, 1);
    g.fillRect(0, 10, 92, 50);
    g.fillStyle(0x111111, 1);
    g.fillRect(0, 10, 92, 4);
    g.fillRect(0, 56, 92, 4);
    const cell = 10;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        g.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff, 1);
        g.fillRect(52 + i * cell, 14 + j * 8, cell, 8);
      }
    }
    g.generateTexture('start_gate', 96, 212);
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
