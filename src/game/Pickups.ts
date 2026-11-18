import { FUEL, PICKUPS, PX_PER_METER } from '../config';
import { fuelPerPx } from './Fuel';
import { Rng } from './Rng';
import { JUMP_KINDS, type PieceKind, type Terrain, type TerrainPiece } from './Terrain';

export type PickupKind = 'snack' | 'fuel';

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
  missed: boolean;
}

/** Chance that a chunk of each kind gets a snack route. */
const SNACK_CHANCE: Record<PieceKind, number> = {
  flat: 0.8,
  hills: 0.75,
  washboard: 0.55,
  ramp: 1,
  table: 1,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Places snacks (lines on the ground, arcs over ramps) and fuel cans ahead of the truck.
 * Uses its own RNG so adding pickups never changes the terrain for a seed.
 *
 * Fuel guarantee: the fuel needed to cover the gap between two cans at the reference speed is
 * never more than `maxGapRatio` of what one can restores, so a driver who grabs every can and
 * keeps a modest pace cannot run dry. Missing a can is the real danger.
 */
export class PickupField {
  items: Pickup[] = [];
  /** World x of every fuel can ever placed, in order (kept for tests and the HUD). */
  fuelXs: number[] = [];

  private rng: Rng;
  private nextId = 1;
  private pieceCursor: number;
  private lastFuelX: number;
  private nextFuelX: number;

  constructor(
    seed: number,
    private terrain: Terrain,
    private startX: number,
  ) {
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.pieceCursor = terrain.endX;
    this.lastFuelX = startX;
    // Starter line on the opening flat so the first thing the player learns is "grab these".
    for (let i = 0; i < 6; i++) {
      const x = startX + 380 + i * PICKUPS.spacing;
      this.add('snack', x, terrain.heightAt(x) - PICKUPS.hover);
    }
    this.nextFuelX = this.planFuel(startX);
  }

  /** Generate everything up to world x `toX`. */
  ensure(toX: number): void {
    this.terrain.ensure(toX);
    this.spawnSnacks();
    while (this.nextFuelX < toX) {
      this.terrain.ensure(this.nextFuelX + 1200);
      this.spawnSnacks();
      const x = this.safeFuelX(this.nextFuelX);
      this.items = this.items.filter((p) => !(p.kind === 'snack' && Math.abs(p.x - x) < 70));
      this.add('fuel', x, this.terrain.heightAt(x) - PICKUPS.hover);
      this.fuelXs.push(x);
      this.lastFuelX = x;
      this.nextFuelX = this.planFuel(x);
    }
  }

  /** Marks and returns the pickups within reach of (x, y). */
  collect(x: number, y: number): Pickup[] {
    const got: Pickup[] = [];
    const r2 = PICKUPS.collectRadius * PICKUPS.collectRadius;
    for (const p of this.items) {
      if (p.taken || p.missed) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) {
        p.taken = true;
        got.push(p);
      }
    }
    return got;
  }

  /** Marks and returns the pickups the truck has driven past without collecting. */
  sweepMissed(x: number): Pickup[] {
    const out: Pickup[] = [];
    for (const p of this.items) {
      if (!p.taken && !p.missed && p.x < x - PICKUPS.missMargin) {
        p.missed = true;
        out.push(p);
      }
    }
    return out;
  }

  prune(x: number): void {
    const cut = x - PICKUPS.keepBehind;
    if (this.items.length && this.items.some((p) => p.x < cut)) {
      this.items = this.items.filter((p) => p.x >= cut);
    }
  }

  private add(kind: PickupKind, x: number, y: number): void {
    this.items.push({ id: this.nextId++, kind, x, y, taken: false, missed: false });
  }

  /** Picks the x of the next can: the guaranteed-reachable gap, with a little jitter. */
  private planFuel(fromX: number): number {
    const meters = (fromX - this.startX) / PX_PER_METER;
    const ramp = clamp01(meters / FUEL.gapRampMeters);
    const ratio = FUEL.minGapRatio + (FUEL.maxGapRatio - FUEL.minGapRatio) * ramp;
    const target = ratio * FUEL.canRestore;
    // Drain grows with distance, so size the gap with the cost at its far end (conservative).
    const rough = target / fuelPerPx(FUEL.refSpeed, meters);
    const endMeters = (fromX + rough - this.startX) / PX_PER_METER;
    const gap = target / fuelPerPx(FUEL.refSpeed, endMeters);
    return fromX + gap * this.rng.range(0.85, 1);
  }

  /** Cans never sit on a ramp or its landing: slide back to just before the jump. */
  private safeFuelX(x: number): number {
    for (let i = 0; i < 6; i++) {
      const piece = this.terrain.pieces.find(
        (p) => JUMP_KINDS.includes(p.kind) && x > p.x0 - 140 && x < p.x1 + 60,
      );
      if (!piece) break;
      x = piece.x0 - 140;
    }
    return Math.max(x, this.lastFuelX + 200);
  }

  private spawnSnacks(): void {
    for (const piece of this.terrain.pieces) {
      if (piece.x0 < this.pieceCursor) continue;
      this.snacksFor(piece);
      this.pieceCursor = piece.x1;
    }
  }

  private snacksFor(p: TerrainPiece): void {
    if (this.rng.next() > SNACK_CHANCE[p.kind]) return;
    const t = this.terrain;
    const hover = PICKUPS.hover;
    if (p.kind === 'ramp' || p.kind === 'table') {
      // Two on the climb, then an arc over the gap: the arc teaches "hit the ramp".
      for (const f of [0.45, 0.8]) {
        const x = p.x0 + (p.liftX - p.x0) * f;
        this.add('snack', x, t.heightAt(x) - hover);
      }
      const lipY = t.heightAt(p.lipX);
      PICKUPS.arcX.forEach((dx, i) => this.add('snack', p.lipX + dx, lipY - PICKUPS.arcY[i]));
      return;
    }
    const len = p.x1 - p.x0;
    const count = Math.min(PICKUPS.maxLine, Math.floor(len / PICKUPS.spacing));
    if (count < 2) return;
    const start = p.x0 + (len - (count - 1) * PICKUPS.spacing) / 2;
    for (let i = 0; i < count; i++) {
      const x = start + i * PICKUPS.spacing;
      this.add('snack', x, t.heightAt(x) - hover);
    }
  }
}
