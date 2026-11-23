import { describe, expect, it } from 'vitest';
import { BASE_Y, FUEL, GAMEPLAY, PHYSICS, PICKUPS, PX_PER_METER, SCORING } from '../src/config';
import { FuelTank, drainRate, fuelPerPx } from '../src/game/Fuel';
import { PickupField } from '../src/game/Pickups';
import { RunModel } from '../src/game/Run';
import { ScoreKeeper } from '../src/game/Score';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import type { InputState } from '../src/game/Input';

const START = GAMEPLAY.startX;

describe('Fuel', () => {
  it('drains faster with speed and distance, but costs less per metre when fast', () => {
    expect(drainRate(900, 0)).toBeGreaterThan(drainRate(0, 0));
    expect(drainRate(500, 3000)).toBeGreaterThan(drainRate(500, 0));
    expect(fuelPerPx(900, 0)).toBeLessThan(fuelPerPx(380, 0));
  });

  it('empties, refuels and caps at a full tank', () => {
    const tank = new FuelTank();
    tank.update(10, 0, 0);
    expect(tank.level).toBeCloseTo(1 - FUEL.baseDrain * 10, 5);
    expect(tank.add(0.1)).toBeCloseTo(0.1, 5);
    expect(tank.add(5)).toBeLessThan(5);
    expect(tank.level).toBe(1);
    for (let i = 0; i < 200; i++) tank.update(1, 0, 0);
    expect(tank.empty).toBe(true);
    expect(tank.emptyTime).toBeGreaterThan(100);
    tank.add(0.35);
    expect(tank.empty).toBe(false);
    expect(tank.emptyTime).toBe(0);
  });
});

describe('Score', () => {
  it('multiplies snacks by the combo, capped, and a miss resets it', () => {
    const s = new ScoreKeeper();
    expect(s.collectSnack()).toBe(SCORING.snack);
    for (let i = 0; i < 40; i++) s.collectSnack();
    expect(s.multiplier).toBe(SCORING.maxCombo);
    expect(s.collectSnack()).toBe(SCORING.snack * SCORING.maxCombo);
    s.breakCombo();
    expect(s.multiplier).toBe(1);
    expect(s.bestMultiplier).toBe(SCORING.maxCombo);
  });

  it('awards air bonus per full step and distance only forwards', () => {
    const s = new ScoreKeeper();
    expect(s.addAir(0.6)).toBe(2 * SCORING.airPoints);
    expect(s.addAir(0.2)).toBe(0);
    s.setDistance(100);
    s.setDistance(40);
    expect(s.distanceScore).toBe(100 * SCORING.perMeter);
    expect(s.total).toBe(s.score + s.bonus);
  });

  it('fuel cans keep the chain alive without being multiplied', () => {
    const s = new ScoreKeeper();
    for (let i = 0; i < 6; i++) s.collectSnack();
    expect(s.collectFuel()).toBe(SCORING.fuelCan);
    expect(s.chain).toBe(7);
  });
});

describe('PickupField', () => {
  it('does not change the terrain for a seed', () => {
    const a = new Terrain(9);
    const b = new Terrain(9);
    const field = new PickupField(9, a, START);
    field.ensure(40000);
    b.ensure(a.endX);
    for (let x = 0; x < b.endX; x += 16) expect(a.heightAt(x)).toBe(b.heightAt(x));
  });

  it('is deterministic for a seed', () => {
    const make = () => {
      const t = new Terrain(5);
      const f = new PickupField(5, t, START);
      f.ensure(30000);
      return f.items.map((p) => [p.kind, Math.round(p.x), Math.round(p.y)]);
    };
    expect(make()).toEqual(make());
  });

  it('places every can so the gap is reachable at the reference speed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const t = new Terrain(seed);
      const f = new PickupField(seed, t, START);
      f.ensure(START + 4000 * PX_PER_METER);
      expect(f.fuelXs.length).toBeGreaterThan(15);
      let prev = START;
      for (const x of f.fuelXs) {
        // Fuel burned between the cans, integrated numerically at the reference speed.
        // A stage (Phase 9) is crossed on the boost pads' surge, which cannot be braked: it costs
        // a fraction of the reference pace, so its road is not counted.
        const stages = t.pieces.filter((p) => p.kind === 'stunt');
        let cost = 0;
        for (let px = prev; px < x; px += 10) {
          if (stages.some((p) => px >= p.x0 && px < p.x1)) continue;
          cost += fuelPerPx(FUEL.refSpeed, (px - START) / PX_PER_METER) * 10;
        }
        // (+1e-3: the integral steps 10 px at a time, so it can overshoot a gap planned at the bound.)
        expect(cost).toBeLessThanOrEqual(FUEL.maxGapRatio * FUEL.canRestore + 1e-3);
        expect(cost).toBeLessThan(1); // and always well within one tank
        prev = x;
      }
    }
  });

  it('keeps cans and snacks off ramps, and arcs snacks over jumps', () => {
    const t = new Terrain(3);
    const f = new PickupField(3, t, START);
    f.ensure(60000);
    for (const can of f.items.filter((p) => p.kind === 'fuel')) {
      const onJump = t.pieces.some(
        (p) => (p.kind === 'ramp' || p.kind === 'table') && can.x > p.x0 && can.x < p.x1,
      );
      expect(onJump).toBe(false);
    }
    const airborne = f.items.filter(
      (p) => p.kind === 'snack' && t.heightAt(p.x) - p.y > PICKUPS.hover + 15,
    );
    expect(airborne.length).toBeGreaterThan(10);
  });

  it('collects within the radius once, and flags the ones driven past', () => {
    const t = new Terrain(1);
    const f = new PickupField(1, t, START);
    f.ensure(START + 3000);
    const first = f.items.find((p) => p.kind === 'snack')!;
    expect(f.collect(first.x, first.y + PICKUPS.collectRadius - 2)).toContain(first);
    expect(f.collect(first.x, first.y)).not.toContain(first);
    const next = f.items.find((p) => !p.taken)!;
    const missed = f.sweepMissed(next.x + PICKUPS.missMargin + 1);
    expect(missed).toContain(next);
    expect(f.sweepMissed(next.x + 5000)).not.toContain(next);
  });
});

describe('RunModel', () => {
  /** Drives a "ghost" truck along the ground at a steady speed, ignoring physics. */
  function ghostRun(seed: number, speed: number, seconds: number, grab: boolean) {
    const terrain = new Terrain(seed);
    const run = new RunModel(seed, terrain, START);
    let x = START;
    const dt = 1 / 60;
    let t = 0;
    for (; t < seconds && !run.over; t += dt) {
      terrain.ensure(x + 4000);
      x += speed * dt;
      // Chassis-centre height on flat ground; if not grabbing, drive far above everything.
      const y = grab ? terrain.heightAt(x) - PICKUPS.hover : BASE_Y - 5000;
      const can = run.pickups.items.find((p) => p.kind === 'fuel' && !p.taken && p.x >= x);
      run.update(dt, { x, y, speed, lane: can?.lane });
    }
    return { run, t, x };
  }

  it('never runs dry for a driver who grabs every can at the reference pace', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { run, t } = ghostRun(seed, FUEL.refSpeed, 900, true);
      expect(run.over).toBe(false);
      expect(t).toBeGreaterThanOrEqual(900 - 1 / 60);
      expect(run.score.snacks).toBeGreaterThan(50);
    }
  });

  it('ends the run when the tank is empty and the truck has stopped', () => {
    const { run } = ghostRun(1, FUEL.refSpeed, 600, false);
    expect(run.over).toBe(true);
    expect(run.fuel.empty).toBe(true);
    expect(run.engineOn).toBe(false);
  });

  it('ends the run as a wreck when the player rolls over', () => {
    const terrain = new Terrain(1);
    const run = new RunModel(1, terrain, START);
    const events = run.wreck();
    expect(run.over).toBe(true);
    expect(run.endReason).toBe('wreck');
    expect(events).toContainEqual({ type: 'over', reason: 'wreck' });
  });

  it('lets a coasting truck be saved by a can, and ends the run after the coast timeout', () => {
    const terrain = new Terrain(2);
    const run = new RunModel(2, terrain, START);
    run.fuel.level = 1e-6; // drains to empty on the first update
    const events = run.update(1 / 60, { x: START, y: BASE_Y - 5000, speed: 500 });
    expect(events.some((e) => e.type === 'empty')).toBe(true);
    expect(run.over).toBe(false);
    for (let i = 0; i < 60 * (FUEL.coastMaxTime + 1) && !run.over; i++) {
      run.update(1 / 60, { x: START, y: BASE_Y - 5000, speed: 500 });
    }
    expect(run.over).toBe(true);
  });

  it('collects snacks and cans and reports events', () => {
    const terrain = new Terrain(1);
    const run = new RunModel(1, terrain, START);
    const snack = run.pickups.items.find((p) => p.kind === 'snack')!;
    const ev = run.update(1 / 60, { x: snack.x, y: snack.y, speed: 400 });
    expect(ev.find((e) => e.type === 'snack')).toBeTruthy();
    expect(run.score.snackScore).toBe(SCORING.snack);
    run.fuel.level = 0.3;
    run.pickups.ensure(START + 20000);
    const can = run.pickups.items.find((p) => p.kind === 'fuel')!;
    run.update(1 / 60, { x: can.x, y: can.y, speed: 400, lane: can.lane });
    expect(run.fuel.level).toBeCloseTo(0.3 + FUEL.canRestore, 1);
  });
});

describe('Pickups with real physics', () => {
  it('an auto-gas truck driving over generated terrain picks up snacks and does not starve', () => {
    const dt = 1 / 60 / PHYSICS.substeps;
    let collected = 0;
    let alive = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const terrain = new Terrain(seed);
      const run = new RunModel(seed, terrain, START);
      const truck = new TruckPhysics(START, BASE_Y - 45);
      let fl = false;
      for (let frame = 0; frame < 60 * 90 && !run.over && !fl; frame++) {
        for (let s = 0; s < PHYSICS.substeps; s++) {
          terrain.ensure(truck.x + 3000);
          const lean = Math.max(-1, Math.min(1, -(truck.angle * 3 + truck.angVel * 0.8)));
          const input: InputState = { throttle: run.engineOn ? 1 : 0, brake: 0, lean };
          const ev = truck.step(dt, input, terrain);
          if (ev.landedAirTime !== null) run.onLanded(ev.landedAirTime);
        }
        run.update(1 / 60, { x: truck.x, y: truck.y, speed: truck.speed });
        fl = truck.flipped;
      }
      collected += run.score.snacks;
      if (!run.over) alive++;
    }
    expect(collected).toBeGreaterThan(seeds.length * 15);
    expect(alive).toBeGreaterThanOrEqual(4);
  });
});
