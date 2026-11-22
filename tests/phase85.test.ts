import { describe, expect, it } from 'vitest';
import { LANES } from '../src/config';
import {
  ARCH_GAP,
  MIN_ARCH_DEPTH,
  PLAYER_BADGE,
  SUV_STRIPE_TOP,
  SUV_WINDOWS,
  archHalfWidth,
  archTop,
  tireOverlap,
  undersideY,
} from '../src/art/chassis';
import { ALL_CREDITS, GAME_TITLE } from '../src/credits';
import {
  FAR_MARGIN,
  FIELD_DEPTH,
  FLAT_FIELD,
  FLAT_FOREGROUND,
  FLAT_KINDS,
  groundDetails,
  lensOutline,
} from '../src/game/GroundDetail';
import { laneLift, laneScale } from '../src/game/Lanes';
import { PLAYER_WHEEL, RIVAL_STYLES } from '../src/game/Rival';
import { MENU_ITEMS } from '../src/ui/MenuModel';
import { checkerSquares, hazardStripes, rankColor, UI, wrapIndex } from '../src/ui/Theme';

const BIOMES = ['forest', 'desert', 'snow', 'swamp'] as const;

describe('road details lie on the road', () => {
  it('keeps flat details off the lip of the near lane and off the far edge', () => {
    for (const b of BIOMES) {
      for (const d of groundDetails(b, 0, 40000)) {
        if (!FLAT_KINDS.has(d.kind)) continue;
        const inField = d.f >= 0;
        if (inField) {
          expect(d.f).toBeGreaterThanOrEqual(FLAT_FIELD[0]);
          expect(d.f).toBeLessThanOrEqual(FLAT_FIELD[1]);
        } else expect(d.f).toBeLessThanOrEqual(-FLAT_FOREGROUND);
      }
    }
  });

  it('keeps even the tallest flat detail under the far edge of the field', () => {
    // A flat detail is at most ~9 px tall (half above its centre line); the far edge is FIELD_DEPTH lanes up.
    const room = laneLift(FIELD_DEPTH) - laneLift(FLAT_FIELD[1]);
    expect(room).toBeGreaterThan(9 * laneScale(FLAT_FIELD[1]) + 3);
  });

  it('keeps standing details inside the field', () => {
    for (const d of groundDetails('forest', 0, 40000)) expect(d.f).toBeLessThanOrEqual(FIELD_DEPTH - FAR_MARGIN + 1e-9);
  });

  it('builds a lens that closes at both ends and never leaves its height', () => {
    const l = lensOutline(100, 200, 10, 8);
    expect(l.top).toHaveLength(11);
    expect(l.top[0].dy).toBeCloseTo(0);
    expect(l.top[10].dy).toBeCloseTo(0);
    for (let i = 0; i <= 10; i++) {
      expect(l.top[i].dy).toBeLessThanOrEqual(0);
      expect(l.bottom[i].dy).toBeGreaterThanOrEqual(0);
      expect(l.bottom[i].dy - l.top[i].dy).toBeLessThanOrEqual(8 + 1e-9);
      expect(l.top[i].x).toBeGreaterThanOrEqual(100);
      expect(l.top[i].x).toBeLessThanOrEqual(200);
    }
  });

  it('still has more than a handful of lanes of field to scatter over', () => {
    expect(LANES.count).toBeGreaterThanOrEqual(3);
  });
});

describe('chassis wheel arches', () => {
  const wheels = [PLAYER_WHEEL, ...RIVAL_STYLES.map((s) => s.wheel)];
  const kinds = ['suv', ...RIVAL_STYLES.map((s) => s.kind)] as const;

  it('cuts every arch up into the body, so no truck has a flat bottom', () => {
    kinds.forEach((kind, i) => {
      const w = wheels[i];
      expect(undersideY(kind, w) - archTop(w)).toBeGreaterThanOrEqual(MIN_ARCH_DEPTH - 1e-9);
      expect(tireOverlap(kind, w)).toBeGreaterThan(8); // the tire reaches well up into its arch
      expect(archHalfWidth(kind, w)).toBeGreaterThan(15);
    });
  });

  it('leaves air between the tire and the arch', () => {
    expect(ARCH_GAP).toBeGreaterThan(0);
  });
});

describe('player CRUNCH badge', () => {
  it('sits below the windows, above the stripe and centred under the glass', () => {
    const b = PLAYER_BADGE;
    expect(b.cy - b.h / 2).toBeGreaterThan(SUV_WINDOWS.bottom);
    expect(b.cy + b.h / 2).toBeLessThan(SUV_STRIPE_TOP);
    expect(b.cx).toBeCloseTo((SUV_WINDOWS.x0 + SUV_WINDOWS.x1) / 2);
  });
});

describe('start screen and credits', () => {
  it('offers play, garage, settings and credits', () => {
    expect(MENU_ITEMS.map((m) => m.id)).toEqual(['play', 'garage', 'settings', 'credits']);
  });

  it('wraps the cursor both ways', () => {
    expect(wrapIndex(0, -1, 4)).toBe(3);
    expect(wrapIndex(3, 1, 4)).toBe(0);
    expect(wrapIndex(1, 2, 4)).toBe(3);
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });

  it('credits the developer and the fonts, with no real-brand names', () => {
    const text = [GAME_TITLE, ...ALL_CREDITS.flatMap((c) => [c.role, ...c.names])].join(' ').toLowerCase();
    expect(text).toContain('arsjobus');
    expect(text).toContain('russo one');
    expect(text).toContain('rajdhani');
    expect(text).not.toContain('triscuit');
  });
});

describe('ui kit geometry', () => {
  it('keeps every hazard stripe inside its rectangle', () => {
    const polys = hazardStripes(10, 20, 300, 12, 12);
    expect(polys.length).toBeGreaterThan(5);
    for (const poly of polys)
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(p.x).toBeLessThanOrEqual(310 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(20 - 1e-9);
        expect(p.y).toBeLessThanOrEqual(32 + 1e-9);
      }
  });

  it('alternates checker squares', () => {
    const sq = checkerSquares(0, 0, 40, 20, 10);
    expect(sq).toHaveLength(4);
    expect(sq.some(([x, y]) => x === 0 && y === 0)).toBe(false);
    expect(sq.some(([x, y]) => x === 10 && y === 0)).toBe(true);
  });

  it('gives the podium medal colours', () => {
    expect(rankColor(1)).toBe(UI.gold);
    expect(rankColor(2)).toBe(UI.silver);
    expect(rankColor(3)).toBe(UI.bronze);
    expect(rankColor(4)).toBe(UI.steel);
  });
});
