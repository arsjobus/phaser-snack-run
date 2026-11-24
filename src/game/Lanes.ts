import { LANES } from '../config';

/**
 * Depth-lane helpers (pure TypeScript). Lane 0 is nearest the camera; a lane further away is drawn
 * higher, smaller and darker. Lane positions are floats while something swerves between lanes.
 */

export const clampLane = (lane: number): number => Math.max(0, Math.min(LANES.count - 1, lane));

/** Drawing scale of a lane position (1 at the nearest lane). */
export const laneScale = (f: number): number => 1 - LANES.scaleStep * f;

/** Pixels a lane position is drawn above the ground line. */
export const laneLift = (f: number): number => LANES.spacing * f;

/** Colour-channel brightness (0..255) used to tint things in a lane (255 = untinted). */
export const laneShade = (f: number): number => Math.round(255 * (1 - LANES.tintStep * f));

/** Draw depth of an entity in a lane; `offset` orders things that share a lane (small numbers). */
export const laneDepth = (f: number, offset = 0): number => LANES.depthBase - LANES.depthStep * f + offset;

/** True when two lane positions are close enough for the things in them to touch. */
export const sameLane = (a: number, b: number, band: number = LANES.hitBand): boolean => Math.abs(a - b) < band;

/** What the lane gate needs to know about the truck this frame. */
export interface SteerState {
  /** Throttle and brake after the engine cut-out (0..1). Either one counts: forwards or reverse. */
  throttle: number;
  brake: number;
  /** Wheels touching the ground right now. */
  wheelsDown: number;
  /** The truck is lying on its roof or side. */
  flipped: boolean;
}

/**
 * Lanes are changed by driving across them, so the truck needs enough gas (forwards or reverse),
 * and a truck that has rolled over with not even one wheel on the ground cannot change lanes at all.
 */
export function canChangeLane(s: SteerState): boolean {
  if (s.flipped && s.wheelsDown === 0) return false;
  return Math.max(s.throttle, s.brake) >= LANES.minDriveToSteer;
}

/** What a depth move did this frame. */
export interface LaneStep {
  /** The whole lane the player just left (the nearest lane changed), or null. */
  changedFrom: number | null;
  /** Set when a limit that is not the edge of the field stopped the move: the index into `limits`. */
  blocked: 'lo' | 'hi' | null;
  /** Depth speed (lanes/s) at the moment of the block, always positive. */
  impactSpeed: number;
}

/**
 * The player's depth. Holding Up (+1, away from the camera) or Down (-1, towards it) drifts the
 * truck through the field with a little easing, so it feels like steering through a 3D field
 * instead of hopping between rails. Other vehicles can limit the move (`lo`/`hi`): pushing into
 * one stops the truck and rebounds it a little, which the race turns into a side-swipe.
 */
export class PlayerLane {
  /** Current depth; this is what collisions and drawing use. */
  f: number = LANES.startLane;
  /** Depth speed (lanes per second, positive = away from the camera). */
  v = 0;
  /** What is being held right now (-1, 0 or 1). */
  dir: -1 | 0 | 1 = 0;
  /** How many times the nearest whole lane has changed this run. */
  changes = 0;
  private home: number = LANES.startLane;

  /** The lane the player is nearest, looking a little ahead in the direction of travel. */
  get target(): number {
    return clampLane(Math.round(this.f + this.dir * 0.6));
  }

  get swerving(): boolean {
    return Math.abs(this.v) > 0.05;
  }

  /** Move for `dt` seconds with `dir` held, within [lo, hi] (the field edges unless something blocks). */
  update(dt: number, dir: -1 | 0 | 1, lo = 0, hi = LANES.count - 1): LaneStep {
    this.dir = dir;
    const goal = dir * LANES.moveSpeed;
    this.v += (goal - this.v) * (1 - Math.exp(-LANES.moveEase * dt));
    if (dir === 0 && Math.abs(this.v) < 0.02) this.v = 0;
    const step: LaneStep = { changedFrom: null, blocked: null, impactSpeed: 0 };
    let next = this.f + this.v * dt;
    const top = Math.min(hi, LANES.count - 1);
    const bottom = Math.max(lo, 0);
    if (next > top) {
      if (hi < LANES.count - 1 && this.v > 0.3 && this.f <= top + 1e-6) {
        step.blocked = 'hi';
        step.impactSpeed = this.v;
      }
      next = top;
      this.v = step.blocked ? -this.v * LANES.rebound : 0;
    } else if (next < bottom) {
      if (lo > 0 && this.v < -0.3 && this.f >= bottom - 1e-6) {
        step.blocked = 'lo';
        step.impactSpeed = -this.v;
      }
      next = bottom;
      this.v = step.blocked ? -this.v * LANES.rebound : 0;
    }
    this.f = next;
    const nearest = Math.round(this.f);
    if (nearest !== this.home) {
      step.changedFrom = this.home;
      this.home = nearest;
      this.changes++;
    }
    return step;
  }

  reset(): void {
    this.f = this.home = LANES.startLane;
    this.v = 0;
    this.dir = 0;
    this.changes = 0;
  }
}

/** Screen y of a point at physics height `y` over ground height `gy`, drawn in lane position `f`. */
export const laneProject = (gy: number, y: number, f: number): number => gy + (y - gy) * laneScale(f) - laneLift(f);
