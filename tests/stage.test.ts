import { describe, expect, it } from 'vitest';
import { BASE_Y, BIOMES, GAMEPLAY, PHYSICS, STUNT, TERRAIN_STEP } from '../src/config';
import { SKY_WORD, SkyShow, skyDots } from '../src/game/Fireworks';
import { ParticleSystem, type Particle } from '../src/game/Particles';
import { PickupField } from '../src/game/Pickups';
import { Race } from '../src/game/Race';
import { RunModel } from '../src/game/Run';
import { StageLocator, StuntShow, type ShowEvent } from '../src/game/Show';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { fitsWindow, isStuntCheckpoint, launchKick, padAt, stuntLayout, stuntLength, stuntOffsets } from '../src/game/Stunt';

const START = GAMEPLAY.startX;
const DT = 1 / 60 / PHYSICS.substeps;
const GAS = { throttle: 1, brake: 0, lean: 0 };

/** Drives the player truck over the stage before checkpoint 2, gas down, as the scene would. */
function drive(opts: { startSpeed?: number; seed?: number; kickOff?: boolean; seconds?: number } = {}) {
  const seed = opts.seed ?? 1;
  const layout = stuntLayout(2);
  const terrain = new Terrain(seed);
  terrain.ensure(layout.x1 + 1500);
  const show = new StuntShow(seed);
  const truck = new TruckPhysics(layout.x0 - 500, BASE_Y - 45);
  truck.autoLevel = true;
  truck.vx = opts.startSpeed ?? 400;
  const events: ShowEvent[] = [];
  let top = 0;
  let landSpeed = 0;
  let t = 0;
  for (let i = 0; i < (opts.seconds ?? 14) / DT; i++) {
    terrain.ensure(truck.x + 1500);
    truck.step(DT, GAS, terrain);
    show.step(DT, truck, terrain);
    for (const e of show.drain()) {
      events.push(e);
      if (e.type === 'landed') landSpeed = truck.speed;
    }
    top = Math.max(top, truck.speed);
    t += DT;
  }
  return { layout, terrain, show, truck, events, top, landSpeed, t };
}

describe('stage layout', () => {
  it('comes before every second checkpoint only', () => {
    expect([1, 2, 3, 4, 5, 6].filter(isStuntCheckpoint)).toEqual([2, 4, 6]);
    expect(isStuntCheckpoint(0)).toBe(false);
    expect(BIOMES.checkpointsPer).toBe(2);
  });

  it('sits in the last tenth of its segment, ends before the gate, and is aligned to terrain samples', () => {
    for (const index of [2, 4, 6, 8]) {
      const l = stuntLayout(index);
      expect(fitsWindow(l)).toBe(true);
      expect(l.x1).toBeLessThanOrEqual(l.gateX - STUNT.gateMargin + TERRAIN_STEP);
      expect(l.x1 - l.x0).toBe(stuntLength());
      for (const x of [l.x0, l.x1, l.lipX, l.pitX0, l.pitX1, l.landX0, l.landX1]) expect(x % TERRAIN_STEP).toBe(0);
    }
  });

  it('has seven pads in driving order (four on the flat, three on the ramp), all inside the stage', () => {
    const l = stuntLayout(2);
    expect(l.pads).toHaveLength(STUNT.flatPads + STUNT.rampPads.length);
    expect(l.pads.map((p) => p.onRamp)).toEqual([false, false, false, false, true, true, true]);
    for (let i = 0; i < l.pads.length; i++) {
      expect(l.pads[i].x0).toBeGreaterThan(i ? l.pads[i - 1].x1 : l.x0);
      expect(l.pads[i].x1).toBeLessThan(l.lipX);
      expect(padAt(l, (l.pads[i].x0 + l.pads[i].x1) / 2)).toBe(l.pads[i]);
    }
    expect(padAt(l, l.pitX0 + 100)).toBeNull();
    expect(new Set(stuntLayout(2).pads.map((p) => p.id)).size).toBe(7);
    expect(stuntLayout(4).pads[0].id).not.toBe(stuntLayout(2).pads[0].id);
  });

  it('parks the cars inside the pit, in four rows', () => {
    const l = stuntLayout(2);
    expect(new Set(l.cars.map((c) => c.lane)).size).toBe(4);
    for (const c of l.cars) {
      expect(c.x).toBeGreaterThan(l.pitX0);
      expect(c.x).toBeLessThan(l.pitX1);
    }
    expect(l.cars.filter((c) => c.lane === 0).length).toBeGreaterThanOrEqual(8);
  });
});

describe('stage terrain', () => {
  it('lays the stage at its place, exactly as designed, and never random pieces inside it', () => {
    const terrain = new Terrain(5);
    const l = stuntLayout(2);
    terrain.ensure(l.x1 + 2000);
    const piece = terrain.pieces.find((p) => p.kind === 'stunt')!;
    expect(piece.x0).toBe(l.x0);
    expect(piece.x1).toBe(l.x1);
    expect(piece.stage).toBe(2);
    const offs = stuntOffsets();
    expect(offs).toHaveLength((l.x1 - l.x0) / TERRAIN_STEP);
    for (let i = 0; i < offs.length; i += 7) {
      expect(terrain.heightAt(l.x0 + i * TERRAIN_STEP)).toBeCloseTo(BASE_Y + offs[i], 6);
    }
    for (const p of terrain.pieces) {
      if (p === piece) continue;
      expect(p.x1 <= l.x0 || p.x0 >= l.x1).toBe(true);
    }
    expect(terrain.heightAt(l.lipX)).toBeCloseTo(l.lipY, 6);
    expect(terrain.heightAt(l.pitX0 + 400)).toBe(BASE_Y);
  });

  it('is the same for every seed up to the stage, and deterministic per seed', () => {
    const a = new Terrain(11);
    const b = new Terrain(11);
    const l = stuntLayout(4);
    a.ensure(l.x1 + 800);
    b.ensure(l.x1 + 800);
    for (let x = START; x < l.x1 + 600; x += 40) expect(a.heightAt(x)).toBe(b.heightAt(x));
    expect(a.pieces.filter((p) => p.kind === 'stunt').map((p) => p.stage)).toEqual([2, 4]);
  });

  it('has a long enough ramp, a steep face behind the lip and a gentle slope down the landing', () => {
    const t = new Terrain(1);
    const l = stuntLayout(2);
    t.ensure(l.x1);
    expect(BASE_Y - l.lipY).toBe(STUNT.rampHeight);
    const climb = t.slopeAt(l.lipX - 64);
    expect(climb).toBeLessThan(-0.2); // the ramp climbs towards the lip...
    expect(climb).toBeGreaterThan(-0.75); // ...but it is not a wall
    expect(Math.abs(t.slopeAt(l.lipX + 40))).toBeGreaterThan(1.5); // but behind it the ground falls away
    expect(Math.abs(t.slopeAt((l.landX1 + l.landEndX) / 2))).toBeLessThanOrEqual(STUNT.landSlope + 0.05);
  });
});

describe('boost pads and the surge', () => {
  it('kicks the truck once per pad, refreshes the surge and ignores the brake', () => {
    const t = new Terrain(1);
    const truck = new TruckPhysics(START, BASE_Y - 45);
    t.ensure(START + 3000);
    expect(truck.hitPad(7, t)).toBe(true);
    expect(truck.vx).toBeGreaterThan(STUNT.padKick - 1);
    const vx = truck.vx;
    expect(truck.hitPad(7, t)).toBe(false); // the same pad again does nothing more
    expect(truck.vx).toBe(vx);
    for (let i = 0; i < 240; i++) truck.step(DT, { throttle: 0, brake: 1, lean: 0 }, t);
    expect(truck.speed).toBeGreaterThan(vx); // braking all the while, still accelerating
    expect(truck.surgeAmount).toBeGreaterThan(0.9);
  });

  it('cannot wheelie or flip on the flat while surging', () => {
    for (const v of [0, 300, 900]) {
      const t = new Terrain(1);
      t.ensure(START + 12000);
      const truck = new TruckPhysics(START, BASE_Y - 45);
      truck.vx = v;
      truck.surge = 3;
      let worst = 0;
      for (let i = 0; i < 4 * 60 * 4; i++) {
        truck.surge = 3;
        truck.step(DT, GAS, t);
        worst = Math.max(worst, Math.abs(truck.angle));
      }
      expect(worst).toBeLessThan(0.35);
      expect(truck.flipped).toBe(false);
    }
  });

  it('fades back to the normal top speed after the landing', () => {
    const r = drive({ seconds: 16 });
    expect(r.top).toBeGreaterThan(PHYSICS.topSpeed * 1.25);
    expect(r.landSpeed).toBeGreaterThan(PHYSICS.topSpeed);
    expect(r.truck.surgeAmount).toBe(0);
    expect(r.truck.speed).toBeLessThanOrEqual(PHYSICS.topSpeed * 1.02);
  });
});

describe('the show jump', () => {
  it('gives the same sequence of events from any start speed, and clears the cars', () => {
    for (const startSpeed of [0, 250, 600, 900]) {
      const { events } = drive({ startSpeed });
      const kinds = events.map((e) => e.type);
      expect(kinds.filter((k) => k === 'pad')).toHaveLength(7);
      expect(kinds.indexOf('sky')).toBeLessThan(kinds.indexOf('launch'));
      expect(kinds.indexOf('launch')).toBeLessThan(kinds.indexOf('landed'));
      const pyro = events.filter((e) => e.type === 'pyro').map((e) => (e.type === 'pyro' ? e.site : ''));
      expect(pyro).toEqual(['launch', 'landing']);
      const landed = events.find((e) => e.type === 'landed');
      expect(landed && landed.type === 'landed' && landed.cleared).toBe(true);
      if (landed && landed.type === 'landed') expect(landed.cars).toBeGreaterThanOrEqual(8);
    }
  });

  it('counts each pad once and in order', () => {
    const { events, layout } = drive({});
    const pads = events.filter((e): e is Extract<ShowEvent, { type: 'pad' }> => e.type === 'pad');
    expect(pads.map((e) => e.count)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pads.map((e) => e.pad.id)).toEqual(layout.pads.map((p) => p.id));
  });

  it('pays the clear bonus, a bonus per car and one per flip', () => {
    const { events } = drive({});
    const e = events.find((x) => x.type === 'landed');
    expect(e && e.type === 'landed' && e.points).toBe(
      e && e.type === 'landed' ? STUNT.clearBonus + e.cars * STUNT.carBonus + e.flips * STUNT.flipBonus : -1,
    );
  });

  it('spins the truck by chance at the launch: some courses flip, most do not, and it is seeded', () => {
    const spins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => launchKick(s, 2));
    expect(spins.every((k) => Math.abs(k) <= STUNT.kick)).toBe(true);
    expect(launchKick(3, 2)).toBe(launchKick(3, 2));
    expect(launchKick(3, 2)).not.toBe(launchKick(3, 4));
    expect(spins.some((k) => Math.abs(k) > STUNT.kick * 0.7)).toBe(true);
    expect(spins.some((k) => Math.abs(k) < STUNT.kick * 0.3)).toBe(true);
  });

  it('is immune to bumps while surging and for the grace period after, not later', () => {
    const l = stuntLayout(2);
    const terrain = new Terrain(1);
    terrain.ensure(l.x1 + 1500);
    const show = new StuntShow(1);
    const truck = new TruckPhysics(l.x0 - 500, BASE_Y - 45);
    truck.autoLevel = true;
    truck.vx = 500;
    expect(show.immune(truck)).toBe(false);
    let landedAt = -1;
    let sawImmune = false;
    let t = 0;
    let after = 0;
    for (let i = 0; i < 16 / DT; i++) {
      terrain.ensure(truck.x + 1500);
      truck.step(DT, GAS, terrain);
      show.step(DT, truck, terrain);
      t += DT;
      if (show.immune(truck)) sawImmune = true;
      for (const e of show.drain()) if (e.type === 'landed') landedAt = t;
      if (landedAt > 0 && t - landedAt > STUNT.grace + 0.3 && truck.surgeAmount === 0 && !after) after = t;
    }
    expect(sawImmune).toBe(true);
    expect(landedAt).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
    expect(show.immune(truck)).toBe(false);
  });
});

describe('nothing else on the stage', () => {
  it('has no obstacles, wrecks, cans or wrenches on the stage road', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const terrain = new Terrain(seed);
      const run = new RunModel(seed, terrain, START);
      const l = stuntLayout(2);
      run.pickups.ensure(l.x1 + 4000);
      run.obstacles.sync();
      run.wrecks.sync();
      const inside = (x: number) => x > l.x0 && x < l.x1;
      expect(run.obstacles.items.filter((o) => inside(o.x))).toEqual([]);
      expect(run.wrecks.items.filter((w) => inside(w.x))).toEqual([]);
      const bad = run.pickups.items.filter((p) => p.kind !== 'snack' && inside(p.x));
      expect(bad).toEqual([]);
    }
  });

  it('keeps a snack line on the flat pads and an arc over the pit that a flying truck collects', () => {
    const seed = 3;
    const l = stuntLayout(2);
    const terrain = new Terrain(seed);
    const field = new PickupField(seed, terrain, START);
    field.ensure(l.x1 + 3000);
    const snacks = field.items.filter((p) => p.kind === 'snack' && p.x > l.x0 && p.x < l.x1);
    expect(snacks.length).toBeGreaterThanOrEqual(STUNT.arcX.length + 4);
    const arc = snacks.filter((p) => p.x > l.lipX);
    expect(arc).toHaveLength(STUNT.arcX.length);
    // Fly the truck over it and count.
    const t = new Terrain(seed);
    t.ensure(l.x1 + 1500);
    const show = new StuntShow(seed);
    const truck = new TruckPhysics(l.x0 - 400, BASE_Y - 45);
    truck.autoLevel = true;
    truck.vx = 500;
    let got = 0;
    for (let i = 0; i < 9 / DT; i++) {
      t.ensure(truck.x + 1500);
      truck.step(DT, GAS, t);
      show.step(DT, truck, t);
      show.drain();
      if (i % 4 === 0) got += field.collect(truck.x, truck.y, 1).filter((p) => p.x > l.lipX).length;
    }
    expect(got).toBeGreaterThanOrEqual(STUNT.arcX.length - 1);
  });

  it('keeps new rivals off the stage and its approach', () => {
    const l = stuntLayout(2);
    const terrain = new Terrain(4);
    const run = new RunModel(4, terrain, START);
    const race = new Race(4, terrain, run.wrecks, START, run.obstacles);
    const truck = new TruckPhysics(l.x0 - STUNT.noSpawnBefore + 100, BASE_Y - 45);
    truck.vx = 400;
    const seen = new Set<number>();
    race.rivals = [];
    for (let i = 0; i < 60 * 12; i++) {
      truck.x = l.x0 - STUNT.noSpawnBefore + 100 + (i / 60) * 100;
      terrain.ensure(truck.x + 3000);
      race.update(1 / 60, truck, 3000, true, 1, 1);
      for (const r of race.rivals) seen.add(r.id);
    }
    expect(seen.size).toBe(0);
  });

  it('boosts rivals on the pads too', () => {
    const l = stuntLayout(2);
    const terrain = new Terrain(2);
    const run = new RunModel(2, terrain, START);
    const race = new Race(2, terrain, run.wrecks, START, run.obstacles);
    const truck = new TruckPhysics(START, BASE_Y - 45);
    terrain.ensure(l.x1 + 2000);
    race.update(1 / 60, truck, 0, true, 1, 1); // opening grid
    const r = race.rivals[0];
    r.truck.x = l.pads[0].x0 - 100;
    r.truck.y = BASE_Y - 48;
    r.truck.vx = 500;
    let max = 0;
    for (let i = 0; i < 4 * 60 * 3; i++) {
      race.stepPhysics(DT);
      max = Math.max(max, r.truck.surgeAmount);
    }
    expect(max).toBeGreaterThan(0.9);
    expect(r.truck.x).toBeGreaterThan(l.pads[0].x1);
  });
});

describe('stage locator', () => {
  it('finds the stage a vehicle is at, going forward and back', () => {
    const loc = new StageLocator();
    const a = stuntLayout(2);
    const b = stuntLayout(4);
    expect(loc.at(START).index).toBe(2);
    expect(loc.at(a.x0 + 10).index).toBe(2);
    expect(loc.at(a.x1 + 10).index).toBe(4);
    expect(loc.at(b.x0 + 10).index).toBe(4);
    expect(loc.at(a.x0).index).toBe(2);
    expect(loc.onStage(a.x0 + 10)).toBe(true);
    expect(loc.onStage(a.x0 - 100)).toBe(false);
    expect(loc.onStage(a.x0 - 100, 200)).toBe(true);
  });
});

describe('fireworks', () => {
  it('spells CRUNCH: six letters of dots inside a box centred where asked', () => {
    const dots = skyDots(SKY_WORD, 1000, 300);
    expect(new Set(dots.map((d) => d.letter)).size).toBe(6);
    const xs = dots.map((d) => d.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(1000, 0);
    const ys = dots.map((d) => d.y);
    expect(Math.min(...ys)).toBeCloseTo(300 - 3 * STUNT.dot, 6);
    expect(Math.max(...ys)).toBeCloseTo(300 + 3 * STUNT.dot, 6);
    // Letters do not overlap: the two Cs are the same shape, one advance apart.
    const c0 = dots.filter((d) => d.letter === 0).map((d) => d.x - dots.filter((e) => e.letter === 0)[0].x);
    expect(new Set(dots.filter((d) => d.letter === 0).map((d) => d.y)).size).toBe(7);
    expect(c0.length).toBe(dots.filter((d) => d.letter === 5).length === 0 ? 0 : c0.length);
  });

  it('launches a rocket per letter, bursts them in order and parks every star on its dot', () => {
    const ps = new ParticleSystem(4000);
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const sounds: string[] = [];
    const show = new SkyShow(ps, rand, 5000, 100, 600, (w) => sounds.push(w));
    expect(show.rockets).toHaveLength(6);
    let t = 0;
    const burstTimes: number[] = [];
    let last = 0;
    while (t < 3) {
      show.update(1 / 60);
      ps.update(1 / 60);
      t += 1 / 60;
      if (show.lettersBurst > last) {
        burstTimes.push(t);
        last = show.lettersBurst;
      }
    }
    expect(show.lettersBurst).toBe(6);
    expect(burstTimes[0]).toBeGreaterThanOrEqual(STUNT.rocketClimb - 0.05);
    expect(burstTimes[5] - burstTimes[0]).toBeGreaterThan(5 * STUNT.rocketGap - 0.1);
    expect(sounds.filter((s) => s === 'rocket')).toHaveLength(6);
    expect(sounds.filter((s) => s === 'burst')).toHaveLength(6);
    const stars = ps.items.filter((p) => p.kind === 'star');
    expect(stars).toHaveLength(show.dots.length);
    for (const s of stars) expect(Math.hypot((s.tx ?? 0) - s.x, (s.ty ?? 0) - s.y)).toBeLessThan(1);
    expect(show.done).toBe(true);
  });

  it('keeps the lettering up for its life and then lets it go', () => {
    const ps = new ParticleSystem(4000);
    const show = new SkyShow(ps, Math.random, 0, 0, 500);
    for (let i = 0; i < 60 * 2; i++) show.update(1 / 60);
    const n = () => ps.items.filter((p) => p.kind === 'star').length;
    expect(n()).toBe(show.dots.length);
    for (let i = 0; i < 60 * (STUNT.skyLife - 1.6); i++) ps.update(1 / 60);
    expect(n()).toBe(show.dots.length);
    for (let i = 0; i < 60 * 2.5; i++) ps.update(1 / 60);
    expect(n()).toBe(0);
  });
});

describe('homing particles', () => {
  it('glide to their target at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const ps = new ParticleSystem();
      const p: Particle = { kind: 'star', x: 0, y: 0, vx: 99, vy: 99, age: 0, life: 9, r0: 3, r1: 3, color: 1, alpha: 1, gravity: 500, drag: 0, rot: 0, spin: 0, tx: 100, ty: -50, home: 6 };
      ps.emit(p);
      for (let t = 0; t < 1; t += dt) ps.update(dt);
      expect(Math.hypot(p.x - 100, p.y + 50)).toBeLessThan(1);
    }
  });
});

describe('a whole run through the first stage', () => {
  it('reaches the checkpoint after the stage with no damage on the stage, and fuel to spare', () => {
    const seed = 9;
    const terrain = new Terrain(seed);
    const run = new RunModel(seed, terrain, START);
    const race = new Race(seed, terrain, run.wrecks, START, run.obstacles);
    const show = new StuntShow(seed);
    const l = stuntLayout(2);
    terrain.ensure(l.x0 - 1400);
    const truck = new TruckPhysics(l.x0 - 1500, BASE_Y - 45);
    truck.autoLevel = true;
    truck.vx = 500;
    run.fuel.level = 1;
    let landed = false;
    let hitsOnStage = 0;
    let frames = 0;
    // Hold the gas down a little before the stage, drive through it, keep going to the gate.
    while (!run.over && truck.x < l.gateX + 600 && frames < 60 * 400) {
      frames++;
      run.fuel.level = 1; // fuel is not under test here
      for (let s = 0; s < PHYSICS.substeps; s++) {
        terrain.ensure(truck.x + 1500);
        truck.step(DT, GAS, terrain);
        show.step(DT, truck, terrain);
        race.stepPhysics(DT);
      }
      for (const e of show.drain()) if (e.type === 'landed') landed = true;
      run.update(1 / 60, { x: truck.x, y: truck.y, speed: truck.speed, lane: 1 });
      for (const e of race.update(1 / 60, truck, run.meters, !run.over, 1, 1)) {
        if (e.type === 'bump' && e.damage > 0 && truck.x > l.x0 && truck.x < l.x1 && !show.immune(truck)) hitsOnStage++;
      }
      run.checkpoints.timeLeft = Math.max(run.checkpoints.timeLeft, 30);
    }
    expect(landed).toBe(true);
    expect(hitsOnStage).toBe(0);
    expect(run.checkpoints.reached).toBeGreaterThanOrEqual(2);
  });
});
