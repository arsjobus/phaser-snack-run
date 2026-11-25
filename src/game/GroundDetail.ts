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

/** One point of a crack: `x` along the ground, `dy` off the ground line (both unscaled px), `w` the crack's width there. */
export interface CrackPt {
  x: number;
  dy: number;
  w: number;
}

/**
 * The shape of one dried-mud crack (pure geometry; the painter bends it over the terrain and scales
 * it by depth). A main fissure runs along the ground with a few kinks and two or three branches
 * leave it, each branch with a small twig on the longer ones. Every width profile is smooth and every
 * free end closes to a point: the main crack is widest in the middle and falls to exactly 0 at both
 * ends (`sin^0.8`), a branch starts at about 60% of the width where it leaves its parent and falls
 * to exactly 0 at its tip. The first point of a branch lies on its parent's centreline.
 */
export function crackShape(seed: number): CrackPt[][] {
  const k = Math.floor(seed * 1_000_000) + 3;
  const r = (i: number) => hash01(k, 900 + i);
  const half = 20 + r(0) * 16;
  const maxW = 2.6 + r(1) * 1.4;
  const n = 14;
  const main: CrackPt[] = [];
  let dy = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A gentle random walk with the odd sharper kink, so it reads as a fracture and not a wave.
    dy += (r(10 + i) - 0.5) * (r(30 + i) > 0.8 ? 5.5 : 2.2);
    dy *= 0.88;
    main.push({ x: -half + 2 * half * t, dy, w: i === 0 || i === n ? 0 : maxW * Math.pow(Math.sin(Math.PI * t), 0.8) });
  }
  const out: CrackPt[][] = [main];
  const branches = 2 + (r(2) > 0.5 ? 1 : 0);
  for (let b = 0; b < branches; b++) {
    const root = 3 + Math.floor((r(50 + b) * (n - 6)));
    const from = main[root];
    const dir = b % 2 === 0 ? -1 : 1; // alternate sides of the main crack
    const along = r(60 + b) > 0.5 ? 1 : -1;
    const reach = half * (0.45 + r(70 + b) * 0.4);
    const spread = (7 + r(80 + b) * 8) * dir;
    const m = 8;
    const pts: CrackPt[] = [];
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const wobble = (r(100 + b * 12 + i) - 0.5) * 2.6 * t;
      pts.push({
        x: from.x + along * reach * t,
        dy: from.dy + spread * Math.pow(t, 0.85) + wobble,
        w: i === m ? 0 : from.w * 0.6 * Math.pow(1 - t, 1.1),
      });
    }
    out.push(pts);
    if (b === 0 && r(95) > 0.35) {
      // A twig off the first branch, roughly in the opposite direction, a third of its length.
      const at = pts[Math.floor(m * 0.55)];
      const tw: CrackPt[] = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        tw.push({
          x: at.x - along * reach * 0.3 * t,
          dy: at.dy + spread * 0.4 * t,
          w: i === 5 ? 0 : at.w * 0.7 * (1 - t),
        });
      }
      out.push(tw);
    }
  }
  return out;
}

/** Standing details sit on top of everything that lies flat, whatever their depth: see `GroundPainter.details`. */
export const isFlatKind = (kind: DetailKind): boolean => FLAT_KINDS.has(kind);

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
  // Puddles must not overlap each other, and that has to be decided the same way whichever window is asked
  // for. So generate a margin wider than any puddle on both sides, drop a puddle only when a higher
  // priority neighbour overlaps it (a purely local rule), then keep what lies inside the window.
  const raw = rawGroundDetails(biome, xa - PUDDLE_MARGIN, xb + PUDDLE_MARGIN, density);
  const puddles = raw.filter((d) => d.kind === 'puddle');
  return raw.filter((d) => {
    if (d.x < xa || d.x >= xb) return false;
    if (d.kind !== 'puddle') return true;
    return !puddles.some((o) => o !== d && puddleOutranks(o, d) && puddlesOverlap(o, d));
  });
}

/** Margin (px) searched either side of a window: more than the widest puddle. */
const PUDDLE_MARGIN = 220;
/** Clear space (px) kept between two puddles. */
const PUDDLE_GAP = 10;

/** Painted size of a puddle (world px wide, px tall): shared by the painter and the overlap rule. */
export function puddleSize(d: Pick<Detail, 'size' | 'seed' | 'f'>): { w: number; h: number } {
  return { w: (40 + d.seed * 38) * d.size * (1 - LANES.scaleStep * d.f), h: 5 + d.seed * 4 };
}

function puddleOutranks(a: Detail, b: Detail): boolean {
  return a.seed !== b.seed ? a.seed > b.seed : a.x > b.x;
}

/** Whether two puddles' painted areas (the dark rim included) touch or come within `PUDDLE_GAP`. */
export function puddlesOverlap(a: Detail, b: Detail): boolean {
  const sa = puddleSize(a);
  const sb = puddleSize(b);
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.f - b.f) * LANES.spacing;
  return dx < (sa.w + sb.w) / 2 + 4 + PUDDLE_GAP && dy < (sa.h + sb.h) / 2 + 3 + PUDDLE_GAP;
}

function rawGroundDetails(biome: BiomeId, xa: number, xb: number, density = 1): Detail[] {
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
