import { FX } from '../config';

export type ParticleKind = 'dust' | 'smoke' | 'mud' | 'chunk' | 'spark';

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
}

/** Ground-hugging kinds: they land, bounce a little and splat. */
const HEAVY: readonly ParticleKind[] = ['mud', 'chunk'];

/** A capped pool of particles. When it is full the oldest particle is dropped. */
export class ParticleSystem {
  items: Particle[] = [];

  constructor(readonly max: number = FX.maxParticles) {}

  emit(p: Particle): void {
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
    this.items = this.items.filter((p) => p.age < p.life);
  }
}

/** Opacity of a particle right now (0..1 of its own alpha). */
export function particleFade(p: Particle): number {
  const k = Math.min(1, p.age / p.life);
  if (p.kind === 'mud' || p.kind === 'chunk') return k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  return 1 - k;
}

/** Radius of a particle right now. */
export function particleRadius(p: Particle): number {
  const k = Math.min(1, p.age / p.life);
  return p.r0 + (p.r1 - p.r0) * k;
}
