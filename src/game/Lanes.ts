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

/**
 * The player's lane: a wanted lane (whole number) and the animated position that chases it, so a
 * lane change is a quick swerve. Pressing again while moving queues another step.
 */
export class PlayerLane {
  /** Wanted lane. */
  target: number = LANES.startLane;
  /** Current (animated) lane position; this is what collisions and drawing use. */
  f: number = LANES.startLane;
  /** How many lane changes have been made this run. */
  changes = 0;

  /** Step one lane away from the camera (+1) or towards it (-1). Returns the lane left, or null at the edge. */
  request(dir: 1 | -1): number | null {
    const next = clampLane(this.target + dir);
    if (next === this.target) return null;
    const from = this.target;
    this.target = next;
    this.changes++;
    return from;
  }

  update(dt: number): void {
    const step = dt / LANES.changeTime;
    this.f = this.target > this.f ? Math.min(this.target, this.f + step) : Math.max(this.target, this.f - step);
  }

  get swerving(): boolean {
    return this.f !== this.target;
  }

  reset(): void {
    this.target = this.f = LANES.startLane;
    this.changes = 0;
  }
}

/** Screen y of a point at physics height `y` over ground height `gy`, drawn in lane position `f`. */
export const laneProject = (gy: number, y: number, f: number): number => gy + (y - gy) * laneScale(f) - laneLift(f);
