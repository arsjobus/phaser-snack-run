import { FX } from '../config';

/** One stretch of tire track along the ground, from x0 to x1. */
export interface TrackSegment {
  x0: number;
  x1: number;
  color: number;
  /** Pixels the track is drawn above the ground line (the lane it was laid in). */
  lift: number;
}

/**
 * Tire tracks left on the crust. Each wheel (a string key) lays a line of short segments while it
 * rolls on the ground; lifting off or a jump in position breaks the line. Pure TypeScript.
 */
export class TrackMarks {
  segments: TrackSegment[] = [];
  private last = new Map<string, number>();

  /** Report a wheel. `rolling` is true while it is on the ground and moving over `minSpeed`. */
  add(key: string, x: number, rolling: boolean, color: number, lift = 0): void {
    const T = FX.tracks;
    const prev = this.last.get(key);
    if (!rolling) {
      this.last.delete(key);
      return;
    }
    if (prev === undefined || Math.abs(x - prev) > T.maxGap) {
      this.last.set(key, x);
      return;
    }
    if (Math.abs(x - prev) < T.spacing) return;
    this.segments.push({ x0: Math.min(prev, x), x1: Math.max(prev, x), color, lift });
    this.last.set(key, x);
    if (this.segments.length > T.max) this.segments.splice(0, this.segments.length - T.max);
  }

  /** Forget everything that lies left of `minX` (off screen). */
  cull(minX: number): void {
    if (this.segments.length && this.segments[0].x1 < minX) {
      this.segments = this.segments.filter((s) => s.x1 >= minX);
    }
  }

  /** Forget a wheel that has gone (a rival that despawned). */
  forget(key: string): void {
    this.last.delete(key);
  }
}
