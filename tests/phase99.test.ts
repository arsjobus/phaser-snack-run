import { describe, expect, it } from 'vitest';
import { BASE_Y, GAMEPLAY, PHYSICS, PROGRESSION, PX_PER_METER } from '../src/config';
import { formatDistance } from '../src/game/HudModel';
import { padButtons } from '../src/input/Gamepad';
import {
  DEFAULT_LOCALE,
  availableLocales,
  format,
  isLocaleAvailable,
  localeName,
  missingKeys,
  registerLocale,
  setLocale,
  t,
} from '../src/i18n';
import { RunModel } from '../src/game/Run';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { ACHIEVEMENTS, allAchievementsUnlocked, unlockAchievements } from '../src/progress/Achievements';
import { UPGRADE_IDS, emptySave, recordRun, sanitizeSave, shopHoursAtReferencePace, totalShopCost } from '../src/progress/Progress';
import { SKINS } from '../src/progress/Skins';
import { ACTIONS, DEFAULT_BINDINGS, defaultSettings, sanitizeSettings } from '../src/settings/Settings';
import { MASTER, starField, sunRays } from '../src/ui/MasterMenu';
import { MENU_ITEMS } from '../src/ui/MenuModel';

const START = GAMEPLAY.startX;
const frame = (run: RunModel, x: number, gas = false, brake = false) => run.update(1 / 60, { x, y: BASE_Y, speed: 0 }, { gas, brake });

describe('signed distance', () => {
  it('goes down when the truck reverses and below zero behind the line', () => {
    const run = new RunModel(1, new Terrain(1), START);
    frame(run, START + 10 * PX_PER_METER);
    expect(run.meters).toBeCloseTo(10, 6);
    frame(run, START + 4 * PX_PER_METER);
    expect(run.meters).toBeCloseTo(4, 6); // reversing took 6 m off
    expect(run.bestMeters).toBeCloseTo(10, 6); // but the furthest point stays
    frame(run, START - 30 * PX_PER_METER);
    expect(run.meters).toBeCloseTo(-30, 6);
    expect(run.lowestMeters).toBeCloseTo(-30, 6);
    expect(run.summary().meters).toBe(-30);
  });

  it('reversing never costs score or un-reaches progress', () => {
    const run = new RunModel(1, new Terrain(1), START);
    frame(run, START + 200 * PX_PER_METER);
    const score = run.score.total;
    frame(run, START - 100 * PX_PER_METER);
    expect(run.score.total).toBeGreaterThanOrEqual(score);
  });

  it('is shown with a minus sign, and banked as zero rather than negative', () => {
    expect(formatDistance(7)).toBe('0007 m');
    expect(formatDistance(-7.9)).toBe('-0007 m');
    expect(formatDistance(12345)).toBe('12345 m');
    const save = emptySave();
    const base = new RunModel(1, new Terrain(1), START).summary();
    const result = recordRun(save, { ...base, meters: -80, snacks: 0 }, '2026-01-01');
    expect(result.coins).toBe(0);
    expect(save.stats.meters).toBe(0);
    expect(save.highScores[0].meters).toBe(0);
  });
});

describe('hidden achievements', () => {
  it('Hands Off needs 100 m with neither pedal pressed; a press starts the count over', () => {
    const run = new RunModel(1, new Terrain(1), START);
    let x = START;
    for (let i = 0; i < 60; i++) frame(run, (x += 1.5 * PX_PER_METER)); // 90 m coasting
    expect(run.bestCoast).toBeCloseTo(90, 3);
    frame(run, (x += 1), true, false); // a tap of the gas
    expect(run.coastMeters).toBe(0);
    for (let i = 0; i < 80; i++) frame(run, (x += 1.5 * PX_PER_METER)); // 120 m more
    expect(run.bestCoast).toBeGreaterThanOrEqual(100);
    const save = emptySave();
    expect(unlockAchievements(save, run.summary(), '2026-01-01').map((a) => a.id)).toContain('coast100');
  });

  it('holding a pedal the whole way never counts', () => {
    const run = new RunModel(1, new Terrain(1), START);
    for (let i = 0; i < 200; i++) frame(run, START + i * 100, true, false);
    expect(run.bestCoast).toBe(0);
  });

  it('Backing Out needs -500 m, not -499', () => {
    const save = emptySave();
    const base = new RunModel(1, new Terrain(1), START).summary();
    expect(unlockAchievements(save, { ...base, lowestMeters: -499 }, '2026-01-01').map((a) => a.id)).not.toContain('reverse500');
    expect(unlockAchievements(save, { ...base, lowestMeters: -500 }, '2026-01-01').map((a) => a.id)).toContain('reverse500');
  });

  it('both are flagged hidden and have text in every language', () => {
    const hidden = ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id);
    expect(hidden.sort()).toEqual(['coast100', 'reverse500']);
  });

  it('a truck can really reverse 500 m behind the line before the clock or a full tank gives out', () => {
    // Real physics, real fuel model, brake held from a standstill (the way a player reverses).
    const dt = 1 / 60 / PHYSICS.substeps;
    const t0 = new Terrain(3);
    const truck = new TruckPhysics(START, BASE_Y - 45);
    const run = new RunModel(3, t0, START, { tank: 1.4, burn: 1, damage: 1 }); // two tank upgrades
    let seconds = 0;
    for (let f = 0; f < 60 * 300 && !run.over && run.lowestMeters > -500; f++) {
      t0.ensure(truck.x + 3000);
      for (let s = 0; s < PHYSICS.substeps; s++) truck.step(dt, { throttle: 0, brake: run.engineOn ? 1 : 0, lean: 0 }, t0);
      run.update(1 / 60, { x: truck.x, y: truck.y, speed: truck.speed }, { gas: false, brake: true });
      seconds += 1 / 60;
    }
    expect(run.lowestMeters).toBeLessThanOrEqual(-500);
    expect(seconds).toBeLessThan(125); // inside the first checkpoint clock
  });
});

describe('every achievement unlocked', () => {
  it('is detected only when all of them, hidden ones included, are in the save', () => {
    const save = emptySave();
    expect(allAchievementsUnlocked(save)).toBe(false);
    for (const a of ACHIEVEMENTS) save.achievements[a.id] = '2026-01-01';
    expect(allAchievementsUnlocked(save)).toBe(true);
    delete save.achievements.reverse500;
    expect(allAchievementsUnlocked(save)).toBe(false);
  });

  it('the special screen has its own geometry', () => {
    expect(sunRays(0, 0, MASTER.rays, 100, 0)).toHaveLength(MASTER.rays);
    expect(sunRays(0, 0, 4, 100, 0)[0]).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 0 });
    const a = starField(10, 960, 10, 200);
    expect(a).toEqual(starField(10, 960, 10, 200)); // the same sky every visit
    expect(a.every((s) => s.x >= 0 && s.x <= 960 && s.y >= 10 && s.y <= 200)).toBe(true);
  });
});

describe('the reset-upright feature is gone', () => {
  it('has no binding, no action and no pad button', () => {
    expect(ACTIONS).not.toContain('reset' as never);
    expect('reset' in DEFAULT_BINDINGS).toBe(false);
    expect(Object.values(DEFAULT_BINDINGS).flat()).not.toContain('KeyR');
    expect(padButtons(null)).not.toHaveProperty('reset');
    // An old save that still lists a reset binding loads fine and drops it.
    const s = sanitizeSettings({ bindings: { reset: ['KeyR'], gas: ['KeyX'] } });
    expect(s.bindings).not.toHaveProperty('reset');
    expect(s.bindings.gas[0]).toBe('KeyX');
  });
});

describe('garage prices', () => {
  it('make the whole shop a 3 to 4 hour job at 2000 coins per 3 minutes', () => {
    const hours = shopHoursAtReferencePace();
    expect(hours).toBeGreaterThanOrEqual(3);
    expect(hours).toBeLessThanOrEqual(4);
    expect(totalShopCost()).toBe(
      UPGRADE_IDS.reduce((a, id) => {
        let sum = 0;
        for (let l = 0; l < PROGRESSION.upgrades[id].max; l++) sum += Math.round((PROGRESSION.upgrades[id].cost * Math.pow(PROGRESSION.upgrades[id].growth, l)) / 5) * 5;
        return a + sum;
      }, 0) + SKINS.reduce((a, s) => a + s.cost, 0),
    );
  });
});

describe('localization', () => {
  it('registers the shipped languages, English first, each with its own name', () => {
    const codes = availableLocales();
    expect(codes[0]).toBe(DEFAULT_LOCALE);
    expect(codes).toEqual(expect.arrayContaining(['en', 'es', 'fr', 'de']));
    expect(localeName('es')).toBe('Español');
  });

  it('every language has every English key, with the same {placeholders}', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const code of availableLocales()) expect(missingKeys(code), `${code} is missing keys`).toEqual([]);
    setLocale('en');
    expect(t('menu.play')).toBe('PLAY');
    // Placeholder parity, per language.
    const files = import.meta.glob('../src/i18n/locales/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>;
    const base = files['../src/i18n/locales/en.json'];
    for (const [path, cat] of Object.entries(files)) {
      for (const [k, v] of Object.entries(cat)) {
        if (k === 'meta.name') continue;
        expect(placeholders(v), `${path} ${k}`).toBe(placeholders(base[k]));
      }
    }
  });

  it('switches only to languages that have a mapping, and falls back to English then the key', () => {
    expect(setLocale('xx')).toBe(false);
    expect(isLocaleAvailable('xx')).toBe(false);
    expect(setLocale('es')).toBe(true);
    expect(t('menu.play')).toBe('JUGAR');
    expect(t('no.such.key')).toBe('no.such.key');
    registerLocale('tlh', { 'meta.name': 'tlhIngan', 'menu.play': 'Qap' }); // a new language is just a new mapping
    expect(availableLocales()).toContain('tlh');
    setLocale('tlh');
    expect(t('menu.play')).toBe('Qap');
    expect(t('menu.garage')).toBe('GARAGE'); // untranslated: English
    expect(registerLocale('bad', { 'menu.play': 'x' })).toBe(false); // no meta.name: refused
    setLocale('en');
  });

  it('fills {placeholders} and leaves unknown ones alone', () => {
    expect(format('BEST {score} {x}', { score: 12 })).toBe('BEST 12 {x}');
  });

  it('the language setting is saved only when it names a real language', () => {
    expect(defaultSettings().language).toBe('en');
    expect(sanitizeSettings({ language: 'fr' }).language).toBe('fr');
    expect(sanitizeSettings({ language: 'zz' }).language).toBe('en');
    expect(sanitizeSettings({ language: 7 }).language).toBe('en');
  });

  it('has text for everything the game shows from tables: menu, upgrades, paint, achievements', () => {
    for (const code of availableLocales()) {
      setLocale(code);
      for (const m of MENU_ITEMS) expect(t(m.key)).not.toBe(m.key);
      for (const id of UPGRADE_IDS) {
        expect(t(`upgrade.${id}.name`)).not.toBe(`upgrade.${id}.name`);
        expect(t(`upgrade.${id}.blurb`)).not.toBe(`upgrade.${id}.blurb`);
      }
      for (const s of SKINS) expect(t(`skin.${s.id}`)).not.toBe(`skin.${s.id}`);
      for (const a of ACHIEVEMENTS) {
        expect(t(`ach.${a.id}.name`)).not.toBe(`ach.${a.id}.name`);
        expect(t(`ach.${a.id}.desc`)).not.toBe(`ach.${a.id}.desc`);
      }
      for (const b of ['forest', 'desert', 'snow', 'swamp']) expect(t(`biome.${b}`)).not.toBe(`biome.${b}`);
      for (const k of ['rock', 'tires', 'log', 'boulder']) expect(t(`obstacle.${k}`)).not.toBe(`obstacle.${k}`);
    }
    setLocale('en');
  });
});

describe('old saves', () => {
  it('still load with the new achievements missing', () => {
    const s = sanitizeSave({ coins: 5, achievements: { combo10: '2026-01-01' } });
    expect(s.achievements.coast100).toBeUndefined();
    expect(allAchievementsUnlocked(s)).toBe(false);
  });
});
