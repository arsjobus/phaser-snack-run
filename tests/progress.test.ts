import { describe, expect, it } from 'vitest';
import { BASE_Y, FUEL, GAMEPLAY, PHYSICS, PROGRESSION, SCORING } from '../src/config';
import { FuelTank } from '../src/game/Fuel';
import { NO_PERKS } from '../src/game/Perks';
import { RunModel, type RunSummary } from '../src/game/Run';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { ACHIEVEMENTS, unlockAchievements } from '../src/progress/Achievements';
import { dayKey } from '../src/progress/Day';
import {
  UPGRADE_IDS,
  buySkin,
  buyUpgrade,
  coinsForRun,
  emptySave,
  equipSkin,
  loadSave,
  perksFor,
  recordRun,
  sanitizeSave,
  upgradeCost,
  writeSave,
} from '../src/progress/Progress';
import { SKINS } from '../src/progress/Skins';
import { MemoryStore, defaultStore } from '../src/progress/Storage';

const START = GAMEPLAY.startX;

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    score: 1000,
    meters: 500,
    snacks: 10,
    bestChain: 4,
    bestMultiplier: 2,
    bestAir: 0.8,
    takedowns: 0,
    checkpoints: 0,
    nearMisses: 0,
    laneChanges: 0,
    crashes: 0,
    damageTaken: 0,
    cleanMeters: 500,
    bestMeters: 500,
    lowestMeters: 0,
    bestCoast: 0,
    endReason: 'fuel',
    ...over,
  };
}

describe('Saves', () => {
  it('round-trips through a store and starts empty', () => {
    const store = new MemoryStore();
    expect(loadSave(store)).toEqual(emptySave());
    const s = emptySave();
    s.coins = 123;
    s.upgrades.tank = 2;
    expect(writeSave(store, s)).toBe(true);
    expect(loadSave(store)).toEqual(s);
  });

  it('accepts garbage: corrupt JSON, wrong types, unknown ids, out-of-range numbers', () => {
    const store = new MemoryStore();
    store.setItem(PROGRESSION.saveKey, '{not json');
    expect(loadSave(store)).toEqual(emptySave());
    const s = sanitizeSave({
      coins: -50,
      upgrades: { tank: 99, efficiency: 'lots', nonsense: 3 },
      skin: 'not-owned-skin',
      ownedSkins: ['lime', 'ghost', 'lime', 7],
      highScores: [{ score: 5, meters: 1, snacks: 0, date: '2026-01-01', daily: true, reason: 'wreck' }, { score: 'x' }, null, { score: 9, date: 'yesterday' }],
      dailyBest: { '2026-01-01': 400, bad: 1, '2026-01-02': 'x' },
      stats: { runs: 'many', bestScore: 77 },
      achievements: { combo10: '2026-01-01', other: 5 },
    });
    expect(s.coins).toBe(0);
    expect(s.upgrades.tank).toBe(PROGRESSION.upgrades.tank.max);
    expect(s.upgrades.efficiency).toBe(0);
    expect(s.skin).toBe('sunny');
    expect(s.ownedSkins).toEqual(['sunny', 'lime']);
    expect(s.highScores).toHaveLength(1);
    // Saves from before the daily run was scrapped still load; its fields are just dropped.
    expect(s).not.toHaveProperty('dailyBest');
    expect(s.highScores[0]).not.toHaveProperty('daily');
    expect(s.stats.runs).toBe(0);
    expect(s.stats.bestScore).toBe(77);
    expect(s.achievements).toEqual({ combo10: '2026-01-01' });
    expect(sanitizeSave(null)).toEqual(emptySave());
    expect(sanitizeSave([1, 2])).toEqual(emptySave());
  });

  it('survives a store that throws, and falls back to memory when localStorage is missing', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(loadSave(bad)).toEqual(emptySave());
    expect(writeSave(bad, emptySave())).toBe(false);
    const store = defaultStore(); // node has no localStorage
    store.setItem('k', 'v');
    expect(store.getItem('k')).toBe('v');
  });
});

describe('The garage', () => {
  it('prices upgrades up the levels and stops at the max', () => {
    for (const id of UPGRADE_IDS) {
      const u = PROGRESSION.upgrades[id];
      expect(upgradeCost(id, 0)).toBe(Math.round(u.cost / 5) * 5);
      let prev = 0;
      for (let l = 0; l < u.max; l++) {
        const c = upgradeCost(id, l)!;
        expect(c).toBeGreaterThan(prev);
        expect(c % 5).toBe(0);
        prev = c;
      }
      expect(upgradeCost(id, u.max)).toBeNull();
    }
  });

  it('buys upgrades only with enough coins, and never past the max', () => {
    const s = emptySave();
    expect(buyUpgrade(s, 'tank')).toBe(false);
    s.coins = upgradeCost('tank', 0)! + 3;
    expect(buyUpgrade(s, 'tank')).toBe(true);
    expect(s.coins).toBe(3);
    expect(s.upgrades.tank).toBe(1);
    s.coins = 1e6;
    while (buyUpgrade(s, 'tank'));
    expect(s.upgrades.tank).toBe(PROGRESSION.upgrades.tank.max);
    expect(buyUpgrade(s, 'tank')).toBe(false);
  });

  it('buys, owns and equips paint', () => {
    const s = emptySave();
    const lime = SKINS.find((k) => k.id === 'lime')!;
    expect(buySkin(s, 'lime')).toBe(false);
    s.coins = lime.cost + 10;
    expect(buySkin(s, 'lime')).toBe(true);
    expect(s.coins).toBe(10);
    expect(s.skin).toBe('lime');
    expect(buySkin(s, 'lime')).toBe(false); // owned
    expect(equipSkin(s, 'sunny')).toBe(true);
    expect(s.skin).toBe('sunny');
    expect(equipSkin(s, 'midnight')).toBe(false);
    expect(buySkin(s, 'nope')).toBe(false);
    expect(SKINS[0].cost).toBe(0);
    expect(new Set(SKINS.map((k) => k.id)).size).toBe(SKINS.length);
  });

  it('upgrades turn into perks: bigger tank, thriftier engine, tougher armor', () => {
    const s = emptySave();
    expect(perksFor(s)).toEqual(NO_PERKS);
    s.upgrades.tank = 5;
    s.upgrades.efficiency = 5;
    s.upgrades.armor = 5;
    const p = perksFor(s);
    expect(p.tank).toBeGreaterThan(1.5);
    expect(p.burn).toBeLessThan(0.8);
    expect(p.damage).toBeLessThan(0.7);
    expect(p.burn).toBeGreaterThan(0);
    expect(p.damage).toBeGreaterThan(0);
  });
});

describe('Perks in a run', () => {
  it('a bigger tank drains the gauge slower and cans fill less of it; efficiency burns less', () => {
    const base = new FuelTank();
    const big = new FuelTank(1.4);
    const thrifty = new FuelTank(1, 0.7);
    for (const t of [base, big, thrifty]) t.update(10, 500, 0);
    expect(1 - big.level).toBeCloseTo((1 - base.level) / 1.4, 6);
    expect(1 - thrifty.level).toBeCloseTo((1 - base.level) * 0.7, 6);
    base.level = big.level = 0.2;
    base.add(0.35);
    big.add(0.35);
    expect(big.level - 0.2).toBeCloseTo(0.35 / 1.4, 6);
    expect(base.level - 0.2).toBeCloseTo(0.35, 6);
    // Same fuel in absolute terms: the big tank runs longer on a fresh fill.
    const a = new FuelTank();
    const b = new FuelTank(1.4);
    let ta = 0;
    let tb = 0;
    while (!a.empty) {
      a.update(1, 400, 0);
      ta++;
    }
    while (!b.empty) {
      b.update(1, 400, 0);
      tb++;
    }
    expect(tb).toBeGreaterThan(ta * 1.3);
  });

  it('armor cuts damage, and the run counts hits and the clean distance', () => {
    const t = new Terrain(1);
    const stock = new RunModel(1, t, START);
    const armored = new RunModel(1, t, START, { tank: 1, burn: 1, damage: 0.6 });
    const at = (r: RunModel, m: number) => {
      r.meters = r.bestMeters = m;
    };
    at(stock, 700);
    at(armored, 700);
    stock.hurt(0.2);
    armored.hurt(0.2);
    expect(armored.damage.level).toBeCloseTo(0.12, 6);
    expect(stock.damage.level).toBeCloseTo(0.2, 6);
    expect(stock.summary().crashes).toBe(1);
    expect(stock.summary().cleanMeters).toBe(700);
    at(stock, 900);
    stock.hurt(0.1);
    expect(stock.summary().cleanMeters).toBe(700); // the first damage ends the clean streak
    expect(stock.summary().damageTaken).toBeCloseTo(0.3, 6);
    const clean = new RunModel(1, t, START);
    at(clean, 2500);
    expect(clean.summary().cleanMeters).toBe(2500);
    expect(clean.summary().crashes).toBe(0);
  });

  it('NO_PERKS is the stock truck', () => {
    const s = emptySave();
    s.upgrades.tank = 3;
    expect(new RunModel(1, new Terrain(1), START, NO_PERKS).fuel.capacity).toBe(1);
    expect(new RunModel(1, new Terrain(1), START, perksFor(s)).fuel.capacity).toBeGreaterThan(1);
    expect(FUEL.start).toBe(1);
  });
});

describe('Banking runs', () => {
  it('pays coins for snacks, distance, checkpoints, takedowns and close calls', () => {
    const C = PROGRESSION.coins;
    const s = summary({ snacks: 10, meters: 500, checkpoints: 2, takedowns: 1, nearMisses: 3 });
    expect(coinsForRun(s)).toBe(10 * C.perSnack + 500 / C.meters + 2 * C.perCheckpoint + C.perTakedown + 3 * C.perNearMiss);
    expect(coinsForRun(summary({ snacks: 0, meters: 0 }))).toBe(0);
  });

  it('keeps a sorted, trimmed high-score table and reports the rank', () => {
    const s = emptySave();
    for (let i = 0; i < PROGRESSION.highScores + 5; i++) recordRun(s, summary({ score: 100 + i * 10 }), '2026-02-01');
    expect(s.highScores).toHaveLength(PROGRESSION.highScores);
    const scores = s.highScores.map((h) => h.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(100 + (PROGRESSION.highScores + 4) * 10);
    expect(recordRun(s, summary({ score: 1 }), '2026-02-01').rank).toBeNull();
    expect(recordRun(s, summary({ score: 99999 }), '2026-02-01').rank).toBe(1);
    // A tie ranks below the older run.
    const t = emptySave();
    recordRun(t, summary({ score: 500 }), '2026-02-01');
    expect(recordRun(t, summary({ score: 500 }), '2026-02-02').rank).toBe(2);
  });

  it('accumulates lifetime stats and notices new bests', () => {
    const s = emptySave();
    const r1 = recordRun(s, summary({ score: 800, meters: 400, snacks: 5, bestAir: 1.2, bestChain: 6, laneChanges: 4, nearMisses: 1, takedowns: 2 }), '2026-02-01');
    expect(r1.newBestScore).toBe(true);
    expect(r1.newBestMeters).toBe(true);
    const r2 = recordRun(s, summary({ score: 500, meters: 900, snacks: 7, bestAir: 0.5, bestChain: 9 }), '2026-02-01');
    expect(r2.newBestScore).toBe(false);
    expect(r2.newBestMeters).toBe(true);
    expect(s.stats.runs).toBe(2);
    expect(s.stats.meters).toBe(1300);
    expect(s.stats.snacks).toBe(12);
    expect(s.stats.bestAir).toBe(1.2);
    expect(s.stats.bestChain).toBe(9);
    expect(s.stats.laneChanges).toBe(4);
    expect(s.stats.coinsEarned).toBe(r1.coins + r2.coins);
    expect(s.coins).toBe(r1.coins + r2.coins);
  });
});

describe('Day stamp', () => {
  it('uses the UTC day', () => {
    expect(dayKey(new Date('2026-11-20T23:59:59Z'))).toBe('2026-11-20');
    expect(dayKey(new Date('2026-11-21T00:00:01Z'))).toBe('2026-11-21');
  });
});

describe('Achievements', () => {
  it('has unique ids, rewards and descriptions', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.reward).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(5);
    }
    for (const id of ['combo10', 'air1', 'clean2k']) expect(ACHIEVEMENTS.some((a) => a.id === id)).toBe(true);
  });

  it('unlocks the roadmap examples: a 10-snack combo, long air time, 2 km undamaged', () => {
    const s = emptySave();
    expect(unlockAchievements(s, summary({ bestChain: 9, bestAir: 0.49, cleanMeters: 1999 }), '2026-04-01')).toEqual([]);
    const fresh = unlockAchievements(s, summary({ bestChain: 10, bestAir: 0.5, cleanMeters: 2000 }), '2026-04-02').map((a) => a.id);
    expect(fresh).toEqual(expect.arrayContaining(['combo10', 'air1', 'clean2k']));
    expect(s.achievements.combo10).toBe('2026-04-02');
  });

  it('pays each reward once, and is safe to call repeatedly', () => {
    const s = emptySave();
    const run = summary({ bestChain: 12, takedowns: 1 });
    const first = unlockAchievements(s, run, '2026-04-01');
    const paid = first.reduce((n, a) => n + a.reward, 0);
    expect(paid).toBeGreaterThan(0);
    expect(s.coins).toBe(paid);
    expect(unlockAchievements(s, run, '2026-04-02')).toEqual([]);
    expect(s.coins).toBe(paid);
  });

  it('profile achievements come from the save, with no run needed', () => {
    const s = emptySave();
    expect(unlockAchievements(s, null, '2026-04-01')).toEqual([]);
    s.coins = 1e5;
    buyUpgrade(s, 'armor');
    buySkin(s, 'sky');
    s.stats.coinsEarned = 1200;
    const ids = unlockAchievements(s, null, '2026-04-01').map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['upgrade1', 'paint1', 'bank1k']));
    expect(ids).not.toContain('combo10');
  });

  it('lane and run achievements need the run', () => {
    const s = emptySave();
    const ids = unlockAchievements(s, summary({ laneChanges: 25, nearMisses: 10, takedowns: 5, checkpoints: 5, meters: 5000, bestMultiplier: SCORING.maxCombo }), '2026-04-01').map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['lanes25', 'close10', 'takedown5', 'cp5', 'km5', 'maxcombo']));
  });
});

describe('Air time thresholds are reachable', () => {
  it('an auto-gas truck over generated terrain jumps long enough for Hang Time (the longest jumps are ~0.55 s, ~0.7 s drafted)', () => {
    let best = 0;
    const dt = 1 / 60 / PHYSICS.substeps;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = new Terrain(seed);
      const truck = new TruckPhysics(START, BASE_Y - 45);
      for (let f = 0; f < 60 * 120 * PHYSICS.substeps; f++) {
        t.ensure(truck.x + 3000);
        const lean = Math.max(-1, Math.min(1, -(truck.angle * 3 + truck.angVel * 0.8)));
        const ev = truck.step(dt, { throttle: 1, brake: 0, lean }, t);
        if (ev.landedAirTime !== null) best = Math.max(best, ev.landedAirTime);
        if (truck.flipped && truck.speed < 50) {
          truck.reset(truck.x, t.heightAt(truck.x) - 50);
          truck.vx = 400;
        }
      }
    }
    expect(best).toBeGreaterThanOrEqual(0.5);
  });
});
