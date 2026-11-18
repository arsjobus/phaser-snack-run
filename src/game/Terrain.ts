import { BASE_Y, GAMEPLAY, PX_PER_METER, TERRAIN_STEP } from '../config';
import { Rng } from './Rng';

export type PieceKind = 'flat' | 'hills' | 'washboard' | 'ramp' | 'table';

/** Record of one generated chunk, so spawners (snacks, fuel) can lay content on top of it. */
export interface TerrainPiece {
  kind: PieceKind;
  /** World x of the piece's first and one-past-last sample (includes its flat run-out). */
  x0: number;
  x1: number;
  /** World x of the first and last sample at the piece's highest point (ramp: the lip). */
  liftX: number;
  lipX: number;
}

export const JUMP_KINDS: readonly PieceKind[] = ['ramp', 'table'];

/**
 * Infinite heightfield terrain built from "chunks" (pieces) appended on demand.
 * Heights are stored as absolute world y (y-down) sampled every TERRAIN_STEP px.
 * Every piece starts and ends at offset 0 so the track is always continuous.
 */
export class Terrain {
  private heights: number[] = [];
  private originX = 0;
  private rng: Rng;
  private lastKind: PieceKind = 'flat';
  /** Chunks in generation order; pruned together with the samples. */
  readonly pieces: TerrainPiece[] = [];

  constructor(seed: number) {
    this.rng = new Rng(seed);
    const n = Math.ceil((GAMEPLAY.flatStartPx + 400) / TERRAIN_STEP);
    for (let i = 0; i < n; i++) this.heights.push(BASE_Y);
  }

  /** World x of the first stored sample. */
  get startX(): number {
    return this.originX;
  }

  /** World x just past the last generated sample. */
  get endX(): number {
    return this.originX + this.heights.length * TERRAIN_STEP;
  }

  /** Generate terrain until at least `x` is covered. */
  ensure(x: number): void {
    while (this.endX < x) this.appendPiece();
  }

  /** Drop samples far behind `x` (keeps memory bounded on long runs). */
  prune(x: number): void {
    const drop = Math.floor((x - this.originX) / TERRAIN_STEP);
    if (drop > 200) {
      this.heights.splice(0, drop);
      this.originX += drop * TERRAIN_STEP;
      while (this.pieces.length && this.pieces[0].x1 < this.originX) this.pieces.shift();
    }
  }

  heightAt(x: number): number {
    const f = (x - this.originX) / TERRAIN_STEP;
    if (f <= 0) return this.heights[0];
    const i = Math.floor(f);
    if (i >= this.heights.length - 1) return this.heights[this.heights.length - 1];
    const t = f - i;
    return this.heights[i] * (1 - t) + this.heights[i + 1] * t;
  }

  /** dy/dx at x (y-down, so negative = uphill to the right). */
  slopeAt(x: number): number {
    const f = (x - this.originX) / TERRAIN_STEP;
    const i = Math.max(0, Math.min(this.heights.length - 2, Math.floor(f)));
    return (this.heights[i + 1] - this.heights[i]) / TERRAIN_STEP;
  }

  private difficulty(): number {
    return Math.max(0, Math.min(1, this.endX / PX_PER_METER / 1500));
  }

  private appendPiece(): void {
    const kind = this.pickKind();
    this.lastKind = kind;
    const offs = this.build(kind);
    // Flat breathing room after every piece.
    for (let i = 0; i < this.rng.int(3, 6); i++) offs.push(0);
    const x0 = this.endX;
    for (const o of offs) this.heights.push(BASE_Y + o);
    let top = 0;
    for (const o of offs) top = Math.min(top, o);
    const first = offs.findIndex((o) => o === top);
    const last = offs.lastIndexOf(top);
    this.pieces.push({
      kind,
      x0,
      x1: this.endX,
      liftX: x0 + first * TERRAIN_STEP,
      lipX: x0 + last * TERRAIN_STEP,
    });
  }

  private pickKind(): PieceKind {
    const r = this.rng.next();
    let kind: PieceKind;
    if (r < 0.18) kind = 'flat';
    else if (r < 0.5) kind = 'hills';
    else if (r < 0.65) kind = 'washboard';
    else if (r < 0.9) kind = 'ramp';
    else kind = 'table';
    // Avoid back-to-back jumps with no recovery.
    const jump = (k: PieceKind) => k === 'ramp' || k === 'table';
    if (jump(kind) && jump(this.lastKind)) kind = 'hills';
    return kind;
  }

  /** Returns height offsets (negative = up) in samples, starting just after offset 0. */
  private build(kind: PieceKind): number[] {
    const d = this.difficulty();
    const out: number[] = [];
    const rng = this.rng;
    switch (kind) {
      case 'flat': {
        for (let i = 0; i < rng.int(8, 18); i++) out.push(0);
        break;
      }
      case 'hills': {
        const waves = rng.int(1, 3);
        const w = rng.int(18, 30);
        const amp = rng.range(14, 22) + d * 20;
        for (let k = 0; k < waves; k++) {
          for (let i = 1; i <= w; i++) {
            out.push((-amp * (1 - Math.cos((2 * Math.PI * i) / w))) / 2);
          }
        }
        break;
      }
      case 'washboard': {
        const bumps = rng.int(4, 8);
        const w = 6;
        const amp = rng.range(7, 12) + d * 6;
        for (let k = 0; k < bumps; k++) {
          for (let i = 1; i <= w; i++) {
            out.push((-amp * (1 - Math.cos((2 * Math.PI * i) / w))) / 2);
          }
        }
        break;
      }
      case 'ramp': {
        const rise = rng.int(10, 14);
        const h = rng.range(55, 85) + d * 40;
        for (let i = 1; i <= rise; i++) out.push(-h * Math.pow(i / rise, 1.25));
        const drop = this.dropSamples(h);
        for (let i = 1; i <= drop; i++) out.push(-h * (1 - i / drop));
        break;
      }
      case 'table': {
        const rise = rng.int(9, 12);
        const top = rng.int(5, 9);
        const h = rng.range(45, 70) + d * 30;
        for (let i = 1; i <= rise; i++) out.push(-h * Math.pow(i / rise, 1.15));
        for (let i = 0; i < top; i++) out.push(-h);
        const drop = this.dropSamples(h);
        for (let i = 1; i <= drop; i++) out.push(-h * (1 - i / drop));
        break;
      }
    }
    return out;
  }

  /** Landing slopes are capped (~0.8) so the truck never faces a cliff it can't survive. */
  private dropSamples(h: number): number {
    return Math.ceil(h / (0.8 * TERRAIN_STEP)) + this.rng.int(0, 2);
  }
}
