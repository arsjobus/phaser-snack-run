import { describe, expect, it } from 'vitest';
import { BIOMES, FX, GAMEPLAY, PX_PER_METER } from '../src/config';
import {
  BIOME_LIST,
  backdropKey,
  biomeAtMeters,
  biomeAtX,
  biomeChangesAt,
  biomeSegments,
  checkpointsPassedAt,
} from '../src/game/Biomes';
import { checkpointMeters } from '../src/game/Checkpoint';
import {
  emitCrash,
  emitDust,
  emitLanding,
  emitMud,
  sprayRate,
} from '../src/game/Effects';
import { ParticleSystem, particleFade, particleRadius } from '../src/game/Particles';
import { RIVAL_STYLES } from '../src/game/Rival';
import { Rng } from '../src/game/Rng';
import { rotationFrame } from '../src/game/Rotation';
import { TrackMarks } from '../src/game/TrackMarks';

const startX = GAMEPLAY.startX;
const rand = () => {
  const r = new Rng(7);
  return () => r.next();
};

describe('biomes', () => {
  it('starts in the forest and rotates every few checkpoints', () => {
    const per = BIOMES.checkpointsPer;
    expect(biomeAtMeters(0).id).toBe('forest');
    expect(biomeAtMeters(checkpointMeters(per) - 0.5).id).toBe('forest');
    expect(biomeAtMeters(checkpointMeters(per)).id).toBe('desert');
    expect(biomeAtMeters(checkpointMeters(per * 2)).id).toBe('snow');
    expect(biomeAtMeters(checkpointMeters(per * 3)).id).toBe('swamp');
    expect(biomeAtMeters(checkpointMeters(per * 4)).id).toBe('forest');
  });

  it('counts checkpoints passed', () => {
    expect(checkpointsPassedAt(0)).toBe(0);
    expect(checkpointsPassedAt(checkpointMeters(3))).toBe(3);
    expect(checkpointsPassedAt(checkpointMeters(3) - 0.01)).toBe(2);
  });

  it('reports the biome that begins at a checkpoint', () => {
    const per = BIOMES.checkpointsPer;
    expect(biomeChangesAt(1)).toBeNull();
    expect(biomeChangesAt(per)?.id).toBe('desert');
    expect(biomeChangesAt(per + 1)).toBeNull();
    expect(biomeChangesAt(per * 4)?.id).toBe('forest');
  });

  it('looks biomes up by world x', () => {
    const gate = startX + checkpointMeters(BIOMES.checkpointsPer) * PX_PER_METER;
    expect(biomeAtX(gate - 1, startX).id).toBe('forest');
    expect(biomeAtX(gate + 1, startX).id).toBe('desert');
  });

  it('splits a span at the gates, contiguously', () => {
    const gate = startX + checkpointMeters(BIOMES.checkpointsPer) * PX_PER_METER;
    const segs = biomeSegments(gate - 500, gate + 700, startX);
    expect(segs.map((s) => s.biome.id)).toEqual(['forest', 'desert']);
    expect(segs[0].x0).toBe(gate - 500);
    expect(segs[0].x1).toBe(gate);
    expect(segs[1].x0).toBe(gate);
    expect(segs[1].x1).toBe(gate + 700);
  });

  it('merges neighbouring checkpoints of the same biome into one segment', () => {
    const far = startX + checkpointMeters(BIOMES.checkpointsPer * 2 + 1) * PX_PER_METER;
    const segs = biomeSegments(startX, far, startX);
    expect(segs.map((s) => s.biome.id)).toEqual(['forest', 'desert', 'snow']);
    for (let i = 1; i < segs.length; i++) expect(segs[i].x0).toBe(segs[i - 1].x1);
  });

  it('gives every biome a distinct palette and texture keys', () => {
    expect(new Set(BIOME_LIST.map((b) => b.id)).size).toBe(BIOME_LIST.length);
    expect(new Set(BIOME_LIST.map((b) => b.ground.crust)).size).toBe(BIOME_LIST.length);
    expect(backdropKey('trees', 'swamp')).toBe('trees_swamp');
  });
});

describe('rotation frames', () => {
  it('picks the nearest frame and wraps', () => {
    expect(rotationFrame(0, 32)).toBe(0);
    expect(rotationFrame(Math.PI, 32)).toBe(16);
    expect(rotationFrame(Math.PI * 2, 32)).toBe(0);
    expect(rotationFrame(-Math.PI / 16, 32)).toBe(31);
    expect(rotationFrame(0.01, 32)).toBe(0);
    expect(rotationFrame(Math.PI / 16 + 0.001, 32)).toBe(1);
  });

  it('always stays in range', () => {
    for (let a = -20; a < 20; a += 0.37) {
      const f = rotationFrame(a, 24);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(24);
    }
  });
});

describe('truck set', () => {
  it('has 4 to 6 distinct rival styles with sane tires', () => {
    expect(RIVAL_STYLES.length).toBeGreaterThanOrEqual(4);
    expect(RIVAL_STYLES.length).toBeLessThanOrEqual(6);
    expect(new Set(RIVAL_STYLES.map((s) => s.number)).size).toBe(RIVAL_STYLES.length);
    expect(new Set(RIVAL_STYLES.map((s) => s.kind)).size).toBe(RIVAL_STYLES.length);
    for (const s of RIVAL_STYLES) {
      expect(s.wheel).toBeGreaterThan(0.8);
      expect(s.wheel).toBeLessThan(1.4);
    }
  });
});

describe('particles', () => {
  const make = (over = {}) => ({
    kind: 'dust' as const,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    r0: 2,
    r1: 10,
    color: 0,
    alpha: 1,
    gravity: 0,
    drag: 0,
    rot: 0,
    spin: 0,
    ...over,
  });

  it('caps the pool by dropping the oldest', () => {
    const ps = new ParticleSystem(3);
    for (let i = 0; i < 5; i++) ps.emit(make({ x: i }));
    expect(ps.items.map((p) => p.x)).toEqual([2, 3, 4]);
  });

  it('ages, moves and expires particles', () => {
    const ps = new ParticleSystem();
    ps.emit(make({ vx: 10, gravity: 100, life: 0.5 }));
    ps.update(0.25);
    expect(ps.items[0].x).toBeCloseTo(2.5);
    expect(ps.items[0].vy).toBeCloseTo(25);
    ps.update(0.3);
    expect(ps.items).toHaveLength(0);
  });

  it('lands mud on the ground: bounces when fast, dies when slow', () => {
    const ps = new ParticleSystem();
    ps.emit(make({ kind: 'mud', y: 99, vy: 300, life: 5 }));
    ps.update(0.02, () => 100);
    expect(ps.items[0].y).toBe(100);
    expect(ps.items[0].vy).toBeLessThan(0);
    ps.items[0].vy = 20;
    ps.items[0].y = 99.9;
    ps.update(0.02, () => 100);
    expect(ps.items).toHaveLength(0);
  });

  it('fades and grows over its life', () => {
    const p = make({ age: 0.5 });
    expect(particleFade(p)).toBeCloseTo(0.5);
    expect(particleRadius(p)).toBeCloseTo(6);
    expect(particleFade(make({ kind: 'mud', age: 0.5 }))).toBe(1);
  });
});

describe('effects', () => {
  it('sprays nothing when slow, more when fast, capped', () => {
    expect(sprayRate(0)).toBe(0);
    expect(sprayRate(FX.spray.minSpeed)).toBe(0);
    expect(sprayRate(500)).toBeGreaterThan(0);
    expect(sprayRate(500)).toBeLessThan(sprayRate(700));
    expect(sprayRate(5000)).toBe(FX.spray.perSecond);
    expect(sprayRate(-5000)).toBe(FX.spray.perSecond);
  });

  it('colours mud and dust by biome', () => {
    const ps = new ParticleSystem();
    const snow = BIOME_LIST[2];
    emitMud(ps, rand(), snow, 0, 0, 500, 5);
    emitDust(ps, rand(), snow, 0, 0, 500, 3);
    expect(ps.items.filter((p) => p.kind === 'mud').every((p) => p.color === snow.splash)).toBe(true);
    expect(ps.items.filter((p) => p.kind === 'dust').every((p) => p.color === snow.dust)).toBe(true);
    expect(ps.items.filter((p) => p.kind === 'mud').every((p) => p.vy < 0)).toBe(true);
  });

  it('makes bigger landings and crashes for bigger events', () => {
    const count = (fn: (ps: ParticleSystem) => void) => {
      const ps = new ParticleSystem(1000);
      fn(ps);
      return ps.items.length;
    };
    const f = BIOME_LIST[0];
    expect(count((ps) => emitLanding(ps, rand(), f, 0, 0, 300, 1.2))).toBeGreaterThan(
      count((ps) => emitLanding(ps, rand(), f, 0, 0, 300, 0.2)),
    );
    expect(count((ps) => emitCrash(ps, rand(), 0, 0, 1, 0xff0000))).toBeGreaterThan(
      count((ps) => emitCrash(ps, rand(), 0, 0, 0, 0xff0000)),
    );
  });

  it('crash debris includes sparks and paint-coloured chunks', () => {
    const ps = new ParticleSystem(1000);
    emitCrash(ps, rand(), 0, 0, 1, 0x123456);
    expect(ps.items.some((p) => p.kind === 'spark')).toBe(true);
    expect(ps.items.some((p) => p.kind === 'chunk' && p.color === 0x123456)).toBe(true);
  });
});

describe('tire tracks', () => {
  it('lays segments while rolling and breaks the line in the air', () => {
    const t = new TrackMarks();
    for (let x = 0; x <= 60; x += 6) t.add('a', x, true, 1);
    const n = t.segments.length;
    expect(n).toBeGreaterThan(2);
    t.add('a', 66, false, 1); // airborne
    t.add('a', 72, true, 1); // lands: starts a new line, no segment across the gap
    t.add('a', 72 + FX.tracks.spacing, true, 1);
    expect(t.segments.length).toBe(n + 1);
    expect(t.segments[n].x0).toBe(72);
  });

  it('does not join across a large jump', () => {
    const t = new TrackMarks();
    t.add('a', 0, true, 1);
    t.add('a', FX.tracks.maxGap + 50, true, 1);
    expect(t.segments).toHaveLength(0);
  });

  it('keeps wheels separate, culls and caps', () => {
    const t = new TrackMarks();
    t.add('a', 0, true, 1);
    t.add('b', 500, true, 2);
    t.add('a', 20, true, 1);
    t.add('b', 520, true, 2);
    expect(t.segments.map((s) => s.color)).toEqual([1, 2]);
    t.cull(100);
    expect(t.segments.map((s) => s.color)).toEqual([2]);
    for (let x = 0; x < (FX.tracks.max + 50) * FX.tracks.spacing; x += FX.tracks.spacing) t.add('c', x, true, 3);
    expect(t.segments.length).toBeLessThanOrEqual(FX.tracks.max);
  });
});
