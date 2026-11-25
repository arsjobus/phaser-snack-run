import { describe, expect, it } from 'vitest';
import { LANES, PICKUPS, PROGRESSION } from '../src/config';
import { groundDetails, puddlesOverlap } from '../src/game/GroundDetail';
import { PickupField } from '../src/game/Pickups';
import { Terrain } from '../src/game/Terrain';
import { unlockAchievements } from '../src/progress/Achievements';
import { addCoins, emptySave, recordRun, sanitizeSave } from '../src/progress/Progress';
import type { RunSummary } from '../src/game/Run';

const run = (score: number): RunSummary =>
  ({ score, total: score, meters: 5000, snacks: 100, takedowns: 5, nearMisses: 5, laneChanges: 5, checkpoints: 3, bestAir: 1, bestChain: 5, bestMultiplier: 3, endReason: 'fuel' }) as unknown as RunSummary;

describe('coin cap', () => {
  it('never lets the bank pass the cap, however coins arrive', () => {
    const cap = PROGRESSION.maxCoins;
    expect(cap).toBe(999_999);
    const save = emptySave();
    save.coins = cap - 3;
    expect(addCoins(save, 50)).toBe(3);
    expect(save.coins).toBe(cap);
    expect(addCoins(save, 50)).toBe(0);
    expect(save.coins).toBe(cap);
    const r = recordRun(save, run(1000), '2026-02-01');
    expect(save.coins).toBe(cap);
    expect(r.coins).toBe(0); // the bank took nothing
    unlockAchievements(save, run(1000), '2026-02-01');
    expect(save.coins).toBe(cap);
  });
  it('clamps a hand-edited save', () => {
    expect(sanitizeSave({ coins: 5_000_000 }).coins).toBe(PROGRESSION.maxCoins);
  });
});

describe('snack lane rule', () => {
  const make = () => {
    const t = new Terrain(1);
    const p = new PickupField(1, t, 0);
    p.items = p.items.filter((i) => i.kind === 'snack');
    const snack = p.items[0];
    return { p, snack };
  };
  it('collects a snack from any lane by default', () => {
    expect(PICKUPS.snacksFromAnyLane).toBe(true);
    const { p, snack } = make();
    const other = snack.lane === 0 ? LANES.count - 1 : 0;
    expect(p.collect(snack.x, snack.y, other).length).toBeGreaterThan(0);
  });
  it('needs the same lane when switched off', () => {
    const { p, snack } = make();
    const other = snack.lane === 0 ? LANES.count - 1 : 0;
    const prev = PICKUPS.snacksFromAnyLane;
    (PICKUPS as { snacksFromAnyLane: boolean }).snacksFromAnyLane = false;
    try {
      expect(p.collect(snack.x, snack.y, other)).toHaveLength(0);
      expect(p.collect(snack.x, snack.y, snack.lane).length).toBeGreaterThan(0);
    } finally {
      (PICKUPS as { snacksFromAnyLane: boolean }).snacksFromAnyLane = prev;
    }
  });
});

describe('puddles never overlap', () => {
  it('in any biome, and the same whichever window is asked for', () => {
    for (const b of ['forest', 'snow', 'swamp'] as const) {
      const ps = groundDetails(b, 0, 40000).filter((d) => d.kind === 'puddle');
      expect(ps.length).toBeGreaterThan(10);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(puddlesOverlap(ps[i], ps[j])).toBe(false);
      // A window cut in two gives the same puddles as the whole.
      const split = [...groundDetails(b, 0, 20000), ...groundDetails(b, 20000, 40000)].filter((d) => d.kind === 'puddle');
      expect(split.map((d) => d.x).sort()).toEqual(ps.map((d) => d.x).sort());
    }
  });
});
