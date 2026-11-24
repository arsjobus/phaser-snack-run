import { BIOMES, PX_PER_METER } from '../config';
import { checkpointMeters } from './Checkpoint';

export type BiomeId = 'forest' | 'desert' | 'snow' | 'swamp';
/** Shape of the little tufts along the verge. */
export type TuftShape = 'grass' | 'scrub' | 'frost' | 'reed';

export interface Biome {
  id: BiomeId;
  name: string;
  /** Sky gradient, top and bottom. */
  sky: readonly [number, number];
  /** Terrain colours: body, deeper layer, sunlit crust, crust shadow line and two rut bands. */
  ground: {
    dirt: number;
    deep: number;
    crust: number;
    crustShadow: number;
    rut1: number;
    rut2: number;
  };
  tuft: { color: number; shape: TuftShape };
  /** Particle colours: dust clouds, flung mud (or sand, or slush) and the tire tracks on the crust. */
  dust: number;
  splash: number;
  track: number;
}

/** In rotation order. Texture keys are `${layer}_${id}` (see `backdropKey`). */
export const BIOME_LIST: readonly Biome[] = [
  {
    id: 'forest',
    name: 'Forest',
    sky: [0x4f93d6, 0xcfe8f7],
    ground: {
      dirt: 0x8a5d33,
      deep: 0x724a29,
      crust: 0xa87a45,
      crustShadow: 0x5b3a1e,
      rut1: 0x6a4425,
      rut2: 0x7a5230,
    },
    tuft: { color: 0x6a9a3a, shape: 'grass' },
    dust: 0xb89a6a,
    splash: 0x6b4423,
    track: 0x4b2f17,
  },
  {
    id: 'desert',
    name: 'Desert',
    sky: [0x3f86c9, 0xf6dcb0],
    ground: {
      dirt: 0xc9965a,
      deep: 0xb07f48,
      crust: 0xe3b878,
      crustShadow: 0x8f6431,
      rut1: 0xa97a43,
      rut2: 0xb98a50,
    },
    tuft: { color: 0x8a8c4a, shape: 'scrub' },
    dust: 0xe6c690,
    splash: 0xc9a066,
    track: 0x9a7038,
  },
  {
    id: 'snow',
    name: 'Snowfield',
    sky: [0x7fa6d1, 0xe9f2fb],
    ground: {
      dirt: 0x9aa9bb,
      deep: 0x7f8da1,
      crust: 0xf4f8fc,
      crustShadow: 0xb6c6d8,
      rut1: 0x8394a8,
      rut2: 0x93a3b6,
    },
    tuft: { color: 0xdfeaf5, shape: 'frost' },
    dust: 0xffffff,
    splash: 0xeef6ff,
    track: 0x7e90a6,
  },
  {
    id: 'swamp',
    name: 'Swamp',
    sky: [0x5d6f5a, 0xb7c29a],
    ground: {
      dirt: 0x4e4a2c,
      deep: 0x3b3822,
      crust: 0x6a6a3a,
      crustShadow: 0x2b2a18,
      rut1: 0x33301c,
      rut2: 0x403d24,
    },
    tuft: { color: 0x7da24a, shape: 'reed' },
    dust: 0x7d8a52,
    splash: 0x2f3a1a,
    track: 0x24280f,
  },
];

/** Texture key of one backdrop layer in one biome, e.g. `trees_swamp`. */
export type BackdropLayer = 'sky' | 'clouds' | 'hills' | 'trees' | 'bushes';
export const backdropKey = (layer: BackdropLayer, id: BiomeId): string => `${layer}_${id}`;

/** Checkpoints whose gate lies at or before `meters`. */
export function checkpointsPassedAt(meters: number): number {
  let n = 0;
  while (checkpointMeters(n + 1) <= meters) n++;
  return n;
}

/** Biome in force once `passed` checkpoints have been reached. */
export function biomeAfterCheckpoints(passed: number): Biome {
  const i = Math.floor(Math.max(0, passed) / BIOMES.checkpointsPer) % BIOME_LIST.length;
  return BIOME_LIST[i];
}

export function biomeAtMeters(meters: number): Biome {
  return biomeAfterCheckpoints(checkpointsPassedAt(meters));
}

/** Biome at world x, given the world x of the start line. */
export function biomeAtX(x: number, startX: number): Biome {
  return biomeAtMeters((x - startX) / PX_PER_METER);
}

/** The biome that begins at checkpoint `index` (1-based), or null when the biome stays the same. */
export function biomeChangesAt(index: number): Biome | null {
  const before = biomeAfterCheckpoints(index - 1);
  const after = biomeAfterCheckpoints(index);
  return after.id === before.id ? null : after;
}

export interface BiomeSegment {
  biome: Biome;
  x0: number;
  x1: number;
}

/**
 * Splits the world span [x0, x1] at the biome borders (which are the checkpoint gates), so the
 * ground can be painted in the right colours either side of a gate. Segments are contiguous.
 */
export function biomeSegments(x0: number, x1: number, startX: number): BiomeSegment[] {
  const out: BiomeSegment[] = [];
  let n = checkpointsPassedAt((x0 - startX) / PX_PER_METER);
  let from = x0;
  for (;;) {
    const biome = biomeAfterCheckpoints(n);
    const gateX = startX + checkpointMeters(n + 1) * PX_PER_METER;
    const last = out[out.length - 1];
    const end = Math.min(gateX, x1);
    if (last && last.biome.id === biome.id) last.x1 = end;
    else out.push({ biome, x0: from, x1: end });
    if (gateX >= x1) return out;
    from = gateX;
    n++;
  }
}

/** Blend two 0xRRGGBB colours (t = 0 gives a, 1 gives b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The world x of the biome border (a gate) within `half` px of x, or null. */
export function biomeBorderNear(x: number, startX: number, half: number): number | null {
  const segs = biomeSegments(x - half, x + half, startX);
  return segs.length > 1 ? segs[0].x1 : null;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Ground colours at world x. Away from a border they are the biome's own; within `width / 2` of one
 * they ease from the previous biome's colours into the next one's, so the dirt changes colour over
 * a stretch of road instead of cutting at the gate.
 */
export function groundPaletteAt(x: number, startX: number, width: number): Biome['ground'] {
  const half = width / 2;
  const border = biomeBorderNear(x, startX, half);
  if (border === null) return biomeAtX(x, startX).ground;
  const from = biomeAtX(border - 1, startX).ground;
  const to = biomeAtX(border + 1, startX).ground;
  const t = smooth(Math.max(0, Math.min(1, (x - (border - half)) / width)));
  const out = {} as Biome['ground'];
  for (const k of Object.keys(from) as (keyof Biome['ground'])[]) out[k] = mixColor(from[k], to[k], t);
  return out;
}
