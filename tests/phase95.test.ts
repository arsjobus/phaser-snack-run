import { describe, expect, it } from 'vitest';
import { CAMERA, GAMEPLAY, LANES, PROGRESSION, STUNT, VIEW_W } from '../src/config';
import { FIELD_DEPTH, PUDDLE_FIELD, groundDetails, puddleSite } from '../src/game/GroundDetail';
import { laneScale } from '../src/game/Lanes';
import { ShowCam } from '../src/game/ShowCam';
import { stuntLayout } from '../src/game/Stunt';
import { Terrain } from '../src/game/Terrain';
import { ACHIEVEMENTS } from '../src/progress/Achievements';
import { UPGRADE_IDS, coinsForRun, emptySave, sanitizeSave, upgradeCost } from '../src/progress/Progress';
import { SKINS } from '../src/progress/Skins';
import { MENU_GATE } from '../src/ui/MenuModel';
import { LIST, listRows } from '../src/ui/Theme';
import type { RunSummary } from '../src/game/Run';

const START = GAMEPLAY.startX;

describe('the show camera', () => {
  const layout = stuntLayout(2, START);
  const dt = 1 / 60;
  const run = (cam: ShowCam, x: number, secs: number, landed = false) => {
    let f = { focus: 0, timeScale: 1 };
    for (let t = 0; t < secs; t += dt) f = cam.update(dt, x, layout, false, landed);
    return f;
  };

  it('stays out of the way on ordinary road', () => {
    const cam = new ShowCam();
    const f = cam.update(dt, layout.x0 - 4000, layout, false, false);
    expect(f.focus).toBeCloseTo(0, 6);
    expect(f.timeScale).toBeCloseTo(1, 6);
  });

  it('centres on the truck the moment it hits the first boost, without slow motion yet', () => {
    const cam = new ShowCam();
    expect(run(cam, layout.pads[0].x0 - 200, 1).focus).toBeLessThan(0.01);
    const f = run(cam, layout.pads[0].x0 + STUNT.camLead + 10, 1);
    expect(f.focus).toBeGreaterThan(0.95);
    expect(f.timeScale).toBeCloseTo(1, 2);
    expect(CAMERA.focusXAnchor).toBe(0.5); // dead centre horizontally
  });

  it('slows the game down towards the lip and over the pit', () => {
    const cam = new ShowCam();
    const f = run(cam, layout.lipX - STUNT.slowLead + 10, 2);
    expect(f.timeScale).toBeLessThan(STUNT.slowScale + 0.02);
    expect(f.timeScale).toBeGreaterThan(0.2);
    const over = run(cam, (layout.pitX0 + layout.pitX1) / 2, 1);
    expect(over.timeScale).toBeLessThan(STUNT.slowScale + 0.02);
  });

  it('stays on the truck through the jump and gives the framing back shortly after the landing', () => {
    const cam = new ShowCam();
    run(cam, layout.lipX, 1);
    const air = run(cam, layout.pitX1 - 100, 0.5);
    expect(air.focus).toBeGreaterThan(0.95); // still centred, truck not yet down
    cam.landed();
    const justLanded = run(cam, layout.landX0, STUNT.camHoldAfterLand * 0.5, true);
    expect(justLanded.focus).toBeGreaterThan(0.9);
    const later = run(cam, layout.landX0 + 200, STUNT.camHoldAfterLand + 2, true);
    expect(later.focus).toBeLessThan(0.1); // normal offset again
  });

  it('does nothing on ordinary road, with no stage near at all', () => {
    const cam = new ShowCam();
    const f = cam.update(dt, 1234, null, false, false);
    expect(f.focus).toBeCloseTo(0, 6);
    expect(f.timeScale).toBeCloseTo(1, 6);
  });

  it('releases a truck that never lands', () => {
    const cam = new ShowCam();
    run(cam, layout.lipX, 1);
    const stuck = run(cam, layout.pitX1 + 5, STUNT.camStuckMax + 3);
    expect(stuck.focus).toBeLessThan(0.1);
  });

  it('slows less than before (a little faster) and keeps the slow motion after the landing, then lets go', () => {
    expect(STUNT.slowScale).toBeGreaterThan(0.5);
    expect(STUNT.slowScale).toBeLessThan(0.85);
    const cam = new ShowCam();
    run(cam, layout.lipX, 1);
    cam.landed();
    const during = run(cam, layout.landX1 + 200, STUNT.slowHold * 0.5, true);
    expect(during.timeScale).toBeLessThan(STUNT.slowScale + 0.1);
    const after = run(cam, layout.landX1 + 600, STUNT.slowHold + 3, true);
    expect(after.timeScale).toBeGreaterThan(0.97);
    expect(after.focus).toBeLessThan(0.1);
  });

  it('snaps back to normal speed the moment the run ends', () => {
    const cam = new ShowCam();
    run(cam, layout.lipX, 1);
    expect(cam.update(dt, layout.lipX, layout, true, false).timeScale).toBe(1);
  });

  it('keeps the truck centred: the look-ahead is fully faded out at full focus', () => {
    const lookAhead = 1000 * CAMERA.lookAhead * (1 - 1);
    expect(lookAhead).toBe(0);
    expect(VIEW_W * CAMERA.focusXAnchor).toBe(VIEW_W / 2);
  });
});

describe('puddles', () => {
  it('sit on the drivable track only: never in the foreground, never past the last lane', () => {
    for (const b of ['forest', 'snow', 'swamp'] as const) {
      const ps = groundDetails(b, 0, 60000).filter((d) => d.kind === 'puddle');
      expect(ps.length).toBeGreaterThan(20);
      for (const d of ps) {
        expect(d.f).toBeGreaterThanOrEqual(PUDDLE_FIELD[0]);
        expect(d.f).toBeLessThanOrEqual(PUDDLE_FIELD[1]);
      }
    }
    expect(PUDDLE_FIELD[1]).toBeLessThan(LANES.count - 1);
    expect(PUDDLE_FIELD[1]).toBeLessThan(FIELD_DEPTH);
  });

  it('accept level ground', () => {
    expect(puddleSite(() => 500, 100, 160)).toBe('flat');
    expect(puddleSite((x) => 500 + x * 0.03, 100, 160)).toBe('flat');
  });

  it('refuse a slope, however long', () => {
    expect(puddleSite((x) => 500 - x * 0.2, 100, 160)).toBeNull();
    expect(puddleSite((x) => 500 - x * 0.08, 100, 160)).toBeNull();
  });

  it('accept a dip with higher walls on both sides, but not a bump or a one-sided step', () => {
    const g = (x: number) => Math.exp(-(((x - 130) / 55) ** 2));
    expect(puddleSite((x) => 500 + 6 * g(x), 100, 160)).toBe('dip'); // y-down: bigger y is lower, so this is a hollow
    expect(puddleSite((x) => 500 - 6 * g(x), 100, 160)).toBeNull(); // a bump
    expect(puddleSite((x) => 500 + 20 * g(x), 100, 160)).toBeNull(); // a hollow with steep sides
    expect(puddleSite((x) => (x < 130 ? 500 : 480 + (x - 130) * 0.1), 100, 160)).toBeNull(); // a step
  });

  it('on real terrain, sites that pass are really flat or hollow (spot-checked over many seeds)', () => {
    let flat = 0;
    let dip = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = new Terrain(seed, START);
      t.ensure(START + 60000);
      for (let x = START + 400; x < START + 59000; x += 30) {
        const site = puddleSite((px) => t.heightAt(px), x - 30, x + 30);
        if (site === 'flat') {
          flat++;
          // level to the eye: the ground under the whole span stays within 3 px
          const hs: number[] = [];
          for (let k = -30; k <= 30; k += 3) hs.push(t.heightAt(x + k));
          expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(3);
        } else if (site === 'dip') dip++;
      }
    }
    expect(flat).toBeGreaterThan(50); // there are enough level spots for puddles to appear
    expect(flat + dip).toBeGreaterThan(0);
  });

  it('keep a pool a sensible size at the far lane (it still fits under the field edge)', () => {
    expect(9 * laneScale(PUDDLE_FIELD[1])).toBeLessThan(15 * (FIELD_DEPTH - PUDDLE_FIELD[1]));
  });
});

describe('the economy', () => {
  const refRun: RunSummary = {
    score: 0, meters: 2150, snacks: 40, bestChain: 5, bestMultiplier: 2, bestAir: 0.5, takedowns: 1, checkpoints: 2,
    nearMisses: 5, laneChanges: 10, crashes: 2, damageTaken: 0.4, cleanMeters: 500, endReason: 'fuel',
  };
  const perRun = coinsForRun(refRun);

  it('a typical run earns a couple of hundred coins', () => {
    expect(perRun).toBeGreaterThan(150);
    expect(perRun).toBeLessThan(300);
  });

  it('the first upgrade or paint takes a couple of runs, not one', () => {
    const cheapest = Math.min(...UPGRADE_IDS.map((id) => upgradeCost(id, 0) ?? Infinity), ...SKINS.filter((s) => s.cost > 0).map((s) => s.cost));
    expect(cheapest / perRun).toBeGreaterThan(1); // one typical run is not enough
    expect(cheapest / perRun).toBeLessThan(4);
  });

  it('unlocking everything takes about a hundred runs: a long haul, not months', () => {
    let total = SKINS.reduce((a, s) => a + s.cost, 0);
    for (const id of UPGRADE_IDS) for (let l = 0; l < PROGRESSION.upgrades[id].max; l++) total += upgradeCost(id, l) ?? 0;
    expect(total / perRun).toBeGreaterThan(80);
    expect(total / perRun).toBeLessThan(160);
  });

  it('paint costs rise with how fancy it is, and each upgrade level costs more than the last', () => {
    const paid = SKINS.filter((s) => s.cost > 0).map((s) => s.cost);
    expect([...paid].sort((a, b) => a - b)).toEqual(paid);
    for (const id of UPGRADE_IDS) for (let l = 1; l < PROGRESSION.upgrades[id].max; l++) expect(upgradeCost(id, l)!).toBeGreaterThan(upgradeCost(id, l - 1)!);
  });
});

describe('list spacing and the menus', () => {
  it('every list keeps at least the standard gap between rows', () => {
    for (const [top, bottom, n, maxH] of [[142, 352, 3, 58], [142, 424, 5, 58], [148, 428, 7, 40]] as const) {
      const rows = listRows(top, bottom, n, maxH);
      expect(rows.step - rows.h).toBeCloseTo(LIST.rowGap, 6);
      expect(rows.y(n - 1) + rows.h / 2).toBeLessThanOrEqual(bottom + 1e-6);
      expect(rows.y(0) - rows.h / 2).toBeGreaterThanOrEqual(top - 1e-6);
    }
  });

  it('there is a row of room for all the achievements, two to a row, with no daily one', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).not.toContain('daily1');
    const rows = listRows(148, 428, Math.ceil(ACHIEVEMENTS.length / 2), 40);
    expect(rows.h).toBeGreaterThanOrEqual(30);
  });

  it('the start sign stands wholly on screen', () => {
    expect(MENU_GATE.screenX - MENU_GATE.width / 2).toBeGreaterThanOrEqual(0);
    expect(MENU_GATE.screenX + MENU_GATE.width / 2).toBeLessThanOrEqual(VIEW_W);
  });

  it('an old save with daily-run fields still loads, and keeps what still exists', () => {
    const s = sanitizeSave({ coins: 40, dailyBest: { '2026-01-01': 9 }, achievements: { daily1: '2026-01-01' }, highScores: [{ score: 5, meters: 1, snacks: 0, date: '2026-01-01', daily: true, reason: null }] });
    expect(s.coins).toBe(40);
    expect(s).not.toHaveProperty('dailyBest');
    expect(s.highScores).toHaveLength(1);
    expect(emptySave()).not.toHaveProperty('dailyBest');
  });
});
