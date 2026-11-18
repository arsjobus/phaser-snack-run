import { describe, expect, it } from 'vitest';
import { BASE_Y, CHECKPOINT, FUEL, GAMEPLAY, PX_PER_METER } from '../src/config';
import {
  CheckpointTrack,
  checkpointMeters,
  segmentMeters,
  segmentSeconds,
} from '../src/game/Checkpoint';
import { DamageMeter } from '../src/game/Damage';
import {
  NeedleSpring,
  blinkLit,
  formatClock,
  needleAngle,
  warnTick,
} from '../src/game/HudModel';
import { RunModel } from '../src/game/Run';
import { Terrain } from '../src/game/Terrain';

const START = GAMEPLAY.startX;

describe('HUD helpers', () => {
  it('maps gauge values to a left-to-right half-dial sweep', () => {
    expect(needleAngle(0)).toBeCloseTo(Math.PI, 6); // far left
    expect(needleAngle(0.5)).toBeCloseTo(1.5 * Math.PI, 6); // straight up
    expect(needleAngle(1)).toBeCloseTo(2 * Math.PI, 6); // far right
    expect(needleAngle(-3)).toBe(needleAngle(0));
    expect(needleAngle(9)).toBe(needleAngle(1));
  });

  it('formats the clock as m:ss, rounding up', () => {
    expect(formatClock(272)).toBe('4:32');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(0.1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('blinks at 2 Hz in step with the warning tick', () => {
    expect(blinkLit(0)).toBe(true);
    expect(blinkLit(0.3)).toBe(false);
    expect(blinkLit(0.5)).toBe(true);
    expect(warnTick(0.49)).toBe(0);
    expect(warnTick(0.5)).toBe(1);
    // The lit phase always starts on a new tick, so the beep lands as the dial lights up.
    for (let t = 0; t < 5; t += 0.5) expect(blinkLit(t)).toBe(true);
  });

  it('springs a needle to its target with a little lag, and stays stable on long frames', () => {
    const n = new NeedleSpring(1);
    n.step(0, 1 / 60);
    expect(n.value).toBeGreaterThan(0.9); // lags behind a sudden drop
    for (let i = 0; i < 180; i++) n.step(0, 1 / 60);
    expect(n.value).toBeCloseTo(0, 2);
    const big = new NeedleSpring(0);
    big.step(1, 5); // e.g. returning to a background tab
    expect(Number.isFinite(big.value)).toBe(true);
    expect(big.value).toBeCloseTo(1, 2);
  });
});

describe('Damage', () => {
  it('adds, repairs and clamps', () => {
    const d = new DamageMeter();
    expect(d.add(0.4)).toBeCloseTo(0.4, 6);
    expect(d.repair(0.1)).toBeCloseTo(0.1, 6);
    expect(d.level).toBeCloseTo(0.3, 6);
    expect(d.add(5)).toBeCloseTo(0.7, 6);
    expect(d.wrecked).toBe(true);
    expect(d.repair(5)).toBeCloseTo(1, 6);
    expect(d.level).toBe(0);
    expect(d.add(-1)).toBe(0);
  });
});

describe('Checkpoints', () => {
  it('spaces gates by growing segments', () => {
    expect(checkpointMeters(0)).toBe(0);
    expect(checkpointMeters(1)).toBe(CHECKPOINT.firstMeters);
    expect(checkpointMeters(2)).toBe(2 * CHECKPOINT.firstMeters + CHECKPOINT.growthMeters);
    for (let i = 1; i < 12; i++) {
      expect(checkpointMeters(i + 1) - checkpointMeters(i)).toBe(segmentMeters(i + 1));
      expect(segmentMeters(i + 1)).toBeGreaterThan(segmentMeters(i));
    }
  });

  it('counts down, then banks time, pays a bonus and advances on reaching a gate', () => {
    const c = new CheckpointTrack();
    const t0 = c.timeLeft;
    expect(t0).toBeCloseTo(segmentSeconds(1) + CHECKPOINT.startBuffer, 6);
    expect(c.update(10, 100)).toEqual([]);
    expect(c.timeLeft).toBeCloseTo(t0 - 10, 6);
    expect(c.progress(100)).toBeCloseTo(0.1, 6);

    const left = c.timeLeft;
    const ev = c.update(0, checkpointMeters(1));
    expect(ev).toHaveLength(1);
    const e = ev[0];
    if (e.type !== 'reached') throw new Error('expected a checkpoint');
    expect(e.index).toBe(1);
    expect(e.timeAdded).toBeCloseTo(segmentSeconds(2), 6);
    expect(e.points).toBe(Math.round(CHECKPOINT.basePoints + left * CHECKPOINT.pointsPerSecondLeft));
    expect(c.timeLeft).toBeCloseTo(left + segmentSeconds(2), 6);
    expect(c.nextIndex).toBe(2);
    expect(c.progress(checkpointMeters(1))).toBe(0);
    expect(c.progress(checkpointMeters(2))).toBe(1);
  });

  it('still counts a gate reached on the frame the clock hits zero, otherwise times out once', () => {
    const c = new CheckpointTrack();
    c.timeLeft = 0.01;
    const ev = c.update(1, checkpointMeters(1));
    expect(ev.map((e) => e.type)).toEqual(['reached']);
    expect(c.timedOut).toBe(false);

    const d = new CheckpointTrack();
    d.timeLeft = 0.01;
    expect(d.update(1, 50).map((e) => e.type)).toEqual(['timeup']);
    expect(d.update(1, 50)).toEqual([]);
  });

  it('gives a slow-but-steady driver (the reference pace) enough time forever', () => {
    const c = new CheckpointTrack();
    const mps = FUEL.refSpeed / PX_PER_METER; // 9.5 m/s
    let meters = 0;
    let timedOut = false;
    for (let t = 0; t < 3600 && !timedOut; t += 1 / 60) {
      meters += mps / 60;
      timedOut = c.update(1 / 60, meters).some((e) => e.type === 'timeup');
    }
    expect(timedOut).toBe(false);
    expect(c.reached).toBeGreaterThan(5);
  });
});

describe('RunModel checkpoints and damage', () => {
  function runAt(seed = 1) {
    const terrain = new Terrain(seed);
    return { terrain, run: new RunModel(seed, terrain, START) };
  }
  const high = BASE_Y - 5000; // far above every pickup

  it('pays time, fuel and BONUS on reaching a checkpoint', () => {
    const { run } = runAt();
    run.fuel.level = 0.5;
    const before = run.score.bonus;
    const x = START + checkpointMeters(1) * PX_PER_METER;
    const ev = run.update(1 / 60, { x, y: high, speed: 500 }).find((e) => e.type === 'checkpoint');
    if (!ev || ev.type !== 'checkpoint') throw new Error('expected a checkpoint event');
    expect(ev.index).toBe(1);
    expect(ev.fuelAdded).toBeCloseTo(CHECKPOINT.fuelBonus, 3);
    expect(run.fuel.level).toBeGreaterThan(0.5);
    expect(run.score.bonus).toBe(before + ev.points);
    expect(run.checkpoints.reached).toBe(1);
  });

  it('ends the run with reason "time" when the clock runs out', () => {
    const { run } = runAt();
    run.checkpoints.timeLeft = 0.5;
    run.fuel.level = 1;
    const seen: string[] = [];
    for (let i = 0; i < 60 && !run.over; i++) {
      for (const e of run.update(1 / 60, { x: START + 10, y: high, speed: 300 })) seen.push(e.type);
    }
    expect(run.over).toBe(true);
    expect(run.endReason).toBe('time');
    expect(seen).toContain('timeup');
    expect(seen).toContain('over');
    expect(run.update(1 / 60, { x: START, y: high, speed: 0 })).toEqual([]);
  });

  it('ends the run with reason "fuel" when dry (unchanged from Phase 2)', () => {
    const { run } = runAt(2);
    run.fuel.level = 1e-6;
    for (let i = 0; i < 60 * 8 && !run.over; i++) {
      run.checkpoints.timeLeft = 1000; // keep the clock out of it
      run.update(1 / 60, { x: START, y: high, speed: 0 });
    }
    expect(run.endReason).toBe('fuel');
  });

  it('wrecks the truck at full damage and lets repairs undo damage before that', () => {
    const { run } = runAt();
    const ev = run.hurt(0.4);
    expect(ev.map((e) => e.type)).toEqual(['damage']);
    expect(run.repair(0.3)).toBeCloseTo(0.3, 6);
    expect(run.damage.level).toBeCloseTo(0.1, 6);
    const end = run.hurt(1);
    expect(end.map((e) => e.type)).toEqual(['damage', 'over']);
    expect(run.endReason).toBe('wreck');
    expect(run.hurt(0.5)).toEqual([]);
    expect(run.repair(0.5)).toBe(0);
  });
});
