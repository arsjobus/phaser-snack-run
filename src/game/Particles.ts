import { FX } from '../config';

export type ParticleKind = 'dust' | 'smoke' | 'mud' | 'chunk' | 'spark' | 'flame' | 'star';

/** One short-lived particle. Plain data so the whole system is testable without Phaser. */
export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  /** Radius at birth and at death (chunks and sparks use r0 as their size). */
  r0: number;
  r1: number;
  color: number;
  alpha: number;
  /** px/s^2 (negative rises). */
  gravity: number;
  /** Horizontal air drag, per second. */
  drag: number;
  rot: number;
  spin: number;
  /** Homing (fireworks lettering): the point to glide to and how fast (1/s); 0 or unset = free flight. */
  tx?: number;
  ty?: number;
  home?: number;
}

/** Ground-hugging kinds: they land, bounce a little and splat. */
const HEAVY: readonly ParticleKind[] = ['mud', 'chunk'];

/** A capped pool of particles. When it is full the oldest particle is dropped. */
export class ParticleSystem {
  items: Particle[] = [];
  /** Share (0..1) of emitted particles that are kept: the effects quality and reduced motion thin the spray. */
  density = 1;

  constructor(readonly max: number = FX.maxParticles) {}

  emit(p: Particle): void {
    if (this.density < 1 && Math.random() >= this.density) return;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(p);
  }

  clear(): void {
    this.items = [];
  }

  /** Advance everything. `groundAt` lets mud and chunks land on the terrain. */
  update(dt: number, groundAt?: (x: number) => number): void {
    for (const p of this.items) {
      p.age += dt;
      if (p.home && p.tx !== undefined && p.ty !== undefined) {
        // Glide to the target, exactly and at any frame rate.
        const k = 1 - Math.exp(-p.home * dt);
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        continue;
      }
      p.vx -= p.vx * Math.min(1, p.drag * dt);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (groundAt && p.vy > 0 && HEAVY.includes(p.kind)) {
        const gy = groundAt(p.x);
        if (p.y >= gy) {
          p.y = gy;
          if (p.vy < 70) {
            p.age = p.life; // came to rest: gone
          } else {
            p.vy = -p.vy * 0.35;
            p.vx *= 0.6;
            p.spin *= 0.5;
          }
        }
      }
    }
    // Drop the dead in place (no new array every frame).
    let n = 0;
    for (const p of this.items) if (p.age < p.life) this.items[n++] = p;
    this.items.length = n;
  }
}

/** Opacity of a particle right now (0..1 of its own alpha). */
export function particleFade(p: Particle): number {
  const k = Math.min(1, p.age / p.life);
  if (p.kind === 'mud' || p.kind === 'chunk' || p.kind === 'star') return k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  return 1 - k;
}

/** Radius of a particle right now. */
export function particleRadius(p: Particle): number {
  const k = Math.min(1, p.age / p.life);
  return p.r0 + (p.r1 - p.r0) * k;
}
