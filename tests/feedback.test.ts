import { describe, expect, it } from 'vitest';
import { BASE_Y, COLLISION, FUEL, GAMEPLAY, LANES, PHYSICS, PX_PER_METER, TERRAIN_STEP, WRENCH } from '../src/config';
import { PIXEL_FONT } from '../src/art/pixelFont';
import { fuelPerPx } from '../src/game/Fuel';
import { playerInput } from '../src/game/Input';
import { PlayerLane } from '../src/game/Lanes';
import { PickupField } from '../src/game/Pickups';
import { Race } from '../src/game/Race';
import { RunModel } from '../src/game/Run';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';

const START = GAMEPLAY.startX;
const DT = 1 / 60 / PHYSICS.substeps;
const NONE = { throttle: 0, brake: 0, lean: 0 };
const GAS = { throttle: 1, brake: 0, lean: 0 };

describe('Phase 7.5: the controls', () => {
  it('has no auto-gas: the truck only drives while the gas is held, and there is no lean', () => {
    expect('autoGas' in GAMEPLAY).toBe(false);
    expect(playerInput({ gas: false, brake: false }, true)).toEqual(NONE);
    expect(playerInput({ gas: true, brake: false }, true)).toEqual(GAS);
    expect(playerInput({ gas: false, brake: true }, true).brake).toBe(1);
    expect(playerInput({ gas: true, brake: true }, false)).toEqual(NONE); // a dry tank cuts both
    for (const gas of [true, false]) for (const brake of [true, false]) expect(playerInput({ gas, brake }, true).lean).toBe(0);
  });

  it('a truck at rest stays at rest, and one that lets go of the gas slows right down', () => {
    const terrain = new Terrain(1);
    const idle = new TruckPhysics(START, BASE_Y - 45);
    for (let i = 0; i < 60 * 6 * PHYSICS.substeps; i++) idle.step(DT, NONE, terrain);
    expect(Math.abs(idle.speed)).toBeLessThan(30);
    expect(idle.x - START).toBeLessThan(30);

    const coast = new TruckPhysics(START, BASE_Y - 45);
    const held = new TruckPhysics(START, BASE_Y - 45);
    coast.vx = held.vx = 700;
    for (let i = 0; i < 60 * 3 * PHYSICS.substeps; i++) {
      terrain.ensure(held.x + 3000);
      coast.step(DT, NONE, terrain);
      held.step(DT, GAS, terrain);
    }
    expect(held.speed).toBeGreaterThan(550);
    expect(coast.speed).toBeLessThan(300); // engine braking
    expect(held.x - coast.x).toBeGreaterThan(600);
  });

  it('a gentle landing assist keeps an un-steered truck on its wheels at least as often as none', () => {
    const flips = (assist: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const terrain = new Terrain(seed);
        const t = new TruckPhysics(START, BASE_Y - 45);
        t.autoLevel = assist;
        let was = false;
        for (let i = 0; i < 60 * 40 * PHYSICS.substeps; i++) {
          terrain.ensure(t.x + 2500);
          t.step(DT, GAS, terrain);
          if (t.flipped && !was) n++;
          was = t.flipped;
        }
      }
      return n;
    };
    expect(flips(true)).toBeLessThanOrEqual(flips(false));
  });
});

describe('Phase 7.5: the track is smooth', () => {
  it('passes through every sample and has no kinks (the height and its slope are continuous)', () => {
    const t = new Terrain(3);
    t.ensure(START + 12000);
    const ys: number[] = [];
    for (let x = START; x < START + 8000; x += TERRAIN_STEP) {
      ys.push(t.heightAt(x));
      // Continuity across a sample boundary: left and right limits agree for height and slope.
      expect(Math.abs(t.heightAt(x + 1e-6) - t.heightAt(x - 1e-6))).toBeLessThan(1e-3);
      expect(Math.abs(t.slopeAt(x + 1e-6) - t.slopeAt(x - 1e-6))).toBeLessThan(1e-3);
    }
    expect(ys.length).toBeGreaterThan(400);
    // The slope is the derivative of the height.
    for (let x = START + 3; x < START + 8000; x += 7.3) {
      const numeric = (t.heightAt(x + 0.01) - t.heightAt(x - 0.01)) / 0.02;
      expect(t.slopeAt(x)).toBeCloseTo(numeric, 2);
    }
  });

  it('does not wobble on its own: the opening flat is exactly flat', () => {
    const t = new Terrain(5);
    for (let x = START; x < START + 800; x += 13) expect(t.heightAt(x)).toBeCloseTo(BASE_Y, 6);
  });
});

describe('Phase 7.5: other cars cannot be driven through', () => {
  function setup(seed = 1) {
    const terrain = new Terrain(seed);
    const run = new RunModel(seed, terrain, START);
    const race = new Race(seed, terrain, run.wrecks, START, run.obstacles);
    const player = new TruckPhysics(START, BASE_Y - 45);
    race.update(1 / 60, player, 0, true, LANES.startLane, LANES.startLane); // seeds the opening grid
    return { terrain, run, race, player };
  }

  it('a rival alongside stops the drift just short of touching, and the rub costs damage', () => {
    const s = setup();
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.lane = r.laneF = 2;
    r.laneTimer = 1e9;
    s.player.vx = 500;
    const lane = new PlayerLane();
    let hits = 0;
    let damage = 0;
    for (let f = 0; f < 60 * 4; f++) {
      r.truck.x = s.player.x; // a rival keeping pace beside the player
      r.truck.vx = 500;
      const lim = s.race.depthLimits(s.player, lane.f);
      const step = lane.update(1 / 60, 1, lim.lo, lim.hi);
      if (step.blocked) {
        const by = step.blocked === 'hi' ? lim.hiBy : lim.loBy;
        expect(by?.kind).toBe('rival');
        const ev = s.race.sideswipe(s.player, by!, step.impactSpeed);
        if (ev && ev.type === 'bump') {
          hits++;
          damage += ev.damage;
          expect(ev.with).toBe('rival');
        }
      }
      s.race.update(1 / 60, s.player, 0, true, lane.f, lane.target);
      expect(lane.f).toBeLessThanOrEqual(2 - LANES.hitBand + 1e-9); // never clips into its depth
    }
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(Math.ceil(4 / LANES.sideCooldown) + 1); // a cooldown, not a damage stream
    expect(damage).toBeGreaterThanOrEqual(LANES.sideMinDamage);
    expect(r.damage).toBeGreaterThan(0); // the rival pays too
    expect(r.lastPlayerHit).toBeGreaterThan(-Infinity); // and a rub counts towards a takedown
  });

  it('a rival that is not alongside (far up the road) blocks nothing', () => {
    const s = setup();
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.lane = r.laneF = 2;
    r.truck.x = s.player.x + LANES.blockX + 50;
    const lim = s.race.depthLimits(s.player, 1);
    expect(lim.hi).toBe(LANES.count - 1);
    expect(lim.hiBy).toBeNull();
    r.truck.x = s.player.x + LANES.blockX - 5;
    expect(s.race.depthLimits(s.player, 1).hi).toBeCloseTo(2 - LANES.hitBand, 9);
  });

  it('a solid wreck blocks the drift too, from either side; touching one is left to the ordinary collision', () => {
    const s = setup();
    s.race.rivals = [];
    const wreck = s.run.wrecks.addFromRival(s.player.x, 0, 0, 0, 2);
    wreck.fresh = false;
    const above = s.race.depthLimits(s.player, 1);
    expect(above.hi).toBeCloseTo(2 - LANES.hitBand, 9);
    expect(above.hiBy?.kind).toBe('wreck');
    const below = s.race.depthLimits(s.player, 3);
    expect(below.lo).toBeCloseTo(2 + LANES.hitBand, 9);
    expect(below.loBy?.kind).toBe('wreck');
    const touching = s.race.depthLimits(s.player, 2.2);
    expect(touching.hi).toBe(LANES.count - 1);
    expect(touching.lo).toBe(0);
  });

  it('standing still (or creeping) beside a car is not painful, but moving is', () => {
    const s = setup();
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.lane = r.laneF = 2;
    const by = { kind: 'rival', key: 'r1', rival: r } as const;
    r.truck.vx = 0;
    s.player.vx = 20;
    const slow = s.race.sideswipe(s.player, by, 0.5);
    expect(slow && slow.type === 'bump' && slow.damage).toBe(0);
    s.race.update(2, s.player, 0, true, 1, 1); // let the cooldown pass
    s.player.vx = 400;
    const fast = s.race.sideswipe(s.player, by, 0.5);
    expect(fast && fast.type === 'bump' && fast.damage).toBeGreaterThanOrEqual(LANES.sideMinDamage);
  });

  it('a rival that rear-ends the player shoves the truck forward (and the player is hurt)', () => {
    const s = setup();
    const r = s.race.rivals[0];
    s.race.rivals = [r];
    r.lane = r.laneF = LANES.startLane;
    r.laneTimer = 1e9;
    r.truck.reset(START, BASE_Y - 42);
    r.truck.vx = 750;
    s.player.reset(START + 260, BASE_Y - 45); // parked, nobody on the gas
    let damage = 0;
    for (let f = 0; f < 60 * 1.5; f++) {
      for (let i = 0; i < PHYSICS.substeps; i++) {
        s.terrain.ensure(s.player.x + 3000);
        s.player.step(DT, NONE, s.terrain);
        s.race.stepPhysics(DT);
      }
      for (const e of s.race.update(1 / 60, s.player, 0, true, LANES.startLane, LANES.startLane)) {
        if (e.type === 'bump' && e.with === 'rival') damage += e.damage;
      }
    }
    expect(s.player.vx).toBeGreaterThan(250);
    expect(s.player.x).toBeGreaterThan(START + 260 + 150);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThanOrEqual(COLLISION.maxDamage * 2);
  });
});

describe('Phase 7.5: balance feedback (less fuel, more wrenches)', () => {
  it('cans restore a modest surplus over what a reference-pace driver burns, not a flood', () => {
    for (const seed of [1, 2, 3, 4]) {
      const terrain = new Terrain(seed);
      const f = new PickupField(seed, terrain, START);
      const meters = 4000;
      f.ensure(START + meters * PX_PER_METER);
      const restored = f.fuelXs.filter((x) => x < START + meters * PX_PER_METER).length * FUEL.canRestore;
      let burned = 0;
      for (let m = 0; m < meters; m += 5) burned += fuelPerPx(FUEL.refSpeed, m) * 5 * PX_PER_METER;
      expect(restored / burned).toBeGreaterThanOrEqual(1); // never starves at the reference pace
      expect(restored / burned).toBeLessThanOrEqual(1.45); // but fuel is not everywhere
    }
  });

  it('wrenches come often enough to repair the damage a rough run takes', () => {
    const [lo, hi] = WRENCH.gapMeters;
    expect(WRENCH.firstMeters).toBeLessThanOrEqual(300);
    expect((lo + hi) / 2).toBeLessThanOrEqual(350);
    for (const seed of [1, 2, 3, 4]) {
      const f = new PickupField(seed, new Terrain(seed), START);
      f.ensure(START + 3000 * PX_PER_METER);
      const wrenches = f.items.filter((p) => p.kind === 'wrench' && p.x < START + 3000 * PX_PER_METER);
      expect(wrenches.length).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('Phase 7.5: the player truck says CRUNCH', () => {
  it('the pixel font can spell the player badge', () => {
    for (const ch of 'CRUNCH') expect(PIXEL_FONT[ch], ch).toBeDefined();
  });
});
