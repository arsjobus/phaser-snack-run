import type Phaser from 'phaser';
import { drawPixelText, pixelTextWidth } from './pixelFont';

type G = Phaser.GameObjects.Graphics;
const OUT = 0x111111;

function poly(g: G, color: number, pts: [number, number][]): void {
  g.fillStyle(color, 1);
  g.fillPoints(
    pts.map(([x, y]) => ({ x, y })),
    true,
  );
}

/** Knobby tire with a five-slot rim; the tread knobs and mud blobs make the spin readable. */
export function drawWheel(g: G): void {
  g.fillStyle(0x161616, 1);
  g.fillCircle(20, 20, 20);
  g.fillStyle(0x30302f, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    g.fillCircle(20 + Math.cos(a) * 18, 20 + Math.sin(a) * 18, 2.6);
  }
  g.fillStyle(0x262626, 1);
  g.fillCircle(20, 20, 15);
  g.fillStyle(0x6b4423, 0.85); // caked mud
  for (const [a, r] of [
    [0.4, 16.5],
    [2.3, 17],
    [4.1, 16],
  ]) {
    g.fillCircle(20 + Math.cos(a) * r, 20 + Math.sin(a) * r, 2.4);
  }
  g.fillStyle(0xb8bcc4, 1);
  g.fillCircle(20, 20, 9.5);
  g.fillStyle(0x3a3d44, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    g.fillCircle(20 + Math.cos(a) * 5.5, 20 + Math.sin(a) * 5.5, 2);
  }
  g.fillStyle(0x777b84, 1);
  g.fillCircle(20, 20, 2.5);
  g.lineStyle(2, 0x8a8f99, 1);
  g.lineBetween(20, 20, 20 + 13, 20); // one bright spoke so rotation shows
}

/** Snack box of the original brand "Crunch Crackers": a little 3D cracker carton. 36x44. */
export function drawSnack(g: G): void {
  const front = 0xe8742a;
  // outline
  poly(g, OUT, [
    [0, 7],
    [8, -1],
    [37, -1],
    [37, 37],
    [29, 45],
    [0, 45],
  ]);
  poly(g, 0xf9b347, [
    [1, 8],
    [8.5, 1],
    [35, 1],
    [28, 8],
  ]); // top face
  poly(g, 0xb8501a, [
    [28, 8],
    [35, 1],
    [35, 36],
    [28, 43],
  ]); // side face
  g.fillStyle(front, 1);
  g.fillRect(1, 8, 27, 35);
  g.fillStyle(0xf9a23c, 1);
  g.fillRect(1, 8, 27, 4);
  drawPixelText(g, 'CRUNCH', Math.round(14.5 - pixelTextWidth('CRUNCH', 1) / 2), 14, 1, 0xffffff);
  g.fillStyle(0xfff2c9, 1); // label window
  g.fillRoundedRect(4, 22, 21, 15, 2);
  g.fillStyle(0xd9a441, 1); // the cracker
  g.fillRect(8, 24, 13, 11);
  g.fillStyle(0x9a6b1f, 1);
  for (const dx of [11, 14.5, 18]) for (const dy of [27, 30, 33]) g.fillRect(dx, dy, 1.5, 1.5);
  g.fillStyle(0xb83a1a, 1); // bottom band
  g.fillRect(1, 39, 27, 4);
  g.fillStyle(0xffffff, 0.75); // glint
  g.fillRect(3, 9, 5, 1.5);
}

/** Jerry can with a spout, handle, stamped brace and FUEL label. 38x46. */
export function drawFuelCan(g: G): void {
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(0, 9, 34, 37, 6);
  g.fillRoundedRect(4, 0, 17, 14, 4); // handle
  g.fillRoundedRect(22, 2, 14, 12, 3); // spout
  g.fillStyle(0xd23a2a, 1);
  g.fillRoundedRect(2, 11, 30, 33, 5);
  g.fillStyle(0xf26b55, 1);
  g.fillRect(4, 14, 5, 27);
  g.fillStyle(0x8f2318, 1);
  g.fillRoundedRect(6, 2, 13, 10, 3);
  g.fillStyle(0x2a2a2a, 1);
  g.fillRect(9, 4, 7, 4); // handle hole
  g.fillStyle(0xffd34d, 1);
  g.fillRoundedRect(24, 4, 10, 9, 2); // cap
  g.fillStyle(0xb88a12, 1);
  g.fillRect(24, 10, 10, 3);
  g.lineStyle(2, 0x8f2318, 1);
  g.lineBetween(7, 16, 28, 40);
  g.lineBetween(28, 16, 7, 40);
  g.fillStyle(0xffe066, 1);
  g.fillRoundedRect(7, 24, 20, 12, 2);
  drawPixelText(g, 'FUEL', Math.round(17 - pixelTextWidth('FUEL', 1) / 2), 27.5, 1, OUT);
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(5, 13, 3, 2);
}

/** Wrench lying on the ground, like the reference's: a grey open-end wrench. 52x44. */
export function drawWrench(g: G): void {
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(4, 17, 40, 10, 4);
  g.fillCircle(8, 22, 10);
  g.fillCircle(42, 22, 9);
  g.fillStyle(0xc9ced6, 1);
  g.fillRoundedRect(6, 19, 36, 6, 3);
  g.fillCircle(8, 22, 8);
  g.fillCircle(42, 22, 7);
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(12, 19, 24, 2);
  g.fillStyle(OUT, 1);
  g.fillRect(0, 19, 8, 6);
  g.fillRect(41, 18, 9, 4);
}

function checkerRow(g: G, x: number, y: number, cols: number, rows: number, cell: number): void {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      g.fillStyle((i + j) % 2 ? OUT : 0xffffff, 1);
      g.fillRect(x + i * cell, y + j * cell, cell, cell);
    }
  }
}

function tireStack(g: G, cx: number, baseY: number): void {
  for (let i = 0; i < 3; i++) {
    const y = baseY - 7 - i * 12;
    g.fillStyle(OUT, 1);
    g.fillRoundedRect(cx - 15, y - 7, 30, 14, 6);
    g.fillStyle(i % 2 ? 0x2c2c2c : 0x3a3a3a, 1);
    g.fillRoundedRect(cx - 13, y - 5, 26, 10, 5);
    if (i === 1) {
      g.fillStyle(0xffffff, 1);
      g.fillRect(cx - 13, y - 1, 26, 3);
    }
  }
}

/**
 * Start gate, an homage to the reference's: a tall pole at the right with a big hanging banner:
 * checkered edges, a START panel and a red sponsor strip, with a tire stack at the foot.
 * 132x220, the pole on the right; the scene anchors it at the bottom centre.
 */
export function drawStartGate(g: G): void {
  g.fillStyle(0x222222, 1);
  g.fillRect(120, 0, 8, 206);
  g.fillStyle(0xd23a2a, 1); // pennant
  g.fillTriangle(120, 0, 120, 12, 100, 6);
  g.fillStyle(0x111111, 1);
  g.fillRect(4, 8, 120, 3); // top rod
  g.fillRect(8, 11, 2, 6); // hangers
  g.fillRect(114, 11, 2, 6);
  // banner
  g.fillStyle(OUT, 1);
  g.fillRect(2, 16, 118, 100);
  g.fillStyle(0xf2c200, 1);
  g.fillRect(4, 18, 114, 96);
  checkerRow(g, 4, 18, 14, 2, 8); // top checks
  checkerRow(g, 4, 98, 14, 2, 8); // bottom checks
  g.fillStyle(0xd23a2a, 1);
  g.fillRect(4, 74, 114, 20); // sponsor strip
  drawPixelText(g, 'START', Math.round(61 - pixelTextWidth('START', 4) / 2), 42, 4, OUT);
  drawPixelText(g, 'CRUNCH', Math.round(61 - pixelTextWidth('CRUNCH', 2) / 2), 79, 2, 0xffffff);
  g.fillStyle(0x000000, 0.12); // cloth folds
  for (const x of [28, 56, 88]) g.fillRect(x, 34, 5, 62);
  tireStack(g, 100, 214);
  g.fillStyle(0x222222, 1);
  g.fillRect(96, 206, 32, 6);
  g.fillStyle(OUT, 1);
  g.fillRect(0, 214, 132, 6);
}

/**
 * Checkpoint arch: two poles with pennants, a banner with checkered ends and a row of bulbs.
 * The scene writes the label on top. 260x212. `banner` is the colour of the cloth.
 */
export function drawCheckpointGate(g: G, banner: number, bulbs: number): void {
  g.fillStyle(0x222222, 1);
  g.fillRect(2, 0, 8, 206);
  g.fillRect(250, 0, 8, 206);
  g.fillStyle(0xd23a2a, 1);
  g.fillTriangle(10, 0, 10, 12, 30, 6);
  g.fillStyle(0xffd34d, 1);
  g.fillTriangle(250, 0, 250, 12, 230, 6);
  g.fillStyle(OUT, 1);
  g.fillRect(0, 8, 260, 56);
  g.fillStyle(banner, 1);
  g.fillRect(0, 12, 260, 48);
  checkerRow(g, 4, 14, 4, 5, 8);
  checkerRow(g, 224, 14, 4, 5, 8);
  g.fillStyle(0x000000, 0.13);
  g.fillRect(0, 50, 260, 10);
  for (let x = 46; x < 220; x += 14) {
    g.fillStyle(OUT, 1);
    g.fillCircle(x, 66, 3.5);
    g.fillStyle(bulbs, 1);
    g.fillCircle(x, 66, 2.4);
  }
  tireStack(g, 6, 212);
  tireStack(g, 254, 212);
}
