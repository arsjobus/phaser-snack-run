import { BASE_Y, BIOMES, GAMEPLAY, PX_PER_METER, STUNT, TERRAIN_STEP } from '../config';
import { checkpointMeters, segmentMeters } from './Checkpoint';
import { Rng } from './Rng';

/** One boost pad lying across the whole field (all depth lanes), on the flat or on the ramp face. */
export interface PadSpot {
  /** Unique across the run: stage index * 100 + the pad's number (0-based, in driving order). */
  id: number;
  x0: number;
  x1: number;
  onRamp: boolean;
}

/** A parked car in the pit (scenery: the trucks fly over it). */
export interface CarSpot {
  x: number;
  /** Which of the show-car textures, and which depth lane's row it stands in. */
  variant: number;
  lane: number;
}

/**
 * Where everything of one stage stands in the world. Pure geometry: it depends only on the
 * checkpoint the stage belongs to, never on the seed, so the terrain, the spawners and the scene
 * all agree. All x are world px and multiples of `TERRAIN_STEP` (so they sit on terrain samples).
 */
export interface StuntLayout {
  /** The checkpoint the stage leads up to (a biome border). */
  index: number;
  /** The terrain piece: [x0, x1). */
  x0: number;
  x1: number;
  gateX: number;
  pads: PadSpot[];
  rampX0: number;
  /** The top of the launch ramp: the last solid sample before the drop. */
  lipX: number;
  /** World y of the ground at the lip. */
  lipY: number;
  pitX0: number;
  pitX1: number;
  /** The landing table (its top) and where the slope down ends. */
  landX0: number;
  landX1: number;
  landEndX: number;
  landY: number;
  cars: CarSpot[];
  /** Fireworks start when the player's x passes this. */
  skyTriggerX: number;
  /** Centre of the sky lettering (world). */
  skyX: number;
  skyY: number;
  /** Pyro fountain sites: x and ground y of the lip and the landing table's centre. */
  pyro: { x: number; y: number; site: 'launch' | 'landing' }[];
}

const snap = (v: number) => Math.round(v / TERRAIN_STEP) * TERRAIN_STEP;
const samples = (px: number) => Math.max(1, Math.round(px / TERRAIN_STEP));

/** Stages come before every `BIOMES.checkpointsPer`-th checkpoint: the 2nd, 4th, 6th... */
export function isStuntCheckpoint(index: number): boolean {
  return index > 0 && index % BIOMES.checkpointsPer === 0;
}

/** Number of terrain samples of the whole stage, and the offset (in samples) of each part. */
function parts() {
  const lead = samples(STUNT.lead);
  const flat = STUNT.flatPads * samples(STUNT.padLength + STUNT.padGap);
  const ramp = samples(STUNT.rampLength);
  const drop = samples(STUNT.lipDrop);
  const pit = samples(STUNT.pitLength);
  const wall = samples(STUNT.landWall);
  const top = samples(STUNT.landTop);
  const slope = Math.max(1, Math.ceil(STUNT.landHeight / (STUNT.landSlope * TERRAIN_STEP)));
  const run = samples(STUNT.runout);
  return { lead, flat, ramp, drop, pit, wall, top, slope, run };
}

/** The stage's length in px. */
export function stuntLength(): number {
  const p = parts();
  // (the pit has one extra flat sample: the floor starts right under the end of the drop)
  return (p.lead + p.flat + p.ramp + p.drop + p.pit + 1 + p.wall + p.top + p.slope + p.run) * TERRAIN_STEP;
}

const cache = new Map<string, StuntLayout>();

/** The stage before checkpoint `index` (see `isStuntCheckpoint`) for a course starting at `startX`. */
export function stuntLayout(index: number, startX: number = GAMEPLAY.startX): StuntLayout {
  const key = `${startX}:${index}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = parts();
  const gateX = startX + checkpointMeters(index) * PX_PER_METER;
  // The stage ends `gateMargin` before the gate and is placed inside the last share of the segment.
  const x1 = snap(gateX - STUNT.gateMargin);
  const x0 = x1 - stuntLength();
  const at = (n: number) => x0 + n * TERRAIN_STEP;

  const padPitch = samples(STUNT.padLength + STUNT.padGap);
  const rampStart = p.lead + p.flat;
  const pads: PadSpot[] = [];
  for (let i = 0; i < STUNT.flatPads; i++) {
    const s = p.lead + i * padPitch;
    pads.push({ id: index * 100 + pads.length, x0: at(s), x1: at(s + samples(STUNT.padLength)), onRamp: false });
  }
  for (const share of STUNT.rampPads) {
    const s = rampStart + Math.round(share * p.ramp);
    pads.push({ id: index * 100 + pads.length, x0: at(s), x1: at(s + samples(STUNT.padLength)), onRamp: true });
  }

  const lipS = rampStart + p.ramp - 1; // the last sample of the ramp, at its full height
  const pitS = lipS + p.drop + 1; // the first sample of the pit floor
  const landS = pitS + p.pit; // the last sample of the pit floor
  const topS = landS + p.wall + 1; // the first sample on top of the landing table
  const endS = topS + p.top + p.slope - 1; // where the slope down reaches the ground
  const lipX = at(lipS);
  const lipY = BASE_Y - STUNT.rampHeight;
  const pitX0 = at(pitS);
  const pitX1 = at(landS);
  const landX0 = at(topS);
  const landX1 = at(topS + p.top - 1);

  const cars: CarSpot[] = [];
  const count = Math.max(1, Math.floor((STUNT.pitLength - 160) / STUNT.carSpacing));
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < count; k++) {
      // Rows are staggered so the cars look parked in a crowd, not on a grid.
      const stagger = (row % 2) * (STUNT.carSpacing / 2);
      const x = pitX0 + 80 + stagger + k * STUNT.carSpacing;
      if (x > pitX1 - 70) continue;
      cars.push({ x, variant: (k * 5 + row * 3 + index) % 12, lane: row });
    }
  }

  const layout: StuntLayout = {
    index,
    x0,
    x1,
    gateX,
    pads,
    rampX0: at(rampStart),
    lipX,
    lipY,
    pitX0,
    pitX1,
    landX0,
    landX1,
    landEndX: at(endS),
    landY: BASE_Y - STUNT.landHeight,
    cars,
    skyTriggerX: lipX - STUNT.skyLead,
    skyX: (pitX0 + pitX1) / 2,
    skyY: lipY - STUNT.skyHeight,
    pyro: [
      { x: lipX - 32, y: lipY, site: 'launch' },
      { x: (landX0 + landX1) / 2, y: BASE_Y - STUNT.landHeight, site: 'landing' },
    ],
  };
  cache.set(key, layout);
  return layout;
}

/** True when the stage fits inside the last `STUNT.fraction` of its segment (plus the gate margin). */
export function fitsWindow(layout: StuntLayout): boolean {
  const window = segmentMeters(layout.index) * PX_PER_METER * STUNT.fraction;
  return layout.gateX - layout.x0 <= window;
}

/** The first stage whose terrain ends after world x (the one the road is heading for). */
export function nextStuntAfter(x: number, startX: number = GAMEPLAY.startX): StuntLayout {
  for (let i = BIOMES.checkpointsPer; ; i += BIOMES.checkpointsPer) {
    const l = stuntLayout(i, startX);
    if (l.x1 > x) return l;
  }
}

/** Terrain height offsets (negative = up, relative to BASE_Y) for the whole stage, one per sample from `x0`. */
export function stuntOffsets(): number[] {
  const p = parts();
  const out: number[] = [];
  const H = STUNT.rampHeight;
  for (let i = 0; i < p.lead + p.flat; i++) out.push(0);
  // The ramp: a quarter-pipe-ish curve, flat at the foot and steepest at the lip.
  for (let i = 1; i <= p.ramp; i++) out.push(-H * Math.pow(i / p.ramp, STUNT.rampCurve));
  // The sheer drop behind the lip down to the floor of the pit.
  for (let i = 1; i <= p.drop; i++) out.push(-H * (1 - i / (p.drop + 1)));
  for (let i = 0; i < p.pit + 1; i++) out.push(0);
  // The landing ramp: a wall, a table, then a long gentle slope down.
  const L = STUNT.landHeight;
  for (let i = 1; i <= p.wall; i++) out.push(-L * (i / p.wall));
  for (let i = 0; i < p.top; i++) out.push(-L);
  for (let i = 1; i <= p.slope; i++) out.push(-L * (1 - i / p.slope));
  for (let i = 0; i < p.run; i++) out.push(0);
  return out;
}

/** The pad under (or just behind) the truck's x, if any. */
export function padAt(layout: StuntLayout, x: number): PadSpot | null {
  for (const pad of layout.pads) if (x >= pad.x0 && x <= pad.x1) return pad;
  return null;
}

/** Optional signed pitch spin (rad/s) added at launch; disabled for fair stunt landings. */
export function launchKick(seed: number, index: number): number {
  if (STUNT.kick === 0) return 0;
  const rng = new Rng(((seed ^ 0x2545f491) + index * 0x9e3779b1) >>> 0);
  rng.next();
  return (rng.next() * 2 - 1) * STUNT.kick;
}
