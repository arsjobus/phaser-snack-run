import { describe, expect, it } from 'vitest';
import { PROGRESSION } from '../src/config';
import { CHEAT_CODES, CHEAT_MAX_COINS, CheatMatcher, applyCheat, type CheatId, type CheatKey } from '../src/progress/Cheats';
import { UPGRADE_IDS, emptySave, perksFor, sanitizeSave } from '../src/progress/Progress';
import { setGodMode } from '../src/progress/Session';
import { SKINS } from '../src/progress/Skins';

const feed = (m: CheatMatcher, keys: readonly CheatKey[]): CheatId | null => {
  let hit: CheatId | null = null;
  for (const k of keys) hit = m.push(k) ?? hit;
  return hit;
};

describe('cheat codes', () => {
  it('each code fires its own cheat', () => {
    for (const id of Object.keys(CHEAT_CODES) as CheatId[]) {
      expect(feed(new CheatMatcher(), CHEAT_CODES[id])).toBe(id);
    }
  });

  it('works after stray presses, and not on a near miss', () => {
    expect(feed(new CheatMatcher(), ['L', 'R', 'U', 'D', ...CHEAT_CODES.god])).toBe('god');
    const miss = [...CHEAT_CODES.god];
    miss[5] = 'U';
    expect(feed(new CheatMatcher(), miss)).toBeNull();
  });

  it('no code ends with another, so only one can fire at a time', () => {
    const ids = Object.keys(CHEAT_CODES) as CheatId[];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const A = CHEAT_CODES[a];
        const B = CHEAT_CODES[b];
        expect(B.length <= A.length && B.every((k, i) => A[A.length - B.length + i] === k)).toBe(false);
      }
    }
  });

  it('clears after a hit, so the same code twice in a row is two hits', () => {
    const m = new CheatMatcher();
    expect(feed(m, CHEAT_CODES.coins)).toBe('coins');
    expect(feed(m, CHEAT_CODES.coins)).toBe('coins');
  });

  it('god mode toggles, and turns off fuel burn and damage', () => {
    setGodMode(false);
    const save = emptySave();
    expect(perksFor(save).god).toBeUndefined();
    expect(applyCheat(save, 'god').on).toBe(true);
    const p = perksFor(save);
    expect(p.god).toBe(true);
    expect(p.burn).toBe(0);
    expect(p.damage).toBe(0);
    expect(applyCheat(save, 'god').on).toBe(false);
    expect(perksFor(save).god).toBeUndefined();
  });

  it('unlock maxes every upgrade and owns every paint job', () => {
    const save = emptySave();
    applyCheat(save, 'unlock');
    for (const id of UPGRADE_IDS) expect(save.upgrades[id]).toBe(PROGRESSION.upgrades[id].max);
    expect([...save.ownedSkins].sort()).toEqual(SKINS.map((s) => s.id).sort());
  });

  it('max coins fills the bank but never lowers a bigger one', () => {
    const save = emptySave();
    applyCheat(save, 'coins');
    expect(save.coins).toBe(CHEAT_MAX_COINS);
    save.coins = CHEAT_MAX_COINS + 5;
    applyCheat(save, 'coins');
    expect(save.coins).toBe(CHEAT_MAX_COINS + 5);
  });

  it('god mode is never saved: a fresh load comes back with it off', () => {
    setGodMode(false);
    const save = emptySave();
    applyCheat(save, 'god');
    expect(perksFor(save).god).toBe(true);
    const stored = JSON.parse(JSON.stringify(save));
    expect(JSON.stringify(stored)).not.toMatch(/god/);
    // A reload: the save comes back from storage and the page's session flag starts over.
    setGodMode(false);
    expect(perksFor(sanitizeSave(stored)).god).toBeUndefined();
  });

  it('an old save that still carries god mode does not turn it on', () => {
    setGodMode(false);
    const old = JSON.parse(JSON.stringify(emptySave()));
    old.cheats = { god: true };
    expect(perksFor(sanitizeSave(old)).god).toBeUndefined();
  });
});
