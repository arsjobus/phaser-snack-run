import { COLLISION, LANES, OBSTACLES, OBSTACLE_KINDS, PX_PER_METER } from '../config';
import { deepestContact, truckCircles, type Circle } from './Collision';
import { sameLane } from './Lanes';
import { Rng } from './Rng';
import { JUMP_KINDS, type Terrain, type TerrainPiece } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';
import type { WreckField } from './Wrecks';

export type ObstacleKind = keyof typeof OBSTACLE_KINDS;
export const OBSTACLE_LIST = Object.keys(OBSTACLE_KINDS) as ObstacleKind[];

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  /** Centre height (px, y-down). */
  y: number;
  angle: number;
  /** Depth lane (0 = nearest the camera); only vehicles in (nearly) that lane can hit it. */
  lane: number;
  /** Look variant (0..2) so rows of rocks do not all look alike. */
  variant: number;
  /** False once knocked loose: harmless debris that fades out. */
  solid: boolean;
  vx: number;
  vy: number;
  spin: number;
  /** Seconds since it was knocked loose (debris only). */
  age: number;
  /** Seconds until a fixed obstacle can hurt again after a hit (it still pushes trucks out). */
  cool: number;
  /** Something has hit it (so passing it later is no clean dodge). */
  hit: boolean;
  /** The player switched lanes away from it while it was close ahead. */
  dodge: boolean;
  /** The dodge has been counted. */
  counted: boolean;
}

export interface ObstacleHit {
  obstacle: Obstacle;
  /** Closing speed into the obstacle along the contact normal (px/s). */
  impact: number;
  x: number;
  y: number;
}

/** The obstacle's collision circles in world space (a log has two, the rest one). */
export function obstacleCircles(o: Obstacle): Circle[] {
  const spec = OBSTACLE_KINDS[o.kind];
  const cos = Math.cos(o.angle);
  const sin = Math.sin(o.angle);
  return (spec.offsets as readonly number[]).map((d) => ({ x: o.x + d * cos, y: o.y + d * sin, r: spec.radius }));
}

/**
 * Obstacles on the course: rocks, tire stacks, logs and boulders, each in one lane. They are placed
 * per terrain chunk in "rows" (one or two obstacles close together) that, together with any wreck
 * nearby, never block more than `OBSTACLES.maxBlocked` lanes. Own RNG, so placing obstacles never
 * changes the terrain for a seed.
 *
 * Loose obstacles (rock, tires) are hit once and fly off as debris; fixed ones (log, boulder) stay
 * and stop a truck that hits them at speed. Switching lanes always gets past one.
 */
export class ObstacleField {
  items: Obstacle[] = [];

  private rng: Rng;
  private nextId = 1;
  private pieceCursor: number;
  private lastRowX = -Infinity;

  /** `wrecks` (optional) lets a row take the roadside wrecks' lanes into account. */
  constructor(
    seed: number,
    private terrain: Terrain,
    private startX: number,
    private wrecks?: WreckField,
  ) {
    this.rng = new Rng((seed ^ 0x2545f491) >>> 0);
    this.pieceCursor = terrain.endX;
  }

  /** Place obstacles on every terrain chunk generated so far that has not been looked at yet. */
  sync(): void {
    this.wrecks?.sync();
    for (const piece of this.terrain.pieces) {
      if (piece.x0 < this.pieceCursor) continue;
      this.rowFor(piece);
      this.pieceCursor = piece.x1;
    }
  }

  /** Add one obstacle by hand (tests, tutorials). It is dropped onto the ground at x. */
  addAt(kind: ObstacleKind, x: number, lane: number, variant = 0): Obstacle {
    const o: Obstacle = {
      id: this.nextId++,
      kind,
      x,
      y: 0,
      angle: 0,
      lane: Math.max(0, Math.min(LANES.count - 1, Math.round(lane))),
      variant,
      solid: true,
      vx: 0,
      vy: 0,
      spin: 0,
      age: 0,
      cool: 0,
      hit: false,
      dodge: false,
      counted: false,
    };
    this.settle(o);
    this.items.push(o);
    return o;
  }

  /** The nearest solid obstacle within `margin` px of x (in `lane`, or any lane if omitted). */
  near(x: number, margin: number, lane?: number): Obstacle | undefined {
    return this.items.find(
      (o) => o.solid && (lane === undefined || sameLane(o.lane, lane)) && Math.abs(o.x - x) <= margin,
    );
  }

  /** The first solid obstacle ahead of x within `distance` px in `lane` (for rivals that look ahead). */
  ahead(x: number, distance: number, lane: number): Obstacle | undefined {
    let best: Obstacle | undefined;
    for (const o of this.items) {
      if (!o.solid || !sameLane(o.lane, lane) || o.x < x || o.x > x + distance) continue;
      if (!best || o.x < best.x) best = o;
    }
    return best;
  }

  /** Lanes blocked by a solid obstacle (wrecks not counted) within `gap` px of x. */
  solidLanes(x: number, gap: number = OBSTACLES.rowGap): Set<number> {
    const out = new Set<number>();
    for (const o of this.items) if (o.solid && Math.abs(o.x - x) <= gap) out.add(o.lane);
    return out;
  }

  /**
   * Could something be put in `lane` at x without closing a row? Looks at the window around x and at
   * the window around every item near it, and none may block more than `OBSTACLES.maxBlocked` lanes.
   */
  canBlock(x: number, lane: number): boolean {
    const gap = OBSTACLES.rowGap;
    const items: { x: number; lane: number }[] = [];
    for (const o of this.items) if (o.solid && Math.abs(o.x - x) <= 2 * gap) items.push(o);
    for (const w of this.wrecks?.items ?? []) if (w.solid && Math.abs(w.x - x) <= 2 * gap) items.push(w);
    const window = (cx: number): Set<number> => new Set(items.filter((e) => Math.abs(e.x - cx) <= gap).map((e) => e.lane));
    const own = window(x).add(lane);
    if (own.size > OBSTACLES.maxBlocked) return false;
    for (const e of items) {
      if (Math.abs(e.x - x) > gap) continue;
      if (window(e.x).add(lane).size > OBSTACLES.maxBlocked) return false;
    }
    return true;
  }

  /** Lanes blocked (by an obstacle or a wreck) within `gap` px of x. */
  blockedLanes(x: number, gap: number = OBSTACLES.rowGap): Set<number> {
    const out = this.wrecks ? this.wrecks.blockedLanes(x, gap) : new Set<number>();
    for (const o of this.items) if (o.solid && Math.abs(o.x - x) <= gap) out.add(o.lane);
    return out;
  }

  /**
   * Tests a truck (at lane position `lane`) against the solid obstacles in its lane. A loose
   * obstacle is knocked off (so it is hit once) and takes a share of the truck's speed; a fixed one
   * stays, bounces the truck back and cannot hurt again for a moment. Either way the truck is pushed
   * out of the overlap. Returns the first hit that should be reported.
   */
  collide(truck: TruckPhysics, lane = 0): ObstacleHit | null {
    const circles = truckCircles(truck);
    for (const o of this.items) {
      if (!o.solid || !sameLane(o.lane, lane) || Math.abs(o.x - truck.x) > 220) continue;
      const c = deepestContact(circles, obstacleCircles(o));
      if (!c) continue;
      const spec = OBSTACLE_KINDS[o.kind];
      // Closing speed: the truck's velocity at the contact point, along the normal into the obstacle.
      const vpx = truck.vx - truck.angVel * (c.y - truck.y);
      const vpy = truck.vy + truck.angVel * (c.x - truck.x);
      const impact = Math.max(0, vpx * c.nx + vpy * c.ny);
      const push = Math.min(c.depth, COLLISION.maxPush);

      if (spec.loose) {
        // Applied near the truck's centre so it slows rather than spins.
        const k = spec.drag * impact;
        truck.applyImpulse(truck.x + (c.x - truck.x) * 0.35, truck.y + (c.y - truck.y) * 0.35, -k * c.nx, -k * c.ny);
        if (impact > 60) truck.vy -= COLLISION.wreckHop * 0.7;
        truck.translate(-c.nx * push, -c.ny * push);
        o.solid = false;
        o.hit = true;
        o.age = 0;
        o.vx = Math.max(truck.vx, 0) * 0.8 + 70;
        o.vy = -(200 + impact * 0.3);
        o.spin = (truck.vx >= 0 ? 1 : -1) * (4 + impact / 200);
        return { obstacle: o, impact, x: c.x, y: c.y };
      }

      // Fixed: always pushed out (so a truck never tunnels in), hurt only by a real, fresh hit.
      truck.translate(-c.nx * push, -c.ny * push);
      if (o.cool > 0 || impact < COLLISION.bumpSpeed) continue;
      o.cool = COLLISION.obstacleCooldown;
      o.hit = true;
      const j = impact * (1 + COLLISION.obstacleRestitution) * spec.drag;
      truck.applyImpulse(truck.x + (c.x - truck.x) * 0.5, truck.y + (c.y - truck.y) * 0.5, -j * c.nx, -j * c.ny);
      if (impact > 120) truck.vy -= COLLISION.wreckHop * 0.6;
      return { obstacle: o, impact, x: c.x, y: c.y };
    }
    return null;
  }

  /**
   * The player has just switched away from `fromLane` at world x: every fixed or loose obstacle close
   * ahead in that lane (and not yet hit) becomes a dodge candidate, paid out by `sweepDodged`.
   */
  markDodge(x: number, fromLane: number): void {
    for (const o of this.items) {
      if (!o.solid || o.hit || !sameLane(o.lane, fromLane)) continue;
      if (o.x >= x - OBSTACLES.dodgeBehind && o.x <= x + OBSTACLES.dodgeAhead) o.dodge = true;
    }
  }

  /** Dodge candidates the truck has now driven past without touching them (each is returned once). */
  sweepDodged(x: number): Obstacle[] {
    const out: Obstacle[] = [];
    for (const o of this.items) {
      if (!o.dodge || o.counted || o.hit || !o.solid) continue;
      if (o.x < x - OBSTACLES.passMargin) {
        o.counted = true;
        out.push(o);
      }
    }
    return out;
  }

  /** Cool down fixed obstacles, fly the debris, and drop debris that has faded. */
  update(dt: number): void {
    for (const o of this.items) {
      if (o.solid) {
        o.cool = Math.max(0, o.cool - dt);
        continue;
      }
      o.age += dt;
      o.vy += 1250 * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.angle += o.spin * dt;
      const floor = this.terrain.heightAt(o.x) - OBSTACLE_KINDS[o.kind].radius;
      if (o.y > floor && o.vy > 0) {
        o.y = floor;
        o.vy *= -0.3;
        o.vx *= 0.8;
        o.spin *= 0.7;
      }
    }
    this.items = this.items.filter((o) => o.solid || o.age < OBSTACLES.debrisLife);
  }

  prune(x: number): void {
    this.items = this.items.filter((o) => o.x > x - 2000);
  }

  /** Sit an obstacle on the ground (tilted to the slope), a little sunk in. */
  private settle(o: Obstacle): void {
    o.y = this.terrain.heightAt(o.x) - OBSTACLE_KINDS[o.kind].radius + 3;
    o.angle = Math.atan(this.terrain.slopeAt(o.x));
  }

  private chance(meters: number): number {
    if (meters < OBSTACLES.startMeters) return 0;
    const t = Math.min(1, (meters - OBSTACLES.startMeters) / OBSTACLES.rampMeters);
    return OBSTACLES.chanceMin + (OBSTACLES.chanceMax - OBSTACLES.chanceMin) * t;
  }

  private pickKind(meters: number, roll: number): ObstacleKind {
    const pool = OBSTACLE_LIST.filter((k) => meters >= OBSTACLE_KINDS[k].fromMeters);
    const total = pool.reduce((sum, k) => sum + OBSTACLE_KINDS[k].weight, 0);
    let r = roll * total;
    for (const k of pool) {
      r -= OBSTACLE_KINDS[k].weight;
      if (r < 0) return k;
    }
    return pool[pool.length - 1];
  }

  /** One row (one or two obstacles) on a flat or hilly chunk. */
  private rowFor(p: TerrainPiece): void {
    if (p.kind !== 'flat' && p.kind !== 'hills') return;
    const mid = (p.x0 + p.x1) / 2;
    // Always draw the same numbers, so the stream does not depend on the conditions below.
    const roll = this.rng.next();
    const jitter = this.rng.range(-60, 60);
    const pairRoll = this.rng.next();
    const kinds = [this.rng.next(), this.rng.next()];
    const lanes = [this.rng.next(), this.rng.next()];
    const sideJitter = this.rng.range(50, 110);

    const meters = (mid - this.startX) / PX_PER_METER;
    if (roll > this.chance(meters)) return;
    let x = mid + jitter;
    // Keep clear of the landing of any jump shortly before x (short chunks can follow a ramp).
    for (const q of this.terrain.pieces) {
      if (JUMP_KINDS.includes(q.kind) && q.x1 <= x && x - q.x1 < OBSTACLES.landingClear) x = q.x1 + OBSTACLES.landingClear;
    }
    if (x > p.x1 - 100 || x < p.x0 + 40) return;
    if (x - this.lastRowX < OBSTACLES.rowSpacing) return;

    const placed = this.placeOne(x, meters, kinds[0], lanes[0]);
    if (!placed) return;
    this.lastRowX = x;
    const t = Math.min(1, meters / OBSTACLES.rampMeters);
    const [pairMin, pairMax] = OBSTACLES.pairChance;
    if (pairRoll < pairMin + (pairMax - pairMin) * t) {
      const x2 = x + sideJitter;
      if (x2 < p.x1 - 60) this.placeOne(x2, meters, kinds[1], lanes[1]);
    }
  }

  /** Place an obstacle in a free lane of the row at x, unless that would block too many lanes. */
  private placeOne(x: number, meters: number, kindRoll: number, laneRoll: number): Obstacle | null {
    const free: number[] = [];
    for (let l = 0; l < LANES.count; l++) if (this.canBlock(x, l)) free.push(l);
    if (free.length === 0) return null;
    const lane = free[Math.min(free.length - 1, Math.floor(laneRoll * free.length))];
    const variant = Math.floor(kindRoll * 997) % 3;
    return this.addAt(this.pickKind(meters, kindRoll), x, lane, variant);
  }
}
