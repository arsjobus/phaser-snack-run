import { describe, expect, it } from 'vitest';
import { BASE_Y, LANES, PHYSICS, TRUCK, VIEW_H, VIEW_W } from '../src/config';
import { Pool } from '../src/game/Pool';
import { ParticleSystem, type Particle } from '../src/game/Particles';
import { QUALITY_LEVELS, QualityGovernor, effectsQuality } from '../src/game/Quality';
import { playerInput } from '../src/game/Input';
import { FIELD_DEPTH, FOREGROUND_DEPTH, RUT_DEPTHS, groundDetails, ruttedAt } from '../src/game/GroundDetail';
import { axleY, tireRadius, tireRise, tireSpin } from '../src/game/Tires';
import { Terrain } from '../src/game/Terrain';
import { TruckPhysics } from '../src/game/TruckPhysics';
import { KeyTracker, heldFromKeys, laneDirOf, mergeHeld } from '../src/input/Controls';
import { PadEdges, padButtons, padHeld, type PadSnapshot } from '../src/input/Gamepad';
import { TOUCH_BUTTONS, TOUCH_LAYOUT, buttonAt, touchHeld, touchVisible } from '../src/input/Touch';
import { MemoryStore } from '../src/progress/Storage';
import {
  ACTIONS,
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  RESERVED_KEYS,
  SETTINGS_KEY,
  bindingText,
  defaultSettings,
  keyLabel,
  loadSettings,
  musicLevel,
  particleScale,
  pickupMark,
  sanitizeSettings,
  saveSettings,
  setBinding,
  shakeScale,
  sfxLevel,
} from '../src/settings/Settings';

/** No two actions may share a key, and every action needs one. */
function valid(b: Record<string, string[]>): boolean {
  const seen = new Set<string>();
  for (const a of ACTIONS) {
    if (b[a].length === 0) return false;
    for (const k of b[a]) {
      if (seen.has(k) || RESERVED_KEYS.includes(k)) return false;
      seen.add(k);
    }
  }
  return true;
}

describe('Phase 8: settings', () => {
  it('starts from sane defaults with valid, clash-free key bindings', () => {
    const s = defaultSettings();
    expect(s.master).toBe(1);
    expect(s.effects).toBe('auto');
    expect(valid(s.bindings)).toBe(true);
    s.bindings.gas.push('KeyZ'); // mutating a copy never touches the defaults
    expect(DEFAULT_BINDINGS.gas).not.toContain('KeyZ');
    expect(DEFAULT_SETTINGS.bindings.gas).not.toContain('KeyZ');
  });

  it('saves and loads, and survives corrupt or hostile storage', () => {
    const store = new MemoryStore();
    const s = defaultSettings();
    s.music = 0.3;
    s.colorblind = true;
    s.effects = 'reduced';
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
    store.setItem(SETTINGS_KEY, '{nope');
    expect(loadSettings(store)).toEqual(defaultSettings());
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    const bad = sanitizeSettings({ master: 7, music: 'loud', shake: -2, effects: 'ultra', touch: 3, colorblind: 'yes' });
    expect(bad.master).toBe(1);
    expect(bad.music).toBe(1);
    expect(bad.shake).toBe(0);
    expect(bad.effects).toBe('auto');
    expect(bad.touch).toBe('auto');
    expect(bad.colorblind).toBe(false);
  });

  it('repairs bindings: no clashes, no reserved keys, nothing left without a key', () => {
    const s = sanitizeSettings({
      bindings: { gas: ['KeyX', 'Escape'], brake: ['KeyX'], far: [], near: 'KeyS', mute: [3, null] },
    });
    expect(valid(s.bindings)).toBe(true);
    expect(s.bindings.gas).toEqual(['KeyX']); // the first claim wins; Escape is reserved
    expect(s.bindings.brake).not.toContain('KeyX');
    for (const a of ACTIONS) expect(s.bindings[a].length).toBeGreaterThan(0);
  });

  it('rebinding takes a key from its old owner, and swaps so nobody is left unbound', () => {
    const b = setBinding(DEFAULT_BINDINGS, 'gas', 'KeyJ');
    expect(b.gas[0]).toBe('KeyJ');
    expect(valid(b)).toBe(true);
    // R is just a key now: binding it moves nothing else.
    const c = setBinding(DEFAULT_BINDINGS, 'gas', 'KeyR');
    expect(c.gas[0]).toBe('KeyR');
    expect(valid(c)).toBe(true);
    // Reserved keys are refused, the input is not mutated.
    expect(setBinding(DEFAULT_BINDINGS, 'gas', 'Escape')).toEqual(DEFAULT_BINDINGS);
    expect('reset' in DEFAULT_BINDINGS).toBe(false); // the R reset-upright feature is gone
    // A long random sequence of rebinds always leaves a valid map.
    let cur = setBinding(DEFAULT_BINDINGS, 'gas', 'KeyJ');
    const codes = ['KeyJ', 'KeyK', 'KeyR', 'ArrowUp', 'Space', 'KeyM', 'KeyA', 'Digit1'];
    for (let i = 0; i < 80; i++) {
      cur = setBinding(cur, ACTIONS[i % ACTIONS.length], codes[(i * 5) % codes.length]);
      expect(valid(cur)).toBe(true);
    }
  });

  it('names keys for the menus', () => {
    expect(keyLabel('ArrowRight')).toBe('→');
    expect(keyLabel('KeyD')).toBe('D');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(bindingText(DEFAULT_BINDINGS, 'gas')).toBe('→ / D');
  });

  it('volume, shake and particle settings do what they say', () => {
    const s = defaultSettings();
    s.master = 0.5;
    s.music = 0.5;
    s.sfx = 0.2;
    expect(musicLevel(s)).toBeCloseTo(0.25);
    expect(sfxLevel(s)).toBeCloseTo(0.1);
    s.shake = 0.4;
    expect(shakeScale(s)).toBe(0.4);
    s.reducedMotion = true;
    expect(shakeScale(s)).toBe(0);
    expect(particleScale(s, 1)).toBeLessThan(0.5);
    s.reducedMotion = false;
    expect(particleScale(s, 0.3)).toBe(0.3);
  });

  it('colour-blind markers differ in shape AND colour for every pickup kind', () => {
    const marks = (['snack', 'fuel', 'wrench'] as const).map(pickupMark);
    expect(new Set(marks.map((m) => m.shape)).size).toBe(3);
    expect(new Set(marks.map((m) => m.fill)).size).toBe(3);
  });
});

describe('Phase 8: controls', () => {
  it('tracks keys by code, with one-shot presses and a focus-loss reset', () => {
    const k = new KeyTracker();
    k.press('KeyD');
    k.press('KeyD'); // key repeat
    expect(k.isDown('KeyD')).toBe(true);
    expect(k.justPressed('KeyD')).toBe(true);
    k.endFrame();
    expect(k.justPressed('KeyD')).toBe(false);
    k.press('KeyD'); // still held: not a new press
    expect(k.justPressed('KeyD')).toBe(false);
    k.release('KeyD');
    k.press('KeyD');
    expect(k.justPressed('KeyD')).toBe(true);
    k.clear();
    expect(k.isDown('KeyD')).toBe(false);
  });

  it('turns held keys into controls using the bindings, so rebinding really moves the controls', () => {
    const k = new KeyTracker();
    k.press('ArrowRight');
    k.press('KeyW');
    expect(heldFromKeys(k, DEFAULT_BINDINGS)).toEqual({ gas: 1, brake: 0, far: true, near: false });
    const moved = setBinding(DEFAULT_BINDINGS, 'gas', 'KeyJ');
    const k2 = new KeyTracker();
    k2.press('KeyJ');
    expect(heldFromKeys(k2, moved).gas).toBe(1);
    expect(heldFromKeys(k2, DEFAULT_BINDINGS).gas).toBe(0);
  });

  it('merges devices (strongest wins) and cancels opposite depth keys', () => {
    const m = mergeHeld({ gas: 0.4, brake: 0, far: false, near: true }, { gas: 0.9, brake: 0.2, far: false, near: false });
    expect(m).toEqual({ gas: 0.9, brake: 0.2, far: false, near: true });
    expect(laneDirOf({ gas: 0, brake: 0, far: true, near: true })).toBe(0);
    expect(laneDirOf({ gas: 0, brake: 0, far: true, near: false })).toBe(1);
    expect(laneDirOf({ gas: 0, brake: 0, far: false, near: true })).toBe(-1);
  });

  it('keeps the no-auto-gas rule for every device: nothing held means no throttle', () => {
    expect(playerInput({ gas: 0, brake: 0 }, true)).toEqual({ throttle: 0, brake: 0, lean: 0 });
    expect(playerInput({ gas: 0.5, brake: 0 }, true).throttle).toBe(0.5); // analog trigger
    expect(playerInput({ gas: 1, brake: 1 }, false)).toEqual({ throttle: 0, brake: 0, lean: 0 }); // dry tank
    expect(playerInput({ gas: 9, brake: -3 }, true)).toEqual({ throttle: 1, brake: 0, lean: 0 });
    expect(playerInput({ gas: true, brake: false }, true).throttle).toBe(1);
  });
});

const pad = (down: Record<number, number> = {}, axes: number[] = [0, 0, 0, 0]): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (down[i] ?? 0) > 0.5, value: down[i] ?? 0 })),
});

describe('Phase 8: gamepad', () => {
  it('has no controls without a pad, and ignores a drifting stick (deadzone)', () => {
    expect(padHeld(null)).toEqual({ gas: 0, brake: 0, far: false, near: false });
    expect(padHeld(pad({}, [0.1, -0.2, 0, 0]))).toEqual({ gas: 0, brake: 0, far: false, near: false });
  });

  it('drives with the triggers (analog), the face buttons, the D-pad and the stick', () => {
    expect(padHeld(pad({ 7: 0.6 })).gas).toBeCloseTo(0.6); // right trigger
    expect(padHeld(pad({ 6: 1 })).brake).toBe(1); // left trigger
    expect(padHeld(pad({ 0: 1 })).gas).toBe(1); // A
    expect(padHeld(pad({ 2: 1 })).brake).toBe(1); // X
    expect(padHeld(pad({ 15: 1 })).gas).toBe(1); // D-pad right
    expect(padHeld(pad({}, [0.8, 0, 0, 0])).gas).toBeCloseTo(0.8);
    expect(padHeld(pad({}, [-0.7, 0, 0, 0])).brake).toBeCloseTo(0.7);
  });

  it('drifts in depth with the stick or the D-pad', () => {
    expect(padHeld(pad({}, [0, -0.9, 0, 0])).far).toBe(true);
    expect(padHeld(pad({}, [0, 0.9, 0, 0])).near).toBe(true);
    expect(padHeld(pad({ 12: 1 })).far).toBe(true);
    expect(padHeld(pad({ 13: 1 })).near).toBe(true);
    expect(padHeld(pad({}, [0, 0.3, 0, 0])).near).toBe(false); // a nudge is not a drift
  });

  it('reports one-shot buttons once per press', () => {
    const e = new PadEdges();
    expect(e.update(padButtons(pad({ 9: 1 })))).toEqual({}); // already down when first seen: no edge
    expect(e.update(padButtons(pad({})))).toEqual({});
    expect(e.update(padButtons(pad({ 9: 1, 3: 1 })))).toEqual({ confirm: true, garage: true, start: true });
    expect(e.update(padButtons(pad({ 9: 1, 3: 1 })))).toEqual({}); // still held
    expect(padButtons(pad({ 8: 1 })).settings).toBe(true);
  });
});

describe('Phase 8: touch controls', () => {
  it('lays four buttons out on screen, above the HUD, without overlapping each other', () => {
    const rects = TOUCH_BUTTONS.map((b) => TOUCH_LAYOUT[b]);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(VIEW_W);
      expect(r.y).toBeGreaterThan(150);
      expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H - 72); // clear of the HUD bar
      expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(70); // a thumb fits
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it('maps fingers to buttons (multi-touch, sliding, and a little slop)', () => {
    const mid = (b: keyof typeof TOUCH_LAYOUT) => ({ x: TOUCH_LAYOUT[b].x + TOUCH_LAYOUT[b].w / 2, y: TOUCH_LAYOUT[b].y + TOUCH_LAYOUT[b].h / 2 });
    expect(touchHeld([])).toEqual({ gas: 0, brake: 0, far: false, near: false });
    expect(touchHeld([mid('gas'), mid('far')])).toEqual({ gas: 1, brake: 0, far: true, near: false });
    expect(touchHeld([mid('brake'), mid('near')])).toEqual({ gas: 0, brake: 1, far: false, near: true });
    const g = TOUCH_LAYOUT.gas;
    expect(buttonAt(g.x + g.w + 8, g.y + g.h / 2)).toBe('gas'); // just off the edge still counts
    expect(buttonAt(VIEW_W / 2, 100)).toBeNull();
  });

  it('shows the buttons when forced on, or on touch devices, never when off', () => {
    expect(touchVisible('on', false, false)).toBe(true);
    expect(touchVisible('off', true, true)).toBe(false);
    expect(touchVisible('auto', true, false)).toBe(true);
    expect(touchVisible('auto', false, false)).toBe(false);
    expect(touchVisible('auto', false, true)).toBe(true); // a first touch on a hybrid device
  });
});

describe('Phase 8: performance helpers', () => {
  it('pools objects: reuses them, caps the idle ones and shrugs off double release', () => {
    let made = 0;
    const dropped: number[] = [];
    const parked: number[] = [];
    const pool = new Pool(
      () => ++made,
      () => {},
      (n) => parked.push(n),
      2,
      (n) => dropped.push(n),
    );
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    pool.release(a);
    pool.release(a); // twice: ignored
    pool.release(b);
    pool.release(c); // over the idle cap
    expect(pool.idle).toBe(2);
    expect(dropped).toEqual([c]);
    expect(parked).toEqual([a, b]);
    expect(pool.acquire()).toBe(b); // last released first
    expect(pool.acquire()).toBe(a);
    expect(made).toBe(3);
    expect(pool.created).toBe(3);
  });

  it('steps effects quality down after sustained low fps, never back up, and ignores stalls', () => {
    const g = new QualityGovernor(45, 2);
    for (let i = 0; i < 300; i++) expect(g.update(1 / 60)).toBe(false); // smooth 60 fps
    expect(g.quality).toBe(QUALITY_LEVELS[0]);
    g.update(3); // a stall (tab in the background) is not slowness
    expect(g.quality).toBe(QUALITY_LEVELS[0]);
    let drops = 0;
    for (let i = 0; i < 400; i++) if (g.update(1 / 25)) drops++; // 25 fps
    expect(drops).toBeGreaterThanOrEqual(1);
    expect(g.quality).toBeLessThan(1);
    const low = g.quality;
    for (let i = 0; i < 600; i++) g.update(1 / 120);
    expect(g.quality).toBeLessThanOrEqual(low); // no flicker back up
    for (let i = 0; i < 4000; i++) g.update(1 / 20);
    expect(g.quality).toBe(QUALITY_LEVELS[QUALITY_LEVELS.length - 1]); // bottoms out
  });

  it('effects setting: auto follows the governor, full and reduced are fixed', () => {
    expect(effectsQuality('full', 0.3)).toBe(1);
    expect(effectsQuality('reduced', 1)).toBeLessThan(0.5);
    expect(effectsQuality('auto', 0.6)).toBe(0.6);
  });

  const particle = (life: number): Particle => ({
    kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, age: 0, life, r0: 1, r1: 2, color: 0, alpha: 1, gravity: 0, drag: 0, rot: 0, spin: 0,
  });

  it('particles: density thins the spray, dead ones are removed in place, the cap holds', () => {
    const ps = new ParticleSystem(50);
    ps.density = 0;
    for (let i = 0; i < 20; i++) ps.emit(particle(1));
    expect(ps.items.length).toBe(0);
    ps.density = 1;
    for (let i = 0; i < 80; i++) ps.emit(particle(i < 40 ? 0.1 : 5));
    expect(ps.items.length).toBe(50);
    const ref = ps.items;
    ps.update(0.5);
    expect(ps.items).toBe(ref); // same array, compacted
    expect(ps.items.every((p) => p.age < p.life)).toBe(true);
    ps.density = 0.5;
    let kept = 0;
    const big = new ParticleSystem(5000);
    big.density = 0.5;
    for (let i = 0; i < 2000; i++) big.emit(particle(1));
    kept = big.items.length;
    expect(kept).toBeGreaterThan(700);
    expect(kept).toBeLessThan(1300);
  });
});

describe('Phase 8 art: the road', () => {
  it('scatters the same details every time and never depends on the viewport', () => {
    const a = groundDetails('forest', 1000, 2000);
    const b = groundDetails('forest', 1000, 2000);
    expect(a).toEqual(b);
    const whole = groundDetails('desert', 0, 3000);
    const part = groundDetails('desert', 1200, 1800);
    const inside = whole.filter((d) => d.x >= 1200 && d.x < 1800);
    expect(part).toEqual(inside);
  });

  it('keeps details within the field and foreground, and a bounded count per screen', () => {
    for (const biome of ['forest', 'desert', 'snow', 'swamp'] as const) {
      const ds = groundDetails(biome, 0, VIEW_W + 40);
      expect(ds.length).toBeGreaterThan(8);
      expect(ds.length).toBeLessThan(140);
      for (const d of ds) {
        expect(d.f).toBeGreaterThanOrEqual(-FOREGROUND_DEPTH);
        expect(d.f).toBeLessThanOrEqual(FIELD_DEPTH);
        expect(d.size).toBeGreaterThanOrEqual(0.6);
        expect(d.size).toBeLessThanOrEqual(1.4);
      }
      // Far first, so nearer details paint over farther ones.
      for (let i = 1; i < ds.length; i++) expect(ds[i - 1].f).toBeGreaterThanOrEqual(ds[i].f);
    }
  });

  it('suits the biome: sparkles and ice only in snow, ripples not in the forest, puddles only on the track', () => {
    const kinds = (b: 'forest' | 'desert' | 'snow' | 'swamp') => new Set(groundDetails(b, 0, 20000).map((d) => d.kind));
    expect(kinds('snow').has('sparkle')).toBe(true);
    expect(kinds('forest').has('sparkle')).toBe(false);
    expect(kinds('forest').has('ripple')).toBe(false);
    expect(kinds('desert').has('ripple')).toBe(true);
    expect(kinds('swamp').has('puddle')).toBe(true);
    for (const d of groundDetails('swamp', 0, 20000)) if (d.kind === 'crack') expect(d.f).toBeLessThan(1.7);
  });

  it('density 0 draws nothing and a lower density draws fewer', () => {
    expect(groundDetails('forest', 0, 5000, 0)).toEqual([]);
    expect(groundDetails('forest', 0, 5000, 0.3).length).toBeLessThan(groundDetails('forest', 0, 5000, 1).length);
  });

  it('ruts run long but break off here and there, in every depth band', () => {
    expect(RUT_DEPTHS.length).toBeGreaterThanOrEqual(5);
    RUT_DEPTHS.forEach((_, i) => {
      let on = 0;
      for (let x = 0; x < 200 * 260; x += 260) if (ruttedAt(i, x)) on++;
      expect(on).toBeGreaterThan(130);
      expect(on).toBeLessThan(200);
    });
    expect(Math.max(...RUT_DEPTHS)).toBeLessThan(LANES.count);
  });
});

describe('Phase 8 art: the lifted trucks', () => {
  it('big tires: the tread meets the ground, and the tire is bigger than the physics wheel', () => {
    expect(TRUCK.tireRadius).toBeGreaterThan(PHYSICS.wheelRadius);
    expect(TRUCK.lift).toBeGreaterThanOrEqual(20);
    // Level truck: the physics wheel's lowest point is the ground; the drawn tire is centred tireRise higher.
    expect(tireRise(1)).toBe(TRUCK.tireRadius - PHYSICS.wheelRadius);
    expect(TRUCK.wheels[0].y + PHYSICS.wheelRadius - axleY(1)).toBeCloseTo(tireRadius(1));
    expect(tireRadius(1.2)).toBeGreaterThan(tireRadius(1));
    expect(tireRise(0.95)).toBeLessThan(tireRise(1.2));
  });

  it('wheels turn at the speed the tread moves over the ground', () => {
    const r = tireRadius(1);
    expect(tireSpin(2 * Math.PI * r)).toBeCloseTo(2 * Math.PI);
    expect(tireSpin(100, 1.2)).toBeLessThan(tireSpin(100, 1)); // a bigger tire turns slower
  });

  it('the roof rides above the lifted body, so a flipped truck rests on its drawn roof', () => {
    const roof = TRUCK.body.filter((p) => p.y < -40);
    expect(roof.length).toBe(2);
    for (const p of roof) expect(p.y).toBeLessThanOrEqual(-30 - TRUCK.lift);
  });

  it('still drives, jumps and lands like before: rests on its wheels and climbs the start', () => {
    const terrain = new Terrain(3);
    const t = new TruckPhysics(300, BASE_Y - 45);
    for (let i = 0; i < 60 * 4 * PHYSICS.substeps; i++) {
      terrain.ensure(t.x + 2500);
      t.step(1 / 60 / PHYSICS.substeps, { throttle: 1, brake: 0, lean: 0 }, terrain);
    }
    expect(t.grounded || t.airTime > 0).toBe(true);
    expect(t.x).toBeGreaterThan(900);
    expect(Number.isFinite(t.y)).toBe(true);
    expect(t.flipped).toBe(false);
  });
});
