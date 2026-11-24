import { describe, expect, it } from 'vitest';
import { LANES, PROGRESSION, VIEW_W } from '../src/config';
import { FIELD_DEPTH, FLAT_KINDS, crackShape, groundDetails, isFlatKind, hash01 } from '../src/game/GroundDetail';
import { CHEVRON_INSET, PAD_FAR, PAD_MID, PAD_NEAR, chevronLit, chevronOutline, chevronStarts, padY } from '../src/game/PadArt';
import { ACHIEVEMENTS } from '../src/progress/Achievements';
import { emptySave, loadSave, resetProgress, writeSave } from '../src/progress/Progress';
import { MemoryStore } from '../src/progress/Storage';
import { LIST, listRows, paginate, plateInner } from '../src/ui/Theme';

describe('cracks', () => {
  it('close to a point at every free end, with smooth widths in between', () => {
    for (let n = 0; n < 200; n++) {
      const seed = hash01(n, 77);
      const shape = crackShape(seed);
      expect(shape.length).toBeGreaterThanOrEqual(3);
      const main = shape[0];
      expect(main[0].w).toBe(0);
      expect(main[main.length - 1].w).toBe(0);
      // Widest near the middle, falling away to both ends.
      const mid = main[Math.floor(main.length / 2)].w;
      expect(mid).toBeGreaterThan(main[1].w);
      expect(mid).toBeGreaterThan(main[main.length - 2].w);
      for (const branch of shape) {
        expect(branch[branch.length - 1].w).toBe(0);
        for (const p of branch) expect(p.w).toBeGreaterThanOrEqual(0);
        // Each branch never gets wider than the main crack, and never thickens along its length.
        for (let i = 1; i < branch.length && branch !== main; i++) expect(branch[i].w).toBeLessThanOrEqual(branch[i - 1].w + 1e-9);
      }
    }
  });

  it('is deterministic and varies with the seed', () => {
    expect(crackShape(0.25)).toEqual(crackShape(0.25));
    expect(crackShape(0.25)).not.toEqual(crackShape(0.26));
  });

  it('stays within a modest footprint so it cannot reach the field edges', () => {
    for (let n = 0; n < 200; n++) {
      for (const branch of crackShape(hash01(n, 5))) for (const p of branch) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(60);
        expect(Math.abs(p.dy)).toBeLessThanOrEqual(30);
      }
    }
  });
});

describe('ground detail layers', () => {
  it('puts cracks, ripples, puddles and drifts below rocks, whatever their depth', () => {
    for (const k of FLAT_KINDS) expect(isFlatKind(k)).toBe(true);
    for (const k of ['pebble', 'gravel', 'stone', 'clod'] as const) expect(isFlatKind(k)).toBe(false);
    // Both kinds really occur together, so the two-pass painter has something to order.
    const kinds = new Set(groundDetails('desert', 0, 20000).map((d) => d.kind));
    expect(kinds.has('crack')).toBe(true);
    expect(kinds.has('stone')).toBe(true);
  });
});

describe('boost pad arrows', () => {
  it('are centred across the field: the tip on the middle, the arms equally far above and below', () => {
    expect(PAD_MID).toBeCloseTo(FIELD_DEPTH / 2, 9);
    expect(PAD_MID - PAD_NEAR).toBeCloseTo(PAD_FAR - PAD_MID, 9);
    const c = chevronOutline(100, 26, 13);
    const lanes = c.map((p) => p.lane);
    expect(Math.max(...lanes) - PAD_MID).toBeCloseTo(PAD_MID - Math.min(...lanes), 9);
    expect(c[1].lane).toBeCloseTo(PAD_MID, 9); // the tip
    expect(c[4].lane).toBeCloseTo(PAD_MID, 9);
    expect(Math.max(...lanes)).toBeCloseTo(PAD_FAR - CHEVRON_INSET, 9);
    expect(Math.min(...lanes)).toBeCloseTo(PAD_NEAR + CHEVRON_INSET, 9);
  });

  it('cover every lane the vehicles drive in, and lie inside the road', () => {
    expect(PAD_NEAR).toBeGreaterThan(0);
    expect(PAD_NEAR).toBeLessThan(0.3);
    expect(PAD_FAR).toBeLessThan(FIELD_DEPTH);
    expect(PAD_FAR).toBeGreaterThan(LANES.count - 1);
    // On screen the middle of the pad sits at the middle of the road band (px above the ground line).
    const mid = (padY(0, PAD_NEAR) + padY(0, PAD_FAR)) / 2;
    expect(mid).toBeCloseTo(-LANES.spacing * (FIELD_DEPTH / 2), 6);
  });

  it('keep the wave: neighbours light up one after another', () => {
    const lit = (t: number) => [0, 1, 2].map((k) => chevronLit(k, t));
    const seen = new Set<string>();
    for (let t = 0; t < 2; t += 0.01) seen.add(lit(t).join());
    expect(seen.size).toBeGreaterThan(2);
    expect(chevronStarts(300)).toHaveLength(3);
  });
});

describe('reset progress', () => {
  it('wipes coins, upgrades, paint, scores and achievements back to a fresh save', () => {
    const store = new MemoryStore();
    const s = emptySave();
    s.coins = 4321;
    s.upgrades.tank = 3;
    s.skin = 'lime';
    s.ownedSkins.push('lime');
    s.highScores.push({ score: 9000, meters: 1200, snacks: 40, date: '2026-11-01', reason: 'fuel' });
    s.stats.runs = 12;
    s.achievements.combo10 = '2026-11-01';
    writeSave(store, s);
    expect(loadSave(store).coins).toBe(4321);
    const fresh = resetProgress(store);
    expect(fresh).toEqual(emptySave());
    expect(loadSave(store)).toEqual(emptySave());
  });

  it('only touches the save, and survives a store that refuses removal', () => {
    const store = new MemoryStore();
    store.setItem('other-setting', 'keep');
    writeSave(store, { ...emptySave(), coins: 5 });
    resetProgress(store);
    expect(store.getItem('other-setting')).toBe('keep');
    const stubborn = {
      data: new Map<string, string>([[PROGRESSION.saveKey, JSON.stringify({ ...emptySave(), coins: 99 })]]),
      getItem(k: string) {
        return this.data.get(k) ?? null;
      },
      setItem(k: string, v: string) {
        this.data.set(k, v);
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    expect(resetProgress(stubborn).coins).toBe(0);
    expect(loadSave(stubborn).coins).toBe(0);
  });
});

describe('menu gutters', () => {
  it('keep text well inside its plate on both sides', () => {
    expect(LIST.padX).toBeGreaterThanOrEqual(24);
    const { left, right } = plateInner(VIEW_W / 2, 860);
    expect(left - (VIEW_W / 2 - 430)).toBe(LIST.padX);
    expect(VIEW_W / 2 + 430 - right).toBe(LIST.padX);
  });

  it('give achievement plates room for a name plus a two-line description', () => {
    const rows = listRows(172, 430, 3, 78);
    expect(rows.h).toBeGreaterThanOrEqual(76);
    expect(rows.y(2) + rows.h / 2).toBeLessThanOrEqual(430);
  });

  it('page the achievements so none is squeezed: six a page, every one on some page exactly once', () => {
    const first = paginate(ACHIEVEMENTS.length, 6, 0);
    expect(first.pages).toBe(Math.ceil(ACHIEVEMENTS.length / 6));
    const seen: number[] = [];
    for (let p = 0; p < first.pages; p++) {
      const pg = paginate(ACHIEVEMENTS.length, 6, p);
      for (let i = pg.from; i < pg.to; i++) seen.push(i);
    }
    expect(seen).toEqual(ACHIEVEMENTS.map((_, i) => i));
    expect(paginate(10, 6, 99).page).toBe(1);
    expect(paginate(0, 6, 0).pages).toBe(1);
  });
});
