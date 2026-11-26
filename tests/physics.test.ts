import { describe, expect, it } from 'vitest';
import { BASE_Y, PHYSICS } from '../src/config';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { NEUTRAL_INPUT, type InputState } from '../src/game/Input';

const DT = 1 / 60 / PHYSICS.substeps;
const GAS: InputState = { throttle: 1, brake: 0, lean: 0 };

function run(truck: TruckPhysics, terrain: Terrain, seconds: number, input: InputState) {
  let maxAir = 0;
  let minY = Infinity;
  for (let t = 0; t < seconds; t += DT) {
    terrain.ensure(truck.x + 2000);
    truck.step(DT, input, terrain);
    maxAir = Math.max(maxAir, truck.airTime);
    minY = Math.min(minY, truck.y);
    expect(Number.isFinite(truck.x + truck.y + truck.angle)).toBe(true);
  }
  return { maxAir, minY };
}

describe('Terrain', () => {
  it('is deterministic for a seed and continuous', () => {
    const a = new Terrain(42);
    const b = new Terrain(42);
    a.ensure(30000);
    b.ensure(30000);
    for (let x = 0; x < 30000; x += 37) expect(a.heightAt(x)).toBe(b.heightAt(x));
    for (let x = 0; x < 30000; x += 16) {
      expect(Math.abs(a.heightAt(x + 16) - a.heightAt(x))).toBeLessThan(40);
    }
  });

  it('prunes old samples without changing heights ahead', () => {
    const t = new Terrain(7);
    t.ensure(20000);
    const h = t.heightAt(15000);
    t.prune(12000);
    expect(t.startX).toBeGreaterThan(0);
    expect(t.heightAt(15000)).toBe(h);
  });
});

describe('TruckPhysics', () => {
  it('settles on flat ground without exploding', () => {
    const terrain = new Terrain(1);
    const truck = new TruckPhysics(200, BASE_Y - 60);
    run(truck, terrain, 3, NEUTRAL_INPUT);
    expect(truck.grounded).toBe(true);
    expect(Math.abs(truck.angle)).toBeLessThan(0.1);
    expect(Math.abs(truck.vy)).toBeLessThan(15);
    // Chassis centre rests roughly wheelRadius + wheel offset above the baseline
    expect(BASE_Y - truck.y).toBeGreaterThan(25);
    expect(BASE_Y - truck.y).toBeLessThan(50);
  });

  it('accelerates under throttle and respects top speed', () => {
    const terrain = new Terrain(1);
    const truck = new TruckPhysics(200, BASE_Y - 45);
    run(truck, terrain, 3, GAS);
    expect(truck.speed).toBeGreaterThan(250);
    run(truck, terrain, 20, GAS);
    expect(truck.speed).toBeLessThanOrEqual(PHYSICS.topSpeed * 1.15);
  });

  it('brakes and reverses', () => {
    const terrain = new Terrain(1);
    const truck = new TruckPhysics(200, BASE_Y - 45);
    run(truck, terrain, 2, GAS);
    run(truck, terrain, 6, { throttle: 0, brake: 1, lean: 0 });
    expect(truck.speed).toBeLessThan(0);
  });

  it('goes airborne on generated ramps and survives 60s of driving', () => {
    const terrain = new Terrain(1234);
    const truck = new TruckPhysics(200, BASE_Y - 45);
    const { maxAir } = run(truck, terrain, 60, GAS);
    expect(maxAir).toBeGreaterThan(0.3);
    expect(truck.x).toBeGreaterThan(5000);
  });

  it('is survivable: a dumb counter-lean controller clears 60s on most seeds', () => {
    let survived = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const terrain = new Terrain(seed);
      const truck = new TruckPhysics(200, BASE_Y - 45);
      let flipped = false;
      for (let t = 0; t < 60 && !flipped; t += DT) {
        terrain.ensure(truck.x + 2000);
        const lean = Math.max(-1, Math.min(1, -(truck.angle * 3 + truck.angVel * 0.8)));
        truck.step(DT, { throttle: 1, brake: 0, lean }, terrain);
        flipped = truck.flipped;
      }
      if (!flipped) survived++;
    }
    // Real players (and the in-game auto-recover) do better than this naive controller.
    expect(survived).toBeGreaterThanOrEqual(6);
  });
});

describe('air timer', () => {
  it('stops counting once a rolled-over truck is lying on its roof', () => {
    const terrain = new Terrain(11);
    terrain.ensure(4000);
    const truck = new TruckPhysics(400, BASE_Y - 45);
    truck.angle = Math.PI; // upside down, dropped from a little height
    let lateAir = 0;
    for (let t = 0; t < 4; t += DT) {
      truck.step(DT, NEUTRAL_INPUT, terrain);
      if (t > 2.5) lateAir = Math.max(lateAir, truck.airTime);
    }
    expect(truck.bodyContact).toBe(true);
    expect(truck.grounded).toBe(false); // no wheels down...
    expect(lateAir).toBe(0); // ...but it is not "in the air"
  });
});
