import { describe, expect, it } from 'vitest';
import { artAssets, artPath } from '../src/art/manifest';
import { SvgGraphics } from '../src/art/SvgGraphics';
import { BIOMES, GAMEPLAY, LANES, VIEW_H, VIEW_W } from '../src/config';
import { biomeAtX, biomeSegments, groundPaletteAt, mixColor } from '../src/game/Biomes';
import { landingPoints } from '../src/game/Effects';
import { canChangeLane } from '../src/game/Lanes';
import { crossfadeAlphas } from '../src/game/Parallax';
import { ScreenShake } from '../src/game/Shake';
import { MAX_RENDER_SCALE, chooseRenderScale } from '../src/ui/RenderScale';

const START = GAMEPLAY.startX;
/** Every file under public/art, as raw text, keyed by its path relative to public/. */
const files = import.meta.glob('../public/art/**/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Screen shake', () => {
  it('only ever offsets by whole pixels and dies away', () => {
    const s = new ScreenShake(() => 0.9137);
    s.kick(0.14, 15);
    let frames = 0;
    while (s.active && frames < 100) {
      const o = s.update(1 / 60);
      expect(Number.isInteger(o.x)).toBe(true);
      expect(Number.isInteger(o.y)).toBe(true);
      frames++;
    }
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThan(20);
    expect(s.update(1 / 60)).toEqual({ x: 0, y: 0 });
  });

  it('a smaller kick never weakens a bigger shake that is running', () => {
    const s = new ScreenShake(() => 1);
    s.kick(0.2, 12);
    s.kick(0.1, 3);
    expect(s.amplitude).toBeCloseTo(12);
    s.kick(0.1, 20);
    expect(s.amplitude).toBeCloseTo(20);
  });

  it('stays within its amplitude', () => {
    const s = new ScreenShake();
    s.kick(0.3, 10);
    for (let i = 0; i < 12; i++) {
      const o = s.update(1 / 60);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(6);
    }
  });
});

describe('Lane changes need gas and a truck that is not rolled over', () => {
  const ok = { throttle: 1, brake: 0, wheelsDown: 4, flipped: false };
  it('allows a change under power, forwards or in reverse', () => {
    expect(canChangeLane(ok)).toBe(true);
    expect(canChangeLane({ ...ok, throttle: 0, brake: 1 })).toBe(true);
  });
  it('refuses with no gas or too little (analog triggers)', () => {
    expect(canChangeLane({ ...ok, throttle: 0 })).toBe(false);
    expect(canChangeLane({ ...ok, throttle: LANES.minDriveToSteer - 0.01 })).toBe(false);
    expect(canChangeLane({ ...ok, throttle: LANES.minDriveToSteer })).toBe(true);
  });
  it('refuses when rolled over with no wheel on the ground, even with full gas', () => {
    expect(canChangeLane({ ...ok, wheelsDown: 0, flipped: true })).toBe(false);
    expect(canChangeLane({ ...ok, wheelsDown: 0, flipped: true, brake: 1 })).toBe(false);
  });
  it('a flipped truck with a wheel still down, or an airborne one, is not "rolled over"', () => {
    expect(canChangeLane({ ...ok, wheelsDown: 1, flipped: true })).toBe(true);
    expect(canChangeLane({ ...ok, wheelsDown: 0, flipped: false })).toBe(true);
  });
});

describe('Landing dust', () => {
  const flat = () => 500;
  it('comes from each wheel that touched down, on the ground and lifted by the lane', () => {
    const wheels = [
      { inContact: true, x: 100, y: 470 },
      { inContact: false, x: 180, y: 430 },
      { inContact: true, x: 260, y: 475 },
    ];
    expect(landingPoints(wheels, flat, 30)).toEqual([
      { x: 100, y: 470 },
      { x: 260, y: 470 },
    ]);
  });
  it('follows the terrain under each wheel', () => {
    const slope = (x: number) => 500 - x * 0.1;
    const pts = landingPoints([{ inContact: true, x: 200, y: 0 }], slope, 0);
    expect(pts).toEqual([{ x: 200, y: 480 }]);
  });
  it('falls back to the lowest wheel, never the truck centre, when none is flagged', () => {
    const wheels = [
      { inContact: false, x: 100, y: 440 },
      { inContact: false, x: 180, y: 470 },
    ];
    expect(landingPoints(wheels, flat, 0)).toEqual([{ x: 180, y: 500 }]);
  });
});

describe('Biome transitions', () => {
  const border = biomeSegments(START, START + 200000, START)[0].x1;
  const half = BIOMES.groundBlend / 2;
  it('the ground is the biome\u2019s own colour away from a border', () => {
    expect(groundPaletteAt(border - half - 10, START, BIOMES.groundBlend)).toEqual(biomeAtX(border - half - 10, START).ground);
    expect(groundPaletteAt(border + half + 10, START, BIOMES.groundBlend)).toEqual(biomeAtX(border + half + 10, START).ground);
  });
  it('eases from one biome\u2019s colours into the next across the blend strip', () => {
    const a = biomeAtX(border - 1, START).ground;
    const b = biomeAtX(border + 1, START).ground;
    const mid = groundPaletteAt(border, START, BIOMES.groundBlend);
    expect(mid.dirt).toBe(mixColor(a.dirt, b.dirt, 0.5));
    let last = a.crust;
    let jump = 0;
    for (let x = border - half; x <= border + half; x += 4) {
      const c = groundPaletteAt(x, START, BIOMES.groundBlend).crust;
      jump = Math.max(jump, Math.abs(((c >> 16) & 255) - ((last >> 16) & 255)));
      last = c;
    }
    expect(jump).toBeLessThan(12); // no hard cut anywhere along the strip
  });
  it('the backdrop cross-fade fades the old one out and the new one in with no gap', () => {
    expect(crossfadeAlphas(0)).toEqual([0, 1]);
    expect(crossfadeAlphas(1)).toEqual([1, 0]);
    let prevIn = -1;
    let prevOut = 2;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const [i, o] = crossfadeAlphas(p);
      expect(i).toBeGreaterThanOrEqual(prevIn);
      expect(o).toBeLessThanOrEqual(prevOut);
      expect(1 - (1 - i) * (1 - o)).toBeGreaterThanOrEqual(0.87); // together they stay nearly opaque
      prevIn = i;
      prevOut = o;
    }
  });
});

describe('Render scale', () => {
  it('matches the canvas to the screen it will be shown on, within limits', () => {
    expect(chooseRenderScale(VIEW_W, VIEW_H, 1)).toBe(1);
    expect(chooseRenderScale(1280, 720, 1)).toBe(2);
    expect(chooseRenderScale(3840, 2160, 1)).toBe(MAX_RENDER_SCALE);
    expect(chooseRenderScale(200, 100, 1)).toBe(1);
  });
});

describe('SVG art', () => {
  it('SvgGraphics writes the shapes in draw order', () => {
    const g = new SvgGraphics();
    g.fillStyle(0xff0000, 1).fillRect(1, 2, 3, 4);
    g.fillStyle(0x00ff00, 0.5).fillCircle(5, 5, 2);
    g.lineStyle(2, 0x0000ff, 1).lineBetween(0, 0, 9, 9);
    const svg = g.toSvg(10, 10);
    expect(svg).toContain('width="10" height="10" viewBox="0 0 10 10"');
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('<circle'));
    expect(svg.indexOf('<circle')).toBeLessThan(svg.indexOf('<line'));
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('stroke="#0000ff" stroke-width="2"');
  });
  it('a pie slice is a closed path with the right arc direction', () => {
    const g = new SvgGraphics();
    g.fillStyle(0, 1).slice(10, 10, 5, Math.PI, Math.PI * 2, false).fillPath();
    const svg = g.toSvg(20, 20);
    expect(svg).toMatch(/<path d="M10 10 L5 10 A5 5 0 0 1 15 10 Z"/);
  });
  const assets = artAssets();
  it('every sprite has a unique key and file', () => {
    expect(new Set(assets.map((a) => a.key)).size).toBe(assets.length);
    expect(new Set(assets.map(artPath)).size).toBe(assets.length);
  });
  it('covers the vehicle parts, pickups and road hazards', () => {
    const groups = new Set(assets.map((a) => a.group));
    for (const g of ['vehicles', 'pickups', 'hazards']) expect(groups.has(g as never)).toBe(true);
    expect(assets.filter((a) => a.group === 'hazards').length).toBe(12);
    expect(assets.filter((a) => a.group === 'pickups').map((a) => a.key).sort()).toEqual(['fuel_can', 'snack', 'wrench']);
    expect(assets.some((a) => a.key === 'wheel')).toBe(true);
  });
  it('the exported files exist in public/art and keep their sprite size', () => {
    for (const a of assets) {
      const text = files[`../public/${artPath(a)}`];
      expect(text, `${artPath(a)} is missing: run npm run art:export`).toBeTypeOf('string');
      const head = text.slice(0, 400);
      expect(head).toContain(`width="${a.w}"`);
      expect(head).toContain(`height="${a.h}"`);
      expect(head).toContain(`viewBox="0 0 ${a.w} ${a.h}"`);
    }
  });
});
