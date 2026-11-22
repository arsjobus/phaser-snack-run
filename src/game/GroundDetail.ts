import { LANES } from '../config';
import type { BiomeId } from './Biomes';

/**
 * Scattered ground detail for the dirt field and the foreground (pure TypeScript, deterministic by
 * world position, so the scene can repaint it every frame and it never shimmers or pops).
 *
 * Depth `f` is in lanes like everywhere else: 0 is the near lane's ground line, up to `FIELD_DEPTH`
 * is the far edge of the field, and negative values are the foreground, nearer than the near lane
 * (drawn lower and bigger), down to `-FOREGROUND_DEPTH`.
 */
export const FIELD_DEPTH = LANES.count - 1 + 0.7;
export const FOREGROUND_DEPTH = 7;

export type DetailKind = 'pebble' | 'gravel' | 'stone' | 'clod' | 'crack' | 'puddle' | 'ripple' | 'sparkle';

export interface Detail {
  kind: DetailKind;
  x: number;
  f: number;
  /** Relative size, 0.6 to 1.4. */
  size: number;
  /** Per-detail random number in [0, 1) for small variations when drawing. */
  seed: number;
}

/** Deterministic hash of two integers into [0, 1). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Cell width (px) the detail is scattered in, and the slots per cell. */
export const DETAIL_CELL = 56;
const SLOTS = 4;

/** Relative weights of the detail kinds per biome (they need not sum to 1). */
export const DETAIL_WEIGHTS: Record<BiomeId, Partial<Record<DetailKind, number>>> = {
  forest: { pebble: 0.22, gravel: 0.22, stone: 0.08, clod: 0.28, crack: 0.08, puddle: 0.12 },
  desert: { pebble: 0.2, gravel: 0.2, stone: 0.08, clod: 0.06, crack: 0.16, ripple: 0.3 },
  snow: { pebble: 0.06, gravel: 0.06, stone: 0.04, clod: 0.12, sparkle: 0.5, puddle: 0.22 },
  swamp: { pebble: 0.06, gravel: 0.08, stone: 0.06, clod: 0.27, puddle: 0.38, crack: 0.05, ripple: 0.1 },
};

/** Puddles and cracks only look right on the big foreground dirt or the near field. */
const FAR_KINDS: ReadonlySet<DetailKind> = new Set(['pebble', 'gravel', 'clod', 'sparkle', 'stone']);

function pickKind(biome: BiomeId, r: number, far: boolean): DetailKind {
  const w = DETAIL_WEIGHTS[biome];
  const kinds = (Object.keys(w) as DetailKind[]).filter((k) => !far || FAR_KINDS.has(k));
  let total = 0;
  for (const k of kinds) total += w[k] ?? 0;
  let t = r * total;
  for (const k of kinds) {
    t -= w[k] ?? 0;
    if (t <= 0) return k;
  }
  return kinds[kinds.length - 1];
}

/**
 * The details whose x lies in [xa, xb). `density` (0..1.5) thins them out for slow machines; 0
 * returns none. Details never depend on the viewport, only on the world x of their cell.
 */
export function groundDetails(biome: BiomeId, xa: number, xb: number, density = 1): Detail[] {
  const out: Detail[] = [];
  if (density <= 0) return out;
  const p = 0.55 * density;
  for (let k = Math.floor(xa / DETAIL_CELL) - 1; k * DETAIL_CELL < xb; k++) {
    for (let s = 0; s < SLOTS; s++) {
      const b = s * 7;
      if (hash01(k, b + 1) > p) continue;
      const x = k * DETAIL_CELL + hash01(k, b + 2) * DETAIL_CELL;
      if (x < xa || x >= xb) continue;
      // The foreground is a much bigger area than the field, so most details land there.
      const fg = hash01(k, b + 3) < 0.62;
      const f = fg ? -hash01(k, b + 4) * FOREGROUND_DEPTH : hash01(k, b + 4) * (FIELD_DEPTH - 0.15);
      const far = !fg && f > 1.6;
      out.push({
        kind: pickKind(biome, hash01(k, b + 5), far),
        x,
        f,
        size: 0.6 + 0.8 * hash01(k, b + 6),
        seed: hash01(k, b + 7),
      });
    }
  }
  // Far things first, so nearer ones paint over them.
  out.sort((a, b) => b.f - a.f);
  return out;
}

/** Depths (in lanes) of the long tire ruts running along the field, foreground first. */
export const RUT_DEPTHS: readonly number[] = [-5.9, -3.6, -1.6, 0.5, 1.55, 2.5];

/**
 * Each rut is a pair of grooves (a vehicle's two tire tracks seen in perspective) a little apart in
 * depth, with a lit ridge between them. `RUT_PAIR` is that gap in lanes.
 */
export const RUT_PAIR = 0.34;

/** A rut breaks off where the hash of its cell says so, so ruts are long but not unbroken lines. */
export const RUT_CELL = 260;
export const ruttedAt = (rut: number, x: number): boolean => hash01(Math.floor(x / RUT_CELL), 400 + rut) > 0.14;

/** Vertical wobble (px, unscaled) of a rut at world x: ruts meander a little. */
export const rutWobble = (rut: number, x: number): number =>
  Math.sin(x * 0.011 + rut * 2.1) * 2.2 + Math.sin(x * 0.0043 + rut) * 3;
