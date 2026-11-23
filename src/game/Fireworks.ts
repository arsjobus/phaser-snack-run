import { STUNT } from '../config';
import { ParticleSystem, type Particle, type ParticleKind } from './Particles';
import type { Rand } from './Effects';

/** 5x7 dot-matrix letters of the word the show spells (and the few more it can spell). */
export const SKY_FONT: Record<string, readonly string[]> = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
};

export const SKY_WORD = 'CRUNCH';

/** One dot of the lettering: where it hangs, and which letter (rocket) it belongs to. */
export interface SkyDot {
  x: number;
  y: number;
  letter: number;
}

/** The dots of `word`, centred on (cx, cy) in world px. */
export function skyDots(word: string, cx: number, cy: number, dot = STUNT.dot, advance = STUNT.letterAdvance): SkyDot[] {
  const out: SkyDot[] = [];
  const width = (word.length - 1) * advance + 4 * dot;
  [...word].forEach((ch, letter) => {
    const glyph = SKY_FONT[ch];
    if (!glyph) return;
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== '1') continue;
        out.push({ x: cx - width / 2 + letter * advance + gx * dot, y: cy + (gy - 3) * dot, letter });
      }
    });
  });
  return out;
}

const PALETTE = [0xff5a4a, 0xffd34d, 0x6fc4ff, 0x7dff8a, 0xffffff, 0xff9f45, 0xd98cff];
const between = (rand: Rand, lo: number, hi: number) => lo + (hi - lo) * rand();

function base(kind: ParticleKind, x: number, y: number, color: number): Particle {
  return { kind, x, y, vx: 0, vy: 0, age: 0, life: 1, r0: 3, r1: 3, color, alpha: 1, gravity: 0, drag: 0, rot: 0, spin: 0 };
}

/** A ring of sparks bursting from (x, y): the classic firework shell. */
export function emitBurst(ps: ParticleSystem, rand: Rand, x: number, y: number, color: number, n = 26, power = 1): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const v = between(rand, 170, 330) * power;
    const p = base('spark', x, y, rand() < 0.25 ? 0xffffff : color);
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.life = between(rand, 0.7, 1.2);
    p.r0 = p.r1 = 2;
    p.gravity = 260;
    p.drag = 1.7;
    ps.emit(p);
  }
}

/** A cold-spark fountain: `n` sparks leaving a nozzle at (x, y), straight up with a little spread. */
export function emitFountain(ps: ParticleSystem, rand: Rand, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = base('spark', x + between(rand, -3, 3), y, rand() < 0.4 ? 0xffffff : 0xffd98a);
    p.vx = between(rand, -90, 90);
    p.vy = -between(rand, 420, 760);
    p.life = between(rand, 0.6, 1.1);
    p.r0 = p.r1 = 2;
    p.gravity = 900;
    p.drag = 0.5;
    ps.emit(p);
  }
}

/** A puff of flame from a jet at (x, y). */
export function emitFlame(ps: ParticleSystem, rand: Rand, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = base('flame', x + between(rand, -6, 6), y, 0xffc233);
    p.vx = between(rand, -40, 40);
    p.vy = -between(rand, 260, 480);
    p.life = between(rand, 0.35, 0.65);
    p.r0 = between(rand, 9, 14);
    p.r1 = 2;
    p.gravity = -120;
    p.drag = 1.2;
    ps.emit(p);
  }
}

interface Rocket {
  /** Seconds after the start when it leaves the ground, and where from. */
  at: number;
  x: number;
  y: number;
  /** The letter it spells and its burst point. */
  letter: number;
  tx: number;
  ty: number;
  color: number;
  launched: boolean;
  burst: boolean;
}

/**
 * The CRUNCH fireworks: one rocket per letter climbs from the pit floor, bursts at the letter's
 * centre and its stars glide into the dots of the letter, which hang in the sky and twinkle; a
 * finale of shells follows. Pure TypeScript (particles only), driven by the scene each frame.
 */
export class SkyShow {
  time = 0;
  readonly rockets: Rocket[] = [];
  readonly dots: SkyDot[];
  /** Letters whose stars have been released so far. */
  lettersBurst = 0;
  /** True once everything has been released (the lettering then only fades). */
  done = false;
  private finale: { at: number; x: number; y: number; color: number }[] = [];

  constructor(
    private ps: ParticleSystem,
    private rand: Rand,
    /** Centre of the lettering and the ground below it. */
    readonly cx: number,
    readonly cy: number,
    readonly floorY: number,
    private onSound?: (what: 'rocket' | 'burst' | 'finale') => void,
    word: string = SKY_WORD,
  ) {
    this.dots = skyDots(word, cx, cy);
    const letters = new Set(this.dots.map((d) => d.letter)).size;
    for (let i = 0; i < letters; i++) {
      const mine = this.dots.filter((d) => d.letter === i);
      const lx = mine.reduce((s, d) => s + d.x, 0) / mine.length;
      this.rockets.push({
        at: i * STUNT.rocketGap,
        x: lx + between(rand, -40, 40),
        y: floorY,
        letter: i,
        tx: lx,
        ty: cy,
        color: PALETTE[i % PALETTE.length],
        launched: false,
        burst: false,
      });
    }
    const end = (letters - 1) * STUNT.rocketGap + STUNT.rocketClimb;
    for (let i = 0; i < 9; i++) {
      this.finale.push({
        at: end + 0.25 + i * 0.16,
        x: cx + between(rand, -300, 300),
        y: cy + between(rand, -150, 120),
        color: PALETTE[Math.floor(rand() * PALETTE.length)],
      });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const r of this.rockets) {
      if (!r.launched && this.time >= r.at) {
        r.launched = true;
        this.onSound?.('rocket');
      }
      if (!r.launched || r.burst) continue;
      const k = (this.time - r.at) / STUNT.rocketClimb;
      if (k >= 1) {
        r.burst = true;
        this.release(r);
        continue;
      }
      // Climb: eased so it slows towards the top, trailing sparks.
      const e = 1 - (1 - k) * (1 - k);
      const x = r.x + (r.tx - r.x) * e;
      const y = r.y + (r.ty - r.y) * e;
      const p = base('spark', x, y, 0xffe9a6);
      p.vx = between(this.rand, -30, 30);
      p.vy = between(this.rand, 40, 120);
      p.life = between(this.rand, 0.25, 0.5);
      p.r0 = p.r1 = 2;
      p.gravity = 200;
      this.ps.emit(p);
    }
    for (const f of this.finale) {
      if (this.time >= f.at && f.at >= 0) {
        emitBurst(this.ps, this.rand, f.x, f.y, f.color, 24, 0.9);
        this.onSound?.('finale');
        f.at = -1;
      }
    }
    this.done = this.rockets.every((r) => r.burst) && this.finale.every((f) => f.at < 0);
  }

  /** The rocket bursts: a shell of sparks plus the stars that become its letter. */
  private release(r: Rocket): void {
    this.lettersBurst++;
    this.onSound?.('burst');
    emitBurst(this.ps, this.rand, r.tx, r.ty, r.color, 22, 0.8);
    for (const d of this.dots) {
      if (d.letter !== r.letter) continue;
      const p = base('star', r.tx, r.ty, r.color === 0xffffff ? 0xffe9a6 : 0xffd34d);
      p.tx = d.x;
      p.ty = d.y;
      p.home = between(this.rand, 5, 8);
      p.life = STUNT.skyLife;
      p.r0 = p.r1 = 4.2;
      p.rot = this.rand() * 6.28;
      this.ps.emit(p);
    }
  }
}

/** Rocket exhaust streaming back from the tail of a surging truck at (x, y); `vx` is its speed. */
export function emitJet(ps: ParticleSystem, rand: Rand, x: number, y: number, vx: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = base('flame', x, y + between(rand, -5, 5), rand() < 0.3 ? 0xfff2a8 : 0xffa629);
    p.vx = -Math.abs(vx) * between(rand, 0.25, 0.5) - between(rand, 60, 160);
    p.vy = between(rand, -40, 40);
    p.life = between(rand, 0.18, 0.4);
    p.r0 = between(rand, 7, 11);
    p.r1 = 1.5;
    p.drag = 2;
    ps.emit(p);
  }
}
