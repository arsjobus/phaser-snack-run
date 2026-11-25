/**
 * The start screen a player gets once every achievement is unlocked ("Legend of the Mud"): golden
 * hour over the desert, a slowly turning sunburst behind a gold-trimmed logo, trophies either side of
 * it, twinkling stars, a glow under the player's truck and a gold-lit button row. This file holds the
 * pure data and geometry; `MenuScene` draws it.
 */

export const MASTER = {
  /** Biome whose backdrop and road the special screen uses (warm light). */
  biome: 'desert',
  /** Where the sun and the burst sit on screen (logical px). */
  sunY: 250,
  sunRadius: 118,
  /** Sunburst: number of rays, their reach and turning speed (rad/s). */
  rays: 16,
  rayReach: 640,
  raySpeed: 0.05,
  /** Warm bands laid over the sky, top to bottom: [y, height, colour, alpha]. */
  bands: [
    [0, 120, 0xff9f45, 0.1],
    [120, 90, 0xff8a3d, 0.16],
    [210, 80, 0xff7a3a, 0.2],
    [290, 70, 0xffb066, 0.22],
  ] as const,
  stars: 26,
  gold: 0xffd34d,
  goldLight: 0xfff2a8,
  /** Text colour for the gold lines. */
  goldInk: '#ffe066',
} as const;

export interface Triangle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
}

/** The wedges of a sunburst centred on (cx, cy): every other slice of the circle is lit, turned by `angle`. */
export function sunRays(cx: number, cy: number, count: number, reach: number, angle: number): Triangle[] {
  const out: Triangle[] = [];
  const slice = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    const a0 = angle + i * slice;
    const a1 = a0 + slice / 2;
    out.push({
      x1: cx,
      y1: cy,
      x2: cx + Math.cos(a0) * reach,
      y2: cy + Math.sin(a0) * reach,
      x3: cx + Math.cos(a1) * reach,
      y3: cy + Math.sin(a1) * reach,
    });
  }
  return out;
}

/** Deterministic star positions (so the screen looks the same each visit): `count` points in the sky band. */
export function starField(count: number, width: number, top: number, bottom: number): { x: number; y: number; size: number; delay: number }[] {
  const out: { x: number; y: number; size: number; delay: number }[] = [];
  let seed = 20240;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    out.push({ x: 20 + rnd() * (width - 40), y: top + rnd() * (bottom - top), size: 3 + rnd() * 4, delay: Math.floor(rnd() * 1600) });
  }
  return out;
}
