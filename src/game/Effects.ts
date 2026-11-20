import { FX } from '../config';
import type { Biome } from './Biomes';
import { ParticleSystem, type Particle, type ParticleKind } from './Particles';

/** Source of randomness in 0..1 (the scene passes Math.random, tests pass a seeded generator). */
export type Rand = () => number;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const between = (rand: Rand, lo: number, hi: number) => lo + (hi - lo) * rand();

function base(kind: ParticleKind, x: number, y: number, color: number): Particle {
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    r0: 3,
    r1: 3,
    color,
    alpha: 1,
    gravity: 0,
    drag: 0,
    rot: 0,
    spin: 0,
  };
}

/** Mud/dust particles per second thrown by one wheel on the ground at `speed` px/s. */
export function sprayRate(speed: number): number {
  const s = FX.spray;
  const t = clamp((Math.abs(speed) - s.minSpeed) / (s.fullSpeed - s.minSpeed), 0, 1);
  return t * s.perSecond;
}

/** Clods of mud (sand, slush) flung up and back by a wheel at (x, y), the contact point. */
export function emitMud(ps: ParticleSystem, rand: Rand, biome: Biome, x: number, y: number, vx: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = base('mud', x + between(rand, -8, 8), y - between(rand, 0, 6), biome.splash);
    p.vx = vx * between(rand, -0.15, 0.3) + between(rand, -50, 30);
    p.vy = -between(rand, 130, 120 + 0.45 * Math.abs(vx) + 60);
    p.life = between(rand, 0.5, 0.95);
    p.r0 = between(rand, 2, 4.5);
    p.r1 = p.r0 * 0.7;
    p.gravity = 1000;
    p.drag = 0.4;
    ps.emit(p);
  }
}

/** A puff of dust at (x, y) drifting back from a moving truck. */
export function emitDust(ps: ParticleSystem, rand: Rand, biome: Biome, x: number, y: number, vx: number, n: number, size = 1): void {
  for (let i = 0; i < n; i++) {
    const p = base('dust', x + between(rand, -10, 10), y - between(rand, 2, 10), biome.dust);
    p.vx = vx * between(rand, -0.1, 0.12) + between(rand, -40, 30);
    p.vy = -between(rand, 20, 70);
    p.life = between(rand, 0.5, 0.95);
    p.r0 = between(rand, 4, 7) * size;
    p.r1 = between(rand, 14, 22) * size;
    p.alpha = 0.5;
    p.gravity = -15;
    p.drag = 1.6;
    ps.emit(p);
  }
}

/** Wheels landing after air time: a dust ring and a spray of mud, bigger for longer jumps. */
export function emitLanding(ps: ParticleSystem, rand: Rand, biome: Biome, x: number, y: number, vx: number, airTime: number): void {
  const t = clamp(airTime / 1.2, 0, 1);
  const dust = Math.round(6 + 14 * t);
  const mud = Math.round(5 + 11 * t);
  emitDust(ps, rand, biome, x, y, vx, dust, 1 + 0.5 * t);
  emitMud(ps, rand, biome, x, y, vx, mud);
  for (let i = 0; i < dust / 2; i++) {
    // the ring: puffs shoved out sideways along the ground
    const p = base('dust', x + between(rand, -6, 6), y - 4, biome.dust);
    p.vx = (rand() < 0.5 ? -1 : 1) * between(rand, 90, 220);
    p.vy = -between(rand, 5, 30);
    p.life = between(rand, 0.4, 0.8);
    p.r0 = 5;
    p.r1 = between(rand, 12, 18);
    p.alpha = 0.45;
    p.drag = 2.4;
    ps.emit(p);
  }
}

/** Sparks, torn metal in the vehicle's paint colour, and smoke. `power` runs 0 (scrape) to 1 (wreck). */
export function emitCrash(ps: ParticleSystem, rand: Rand, x: number, y: number, power: number, paint: number): void {
  const k = clamp(power, 0, 1);
  const sparks = Math.round(6 + 18 * k);
  const chunks = Math.round(3 + 9 * k);
  const smoke = Math.round(3 + 5 * k);
  const spark = [0xffffff, 0xffe9a6, 0xffb347];
  const metal = [paint, paint, 0x2a2a2e, 0x8a8f99, 0xc9ced6];
  for (let i = 0; i < sparks; i++) {
    const a = rand() * Math.PI * 2;
    const v = between(rand, 160, 320 + 220 * k);
    const p = base('spark', x, y, spark[Math.floor(rand() * spark.length)]);
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - 80;
    p.life = between(rand, 0.18, 0.45);
    p.r0 = between(rand, 1.5, 2.5);
    p.r1 = p.r0;
    p.gravity = 700;
    p.drag = 0.8;
    ps.emit(p);
  }
  for (let i = 0; i < chunks; i++) {
    const a = rand() * Math.PI * 2;
    const v = between(rand, 90, 230 + 200 * k);
    const p = base('chunk', x, y, metal[Math.floor(rand() * metal.length)]);
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - 160;
    p.life = between(rand, 0.7, 1.3);
    p.r0 = between(rand, 3, 6);
    p.r1 = p.r0;
    p.gravity = 1100;
    p.drag = 0.3;
    p.rot = rand() * Math.PI * 2;
    p.spin = between(rand, -14, 14);
    ps.emit(p);
  }
  for (let i = 0; i < smoke; i++) emitSmoke(ps, rand, x + between(rand, -10, 10), y - 6, rand() < 0.5 ? 0x3a3a3e : 0x6e6e72);
}

/** One puff of engine smoke or burning wreck. */
export function emitSmoke(ps: ParticleSystem, rand: Rand, x: number, y: number, color: number): void {
  const p = base('smoke', x, y, color);
  p.vx = between(rand, 30, 60);
  p.vy = -between(rand, 50, 80);
  p.life = between(rand, 0.8, 1.2);
  p.r0 = 5;
  p.r1 = 16;
  p.alpha = 0.6;
  p.gravity = 40;
  ps.emit(p);
}
