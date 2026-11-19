import { describe, expect, it } from 'vitest';
import {
  BASE_Y,
  COLLISION,
  GAMEPLAY,
  PHYSICS,
  PX_PER_METER,
  RIVALS,
  SCORING,
  WRECKS,
  WRENCH,
} from '../src/config';
import { collideTrucks, damageForImpact, deepestContact } from '../src/game/Collision';
import { PickupField } from '../src/game/Pickups';
import { Race } from '../src/game/Race';
import { Rival } from '../src/game/Rival';
import { RunModel } from '../src/game/Run';
import { Terrain, JUMP_KINDS } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { WreckField } from '../src/game/Wrecks';

const START = GAMEPLAY.startX;
const DT = 1 / 60 / PHYSICS.substeps;
const GAS = { throttle: 1, brake: 0, lean: 0 };

/** Two settled trucks on flat ground, `gap` px between their centres, A moving at `va`. */
function pair(gap: number, va: number, vb = 0) {
  const terrain = new Terrain(1);
  const a = new TruckPhysics(START, BASE_Y - 42);
  const b = new TruckPhysics(START + gap, BASE_Y - 42);
  a.vx = va;
  b.vx = vb;
  return { terrain, a, b };
}

describe('Collision maths', () => {
  it('finds the deepest overlapping circles and ignores separated ones', () => {
    const hit = deepestContact([{ x: 0, y: 0, r: 10 }], [{ x: 15, y: 0, r: 10 }])!;
    expect(hit.depth).toBeCloseTo(5, 6);
    expect(hit.nx).toBeCloseTo(1, 6);
    expect(deepestContact([{ x: 0, y: 0, r: 10 }], [{ x: 25, y: 0, r: 10 }])).toBeNull();
  });

  it('is free below the soft speed and 10-25% above it, growing with speed', () => {
    expect(damageForImpact(COLLISION.softSpeed - 1)).toBe(0);
    expect(damageForImpact(COLLISION.softSpeed)).toBeCloseTo(COLLISION.minDamage, 6);
    expect(damageForImpact(COLLISION.hardSpeed)).toBeCloseTo(COLLISION.maxDamage, 6);
    expect(damageForImpact(99999)).toBeCloseTo(COLLISION.maxDamage, 6);
    expect(damageForImpact(350)).toBeGreaterThan(damageForImpact(250));
  });

  it('swaps momentum in a rear-end bump and pushes the trucks apart', () => {
    const { a, b } = pair(110, 600);
    const hit = collideTrucks(a, b)!;
    expect(hit.impact).toBeGreaterThan(400);
    expect(b.vx).toBeGreaterThan(300); // the stopped truck is shoved forward
    expect(a.vx).toBeLessThan(300); // the rammer loses speed
    expect(b.x - a.x).toBeGreaterThan(110);
    // Total momentum is conserved apart from the push-out, which does not touch velocity.
    expect(a.vx + b.vx).toBeCloseTo(600, 3);
  });

  it('does nothing to trucks that are apart, and no impulse when already separating', () => {
    const far = pair(400, 600);
    expect(collideTrucks(far.a, far.b)).toBeNull();
    const sep = pair(110, 0, 300); // overlapping but B is leaving
    const hit = collideTrucks(sep.a, sep.b)!;
    expect(hit.impact).toBe(0);
    expect(sep.b.vx).toBe(300);
  });
});

describe('Wrecks', () => {
  it('are placed deterministically, off jump landings, spaced out, and never change the terrain', () => {
    const make = () => {
      const t = new Terrain(11);
      const w = new WreckField(11, t, START);
      t.ensure(START + 5000 * PX_PER_METER);
      w.sync();
      return { t, w };
    };
    const a = make();
    const b = make();
    expect(a.w.items.map((x) => Math.round(x.x))).toEqual(b.w.items.map((x) => Math.round(x.x)));
    expect(a.w.items.length).toBeGreaterThan(5);
    const plain = new Terrain(11);
    plain.ensure(a.t.endX);
    for (let x = 0; x < plain.endX; x += 16) expect(plain.heightAt(x)).toBe(a.t.heightAt(x));

    const xs = a.w.items.map((w) => w.x).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(WRECKS.minSpacing);
    expect(xs[0]).toBeGreaterThan(START + WRECKS.startMeters * PX_PER_METER - 100);
    for (const w of a.w.items) {
      const prev = a.t.pieces.find((p) => JUMP_KINDS.includes(p.kind) && w.x > p.x1 && w.x - p.x1 < WRECKS.landingClear - 1);
      expect(prev).toBeUndefined();
    }
  });

  it('are hit once: the truck pays in speed, the wreck is flung off as debris and fades', () => {
    const t = new Terrain(1);
    const field = new WreckField(1, t, START);
    const wreck = field.addFromRival(START + 300, 0, 0, 0, false);
    const truck = new TruckPhysics(START + 300 - 90, BASE_Y - 42);
    truck.vx = 700;
    let hit = null;
    for (let i = 0; i < 40 && !hit; i++) {
      truck.step(DT * 4, GAS, t);
      hit = field.collide(truck);
    }
    expect(hit).not.toBeNull();
    expect(hit!.impact).toBeGreaterThan(300);
    expect(truck.vx).toBeLessThan(700);
    expect(wreck.solid).toBe(false);
    expect(field.collide(truck)).toBeNull(); // never hit twice
    for (let i = 0; i < 120; i++) field.update(1 / 60);
    expect(field.items).not.toContain(wreck);
  });

  it('can be creeped into without damage (a soft bump) and never trap the truck', () => {
    const t = new Terrain(1);
    const field = new WreckField(1, t, START);
    field.addFromRival(START + 200, 0, 1, 0, false);
    const truck = new TruckPhysics(START + 60, BASE_Y - 42);
    let hit = null;
    for (let i = 0; i < 2400 && !hit; i++) {
      truck.step(DT, { throttle: truck.vx < 80 ? 1 : 0, brake: 0, lean: 0 }, t);
      if (i % 4 === 0) hit = field.collide(truck);
    }
    expect(hit).not.toBeNull();
    expect(damageForImpact(hit!.impact)).toBe(0);
    for (let i = 0; i < 600; i++) truck.step(DT, GAS, t);
    expect(truck.x).toBeGreaterThan(START + 260); // drove on through
  });

  it('far-lane wrecks are scenery only', () => {
    const t = new Terrain(1);
    const field = new WreckField(1, t, START);
    const w = field.addFromRival(START + 100, 0, 0, 0, true);
    const truck = new TruckPhysics(START + 100, BASE_Y - 42);
    expect(field.collide(truck)).toBeNull();
    expect(w.solid).toBe(true);
    expect(field.near(START + 100, 50)).toBeUndefined();
    expect(field.ahead(START, 500)).toBeUndefined();
  });
});

describe('Wrenches', () => {
  it('are placed on a schedule, on the ground, away from jumps, cans and wrecks', () => {
    const t = new Terrain(5);
    const wrecks = new WreckField(5, t, START);
    const f = new PickupField(5, t, START, wrecks);
    f.ensure(START + 4000 * PX_PER_METER);
    const wrenches = f.items.filter((p) => p.kind === 'wrench');
    expect(wrenches.length).toBeGreaterThan(3);
    expect(wrenches[0].x).toBeGreaterThanOrEqual(START + WRENCH.firstMeters * PX_PER_METER);
    for (const w of wrenches) {
      expect(t.heightAt(w.x) - w.y).toBeCloseTo(WRENCH.hover, 3);
      expect(t.pieces.some((p) => JUMP_KINDS.includes(p.kind) && w.x > p.x0 && w.x < p.x1)).toBe(false);
      expect(f.fuelXs.some((x) => Math.abs(x - w.x) < WRENCH.clearance - 1)).toBe(false);
      expect(wrecks.near(w.x, WRENCH.clearance - 1)).toBeUndefined();
    }
  });

  it('keep snacks and cans off roadside wrecks', () => {
    const t = new Terrain(8);
    const wrecks = new WreckField(8, t, START);
    const f = new PickupField(8, t, START, wrecks);
    f.ensure(START + 4000 * PX_PER_METER);
    expect(wrecks.items.length).toBeGreaterThan(5);
    for (const w of wrecks.items) {
      const bad = f.items.filter((p) => p.kind !== 'wrench' && Math.abs(p.x - w.x) < 70 && t.heightAt(p.x) - p.y < 60);
      expect(bad).toEqual([]);
    }
  });

  it('repair damage, and missing one does not break the combo', () => {
    const t = new Terrain(1);
    const run = new RunModel(1, t, START);
    run.hurt(0.5);
    run.pickups.ensure(START + 600 * PX_PER_METER);
    const wrench = run.pickups.items.find((p) => p.kind === 'wrench')!;
    const ev = run.update(1 / 60, { x: wrench.x, y: wrench.y, speed: 400 });
    const e = ev.find((v) => v.type === 'wrench');
    expect(e).toBeTruthy();
    expect(run.damage.level).toBeCloseTo(0.5 - WRENCH.restore, 6);

    const run2 = new RunModel(2, new Terrain(2), START);
    run2.pickups.ensure(START + 600 * PX_PER_METER);
    run2.score.chain = 5;
    const w2 = run2.pickups.items.find((p) => p.kind === 'wrench')!;
    w2.missed = false;
    run2.pickups.items = [w2];
    run2.update(1 / 60, { x: w2.x + 500, y: BASE_Y - 5000, speed: 400 });
    expect(w2.missed).toBe(true);
    expect(run2.score.chain).toBe(5);
  });

  it('takedowns pay BONUS and are counted', () => {
    const run = new RunModel(1, new Terrain(1), START);
    expect(run.takedown()).toBe(SCORING.takedown);
    expect(run.score.takedowns).toBe(1);
    expect(run.score.bonus).toBe(SCORING.takedown);
  });
});

describe('Rivals and the race', () => {
  function setup(seed = 1) {
    const terrain = new Terrain(seed);
    const run = new RunModel(seed, terrain, START);
    const race = new Race(seed, terrain, run.wrecks, START);
    const player = new TruckPhysics(START, BASE_Y - 45);
    return { terrain, run, race, player };
  }

  /** Step player-less physics and the race for `seconds`. */
  function drive(s: ReturnType<typeof setup>, seconds: number, input = GAS) {
    const events = [];
    for (let f = 0; f < 60 * seconds; f++) {
      for (let i = 0; i < PHYSICS.substeps; i++) {
        s.terrain.ensure(s.player.x + 3000);
        s.player.step(DT, input, s.terrain);
        s.race.stepPhysics(DT);
      }
      events.push(...s.race.update(1 / 60, s.player, Math.max(0, (s.player.x - START) / PX_PER_METER)));
    }
    return events;
  }

  it('starts with a grid ahead of the line, and the field grows with distance up to the cap', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    expect(s.race.rivals.length).toBe(RIVALS.grid.length);
    for (const r of s.race.rivals) expect(r.truck.x).toBeGreaterThan(START);
    expect(s.race.wanted(0)).toBe(1);
    expect(s.race.wanted(1600)).toBe(3);
    expect(s.race.wanted(99999)).toBe(RIVALS.max);
  });

  it('rivals have distinct liveries and numbers', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    expect(new Set(s.race.rivals.map((r) => r.style)).size).toBe(s.race.rivals.length);
    expect(new Set(s.race.rivals.map((r) => r.number)).size).toBe(s.race.rivals.length);
  });

  it('rubber-bands: a rival behind the player targets a higher speed than one far ahead', () => {
    const r = new Rival(1, 0, 1000, 400, 0.5, 0.5);
    expect(r.targetSpeed(3000)).toBeGreaterThan(r.targetSpeed(-3000));
    expect(r.targetSpeed(-3000)).toBeGreaterThanOrEqual(RIVALS.floorSpeed);
    expect(r.targetSpeed(3000)).toBeLessThanOrEqual(PHYSICS.topSpeed);
  });

  it('only collide with the player in the player\'s lane', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    const r = s.race.rivals[0];
    r.truck.reset(START + 100, BASE_Y - 42);
    s.player.vx = 600;
    r.lane = 1;
    r.laneBlend = 1;
    r.laneTimer = 99;
    const far = s.race.update(1 / 60, s.player, 0);
    expect(far.some((e) => e.type === 'bump')).toBe(false);

    r.lane = 0;
    r.laneBlend = 0;
    const near = s.race.update(1 / 60, s.player, 0);
    const bump = near.find((e) => e.type === 'bump');
    expect(bump).toBeTruthy();
    expect(bump!.type === 'bump' && bump!.damage).toBeGreaterThan(0);
  });

  it('a rival never drops into the player\'s lane right in front of the truck', () => {
    for (const seed of [1, 2, 3]) {
      const s = setup(seed);
      for (let f = 0; f < 60 * 120; f++) {
        for (let i = 0; i < PHYSICS.substeps; i++) {
          s.terrain.ensure(s.player.x + 3000);
          s.player.step(DT, GAS, s.terrain);
          s.race.stepPhysics(DT);
        }
        const before = new Map(s.race.rivals.map((r) => [r.id, r.lane]));
        s.race.update(1 / 60, s.player, Math.max(0, (s.player.x - START) / PX_PER_METER));
        for (const r of s.race.rivals) {
          if (before.get(r.id) === 1 && r.lane === 0) {
            const dx = r.truck.x - s.player.x;
            expect(Math.abs(dx)).toBeGreaterThan(RIVALS.laneGap);
            if (dx > 0) expect(dx).toBeGreaterThan(RIVALS.warnGap);
          }
        }
      }
    }
  });

  it('builds a slipstream boost behind a rival and fades it after', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.laneTimer = 99;
    r.lane = 0;
    r.laneBlend = 0;
    r.truck.reset(START + 400, BASE_Y - 42);
    r.truck.vx = 600;
    s.player.reset(START + 150, BASE_Y - 42);
    s.player.vx = 600;
    const frame = () => {
      r.truck.vx = 600;
      s.player.vx = 600;
      r.truck.x = s.player.x + 250;
      r.truck.vy = s.player.vy = 0;
      s.race.update(1 / 60, s.player, 0);
    };
    for (let i = 0; i < 90; i++) frame();
    expect(s.race.drafting).toBe(true);
    expect(s.race.draft).toBe(1);
    expect(s.player.boost).toBe(1);
    r.lane = 1;
    r.laneBlend = 1;
    for (let i = 0; i < 60; i++) frame();
    expect(s.race.draft).toBe(0);
  });

  it('boost raises top speed and acceleration without changing the un-boosted truck', () => {
    const terrain = new Terrain(1);
    const plain = new TruckPhysics(START, BASE_Y - 45);
    const boosted = new TruckPhysics(START, BASE_Y - 45);
    boosted.boost = 1;
    for (let i = 0; i < 60 * 12 * PHYSICS.substeps; i++) {
      terrain.ensure(plain.x + 2000);
      plain.step(DT, GAS, terrain);
      boosted.step(DT, GAS, terrain);
    }
    expect(boosted.speed).toBeGreaterThan(plain.speed + 40);
  });

  it('ranks the player among the live rivals', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    expect(s.race.position(START)).toEqual({ place: 3, of: 3 });
    expect(s.race.position(START + 10000)).toEqual({ place: 1, of: 3 });
  });

  it('wrecks a rival that has had enough, and credits a takedown only if you rammed it', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    const [a, b] = s.race.rivals;
    a.damage = 1;
    a.lastPlayerHit = s.race.time - 1;
    b.damage = 1;
    const ev = s.race.update(1 / 60, s.player, 0);
    expect(ev.filter((e) => e.type === 'wrecked')).toHaveLength(2);
    const takedowns = ev.filter((e) => e.type === 'takedown');
    expect(takedowns).toHaveLength(1);
    expect(takedowns[0].type === 'takedown' && takedowns[0].rivalId).toBe(a.id);
    expect(s.run.wrecks.items.filter((w) => w.fresh)).toHaveLength(2);
    expect(s.race.rivals).not.toContain(a);
  });

  it('a rival stuck on its roof becomes a wreck', () => {
    const s = setup();
    s.race.update(1 / 60, s.player, 0);
    const r = s.race.rivals[0];
    r.truck.angle = Math.PI;
    r.truck.vx = 0;
    const ev = drive(s, RIVALS.flipWreckTime + 1, { throttle: 0, brake: 0, lean: 0 });
    expect(ev.some((e) => e.type === 'wrecked' && e.rivalId === r.id)).toBe(true);
  });

  it('simulates a long mixed run without NaNs, with bounded rival counts and real bumps', () => {
    let bumps = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = setup(seed);
      const ev = drive(s, 90);
      for (const e of ev) if (e.type === 'bump') bumps++;
      expect(Number.isFinite(s.player.x + s.player.y)).toBe(true);
      for (const r of s.race.rivals) expect(Number.isFinite(r.truck.x + r.truck.y + r.truck.angle)).toBe(true);
      expect(s.race.rivals.length).toBeLessThanOrEqual(RIVALS.max);
    }
    expect(bumps).toBeGreaterThan(0);
  });
});
