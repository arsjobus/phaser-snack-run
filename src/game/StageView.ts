import Phaser from 'phaser';
import { BASE_Y, STUNT, VIEW_W } from '../config';
import { showCarKey } from '../art/show';
import type { AudioSystem } from '../audio/AudioSystem';
import { emitBurst, emitFlame, emitFountain, emitJet, SkyShow } from './Fireworks';
import { laneDepth, laneProject, laneScale, laneShade } from './Lanes';
import { PAD_COLORS, PAD_FAR, PAD_NEAR, chevronLit, chevronOutline, chevronStarts, padY } from './PadArt';
import { ParticleSystem, particleFade, particleRadius } from './Particles';
import { StageLocator } from './Show';
import type { PadSpot, StuntLayout } from './Stunt';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';

/** Lanes the pyro stands stand in: the near and the far edge of the field, so the jets flank the road. */
const PYRO_LANES = [0, 3] as const;

interface Burn {
  layout: StuntLayout;
  site: 'launch' | 'landing';
  x: number;
  age: number;
  acc: number;
}

/**
 * Everything the Phase 9 stage looks like in the scene: the boost pads painted on the road, the
 * entrance arch, the parked cars in the pit, the pyro stands and their jets, the CRUNCH fireworks
 * and the rocket exhaust. Owns its own graphics and particle pool; the scene calls `update` once
 * per frame and forwards the show events.
 */
export class StageView {
  private pads: Phaser.GameObjects.Graphics;
  private shadows: Phaser.GameObjects.Graphics;
  /** Additive layers: the letters hang behind the trucks, sparks and flames burn in front. */
  private skyGfx: Phaser.GameObjects.Graphics;
  private sparkGfx: Phaser.GameObjects.Graphics;
  private cars = new Map<string, Phaser.GameObjects.Image>();
  private stands = new Map<string, Phaser.GameObjects.Image>();
  private arches = new Map<number, Phaser.GameObjects.Image>();
  private burns: Burn[] = [];
  private sky: SkyShow | null = null;
  private locator: StageLocator;
  /** Glowing particles of the show (letters, shells, fountains, jets). */
  readonly parts = new ParticleSystem(1800);
  /** Reduced motion: thinner jets and exhaust (the lettering always stays whole). */
  calm = false;

  constructor(
    private scene: Phaser.Scene,
    private terrain: Terrain,
    startX: number,
    private audio: () => AudioSystem,
  ) {
    this.locator = new StageLocator(startX);
    this.pads = scene.add.graphics().setDepth(1.3);
    this.shadows = scene.add.graphics().setDepth(1.55);
    this.skyGfx = scene.add.graphics().setDepth(1.1).setBlendMode(Phaser.BlendModes.ADD);
    this.sparkGfx = scene.add.graphics().setDepth(4.6).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** A pyro jet fires at a site of the stage. */
  pyro(layout: StuntLayout, site: 'launch' | 'landing', x: number): void {
    this.burns.push({ layout, site, x, age: 0, acc: 0 });
    this.audio().pyro();
  }

  /** The CRUNCH fireworks start. */
  startSky(layout: StuntLayout): void {
    const a = this.audio();
    this.sky = new SkyShow(this.parts, Math.random, layout.skyX, layout.skyY, BASE_Y - 24, (what) => {
      if (what === 'rocket') a.rocket();
      else a.burst(what === 'burst');
    });
  }

  /** A burst of sparks at a world point (a pad hit, a landing). */
  sparks(x: number, y: number, color: number, n = 16): void {
    emitBurst(this.parts, Math.random, x, y, color, n, 0.7);
  }

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera, seconds: number, truck: TruckPhysics, laneF: number, surging: boolean): void {
    const left = cam.scrollX - 320;
    const right = cam.scrollX + VIEW_W + 320;
    const stage = this.locator.at(left);
    this.shadows.clear();
    this.pads.clear();
    const visible = stage.x0 < right && stage.x1 > left;
    if (visible) {
      this.drawPads(stage, left, right, seconds);
      this.syncProps(stage, left, right);
    } else {
      this.releaseAll();
    }

    // Rocket exhaust while the surge is on.
    if (surging) {
      const cos = Math.cos(truck.angle);
      const sin = Math.sin(truck.angle);
      const n = this.calm ? 1 : 3;
      emitJet(this.parts, Math.random, truck.x - 62 * cos - 6 * sin, laneProject(this.terrain.heightAt(truck.x), truck.y - 62 * sin + 4 * cos, laneF), truck.speed, n);
    }

    this.burn(dt);
    this.sky?.update(dt);
    if (this.sky?.done) this.sky = null;
    this.parts.update(dt);
    this.render();
  }

  private releaseAll(): void {
    for (const m of [this.cars, this.stands]) {
      for (const im of m.values()) im.destroy();
      m.clear();
    }
    for (const im of this.arches.values()) im.destroy();
    this.arches.clear();
  }

  /** The pads: dark panels across the whole field with a wave of red chevrons running over them. */
  private drawPads(stage: StuntLayout, left: number, right: number, seconds: number): void {
    const g = this.pads;
    const T = this.terrain;
    for (const pad of stage.pads) {
      if (pad.x1 < left || pad.x0 > right) continue;
      this.drawPad(g, T, pad, seconds);
    }
  }

  private drawPad(g: Phaser.GameObjects.Graphics, T: Terrain, pad: PadSpot, seconds: number): void {
    const steps = 4;
    const xs: number[] = [];
    for (let i = 0; i <= steps; i++) xs.push(pad.x0 + ((pad.x1 - pad.x0) * i) / steps);
    const yAt = (x: number, lane: number) => padY(T.heightAt(x), lane);
    const top = xs.map((x) => new Phaser.Geom.Point(x, yAt(x, PAD_FAR)));
    const bottom = xs.map((x) => new Phaser.Geom.Point(x, yAt(x, PAD_NEAR))).reverse();
    const outline = [...top, ...bottom];
    g.fillStyle(PAD_COLORS.outline, 1);
    g.fillPoints(outline, true);
    g.fillStyle(PAD_COLORS.panel, 1);
    const inset = (p: Phaser.Geom.Point, i: number) => new Phaser.Geom.Point(p.x, p.y + (i < xs.length ? 2 : -2));
    g.fillPoints(outline.map(inset), true);
    // Red chevrons, centred across the field, lit one after the other (a wave towards the ramp).
    chevronStarts(pad.x1 - pad.x0).forEach((xa, k) => {
      const pts = chevronOutline(pad.x0 + xa, 26, 13).map((p) => new Phaser.Geom.Point(p.x, yAt(p.x, p.lane)));
      g.fillStyle(chevronLit(k, seconds) ? PAD_COLORS.lit : PAD_COLORS.dim, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, PAD_COLORS.outline, 1);
      g.strokePoints(pts, true);
    });
  }

  /** Cars, stands and the arch: created while on screen, destroyed when left behind. */
  private syncProps(stage: StuntLayout, left: number, right: number): void {
    const T = this.terrain;
    // The entrance arch stands before the first pad.
    const archX = stage.pads[0].x0 - 150;
    if (archX > left - 200 && archX < right + 200) {
      let arch = this.arches.get(stage.index);
      if (!arch) {
        arch = this.scene.add.image(archX, T.heightAt(archX) + 4, 'boost_arch').setOrigin(0.5, 1).setDepth(0.5);
        this.arches.set(stage.index, arch);
      }
    }
    // Parked cars in four rows: nearer rows are bigger and lower.
    stage.cars.forEach((c, i) => {
      const key = `${stage.index}:${i}`;
      const shown = c.x > left - 80 && c.x < right + 80;
      let im = this.cars.get(key);
      if (shown && !im) {
        im = this.scene.add.image(c.x, 0, showCarKey(c.variant)).setOrigin(0.5, 1);
        this.cars.set(key, im);
      } else if (!shown && im) {
        im.destroy();
        this.cars.delete(key);
        return;
      }
      if (!im) return;
      const gy = T.heightAt(c.x);
      const shade = laneShade(c.lane);
      im.setPosition(c.x, laneProject(gy, gy + 2, c.lane))
        .setScale(laneScale(c.lane))
        .setTint(Phaser.Display.Color.GetColor(shade, shade, shade))
        .setDepth(laneDepth(c.lane, 0.015));
      this.shadows.fillStyle(0x000000, 0.28);
      this.shadows.fillEllipse(c.x, gy - c.lane * 15 + 2, 118 * laneScale(c.lane), 11 * laneScale(c.lane));
    });
    // Pyro stands at the lip and on the landing table, at the near and far edge of the field.
    for (const site of stage.pyro) {
      for (const lane of PYRO_LANES) {
        const key = `${stage.index}:${site.site}:${lane}`;
        let im = this.stands.get(key);
        if (!im) {
          im = this.scene.add.image(site.x, 0, 'pyro_stand').setOrigin(0.5, 1);
          this.stands.set(key, im);
        }
        const gy = T.heightAt(site.x);
        const shade = laneShade(lane);
        im.setPosition(site.x, laneProject(gy, gy + 2, lane))
          .setScale(laneScale(lane) * 1.1)
          .setTint(Phaser.Display.Color.GetColor(shade, shade, shade))
          .setDepth(laneDepth(lane, 0.03));
      }
    }
  }

  /** Jets burn for `STUNT.pyroTime`: a cold-spark fountain at every stand plus pulses of flame. */
  private burn(dt: number): void {
    const T = this.terrain;
    for (const b of this.burns) {
      b.age += dt;
      const active = b.age < STUNT.pyroTime;
      if (!active) continue;
      b.acc += dt * (this.calm ? 40 : 90);
      const n = Math.floor(b.acc);
      b.acc -= n;
      const flames = b.age < 0.9 && Math.floor(b.age * 6) % 2 === 0 ? (this.calm ? 1 : 3) : 0;
      for (const lane of PYRO_LANES) {
        const sc = laneScale(lane) * 1.1;
        const gy = T.heightAt(b.x);
        const nozzleY = laneProject(gy, gy + 2, lane) - 72 * sc;
        emitFountain(this.parts, Math.random, b.x, nozzleY, Math.max(0, Math.round(n * sc)));
        if (flames) emitFlame(this.parts, Math.random, b.x, nozzleY, flames);
      }
    }
    this.burns = this.burns.filter((b) => b.age < STUNT.pyroTime);
  }

  private render(): void {
    const sky = this.skyGfx;
    const sp = this.sparkGfx;
    sky.clear();
    sp.clear();
    for (const p of this.parts.items) {
      const fade = particleFade(p) * p.alpha;
      const r = particleRadius(p);
      switch (p.kind) {
        case 'star': {
          const tw = 0.78 + 0.22 * Math.sin(p.age * 18 + p.rot * 5);
          sky.fillStyle(p.color, 0.2 * fade * tw);
          sky.fillCircle(p.x, p.y, r * 2.8);
          sky.fillStyle(p.color, fade * tw);
          sky.fillCircle(p.x, p.y, r);
          sky.fillStyle(0xffffff, 0.8 * fade * tw);
          sky.fillCircle(p.x, p.y, r * 0.45);
          break;
        }
        case 'flame': {
          const k = Math.min(1, p.age / p.life);
          sp.fillStyle(k < 0.5 ? p.color : 0xff5a1a, 0.85 * (1 - k));
          sp.fillCircle(p.x, p.y, r);
          break;
        }
        default: {
          sp.lineStyle(2, p.color, fade);
          sp.lineBetween(p.x, p.y, p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        }
      }
    }
  }

  destroy(): void {
    this.releaseAll();
    this.pads.destroy();
    this.shadows.destroy();
    this.skyGfx.destroy();
    this.sparkGfx.destroy();
  }
}
