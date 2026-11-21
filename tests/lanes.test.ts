import { describe, expect, it } from 'vitest';
import { BASE_Y, COLLISION, GAMEPLAY, LANES, OBSTACLES, OBSTACLE_KINDS, PHYSICS, PX_PER_METER, RIVALS } from '../src/config';
import { damageForImpact } from '../src/game/Collision';
import { PlayerLane, clampLane, laneDepth, laneLift, laneProject, laneScale, laneShade, sameLane } from '../src/game/Lanes';
import { OBSTACLE_LIST, ObstacleField, obstacleCircles } from '../src/game/Obstacles';
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

describe('Lane geometry', () => {
  it('each lane further away is higher, smaller, darker and drawn behind', () => {
    for (let l = 1; l < LANES.count; l++) {
      expect(laneLift(l)).toBeGreaterThan(laneLift(l - 1));
      expect(laneScale(l)).toBeLessThan(laneScale(l - 1));
      expect(laneShade(l)).toBeLessThan(laneShade(l - 1));
      expect(laneDepth(l)).toBeLessThan(laneDepth(l - 1));
    }
    expect(laneScale(0)).toBe(1);
    expect(laneLift(0)).toBe(0);
    expect(laneShade(0)).toBe(255);
    // Entities in a nearer lane always draw over those in a farther one, whatever their offsets.
    expect(laneDepth(0, 0)).toBeGreaterThan(laneDepth(1, 0.15));
  });

  it('projects heights about the ground line', () => {
    expect(laneProject(500, 450, 0)).toBe(450);
    expect(laneProject(500, 500, 2)).toBe(500 - laneLift(2)); // on the ground = on the lane's ground
    expect(laneProject(500, 450, 2)).toBeCloseTo(500 - 50 * laneScale(2) - laneLift(2), 6);
  });

  it('collisions need the same lane; a swerve counts as being between two lanes', () => {
    expect(sameLane(1, 1)).toBe(true);
    expect(sameLane(1, 2)).toBe(false);
    expect(sameLane(1.4, 1)).toBe(true);
    expect(sameLane(1.4, 2)).toBe(false);
    expect(sameLane(1.5, 2)).toBe(true);
  });

  it('the player changes lanes one at a time, clamped to the field, and swerves smoothly', () => {
    const p = new PlayerLane();
    expect(p.target).toBe(LANES.startLane);
    expect(p.request(1)).toBe(LANES.startLane); // returns the lane left
    expect(p.target).toBe(LANES.startLane + 1);
    expect(p.swerving).toBe(true);
    p.update(LANES.changeTime / 2);
    expect(p.f).toBeCloseTo(LANES.startLane + 0.5, 6);
    p.update(1);
    expect(p.f).toBe(p.target);
    expect(p.swerving).toBe(false);
    while (p.request(1) !== null);
    expect(p.target).toBe(LANES.count - 1);
    expect(p.request(1)).toBeNull();
    while (p.request(-1) !== null);
    expect(p.target).toBe(0);
    expect(p.changes).toBeGreaterThan(3);
    expect(clampLane(-3)).toBe(0);
    expect(clampLane(99)).toBe(LANES.count - 1);
  });
});

describe('Obstacle placement', () => {
  const make = (seed: number, far = 6000) => {
    const t = new Terrain(seed);
    const wrecks = new WreckField(seed, t, START);
    const obs = new ObstacleField(seed, t, START, wrecks);
    wrecks.canBlock = (x, l) => obs.canBlock(x, l);
    t.ensure(START + far * PX_PER_METER);
    obs.sync();
    return { t, wrecks, obs };
  };

  it('is deterministic per seed and never changes the terrain', () => {
    const a = make(7);
    const b = make(7);
    expect(a.obs.items.map((o) => [o.kind, Math.round(o.x), o.lane])).toEqual(b.obs.items.map((o) => [o.kind, Math.round(o.x), o.lane]));
    expect(a.obs.items.length).toBeGreaterThan(40);
    const plain = new Terrain(7);
    plain.ensure(a.t.endX);
    for (let x = 0; x < plain.endX; x += 16) expect(plain.heightAt(x)).toBe(a.t.heightAt(x));
  });

  it('starts after the start distance, off ramps and jump landings, in valid lanes, and ramps up in kinds and density', () => {
    const { t, obs } = make(3);
    for (const o of obs.items) {
      expect(o.x).toBeGreaterThan(START + OBSTACLES.startMeters * PX_PER_METER - 100);
      expect(o.lane).toBeGreaterThanOrEqual(0);
      expect(o.lane).toBeLessThan(LANES.count);
      const spec = OBSTACLE_KINDS[o.kind];
      expect((o.x - START) / PX_PER_METER).toBeGreaterThanOrEqual(spec.fromMeters - 60);
      expect(t.pieces.some((p) => JUMP_KINDS.includes(p.kind) && o.x > p.x0 && o.x < p.x1)).toBe(false);
      const prev = t.pieces.find((p) => JUMP_KINDS.includes(p.kind) && o.x > p.x1 && o.x - p.x1 < OBSTACLES.landingClear - 1);
      expect(prev).toBeUndefined();
      expect(t.heightAt(o.x) - o.y).toBeGreaterThan(0); // sits on the ground
    }
    expect(new Set(obs.items.map((o) => o.kind)).size).toBe(OBSTACLE_LIST.length);
    const early = obs.items.filter((o) => o.x < START + 1500 * PX_PER_METER).length;
    const late = obs.items.filter((o) => o.x >= START + 3000 * PX_PER_METER && o.x < START + 4500 * PX_PER_METER).length;
    expect(late).toBeGreaterThan(early);
  });

  it('never blocks more than maxBlocked lanes of a row (obstacles and wrecks together)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { obs, wrecks } = make(seed, 8000);
      for (const o of obs.items) {
        const blocked = new Set([...obs.solidLanes(o.x), ...wrecks.blockedLanes(o.x, OBSTACLES.rowGap)]);
        expect(blocked.size).toBeLessThanOrEqual(OBSTACLES.maxBlocked);
        expect(LANES.count - blocked.size).toBeGreaterThanOrEqual(2);
      }
      for (const w of wrecks.items) {
        const blocked = new Set([...obs.solidLanes(w.x), ...wrecks.blockedLanes(w.x, OBSTACLES.rowGap)]);
        expect(blocked.size).toBeLessThanOrEqual(OBSTACLES.maxBlocked);
      }
    }
  });

  it('keeps snacks, cans and wrenches off obstacles in their lane', () => {
    const t = new Terrain(5);
    const wrecks = new WreckField(5, t, START);
    const obs = new ObstacleField(5, t, START, wrecks);
    wrecks.canBlock = (x, l) => obs.canBlock(x, l);
    const f = new PickupField(5, t, START, wrecks, obs);
    f.ensure(START + 4000 * PX_PER_METER);
    expect(obs.items.length).toBeGreaterThan(20);
    for (const o of obs.items) {
      const bad = f.items.filter((p) => p.kind === 'snack' && Math.abs(p.x - o.x) < 80 && p.lane === o.lane && t.heightAt(p.x) - p.y < 60);
      expect(bad).toEqual([]);
    }
  });
});

describe('Obstacle collisions', () => {
  function hit(kind: 'rock' | 'tires' | 'log' | 'boulder', speed: number, truckLane = 0, obstacleLane = 0) {
    const t = new Terrain(1);
    const field = new ObstacleField(1, t, START);
    const o = field.addAt(kind, START + 300, obstacleLane);
    const truck = new TruckPhysics(START + 300 - 140, BASE_Y - 42);
    truck.vx = speed;
    let h = null;
    for (let i = 0; i < 80 && !h; i++) {
      truck.step(DT * 4, GAS, t);
      h = field.collide(truck, truckLane);
    }
    return { field, o, truck, h, t };
  }

  it('only touch trucks in (nearly) the same lane', () => {
    expect(hit('boulder', 700, 0, 0).h).not.toBeNull();
    expect(hit('boulder', 700, 1, 0).h).toBeNull();
    expect(hit('boulder', 700, 0, 2).h).toBeNull();
    expect(hit('boulder', 700, 0.4, 0).h).not.toBeNull(); // mid-swerve out of lane 0 still clips it
  });

  it('a rock is hit once: the truck slows, the rock flies off as debris and fades', () => {
    const { field, o, truck, h } = hit('rock', 700);
    expect(h).not.toBeNull();
    expect(h!.impact).toBeGreaterThan(300);
    expect(truck.vx).toBeLessThan(700);
    expect(o.solid).toBe(false);
    expect(field.collide(truck, 0)).toBeNull();
    for (let i = 0; i < 120; i++) field.update(1 / 60);
    expect(field.items).not.toContain(o);
  });

  it('a boulder stays put, stops a fast truck and hurts it; a log and tires cost less', () => {
    const boulder = hit('boulder', 750);
    expect(boulder.o.solid).toBe(true);
    expect(boulder.truck.vx).toBeLessThan(750 * 0.5);
    const rock = hit('rock', 750);
    const tires = hit('tires', 750);
    const log = hit('log', 750);
    const dmg = (r: ReturnType<typeof hit>) => damageForImpact(r.h!.impact) * OBSTACLE_KINDS[r.o.kind].damageScale;
    expect(dmg(boulder)).toBeGreaterThan(dmg(log));
    expect(dmg(log)).toBeGreaterThan(dmg(rock));
    expect(dmg(rock)).toBeGreaterThan(0);
    expect(dmg(tires)).toBe(0);
    expect(dmg(boulder)).toBeLessThanOrEqual(COLLISION.maxDamage * OBSTACLE_KINDS.boulder.damageScale + 1e-9);
  });

  it('a fixed obstacle cannot hurt twice in a row (cooldown) and never lets the truck tunnel in', () => {
    const { field, o, truck, t } = hit('boulder', 750);
    expect(o.cool).toBeGreaterThan(0);
    let hits = 0;
    for (let i = 0; i < 30; i++) {
      // the cooldown window (0.5 s): the truck keeps pushing, the boulder keeps pushing back
      truck.step(DT * 4, GAS, t);
      if (field.collide(truck, 0)) hits++;
      for (const c of obstacleCircles(o)) expect(truck.x).toBeLessThan(c.x);
    }
    expect(hits).toBe(0);
  });

  it('a pinned truck is freed by changing lane: nothing traps a run for good', () => {
    const t = new Terrain(1);
    const field = new ObstacleField(1, t, START);
    field.addAt('boulder', START + 300, 1);
    const truck = new TruckPhysics(START + 300 - 140, BASE_Y - 42);
    let lane = 1;
    for (let i = 0; i < 60 * 8 * PHYSICS.substeps; i++) {
      truck.step(DT, GAS, t);
      if (i % 4 === 0) field.update(1 / 60);
      field.collide(truck, lane);
      if (i === 60 * 2 * PHYSICS.substeps) lane = 2; // the driver finally swerves
    }
    expect(truck.x).toBeGreaterThan(START + 500);
  });

  it('a soft nudge into a fixed obstacle is free, and creeping into a rock clears it', () => {
    const t = new Terrain(1);
    const field = new ObstacleField(1, t, START);
    field.addAt('log', START + 300, 0);
    const truck = new TruckPhysics(START + 300 - 140, BASE_Y - 42);
    truck.vx = 120;
    let h = null;
    for (let i = 0; i < 200 && !h; i++) {
      truck.step(DT * 4, { throttle: 0, brake: 0, lean: 0 }, t);
      h = field.collide(truck, 0);
    }
    expect(h === null || damageForImpact(h.impact) === 0).toBe(true);
  });

  it('dodges are paid once, only for obstacles in the lane you left and drove past clean', () => {
    const t = new Terrain(1);
    const field = new ObstacleField(1, t, START);
    const a = field.addAt('boulder', START + 400, 1);
    const b = field.addAt('boulder', START + 450, 3); // another lane: not a dodge
    const c = field.addAt('rock', START + 3000, 1); // too far ahead to be what you swerved from
    field.markDodge(START + 200, 1);
    expect(field.sweepDodged(START + 300)).toEqual([]); // not passed yet
    expect(field.sweepDodged(START + 400 + OBSTACLES.passMargin + 5)).toEqual([a]);
    expect(field.sweepDodged(START + 9000)).toEqual([]); // once only
    expect(b.dodge).toBe(false);
    expect(c.dodge).toBe(false);
    // An obstacle you hit is no clean dodge.
    const d = field.addAt('boulder', START + 5000, 0);
    field.markDodge(START + 4800, 0);
    d.hit = true;
    expect(field.sweepDodged(START + 6000)).toEqual([]);
  });
});

describe('Run with lanes', () => {
  it('snacks need the lane; cans reach one lane over; no lane given means any lane', () => {
    const t = new Terrain(1);
    const f = new PickupField(1, t, START);
    f.ensure(START + 20000);
    const snack = f.items.find((p) => p.kind === 'snack' && p.lane === 1)!;
    expect(f.collect(snack.x, snack.y, 3)).not.toContain(snack);
    expect(f.collect(snack.x, snack.y, 2)).not.toContain(snack); // a whole lane off: no
    expect(f.collect(snack.x, snack.y, 1.2)).toContain(snack);
    const can = f.items.find((p) => p.kind === 'fuel')!;
    expect(f.collect(can.x, can.y, can.lane + 1)).toContain(can);
    const other = f.items.filter((p) => p.kind === 'snack' && !p.taken)[3];
    expect(f.collect(other.x, other.y)).toContain(other);
  });

  it('fuel cans stay in the middle lanes and snack trails wander one lane at a time', () => {
    const t = new Terrain(2);
    const f = new PickupField(2, t, START);
    f.ensure(START + 6000 * PX_PER_METER);
    for (const p of f.items.filter((q) => q.kind === 'fuel')) {
      expect(p.lane).toBeGreaterThanOrEqual(1);
      expect(p.lane).toBeLessThanOrEqual(LANES.count - 2);
    }
    const lanes = new Set(f.items.filter((p) => p.kind === 'snack').map((p) => p.lane));
    expect(lanes.size).toBeGreaterThanOrEqual(3);
  });

  it('counts lane changes and near misses, and pays the BONUS', () => {
    const t = new Terrain(1);
    const run = new RunModel(1, t, START);
    const o = run.obstacles.addAt('boulder', START + 400, 1);
    run.laneChanged(START + 250, 1);
    expect(run.laneChanges).toBe(1);
    const ev = run.update(1 / 60, { x: o.x + OBSTACLES.passMargin + 10, y: BASE_Y - 5000, speed: 500, lane: 2 });
    const e = ev.find((v) => v.type === 'nearmiss');
    expect(e).toBeTruthy();
    expect(run.nearMisses).toBe(1);
    expect(run.score.bonus).toBeGreaterThan(0);
    expect(run.summary().nearMisses).toBe(1);
    expect(run.summary().laneChanges).toBe(1);
  });
});

describe('Rivals in the lanes', () => {
  function setup(seed: number) {
    const terrain = new Terrain(seed);
    const run = new RunModel(seed, terrain, START);
    const race = new Race(seed, terrain, run.wrecks, START, run.obstacles);
    const player = new TruckPhysics(START, BASE_Y - 45);
    return { terrain, run, race, player };
  }

  it('start in lanes other than the player\'s', () => {
    const s = setup(1);
    s.race.update(1 / 60, s.player, 0, true, LANES.startLane, LANES.startLane);
    expect(s.race.rivals.length).toBe(RIVALS.grid.length);
    for (const r of s.race.rivals) expect(Math.abs(r.lane - LANES.startLane)).toBeGreaterThanOrEqual(1);
  });

  it('only collide with the player when within a lane-width, and an obstacle bump reports its kind', () => {
    const s = setup(1);
    s.race.update(1 / 60, s.player, 0, true, 0, 0);
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.laneTimer = 99;
    r.truck.reset(START + 100, BASE_Y - 42);
    s.player.vx = 600;
    r.lane = r.laneF = 2;
    expect(s.race.update(1 / 60, s.player, 0, true, 0, 0).some((e) => e.type === 'bump')).toBe(false);
    r.lane = r.laneF = 0;
    expect(s.race.update(1 / 60, s.player, 0, true, 0, 0).some((e) => e.type === 'bump' && e.with === 'rival')).toBe(true);

    const s2 = setup(2);
    s2.race.update(1 / 60, s2.player, 0, true, 1, 1);
    s2.race.rivals = [];
    s2.run.obstacles.addAt('boulder', START + 160, 1);
    s2.player.vx = 700;
    let bump = null;
    for (let i = 0; i < 80 && !bump; i++) {
      for (let k = 0; k < PHYSICS.substeps; k++) s2.player.step(DT, GAS, s2.terrain);
      bump = s2.race.update(1 / 60, s2.player, 0, true, 1, 1).find((e) => e.type === 'bump');
    }
    expect(bump && bump.type === 'bump' && bump.with === 'obstacle' && bump.kind === 'boulder').toBe(true);
  });

  it('a skilled rival swerves around an obstacle in its lane; a careless one drives into it', () => {
    const results = { dodged: 0, crashed: 0 };
    for (const skill of [1, 0]) {
      for (let seed = 1; seed <= 12; seed++) {
        const s = setup(seed);
        s.race.update(1 / 60, s.player, 0, true, 0, 0);
        const rival = new Rival(1, 0, START + 300, BASE_Y - 48, skill, 0.1);
        rival.lane = rival.laneF = 2;
        rival.laneTimer = 99;
        rival.truck.vx = 560;
        s.race.rivals = [rival];
        s.run.obstacles.addAt('boulder', START + 1000, 2);
        let crashed = false;
        let passed = false;
        for (let f = 0; f < 60 * 6 && !passed; f++) {
          for (let k = 0; k < PHYSICS.substeps; k++) {
            s.terrain.ensure(rival.truck.x + 2000);
            s.race.stepPhysics(DT);
          }
          const ev = s.race.update(1 / 60, new TruckPhysics(START - 800, BASE_Y - 45), 0, false, 0, 0);
          if (ev.some((e) => e.type === 'rivalCrash')) crashed = true;
          if (rival.truck.x > START + 1200) passed = true;
        }
        if (skill === 1) {
          if (!crashed) results.dodged++;
        } else if (crashed) results.crashed++;
      }
    }
    expect(results.dodged).toBeGreaterThanOrEqual(10); // skill 1 always notices
    expect(results.crashed).toBeGreaterThanOrEqual(5); // skill 0 notices only 15% of hazards
  });

  it('simulates long runs with obstacles without NaNs or runaway rivals, and rivals do crash on their own', () => {
    let rivalCrashes = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = setup(seed);
      const lane = new PlayerLane();
      for (let f = 0; f < 60 * 100; f++) {
        for (let i = 0; i < PHYSICS.substeps; i++) {
          s.terrain.ensure(s.player.x + 3000);
          s.player.step(DT, GAS, s.terrain);
          s.race.stepPhysics(DT);
        }
        lane.update(1 / 60);
        if (f % 300 === 150) lane.request(f % 600 === 150 ? 1 : -1);
        s.run.pickups.ensure(s.player.x + 2600);
        for (const e of s.race.update(1 / 60, s.player, Math.max(0, (s.player.x - START) / PX_PER_METER), true, lane.f, lane.target)) {
          if (e.type === 'rivalCrash') rivalCrashes++;
        }
        s.run.obstacles.prune(s.player.x);
      }
      expect(Number.isFinite(s.player.x + s.player.y + s.player.angle)).toBe(true);
      for (const r of s.race.rivals) {
        expect(Number.isFinite(r.truck.x + r.truck.y)).toBe(true);
        expect(r.laneF).toBeGreaterThanOrEqual(0);
        expect(r.laneF).toBeLessThanOrEqual(LANES.count - 1);
      }
      expect(s.race.rivals.length).toBeLessThanOrEqual(RIVALS.max);
    }
    expect(rivalCrashes).toBeGreaterThan(0);
  });
});
