import { COLLISION, LANES, PX_PER_METER, WRECKS } from '../config';
import { deepestContact, truckCircles, type Circle } from './Collision';
import { sameLane } from './Lanes';
import { RIVAL_STYLES } from './Rival';
import { Rng } from './Rng';
import { JUMP_KINDS, type PieceKind, type Terrain, type TerrainPiece } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';

/** Chassis-centre height above the ground for a wreck lying at rest (px). */
const REST = 20;
/** Sliding friction of a wreck on the ground (px/s^2). */
const SLIDE_FRICTION = 500;

export interface Wreck {
  id: number;
  x: number;
  /** Centre height (px, y-down). */
  y: number;
  angle: number;
  /** Which rival livery the wreck wears (index into the texture set). */
  style: number;
  /** True while it blocks the road; false once hit, when it is flung as harmless debris. */
  solid: boolean;
  vx: number;
  vy: number;
  spin: number;
  /** Seconds since it was knocked loose (debris only). */
  age: number;
  /** Came from a rival (as opposed to a roadside hulk): drawn smoking. */
  fresh: boolean;
  /** Depth lane it lies in (0 = nearest the camera); only vehicles in that lane can hit it. */
  lane: number;
}

export interface WreckHit {
  wreck: Wreck;
  /** Truck speed into the wreck along the contact normal (px/s). */
  impact: number;
  x: number;
  y: number;
}

/** Wreck collision circles: two along its length. */
export function wreckCircles(w: Wreck): Circle[] {
  const dx = Math.cos(w.angle) * WRECKS.halfLength;
  const dy = Math.sin(w.angle) * WRECKS.halfLength;
  return [
    { x: w.x - dx, y: w.y - dy, r: WRECKS.radius },
    { x: w.x + dx, y: w.y + dy, r: WRECKS.radius },
  ];
}

/**
 * Wrecked vehicles on the course. Roadside hulks are placed on flat and hilly chunks, each in a
 * random lane (never just after a jump, where nobody could brake in time); rivals that flip join
 * them where they lie. A solid wreck is hit once: the truck pays in speed and damage and the wreck
 * is flung away as debris, so a wreck can never trap the player. Own RNG, so placing wrecks never
 * changes the terrain for a seed.
 */
export class WreckField {
  items: Wreck[] = [];
  /**
   * Asks whether a hulk may block `lane` at x without closing a row of obstacles (set by `RunModel`),
   * so the lanes left open never drop below `count - OBSTACLES.maxBlocked`.
   */
  canBlock?: (x: number, lane: number) => boolean;

  private rng: Rng;
  private nextId = 1;
  private pieceCursor: number;
  private lastX = -Infinity;

  constructor(
    seed: number,
    private terrain: Terrain,
    private startX: number,
  ) {
    this.rng = new Rng((seed ^ 0x3c6ef372) >>> 0);
    this.pieceCursor = terrain.endX;
  }

  /** Place wrecks on every terrain chunk generated so far that has not been looked at yet. */
  sync(): void {
    for (const piece of this.terrain.pieces) {
      if (piece.x0 < this.pieceCursor) continue;
      this.wreckFor(piece);
      this.pieceCursor = piece.x1;
    }
  }

  /** The nearest solid wreck within `margin` px of x (in `lane`, or in any lane if omitted), if any. */
  near(x: number, margin: number, lane?: number): Wreck | undefined {
    return this.items.find(
      (w) => w.solid && (lane === undefined || sameLane(w.lane, lane)) && Math.abs(w.x - x) <= margin,
    );
  }

  /** The first solid wreck ahead of x within `distance` px in `lane` (for rivals that look ahead). */
  ahead(x: number, distance: number, lane: number): Wreck | undefined {
    let best: Wreck | undefined;
    for (const w of this.items) {
      if (!w.solid || !sameLane(w.lane, lane) || w.x < x || w.x > x + distance) continue;
      if (!best || w.x < best.x) best = w;
    }
    return best;
  }

  /** Lanes blocked by a solid wreck within `gap` px of x. */
  blockedLanes(x: number, gap: number): Set<number> {
    const out = new Set<number>();
    for (const w of this.items) if (w.solid && Math.abs(w.x - x) <= gap) out.add(w.lane);
    return out;
  }

  /** A rival that just died becomes a wreck where it lies (in its lane). */
  addFromRival(x: number, angle: number, style: number, vx: number, lane = 0): Wreck {
    const w = this.make(x, style, true, lane);
    w.angle = angle;
    w.vx = Math.max(0, vx);
    return w;
  }

  /**
   * Tests a truck (at lane position `lane`) against the solid wrecks in its lane. A hit knocks the
   * wreck loose (so it is never hit twice), takes speed off the truck, gives it a hop and pushes it
   * out of the overlap. Returns the first hit (one per call is plenty).
   */
  collide(truck: TruckPhysics, lane = 0): WreckHit | null {
    const circles = truckCircles(truck);
    for (const w of this.items) {
      if (!w.solid || !sameLane(w.lane, lane) || Math.abs(w.x - truck.x) > 200) continue;
      const c = deepestContact(circles, wreckCircles(w));
      if (!c) continue;
      // Closing speed: the truck's velocity at the contact point, along the normal to the wreck.
      const vpx = truck.vx - truck.angVel * (c.y - truck.y);
      const vpy = truck.vy + truck.angVel * (c.x - truck.x);
      const impact = Math.max(0, vpx * c.nx + vpy * c.ny);
      if (impact > 0) {
        // Drag on the truck, applied near its centre so it slows rather than spins.
        const k = COLLISION.wreckDrag * impact;
        const ax = truck.x + (c.x - truck.x) * 0.35;
        const ay = truck.y + (c.y - truck.y) * 0.35;
        truck.applyImpulse(ax, ay, -k * c.nx, -k * c.ny);
        if (impact > 60) truck.vy -= COLLISION.wreckHop;
      }
      truck.translate(-c.nx * Math.min(c.depth, COLLISION.maxPush), -c.ny * Math.min(c.depth, COLLISION.maxPush));
      // Knock it loose: forward and up, tumbling.
      w.solid = false;
      w.age = 0;
      w.vx = Math.max(truck.vx, 0) * 0.85 + 90;
      w.vy = -(240 + impact * 0.3);
      w.spin = (truck.vx >= 0 ? 1 : -1) * (3 + impact / 220);
      return { wreck: w, impact, x: c.x, y: c.y };
    }
    return null;
  }

  /** Slide freshly made wrecks to a stop and fly the debris. Returns nothing; drop old ones. */
  update(dt: number): void {
    for (const w of this.items) {
      if (w.solid) {
        if (Math.abs(w.vx) > 1) {
          w.x += w.vx * dt;
          w.vx = Math.max(0, w.vx - SLIDE_FRICTION * dt);
          this.settle(w);
        }
        continue;
      }
      w.age += dt;
      w.vy += 1250 * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.angle += w.spin * dt;
      const floor = this.terrain.heightAt(w.x) - 12;
      if (w.y > floor && w.vy > 0) {
        w.y = floor;
        w.vy *= -0.3;
        w.vx *= 0.8;
        w.spin *= 0.7;
      }
    }
    this.items = this.items.filter((w) => w.solid || w.age < WRECKS.debrisLife);
  }

  prune(x: number): void {
    this.items = this.items.filter((w) => w.x > x - 2000);
  }

  /** Sit a solid wreck on the ground, tilted to the slope. */
  private settle(w: Wreck): void {
    w.y = this.terrain.heightAt(w.x) - REST;
    w.angle = Math.atan(this.terrain.slopeAt(w.x));
  }

  private make(x: number, style: number, fresh: boolean, lane = 0): Wreck {
    const w: Wreck = {
      id: this.nextId++,
      x,
      y: 0,
      angle: 0,
      style,
      solid: true,
      vx: 0,
      vy: 0,
      spin: 0,
      age: 0,
      fresh,
      lane: Math.max(0, Math.min(LANES.count - 1, Math.round(lane))),
    };
    this.settle(w);
    this.items.push(w);
    return w;
  }

  private chance(meters: number): number {
    if (meters < WRECKS.startMeters) return 0;
    const t = Math.min(1, (meters - WRECKS.startMeters) / WRECKS.rampMeters);
    return WRECKS.chanceMin + (WRECKS.chanceMax - WRECKS.chanceMin) * t;
  }

  private wreckFor(p: TerrainPiece): void {
    const kinds: readonly PieceKind[] = ['flat', 'hills'];
    if (!kinds.includes(p.kind)) return;
    const mid = (p.x0 + p.x1) / 2;
    // Always draw, so the stream of random numbers does not depend on the conditions below.
    const roll = this.rng.next();
    const jitter = this.rng.range(-60, 60);
    const style = this.rng.int(0, RIVAL_STYLES.length - 1);
    let lane = this.rng.int(0, LANES.count - 1);
    if (roll > this.chance((mid - this.startX) / PX_PER_METER)) return;

    let x = mid + jitter;
    // Keep clear of the landing of a jump just before this chunk.
    const prev = this.terrain.pieces.find((q) => q !== p && Math.abs(q.x1 - p.x0) < 1);
    if (prev && JUMP_KINDS.includes(prev.kind)) x = Math.max(x, prev.x1 + WRECKS.landingClear);
    if (x > p.x1 - 120 || x < p.x0 + 40) return;
    if (x - this.lastX < WRECKS.minSpacing) return;
    if (this.canBlock && !this.canBlock(x, lane)) {
      const other = [...Array(LANES.count).keys()].find((l) => this.canBlock!(x, l));
      if (other === undefined) return;
      lane = other;
    }
    this.lastX = x;
    this.make(x, style, false, lane);
  }
}
