import { COLLISION, PHYSICS } from '../config';
import type { TruckPhysics } from './TruckPhysics';

/** Pure collision maths (no Phaser): trucks are three circles, wrecks are two. */

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Contact {
  /** Unit normal pointing from shape A towards shape B. */
  nx: number;
  ny: number;
  /** Penetration depth (px, > 0). */
  depth: number;
  /** World point of contact, midway through the overlap. */
  x: number;
  y: number;
}

export interface TruckHit {
  /** Closing speed along the contact normal before the bump (px/s). */
  impact: number;
  x: number;
  y: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The truck's body circles in world space. */
export function truckCircles(t: TruckPhysics): Circle[] {
  const cos = Math.cos(t.angle);
  const sin = Math.sin(t.angle);
  return COLLISION.circles.map((c) => ({
    x: t.x + c.x * cos - c.y * sin,
    y: t.y + c.x * sin + c.y * cos,
    r: c.r,
  }));
}

/** The deepest overlapping pair of circles, or null. The normal points from `a` to `b`. */
export function deepestContact(a: readonly Circle[], b: readonly Circle[]): Contact | null {
  let best: Contact | null = null;
  for (const ca of a) {
    for (const cb of b) {
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const dist = Math.hypot(dx, dy);
      const depth = ca.r + cb.r - dist;
      if (depth <= 0 || (best && depth <= best.depth)) continue;
      // Concentric circles have no direction: call it "from above".
      const nx = dist > 1e-6 ? dx / dist : 0;
      const ny = dist > 1e-6 ? dy / dist : 1;
      best = {
        nx,
        ny,
        depth,
        x: ca.x + nx * (ca.r - depth / 2),
        y: ca.y + ny * (ca.r - depth / 2),
      };
    }
  }
  return best;
}

/** Damage (0..1) for a bump at `speed` px/s: free when soft, 10-25% when hard. */
export function damageForImpact(speed: number): number {
  if (speed < COLLISION.softSpeed) return 0;
  const t = clamp01((speed - COLLISION.softSpeed) / (COLLISION.hardSpeed - COLLISION.softSpeed));
  return COLLISION.minDamage + (COLLISION.maxDamage - COLLISION.minDamage) * t;
}

/**
 * Collides two trucks: separates them and swaps momentum with an impulse (equal masses).
 * Returns what happened, or null when they do not overlap. Safe to call every frame: trucks that
 * are already moving apart are only pushed out of each other, with no impulse.
 */
export function collideTrucks(a: TruckPhysics, b: TruckPhysics): TruckHit | null {
  const c = deepestContact(truckCircles(a), truckCircles(b));
  if (!c) return null;

  const rax = c.x - a.x;
  const ray = c.y - a.y;
  const rbx = c.x - b.x;
  const rby = c.y - b.y;
  const vax = a.vx - a.angVel * ray;
  const vay = a.vy + a.angVel * rax;
  const vbx = b.vx - b.angVel * rby;
  const vby = b.vy + b.angVel * rbx;
  const vn = (vbx - vax) * c.nx + (vby - vay) * c.ny;

  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    const raN = rax * c.ny - ray * c.nx;
    const rbN = rbx * c.ny - rby * c.nx;
    const invM = 1 / PHYSICS.mass;
    const denom = 2 * invM + (raN * raN + rbN * rbN) / PHYSICS.inertia;
    const j = (-(1 + COLLISION.restitution) * vn) / denom;
    a.applyImpulse(c.x, c.y, -j * c.nx, -j * c.ny);
    b.applyImpulse(c.x, c.y, j * c.nx, j * c.ny);
  }

  // Positional push-out, split evenly and capped so nothing teleports.
  const push = Math.min(c.depth / 2, COLLISION.maxPush);
  a.translate(-c.nx * push, -c.ny * push);
  b.translate(c.nx * push, c.ny * push);
  return { impact, x: c.x, y: c.y };
}
