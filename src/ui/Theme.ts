import { FONT_BODY, FONT_DISPLAY } from './Fonts';

/**
 * UI theme (pure data and geometry, no Phaser): the menus share the HUD's navy and steel-blue, the
 * logo plate's yellow, and the same flat, outlined look as the trucks and the road: solid colours,
 * dark outlines, no gradients. See docs/ui-art-plan.md for the design.
 */
export const UI = {
  // Surfaces (the HUD's own colours)
  navy: 0x14224a,
  panel: 0x0b1230,
  panelLight: 0x16224a,
  rim: 0x8fa4d6,
  steel: 0x44558a,
  outline: 0x0a0a10,
  // Accents
  yellow: 0xf2c200,
  yellowLight: 0xffe066,
  red: 0xd2392b,
  green: 0x4cd964,
  cyan: 0x9be0ff,
  white: 0xffffff,
  // Rank medals
  gold: 0xf2c200,
  silver: 0xc4cbd8,
  bronze: 0xcd7f32,
} as const;

/** CSS colours for text. */
export const INK = {
  title: '#ffe066',
  text: '#ffffff',
  soft: '#c9d3ee',
  dim: '#8a97bd',
  good: '#7dff8a',
  bad: '#ff6a5a',
  cyan: '#9be0ff',
  dark: '#0a0a10',
  navy: '#14224a',
  red: '#ff5a4a',
  hudLabel: '#9fb4e8',
} as const;

export type TextKind = 'display' | 'body';

export interface TextStyle {
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  color: string;
  stroke?: string;
  strokeThickness?: number;
  align?: string;
  lineSpacing?: number;
}

/**
 * Phaser text style for the theme. Display text is Russo One (single weight: never faux-bold);
 * body text is Rajdhani bold. `outline` adds the thick dark stroke used over the game scene.
 */
export function textStyle(kind: TextKind, size: number, color: string = INK.text, outline = 0): TextStyle {
  const style: TextStyle = {
    fontFamily: kind === 'display' ? FONT_DISPLAY : FONT_BODY,
    fontSize: `${size}px`,
    fontStyle: kind === 'display' ? 'normal' : 'bold',
    color,
  };
  if (outline > 0) {
    style.stroke = '#000';
    style.strokeThickness = outline;
  }
  return style;
}

export type Pt = { x: number; y: number };

/** Clips a convex polygon to the rectangle (Sutherland-Hodgman). */
function clipToRect(poly: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p.x >= x0, (a, b) => ({ x: x0, y: a.y + ((b.y - a.y) * (x0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= x1, (a, b) => ({ x: x1, y: a.y + ((b.y - a.y) * (x1 - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= y0, (a, b) => ({ x: a.x + ((b.x - a.x) * (y0 - a.y)) / (b.y - a.y), y: y0 })],
    [(p) => p.y <= y1, (a, b) => ({ x: a.x + ((b.x - a.x) * (y1 - a.y)) / (b.y - a.y), y: y1 })],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    });
    if (out.length === 0) break;
  }
  return out;
}

/**
 * Diagonal hazard stripes inside the rectangle: one polygon per dark stripe, every point inside the
 * rectangle (the caller fills the rectangle yellow first, then these in black). `stripe` is each
 * stripe's width along x, and the slant is 45 degrees.
 */
export function hazardStripes(x: number, y: number, w: number, h: number, stripe: number): Pt[][] {
  const out: Pt[][] = [];
  for (let sx = x - h; sx < x + w; sx += stripe * 2) {
    const poly: Pt[] = [
      { x: sx, y: y + h },
      { x: sx + stripe, y: y + h },
      { x: sx + stripe + h, y },
      { x: sx + h, y },
    ];
    const clipped = clipToRect(poly, x, y, x + w, y + h);
    if (clipped.length >= 3) out.push(clipped);
  }
  return out;
}

/** The dark squares of a checkered strip (the caller fills the strip white first): [x, y, size] each. */
export function checkerSquares(x: number, y: number, w: number, h: number, cell: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      out.push([x + c * cell, y + r * cell, cell]);
    }
  }
  return out;
}

/** Medal colour of a high-score rank (1-based): gold, silver, bronze, then the plain panel colour. */
export function rankColor(rank: number): number {
  return rank === 1 ? UI.gold : rank === 2 ? UI.silver : rank === 3 ? UI.bronze : UI.steel;
}

/**
 * Where the `i`th of `n` equal rows sits in a column starting at `top`, `step` px apart; used so every
 * list (garage rows, scores, settings) lays out the same way.
 */
export const rowY = (top: number, step: number, i: number): number => top + i * step;

/**
 * The spacing every list in the menus follows (garage rows, achievements, settings): rows are
 * separated by at least `rowGap` px, and text starts `padX` px inside its plate.
 */
export const LIST = { rowGap: 8, padX: 24, rowHeight: 30 } as const;

/** Rows of a list laid out between `top` and `bottom`: each is at most `maxH` tall, `LIST.rowGap` apart. */
export function listRows(top: number, bottom: number, n: number, maxH: number): { h: number; step: number; y: (i: number) => number } {
  const h = Math.max(1, Math.min(maxH, (bottom - top - Math.max(0, n - 1) * LIST.rowGap) / Math.max(1, n)));
  const step = h + LIST.rowGap;
  return { h, step, y: (i) => top + h / 2 + i * step };
}

/** Wraps a menu cursor by `d` over `n` items. */
export const wrapIndex = (i: number, d: number, n: number): number => (n <= 0 ? 0 : (((i + d) % n) + n) % n);

/** Where text may sit inside a plate of width `w` centred at `cx`: `LIST.padX` in from each edge. */
export function plateInner(cx: number, w: number): { left: number; right: number } {
  return { left: cx - w / 2 + LIST.padX, right: cx + w / 2 - LIST.padX };
}

/** Pages of a list shown `per` at a time: how many, and the item indexes of page `page` (clamped). */
export function paginate(total: number, per: number, page: number): { pages: number; page: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, per)));
  const p = Math.max(0, Math.min(pages - 1, page));
  return { pages, page: p, from: p * per, to: Math.min(total, p * per + per) };
}
