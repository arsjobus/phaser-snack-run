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

/** `sparkle` is the snow biome's drift: a flat blue-grey patch (the name is kept; nothing glints any more). */
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
  forest: { pebble: 0.22, gravel: 0.22, stone: 0.08, clod: 0.28, crack: 0.08, puddle: 0.2 },
  desert: { pebble: 0.2, gravel: 0.2, stone: 0.08, clod: 0.06, crack: 0.16, ripple: 0.3 },
  snow: { pebble: 0.06, gravel: 0.06, stone: 0.04, clod: 0.12, sparkle: 0.5, puddle: 0.3 },
  swamp: { pebble: 0.06, gravel: 0.08, stone: 0.06, clod: 0.2, puddle: 0.5, crack: 0.05, ripple: 0.1 },
};

/** Puddles and cracks only look right on the big foreground dirt or the near field. */
const FAR_KINDS: ReadonlySet<DetailKind> = new Set(['pebble', 'gravel', 'clod', 'stone']);

/**
 * Details that LIE on the ground (patches, cracks, ripples) rather than standing on it. They are drawn
 * as shapes that follow the terrain, and kept clear of the lip of the near lane and of the far edge
 * of the field, so none of them can overlay the road's edge or poke out of it:
 *  - in the field they live between `FLAT_FIELD[0]` and `FLAT_FIELD[1]` lanes behind the near lane,
 *  - in the foreground they live at least `FLAT_FOREGROUND` lanes in front of it.
 */
export const FLAT_KINDS: ReadonlySet<DetailKind> = new Set(['crack', 'puddle', 'ripple', 'sparkle']);
export const FLAT_FIELD: readonly [number, number] = [0.5, 1.6];
export const FLAT_FOREGROUND = 1.7;
/**
 * Puddles are the one flat detail with a stricter rule (Phase 9.5): they only lie ON the track the
 * vehicles drive on (between these depths, in lanes: never in the foreground in front of the near
 * lane, never at the far edge of the field), and only where the ground is flat or sunk into a dip,
 * never on a slope (see `puddleSite`).
 */
export const PUDDLE_FIELD: readonly [number, number] = [0.5, 2.4];
/** A puddle site is flat when the ground under it never slopes more than this (rise over run). */
export const PUDDLE_MAX_SLOPE = 0.05;
/** In a dip the ground may slope up to this under the puddle, but both walls must stand `PUDDLE_DIP_DEPTH` px higher. */
export const PUDDLE_DIP_SLOPE = 0.12;
export const PUDDLE_DIP_DEPTH = 4;
/** How far (px) beyond each end of the puddle the dip's walls are measured. */
export const PUDDLE_WALL = 48;

/**
 * Whether the ground between world x0 and x1 can hold a puddle: `flat` (the whole span is level) or
 * `dip` (a hollow: both walls beyond the ends are higher than anything under the puddle, and the
 * sides are gentle), else null. `heightAt` is the terrain's ground height (y-down, so a bigger y is lower).
 */
export function puddleSite(heightAt: (x: number) => number, x0: number, x1: number): 'flat' | 'dip' | null {
  const n = Math.max(2, Math.ceil((x1 - x0) / 8));
  let maxSlope = 0;
  let low = -Infinity;
  let prev = heightAt(x0);
  low = prev;
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = heightAt(x);
    maxSlope = Math.max(maxSlope, Math.abs(y - prev) / ((x1 - x0) / n));
    low = Math.max(low, y);
    prev = y;
  }
  if (maxSlope <= PUDDLE_MAX_SLOPE) return 'flat';
  if (maxSlope <= PUDDLE_DIP_SLOPE && heightAt(x0 - PUDDLE_WALL) <= low - PUDDLE_DIP_DEPTH && heightAt(x1 + PUDDLE_WALL) <= low - PUDDLE_DIP_DEPTH) return 'dip';
  return null;
}

/** Standing details (rocks, clods) stay this far (lanes) inside the field's far edge. */
export const FAR_MARGIN = 0.5;

/**
 * The outline of a flat lens lying on the ground between x0 and x1: `steps + 1` points along the top
 * and along the bottom edge, as offsets `dy` (px, y-down) from the ground line the lens follows.
 * The lens is `height` px tall in the middle and closes to a point at both ends. Pure geometry, so
 * the painter can bend it over the terrain and the tests can check it never leaves its bounds.
 */
export function lensOutline(
  x0: number,
  x1: number,
  steps: number,
  height: number,
): { top: { x: number; dy: number }[]; bottom: { x: number; dy: number }[] } {
  const top: { x: number; dy: number }[] = [];
  const bottom: { x: number; dy: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const half = (height / 2) * Math.pow(Math.sin(Math.PI * t), 0.6);
    top.push({ x, dy: -half });
    bottom.push({ x, dy: half });
  }
  return { top, bottom };
}

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
      const r = hash01(k, b + 4);
      let f = fg ? -r * FOREGROUND_DEPTH : r * (FIELD_DEPTH - FAR_MARGIN);
      const far = !fg && f > 1.6;
      const kind = pickKind(biome, hash01(k, b + 5), far);
      if (FLAT_KINDS.has(kind)) {
        // Remap onto the zones where a flat detail sits well on the ground (same random number).
        f = fg ? -(FLAT_FOREGROUND + r * (FOREGROUND_DEPTH - FLAT_FOREGROUND)) : FLAT_FIELD[0] + r * (FLAT_FIELD[1] - FLAT_FIELD[0]);
        // Puddles only ever sit on the drivable track, so the foreground ones move into the field.
        if (kind === 'puddle') f = PUDDLE_FIELD[0] + r * (PUDDLE_FIELD[1] - PUDDLE_FIELD[0]);
      }
      out.push({
        kind,
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
