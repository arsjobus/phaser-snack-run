import { FUEL, LANES, PICKUPS, PX_PER_METER, STUNT, WRENCH } from '../config';
import { fuelPerPx } from './Fuel';
import { clampLane, sameLane } from './Lanes';
import type { ObstacleField } from './Obstacles';
import { Rng } from './Rng';
import { stuntLayout, stuntLength } from './Stunt';
import { JUMP_KINDS, type PieceKind, type Terrain, type TerrainPiece } from './Terrain';
import type { WreckField } from './Wrecks';

export type PickupKind = 'snack' | 'fuel' | 'wrench';

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  /** Depth lane it sits in (0 = nearest the camera). The truck must be near that lane to grab it. */
  lane: number;
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
  stunt: 0,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Places snacks (lines on the ground, arcs over ramps), fuel cans and wrenches ahead of the truck.
 * Each group sits in one depth lane; snack groups wander one lane at a time (so following the trail
 * means a lane change now and then), cans stay in the two middle lanes. Uses its own RNG so adding
 * pickups never changes the terrain for a seed.
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
  private wrenchRng: Rng;
  /** Lane choices have their own stream, so lanes never shift where cans and snacks go. */
  private laneRng: Rng;
  private nextId = 1;
  private pieceCursor: number;
  private lastFuelX: number;
  private nextFuelX: number;
  private nextWrenchX: number;
  /** Lane of the latest snack group. */
  private snackLane: number = LANES.startLane;

  /** `wrecks` and `obstacles` (optional) keep snacks, cans and wrenches off the hulks and rocks. */
  constructor(
    seed: number,
    private terrain: Terrain,
    private startX: number,
    private wrecks?: WreckField,
    private obstacles?: ObstacleField,
  ) {
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.wrenchRng = new Rng((seed ^ 0x7f4a7c15) >>> 0);
    this.laneRng = new Rng((seed ^ 0x1b873593) >>> 0);
    this.pieceCursor = terrain.endX;
    this.lastFuelX = startX;
    // Starter line on the opening flat so the first thing the player learns is "grab these".
    for (let i = 0; i < 6; i++) {
      const x = startX + 380 + i * PICKUPS.spacing;
      this.add('snack', x, terrain.heightAt(x) - PICKUPS.hover, LANES.startLane);
    }
    this.nextFuelX = this.planFuel(startX);
    this.nextWrenchX = startX + WRENCH.firstMeters * PX_PER_METER;
  }

  /** Generate everything up to world x `toX`. */
  ensure(toX: number): void {
    this.terrain.ensure(toX);
    this.spawnSnacks();
    while (this.nextFuelX < toX) {
      // (a whole stage ahead, so a can that lands in one is found and moved)
      this.terrain.ensure(this.nextFuelX + 1200 + stuntLength());
      this.spawnSnacks();
      const wanted = this.nextFuelX;
      const x = this.safeFuelX(wanted);
      this.items = this.items.filter((p) => !(p.kind === 'snack' && Math.abs(p.x - x) < 70));
      const lane = this.laneRng.int(1, Math.max(1, LANES.count - 2));
      this.add('fuel', x, this.terrain.heightAt(x) - PICKUPS.hover, lane);
      this.fuelXs.push(x);
      this.lastFuelX = x;
      // A can that had to slide back before a stage (up to a few thousand px) does not make the
      // next gap shorter: the stage is crossed boosted, at a fraction of the fuel, so it is credited.
      const inStage = this.terrain.pieces.some((q) => q.kind === 'stunt' && wanted > q.x0 - 140 && wanted < q.x1 + 60);
      this.nextFuelX = this.planFuel(x) + (inStage ? Math.max(0, wanted - x) : 0);
    }
    while (this.nextWrenchX < toX) {
      this.terrain.ensure(this.nextWrenchX + 1200 + stuntLength());
      this.spawnSnacks();
      const x = this.safeWrenchX(this.nextWrenchX);
      this.add('wrench', x, this.terrain.heightAt(x) - WRENCH.hover, this.laneRng.int(0, LANES.count - 1));
      const [lo, hi] = WRENCH.gapMeters;
      this.nextWrenchX = x + this.wrenchRng.range(lo, hi) * PX_PER_METER;
    }
  }

  /**
   * Marks and returns the pickups within reach of (x, y). Snacks can be grabbed from any lane unless
   * `PICKUPS.snacksFromAnyLane` is switched off; fuel and wrenches always require the truck to be in
   * the pickup's lane when `lane` is provided.
   */
  collect(x: number, y: number, lane?: number, band = Infinity): Pickup[] {
    const got: Pickup[] = [];
    const r2 = PICKUPS.collectRadius * PICKUPS.collectRadius;
    for (const p of this.items) {
      if (p.taken || p.missed) continue;
      if (lane !== undefined && Math.abs(p.lane - lane) >= band) continue;
      if (lane !== undefined && (p.kind !== 'snack' || !PICKUPS.snacksFromAnyLane) && !sameLane(p.lane, lane)) continue;
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

  private add(kind: PickupKind, x: number, y: number, lane: number): void {
    this.items.push({ id: this.nextId++, kind, x, y, lane: clampLane(lane), taken: false, missed: false });
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
      // Before a stage there may be no room behind (the last can is close): go on past it instead.
      x = piece.kind === 'stunt' && piece.x0 - 140 < this.lastFuelX + 200 ? piece.x1 + 60 : piece.x0 - 140;
    }
    // Nor on a roadside wreck or obstacle.
    for (let i = 0; i < 4; i++) {
      const w = this.wrecks?.near(x, 110) ?? this.obstacles?.near(x, 110);
      if (!w) break;
      // (back, unless that is on a jump: then forward)
      const back = w.x - 150;
      x = this.terrain.pieces.some((p) => JUMP_KINDS.includes(p.kind) && back > p.x0 - 140 && back < p.x1 + 60) ? w.x + 150 : back;
    }
    x = Math.max(x, this.lastFuelX + 200);
    const jump = this.terrain.pieces.find((p) => JUMP_KINDS.includes(p.kind) && x > p.x0 - 140 && x < p.x1 + 60);
    return jump ? jump.x1 + 60 : x;
  }

  /** Wrenches lie on the ground: not on jumps or their landings, wrecks, or right on a can. */
  private safeWrenchX(x: number): number {
    for (let i = 0; i < 8; i++) {
      const jump = this.terrain.pieces.find(
        (p) => JUMP_KINDS.includes(p.kind) && x > p.x0 - 60 && x < p.x1 + 60,
      );
      const wreck = this.wrecks?.near(x, WRENCH.clearance) ?? this.obstacles?.near(x, WRENCH.clearance);
      const can = this.fuelXs.find((f) => Math.abs(f - x) < WRENCH.clearance);
      if (jump) x = jump.x1 + 60;
      else if (wreck) x = wreck.x + WRENCH.clearance;
      else if (can !== undefined) x = can + WRENCH.clearance;
      else break;
      this.terrain.ensure(x + 1200);
      this.spawnSnacks();
    }
    return x;
  }

  private spawnSnacks(): void {
    this.wrecks?.sync();
    this.obstacles?.sync();
    for (const piece of this.terrain.pieces) {
      if (piece.x0 < this.pieceCursor) continue;
      this.snacksFor(piece);
      this.pieceCursor = piece.x1;
    }
  }

  /** The stage's reward: a snack line along the flat pads and a long arc over the pit. */
  private stuntSnacks(p: TerrainPiece): void {
    const t = this.terrain;
    const stage = stuntLayout(p.stage ?? 0, this.startX);
    const lane = 1;
    const first = stage.pads[0].x0;
    const last = stage.rampX0;
    for (let x = first + 40; x < last; x += PICKUPS.spacing * 2) this.add('snack', x, t.heightAt(x) - PICKUPS.hover, lane);
    STUNT.arcX.forEach((dx, i) => this.add('snack', stage.lipX + dx, stage.lipY - STUNT.arcY[i], lane));
  }

  private snacksFor(p: TerrainPiece): void {
    if (p.kind === 'stunt') {
      this.stuntSnacks(p);
      return;
    }
    if (this.rng.next() > SNACK_CHANCE[p.kind]) return;
    const t = this.terrain;
    const hover = PICKUPS.hover;
    const lane = (this.snackLane = clampLane(this.snackLane + this.laneRng.int(-1, 1)));
    if (p.kind === 'ramp' || p.kind === 'table') {
      // Two on the climb, then an arc over the gap: the arc teaches "hit the ramp".
      for (const f of [0.45, 0.8]) {
        const x = p.x0 + (p.liftX - p.x0) * f;
        this.add('snack', x, t.heightAt(x) - hover, lane);
      }
      const lipY = t.heightAt(p.lipX);
      PICKUPS.arcX.forEach((dx, i) => this.add('snack', p.lipX + dx, lipY - PICKUPS.arcY[i], lane));
      return;
    }
    const len = p.x1 - p.x0;
    const count = Math.min(PICKUPS.maxLine, Math.floor(len / PICKUPS.spacing));
    if (count < 2) return;
    const start = p.x0 + (len - (count - 1) * PICKUPS.spacing) / 2;
    for (let i = 0; i < count; i++) {
      const x = start + i * PICKUPS.spacing;
      if (this.wrecks?.near(x, 80, lane) || this.obstacles?.near(x, 80, lane)) continue; // something lies there
      this.add('snack', x, t.heightAt(x) - hover, lane);
    }
  }
}
