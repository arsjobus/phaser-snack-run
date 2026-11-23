import type Phaser from 'phaser';
import { drawPixelText, pixelTextWidth } from './pixelFont';

type G = Phaser.GameObjects.Graphics;
const OUT = 0x111111;

/** Paints of the parked show cars (flat, a little tired: this is a car park, not a showroom). */
export const SHOW_PAINTS = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x239b56, 0x8e44ad, 0xcb6c1e] as const;
export const SHOW_CAR_VARIANTS = 12;
export const SHOW_CAR_W = 128;
export const SHOW_CAR_H = 54;
export const showCarKey = (variant: number): string => `show_car_${variant % SHOW_CAR_VARIANTS}`;

type Pts = [number, number][];
const poly = (g: G, color: number, pts: Pts) => {
  g.fillStyle(color, 1);
  g.fillPoints(pts.map(([x, y]) => ({ x, y })), true);
};
const outline = (g: G, pts: Pts) => {
  g.lineStyle(2, OUT, 1);
  g.strokePoints(pts.map(([x, y]) => ({ x, y })), true);
};

const shade = (c: number, k: number): number => {
  const r = Math.round(((c >> 16) & 255) * k);
  const gr = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (gr << 8) | b;
};

/** Cabin outlines (x, y) of the four body shapes: sedan, hatchback, wagon, coupe. 128x54 canvas. */
const CABINS: Pts[] = [
  [[34, 24], [46, 8], [84, 8], [98, 24]],
  [[30, 24], [40, 8], [88, 8], [112, 25]],
  [[28, 24], [38, 8], [106, 8], [112, 24]],
  [[40, 24], [58, 8], [88, 8], [106, 24]],
];

/** A parked car in side view, nose to the right, standing on y = 54. Variant picks body and paint. */
export function drawShowCar(g: G, variant: number): void {
  const v = ((variant % SHOW_CAR_VARIANTS) + SHOW_CAR_VARIANTS) % SHOW_CAR_VARIANTS;
  const paint = SHOW_PAINTS[(v + (v >> 2)) % SHOW_PAINTS.length];
  const cabin = CABINS[v & 3];
  // Cabin first (the body overlaps its foot), then the window.
  poly(g, paint, cabin);
  outline(g, cabin);
  const [a, b, c, d] = cabin;
  const win: Pts = [[a[0] + 7, a[1] - 2], [b[0] + 3, b[1] + 4], [c[0] - 3, c[1] + 4], [d[0] - 7, d[1] - 2]];
  poly(g, 0x9fd4ee, win);
  g.fillStyle(0xd7eefa, 1);
  g.fillTriangle(win[1][0], win[1][1], win[1][0] + 14, win[1][1], win[1][0] + 4, win[0][1]);
  g.fillStyle(OUT, 1);
  g.fillRect(Math.round((win[1][0] + win[2][0]) / 2) - 1, win[1][1], 3, win[0][1] - win[1][1]); // pillar
  // Body: a low slab with a darker sill and bumpers.
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(4, 22, 120, 24, 5);
  g.fillStyle(paint, 1);
  g.fillRoundedRect(6, 24, 116, 20, 4);
  g.fillStyle(shade(paint, 0.72), 1);
  g.fillRect(8, 38, 112, 6);
  g.fillStyle(0xffffff, 0.22);
  g.fillRect(10, 26, 100, 2); // roof-line highlight on the shoulder
  g.fillStyle(0xffe27a, 1);
  g.fillRect(116, 28, 6, 6); // headlight
  g.fillStyle(0xd23a2a, 1);
  g.fillRect(6, 28, 5, 6); // tail light
  g.fillStyle(0x2a2a2e, 1);
  g.fillRect(2, 38, 6, 6);
  g.fillRect(120, 38, 6, 6); // bumpers
  g.fillStyle(OUT, 1);
  g.fillRect(60, 28, 2, 12); // door seam
  // Wheels.
  for (const x of [28, 100]) {
    g.fillStyle(OUT, 1);
    g.fillCircle(x, 43, 12);
    g.fillStyle(0x2c2c2b, 1);
    g.fillCircle(x, 43, 9.5);
    g.fillStyle(0xb8bcc4, 1);
    g.fillCircle(x, 43, 5);
    g.fillStyle(0x6b6f78, 1);
    g.fillCircle(x, 43, 2);
  }
}

/** A pyro stand: a tripod, a post and a nozzle with a hot ring. 30x76, the base on y = 76. */
export function drawPyroStand(g: G): void {
  g.fillStyle(OUT, 1);
  g.fillTriangle(15, 54, 1, 76, 29, 76);
  g.fillStyle(0x3a3d44, 1);
  g.fillTriangle(15, 58, 6, 74, 24, 74);
  g.fillStyle(OUT, 1);
  g.fillRect(11, 18, 8, 44);
  g.fillStyle(0x6b6f78, 1);
  g.fillRect(13, 20, 4, 40);
  g.fillStyle(OUT, 1);
  g.fillTriangle(6, 4, 24, 4, 19, 22);
  g.fillTriangle(6, 4, 19, 22, 11, 22);
  g.fillStyle(0x8a8f99, 1);
  g.fillTriangle(9, 6, 21, 6, 17, 20);
  g.fillStyle(0xff7a2e, 1);
  g.fillRect(8, 2, 14, 4); // the hot lip of the nozzle
  g.fillStyle(0xffd34d, 1);
  g.fillRect(10, 2, 10, 2);
}

/**
 * The stage's entrance arch: two posts and a hazard-striped beam with a BOOST sign. 300x214, drawn
 * behind the road like the checkpoint gates.
 */
export function drawBoostArch(g: G): void {
  g.fillStyle(0x222222, 1);
  g.fillRect(4, 28, 10, 186);
  g.fillRect(286, 28, 10, 186);
  g.fillStyle(OUT, 1);
  g.fillRect(0, 10, 300, 44);
  g.fillStyle(0xffd23f, 1);
  g.fillRect(3, 13, 294, 38);
  g.fillStyle(OUT, 1);
  for (let x = 3; x < 297; x += 24) g.fillTriangle(x, 51, x + 12, 51, x + 12, 13); // hazard stripes
  g.fillStyle(OUT, 1);
  g.fillRect(60, 18, 180, 28);
  g.fillStyle(0x1b1e23, 1);
  g.fillRect(63, 21, 174, 22);
  const text = 'BOOST';
  drawPixelText(g, text, Math.round(150 - pixelTextWidth(text, 4) / 2), 24, 4, 0xffd23f);
  g.fillStyle(0xff5a4a, 1); // bulbs
  for (let x = 68; x < 236; x += 22) g.fillCircle(x, 54, 3);
}
