import Phaser from 'phaser';
import {
  BASE_Y,
  ART,
  CAMERA,
  FUEL,
  FX,
  GAMEPLAY,
  PHYSICS,
  PX_PER_METER,
  RIVALS,
  SCROLL_Y0,
  TERRAIN_STEP,
  TRUCK,
  VIEW_H,
  VIEW_W,
  WRECKS,
  WRENCH,
} from '../config';
import { RIVAL_PAINT, rivalTruckKey, shade } from '../art/trucks';
import { Beeper } from '../game/Beeper';
import { biomeAtX, biomeChangesAt, biomeSegments, type Biome } from '../game/Biomes';
import { checkpointMeters } from '../game/Checkpoint';
import { truckCircles } from '../game/Collision';
import { emitCrash, emitDust, emitLanding, emitMud, emitSmoke, sprayRate } from '../game/Effects';
import { ParticleSystem, particleFade, particleRadius } from '../game/Particles';
import { TrackMarks } from '../game/TrackMarks';
import { RIVAL_STYLES } from '../game/Rival';
import { HUD_H, Hud } from '../game/Hud';
import { warnTick } from '../game/HudModel';
import { Race, type RaceEvent } from '../game/Race';
import { RivalView } from '../game/RivalView';
import { hashSeed } from '../game/Rng';
import { Parallax } from '../game/Parallax';
import { RunModel, type RunEvent } from '../game/Run';
import { Terrain } from '../game/Terrain';
import { TruckPhysics } from '../game/TruckPhysics';
import { TruckView } from '../game/TruckView';
import { wreckCircles, type Wreck } from '../game/Wrecks';
import type { InputState } from '../game/Input';

const FIXED_DT = 1 / 60 / PHYSICS.substeps;
const TUFT_SPACING = 72;
const GATE_X = GAMEPLAY.startX + 420;
interface WreckSprite {
  body: Phaser.GameObjects.Image;
  wheels: Phaser.GameObjects.Image[];
  smokeClock: number;
}

const TITLES = { fuel: 'OUT OF FUEL', time: 'TIME UP', wreck: 'WRECKED' } as const;

export class GameScene extends Phaser.Scene {
  private terrain!: Terrain;
  private truck!: TruckPhysics;
  private view!: TruckView;
  private parallax!: Parallax;
  private run!: RunModel;
  private hudBar!: Hud;
  private ground!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private warn!: Phaser.GameObjects.Text;
  private cpToast!: Phaser.GameObjects.Text;
  private beeper!: Beeper;
  private race!: Race;
  private fx!: Phaser.GameObjects.Graphics;
  private posText!: Phaser.GameObjects.Text;
  private rivalViews = new Map<number, RivalView>();
  private wreckSprites = new Map<number, WreckSprite>();
  private particles = new ParticleSystem();
  private tracks = new TrackMarks();
  private decals!: Phaser.GameObjects.Graphics;
  /** Fractional particle counts carried between frames, per wheel key. */
  private sprayAcc = new Map<string, number>();
  private biome!: Biome;
  private smokeClock = 0;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private gates = new Map<number, Phaser.GameObjects.GameObject[]>();

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private acc = 0;
  private seed = 0;
  private autoThrottle = GAMEPLAY.autoGas;
  private debug = false;
  private bestAir = 0;
  private flippedTimer = 0;
  private overAt = 0;
  private startX = GAMEPLAY.startX;
  private lastBeepTick = -1;

  constructor() {
    super('Game');
  }

  create(): void {
    // Scene instances are reused on restart, so reset every piece of run state here.
    this.acc = 0;
    this.autoThrottle = GAMEPLAY.autoGas;
    this.debug = false;
    this.bestAir = 0;
    this.flippedTimer = 0;
    this.overAt = 0;
    this.sprites.clear();
    this.gates.clear();
    this.rivalViews.clear();
    this.wreckSprites.clear();
    this.particles = new ParticleSystem();
    this.tracks = new TrackMarks();
    this.sprayAcc.clear();
    this.smokeClock = 0;
    this.lastBeepTick = -1;
    this.beeper = new Beeper(this.sound);

    const param = new URLSearchParams(window.location.search).get('seed');
    this.seed = param ? hashSeed(param) : Math.floor(Math.random() * 2 ** 31);

    this.terrain = new Terrain(this.seed);
    this.run = new RunModel(this.seed, this.terrain, this.startX);
    this.race = new Race(this.seed, this.terrain, this.run.wrecks, this.startX);
    this.biome = biomeAtX(this.startX, this.startX);
    this.parallax = new Parallax(this, this.biome.id);
    this.ground = this.add.graphics().setDepth(1);
    this.decals = this.add.graphics().setDepth(1.2);
    this.addStartGate();
    this.truck = new TruckPhysics(this.startX, BASE_Y - 45);
    this.view = new TruckView(this);
    this.fx = this.add.graphics().setDepth(4.5);
    this.debugGfx = this.add.graphics().setDepth(5);
    this.hudBar = new Hud(this);

    const text = (size: number, color: string) => ({
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color,
      stroke: '#000',
      strokeThickness: size > 20 ? 5 : 3,
    });
    this.hud = this.add.text(12, 10, '', text(16, '#ffffff')).setScrollFactor(0).setDepth(10);
    this.hint = this.add
      .text(
        VIEW_W / 2,
        VIEW_H - HUD_H - 30,
        [
          '←/A brake   ↑/W lean back   ↓/S lean forward   R reset   T auto-gas   M mute   H debug',
          'BRAKE for wrecks · tuck in behind a rival to draft · ram it to wreck it for a takedown',
        ],
        { ...text(13, '#ffffff'), align: 'center' },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10);
    this.posText = this.add
      .text(VIEW_W - 12, 10, '', { ...text(20, '#ffffff'), align: 'right' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10);
    this.toast = this.add
      .text(VIEW_W / 2, 90, '', text(34, '#ffe066'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);
    this.warn = this.add
      .text(VIEW_W / 2, 150, '', text(30, '#ff5a4a'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);
    this.cpToast = this.add
      .text(VIEW_W / 2, 128, '', { ...text(26, '#9be0ff'), align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 9000, duration: 1200 });

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,R,T,H,M,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

    this.terrain.ensure(this.startX + VIEW_W + 1500);
    const cam = this.cameras.main;
    cam.setScroll(this.truck.x - VIEW_W * CAMERA.xAnchor, SCROLL_Y0);
  }

  private addStartGate(): void {
    const y = this.terrain.heightAt(GATE_X) + 4;
    this.add.image(GATE_X, y, 'start_gate').setOrigin(0.5, 1).setDepth(0.5);
  }

  private readInput(): InputState {
    if (this.run.over) return { throttle: 0, brake: 0, lean: 0 };
    const k = this.keys;
    const c = this.cursors;
    const engine = this.run.engineOn; // a dry tank means no throttle and no brake torque
    const gas = engine && (c.right.isDown || k.D.isDown || this.autoThrottle);
    const brake = engine && (c.left.isDown || k.A.isDown);
    const back = c.up.isDown || k.W.isDown;
    const fwd = c.down.isDown || k.S.isDown;
    return { throttle: gas ? 1 : 0, brake: brake ? 1 : 0, lean: (fwd ? 1 : 0) - (back ? 1 : 0) };
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    const J = Phaser.Input.Keyboard.JustDown;
    if (this.run.over) {
      if (J(this.keys.R) || J(this.keys.SPACE) || J(this.keys.ENTER)) this.restart();
    } else {
      if (J(this.keys.R)) this.recover();
      if (J(this.keys.T)) this.autoThrottle = !this.autoThrottle;
    }
    if (J(this.keys.H)) this.debug = !this.debug;
    if (J(this.keys.M)) this.sound.mute = !this.sound.mute;

    // Fixed-step physics (substeps keep the stiff suspension stable)
    const input = this.readInput();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 40) {
      this.terrain.ensure(this.truck.x + VIEW_W + 1500);
      const ev = this.truck.step(FIXED_DT, input, this.terrain);
      this.race.stepPhysics(FIXED_DT);
      if (ev.landedAirTime !== null) this.onLanded(ev.landedAirTime);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === 40) this.acc = 0;
    this.terrain.prune(this.truck.x - 1800);

    for (const e of this.run.update(dt, this.truck)) this.onRunEvent(e);
    for (const e of this.race.update(dt, this.truck, this.run.meters, !this.run.over)) {
      this.onRaceEvent(e);
    }
    this.lowFuelBeep();

    // Auto-recover when stuck upside down
    this.flippedTimer =
      !this.run.over && this.truck.flipped && this.truck.speed < 80 ? this.flippedTimer + dt : 0;
    if (this.flippedTimer > GAMEPLAY.flipRecoverTime) this.recover();

    this.updateCamera(dt);
    this.view.update(this.truck, this.terrain, dt);
    this.syncBiome();
    this.drawGround();
    this.syncPickups(time / 1000);
    this.syncRivals(dt);
    this.syncWrecks(dt);
    this.updateFx(dt);
    this.drawDecals();
    this.syncGates();
    this.parallax.update(this.cameras.main.scrollX, this.cameras.main.scrollY, dt);
    this.drawDebug();
    this.updateHud();
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const tx = this.truck.x + this.truck.vx * CAMERA.lookAhead - VIEW_W * CAMERA.xAnchor;
    const ty = this.truck.y - VIEW_H * CAMERA.yAnchor;
    cam.scrollX = tx;
    cam.scrollY += (ty - cam.scrollY) * (1 - Math.exp(-CAMERA.yLerp * dt));
  }

  /** The backdrop follows the screen centre, so it has changed by the time the new ground arrives. */
  private syncBiome(): void {
    const cam = this.cameras.main;
    const mid = biomeAtX(cam.scrollX + VIEW_W / 2, this.startX);
    this.parallax.setBiome(mid.id);
    this.biome = biomeAtX(this.truck.x, this.startX); // what the wheels are rolling on
  }

  private drawGround(): void {
    const cam = this.cameras.main;
    const g = this.ground;
    const x0 = Math.floor(cam.scrollX / TERRAIN_STEP) * TERRAIN_STEP - TERRAIN_STEP;
    const x1 = cam.scrollX + VIEW_W + TERRAIN_STEP * 2;
    const bottom = cam.scrollY + VIEW_H + 80;
    g.clear();

    // Paint one strip of terrain between xa and xb. Segment borders sit on terrain sample steps
    // (or are clipped to them), so neighbouring biomes meet exactly at the checkpoint gate.
    const strip = (color: number, topOffset: number, bottomOffset: number | null, xa: number, xb: number) => {
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(xa, this.terrain.heightAt(xa) + topOffset);
      for (let x = Math.ceil(xa / TERRAIN_STEP) * TERRAIN_STEP; x < xb; x += TERRAIN_STEP) {
        if (x > xa) g.lineTo(x, this.terrain.heightAt(x) + topOffset);
      }
      g.lineTo(xb, this.terrain.heightAt(xb) + topOffset);
      if (bottomOffset === null) {
        g.lineTo(xb, bottom);
        g.lineTo(xa, bottom);
      } else {
        g.lineTo(xb, this.terrain.heightAt(xb) + bottomOffset);
        for (let x = Math.floor(xb / TERRAIN_STEP) * TERRAIN_STEP; x > xa; x -= TERRAIN_STEP) {
          if (x < xb) g.lineTo(x, this.terrain.heightAt(x) + bottomOffset);
        }
        g.lineTo(xa, this.terrain.heightAt(xa) + bottomOffset);
      }
      g.closePath();
      g.fillPath();
    };

    for (const seg of biomeSegments(x0, x1, this.startX)) {
      const c = seg.biome.ground;
      const { x0: xa, x1: xb } = seg;
      strip(c.dirt, 0, null, xa, xb);
      strip(c.deep, 44, null, xa, xb);
      strip(c.crust, 0, 10, xa, xb); // sunlit crust
      strip(c.crustShadow, 10, 15, xa, xb);
      strip(c.rut1, 22, 26, xa, xb); // tire ruts, like the reference's rutted mud
      strip(c.rut2, 33, 36, xa, xb);
      // The far lane's road: a raised shelf of dirt, so trucks driving there rest on something.
      strip(shade(c.crust, 0.78), -RIVALS.farOffset, 0, xa, xb);
      strip(c.crustShadow, -RIVALS.farOffset, -RIVALS.farOffset + 3, xa, xb);
      this.drawTufts(seg.biome, xa, xb);
    }
  }

  /** Verge tufts (deterministic by world position): grass, dry scrub, frost or reeds. */
  private drawTufts(biome: Biome, xa: number, xb: number): void {
    const g = this.ground;
    const { color, shape } = biome.tuft;
    g.fillStyle(color, 1);
    for (let k = Math.floor(xa / TUFT_SPACING) - 1; k * TUFT_SPACING < xb; k++) {
      const r = ((Math.imul(k, 2654435761) >>> 0) % 1000) / 1000;
      if (r > 0.6) continue;
      const x = k * TUFT_SPACING + r * 90;
      if (x < xa || x > xb) continue;
      const y = this.terrain.heightAt(x) + 1;
      switch (shape) {
        case 'grass':
          g.fillTriangle(x - 5, y, x - 1, y, x - 4, y - 9);
          g.fillTriangle(x - 2, y, x + 2, y, x, y - 12);
          g.fillTriangle(x + 1, y, x + 5, y, x + 4, y - 8);
          break;
        case 'scrub': // low, wide dry bush with a woody centre
          g.fillTriangle(x - 9, y, x - 2, y, x - 7, y - 7);
          g.fillTriangle(x - 4, y, x + 5, y, x + 1, y - 10);
          g.fillTriangle(x + 2, y, x + 9, y, x + 7, y - 6);
          break;
        case 'frost': // snow clumps with an icy crystal
          g.fillEllipse(x, y - 2, 16, 6);
          g.fillTriangle(x - 2, y - 3, x + 2, y - 3, x, y - 11);
          break;
        case 'reed': // tall thin blades with a cattail
          g.fillRect(x - 4, y - 16, 1.5, 16);
          g.fillRect(x, y - 20, 1.5, 20);
          g.fillRect(x + 4, y - 14, 1.5, 14);
          g.fillStyle(0x5b3a1e, 1);
          g.fillRect(x - 0.5, y - 26, 3, 7);
          g.fillStyle(color, 1);
          break;
      }
    }
  }

  /** Tire tracks on the crust, in the colour of the biome they were laid in. */
  private drawDecals(): void {
    const cam = this.cameras.main;
    this.tracks.cull(cam.scrollX - 120);
    const g = this.decals;
    g.clear();
    const right = cam.scrollX + VIEW_W + 60;
    // Join touching segments of one colour into a single stroked path (far fewer draw calls).
    let open = false;
    let color = -1;
    let endX = Number.NaN;
    const y = (x: number) => this.terrain.heightAt(x) + 3;
    for (const seg of this.tracks.segments) {
      if (seg.x0 > right) continue;
      if (!open || seg.color !== color || seg.x0 !== endX) {
        if (open) g.strokePath();
        g.lineStyle(FX.tracks.width, seg.color, FX.tracks.alpha);
        g.beginPath();
        g.moveTo(seg.x0, y(seg.x0));
        open = true;
        color = seg.color;
      }
      g.lineTo(seg.x1, y(seg.x1));
      endX = seg.x1;
    }
    if (open) g.strokePath();
  }

  private syncPickups(seconds: number): void {
    const cam = this.cameras.main;
    const left = cam.scrollX - 60;
    const right = cam.scrollX + VIEW_W + 60;
    for (const p of this.run.pickups.items) {
      const visible = !p.taken && p.x > left && p.x < right;
      let sprite = this.sprites.get(p.id);
      if (visible && !sprite) {
        const key = p.kind === 'fuel' ? 'fuel_can' : p.kind === 'wrench' ? 'wrench' : 'snack';
        sprite = this.add.image(p.x, p.y, key).setDepth(2.5);
        if (p.kind === 'wrench') sprite.setAngle(-14);
        this.sprites.set(p.id, sprite);
      }
      if (!sprite) continue;
      if (visible && p.kind !== 'wrench') sprite.y = p.y + Math.sin(seconds * 4 + p.id) * 3;
      else if (!p.taken) {
        sprite.destroy();
        this.sprites.delete(p.id);
      }
    }
  }

  private popup(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private onRunEvent(e: RunEvent): void {
    switch (e.type) {
      case 'snack':
      case 'fuel':
      case 'wrench': {
        const sprite = this.sprites.get(e.pickup.id);
        if (sprite) {
          this.sprites.delete(e.pickup.id);
          this.tweens.add({
            targets: sprite,
            scale: 1.9,
            alpha: 0,
            duration: 180,
            onComplete: () => sprite.destroy(),
          });
        }
        if (e.type === 'wrench') {
          this.beeper.wrench();
          const label = e.repaired > 0 ? `REPAIR -${Math.round(e.repaired * 100)}%` : 'WRENCH';
          this.popup(e.pickup.x, e.pickup.y - 24, label, e.repaired > 0 ? '#9be0ff' : '#c9ced6');
        } else if (e.type === 'snack') {
          const label = e.multiplier > 1 ? `+${e.points} x${e.multiplier}` : `+${e.points}`;
          this.popup(e.pickup.x, e.pickup.y - 18, label, '#ffe066');
        } else {
          this.popup(e.pickup.x, e.pickup.y - 24, `FUEL +${Math.round(FUEL.canRestore * 100)}%`, '#7dff8a');
          this.tweens.killTweensOf(this.warn);
          this.warn.setAlpha(0);
        }
        break;
      }
      case 'checkpoint':
        this.celebrateCheckpoint(e.index, e.timeAdded, e.points, e.fuelAdded);
        break;
      case 'empty':
        this.tweens.killTweensOf(this.warn);
        this.warn.setText('OUT OF FUEL!').setAlpha(1);
        break;
      case 'over':
        this.overAt = this.time.now;
        this.showGameOver();
        break;
      case 'damage':
        this.popup(this.truck.x, this.truck.y - 70, `DAMAGE +${Math.round(e.amount * 100)}%`, '#ff6a5a');
        break;
      case 'miss':
      case 'timeup':
        break;
    }
  }

  /** Bumps, wrecks and takedowns from the race model. */
  private onRaceEvent(e: RaceEvent): void {
    switch (e.type) {
      case 'bump': {
        const hard = e.damage > 0;
        this.beeper.thud(hard);
        emitDust(this.particles, Math.random, this.biome, e.x, e.y, 0, hard ? 8 : 4);
        if (hard) emitCrash(this.particles, Math.random, e.x, e.y - 8, Math.min(1, e.impact / 520), 0xf2c200);
        if (hard) {
          this.cameras.main.shake(140, Math.min(0.012, 0.004 + e.impact / 60000));
          for (const ev of this.run.hurt(e.damage)) this.onRunEvent(ev);
        }
        break;
      }
      case 'wrecked':
        this.beeper.thud(true);
        emitCrash(this.particles, Math.random, e.x, e.y - 10, 1, RIVAL_PAINT[Math.max(0, RIVAL_STYLES.findIndex((st) => st.number === e.number))].body);
        break;
      case 'takedown': {
        const points = this.run.takedown();
        this.beeper.takedown();
        this.popup(e.x, e.y - 60, `TAKEDOWN #${e.number}  +${points}`, '#ff9f45');
        this.toast.setText(`TAKEDOWN! +${points}`).setAlpha(1).setScale(1.3);
        this.tweens.killTweensOf(this.toast);
        this.tweens.add({ targets: this.toast, scale: 1, duration: 150 });
        this.tweens.add({ targets: this.toast, alpha: 0, delay: 1000, duration: 500 });
        break;
      }
    }
  }

  /** Create and update a view per live rival; drop views of rivals that left or died. */
  private syncRivals(dt: number): void {
    const live = new Set<number>();
    for (const r of this.race.rivals) {
      live.add(r.id);
      let v = this.rivalViews.get(r.id);
      if (!v) {
        v = new RivalView(this, r);
        this.rivalViews.set(r.id, v);
      }
      v.update(this.terrain, dt);
      if (r.damage >= 0.5 && this.smokeClock <= 0) {
        this.puffSmoke(v.drawX + 40, v.drawY - 22, r.damage >= 0.75 ? 0x222222 : 0x777777);
      }
    }
    for (const [id, v] of this.rivalViews) {
      if (!live.has(id)) {
        v.destroy();
        this.rivalViews.delete(id);
      }
    }
  }

  /** Wrecks lie upside down on their roofs with the wheels in the air; debris tumbles and fades. */
  private syncWrecks(dt: number): void {
    const cam = this.cameras.main;
    const left = cam.scrollX - 250;
    const right = cam.scrollX + VIEW_W + 250;
    const live = new Set<number>();
    for (const w of this.run.wrecks.items) {
      if (w.x < left || w.x > right) continue;
      live.add(w.id);
      let sp = this.wreckSprites.get(w.id);
      if (!sp) {
        sp = {
          body: this.add
            .image(0, 0, rivalTruckKey(w.style))
            .setOrigin(ART.truckCx / ART.truckW, ART.truckCy / ART.truckH)
            .setFlipY(true),
          wheels: TRUCK.wheels.map(() => this.add.image(0, 0, 'wheel')),
          smokeClock: Math.random() * 0.3,
        };
        this.wreckSprites.set(w.id, sp);
      }
      this.placeWreck(w, sp);
      if (w.solid && (w.fresh || w.id % 2 === 0)) {
        sp.smokeClock -= dt;
        if (sp.smokeClock <= 0) {
          sp.smokeClock = w.fresh ? 0.12 : 0.3;
          this.puffSmoke(sp.body.x - 6, sp.body.y - 26, w.fresh ? 0x333333 : 0x8a8a8f);
        }
      }
    }
    for (const [id, sp] of this.wreckSprites) {
      if (!live.has(id)) {
        sp.body.destroy();
        sp.wheels.forEach((o) => o.destroy());
        this.wreckSprites.delete(id);
      }
    }
  }

  private placeWreck(w: Wreck, sp: WreckSprite): void {
    const far = w.far ? 1 : 0;
    const scale = 1 - (1 - RIVALS.farScale) * far;
    const gy = this.terrain.heightAt(w.x);
    const lift = RIVALS.farOffset * far;
    // Upside down: the sprite's pivot is the chassis centre, so sit it a little above the roof line.
    const y = gy + (w.y - 12 - gy) * scale - lift;
    const fade = w.solid ? 1 : Math.max(0, 1 - w.age / WRECKS.debrisLife);
    const tint = far ? 0x555559 : 0x77777c;
    const depth = far ? 1.55 : w.solid ? 2.4 : 4;
    sp.body.setPosition(w.x, y).setRotation(w.angle).setScale(scale).setTint(tint).setAlpha(fade).setDepth(depth);
    const cos = Math.cos(w.angle);
    const sin = Math.sin(w.angle);
    TRUCK.wheels.forEach((wh, i) => {
      // Wheels are mirrored to the top of the flipped body.
      const lx = wh.x * scale;
      const ly = -(wh.y + 6) * scale;
      sp.wheels[i]
        .setPosition(w.x + lx * cos - ly * sin, y + lx * sin + ly * cos)
        .setRotation(w.angle + i)
        .setScale(scale * RIVAL_STYLES[w.style % RIVAL_STYLES.length].wheel)
        .setTint(tint)
        .setAlpha(fade)
        .setDepth(depth - 0.1);
    });
  }

  private puffSmoke(x: number, y: number, color: number): void {
    emitSmoke(this.particles, Math.random, x, y, color);
  }

  /** Mud and dust off the wheels, tire tracks, damage smoke, the particle layer and speed lines. */
  private updateFx(dt: number): void {
    this.smokeClock -= dt;
    const t = this.truck;
    const dmg = this.run.damage.level;
    if (!this.run.over && dmg >= 0.5 && this.smokeClock <= 0) {
      const cos = Math.cos(t.angle);
      const sin = Math.sin(t.angle);
      this.puffSmoke(t.x + 44 * cos + 14 * sin, t.y + 44 * sin - 14 * cos, dmg >= 0.75 ? 0x1a1a1a : 0x6e6e72);
    }
    if (this.smokeClock <= 0) this.smokeClock = dmg >= 0.75 ? 0.07 : 0.14;

    this.wheelFx('p', t.wheelContacts, t.speed, dt, false);
    for (const r of this.race.rivals) {
      const far = r.laneBlend > 0.5;
      this.wheelFx(`r${r.id}`, r.truck.wheelContacts, r.truck.speed, dt, far);
    }

    this.particles.update(dt, (x) => this.terrain.heightAt(x));
    const g = this.fx;
    g.clear();
    for (const p of this.particles.items) {
      const fade = particleFade(p) * p.alpha;
      const r = particleRadius(p);
      switch (p.kind) {
        case 'mud':
          g.fillStyle(0x1c120a, fade * 0.6);
          g.fillCircle(p.x, p.y, r + 1);
          g.fillStyle(p.color, fade);
          g.fillCircle(p.x, p.y, r);
          break;
        case 'chunk': {
          const c = Math.cos(p.rot) * r;
          const s2 = Math.sin(p.rot) * r;
          g.fillStyle(p.color, fade);
          g.fillTriangle(p.x - c, p.y - s2, p.x + c * 0.8 - s2 * 0.5, p.y + s2 * 0.8 + c * 0.5, p.x + s2, p.y - c);
          break;
        }
        case 'spark': {
          const len = 0.03;
          g.lineStyle(2, p.color, fade);
          g.lineBetween(p.x, p.y, p.x - p.vx * len, p.y - p.vy * len);
          break;
        }
        default:
          g.fillStyle(p.color, fade);
          g.fillCircle(p.x, p.y, r);
      }
    }

    // Slipstream: streaks tearing past the nose while the draft is on.
    if (this.race.draft > 0.15 && !this.run.over) {
      const clock = this.time.now / 1000;
      g.lineStyle(3, 0xffffff, 0.55 * this.race.draft);
      for (let i = 0; i < 6; i++) {
        const along = (clock * 1400 + i * 97) % 260;
        const y = t.y - 46 + i * 16;
        g.lineBetween(t.x + 120 - along, y, t.x + 160 - along + 40, y);
      }
    }
  }

  /** Spray and tire tracks for the wheels of one vehicle. Far-lane trucks only kick up dust. */
  private wheelFx(
    key: string,
    wheels: { inContact: boolean; x: number; y: number }[],
    speed: number,
    dt: number,
    far: boolean,
  ): void {
    const biome = this.biome;
    wheels.forEach((c, i) => {
      const k = `${key}${i}`;
      const rolling = c.inContact && Math.abs(speed) > FX.tracks.minSpeed && !this.run.over;
      const gy = this.terrain.heightAt(c.x);
      if (!far) this.tracks.add(k, c.x, rolling, biomeAtX(c.x, this.startX).track);
      else this.tracks.forget(k);
      if (!c.inContact) return;
      const acc = (this.sprayAcc.get(k) ?? 0) + sprayRate(speed) * dt * (far ? 0.4 : 1);
      const n = Math.floor(acc);
      this.sprayAcc.set(k, acc - n);
      if (n <= 0) return;
      const y = far ? gy - RIVALS.farOffset : gy;
      emitMud(this.particles, Math.random, biome, c.x, y, speed, far ? 0 : n);
      emitDust(this.particles, Math.random, biome, c.x, y, speed, Math.max(1, Math.round(n / 2)), far ? 0.7 : 1);
    });
  }

  private onLanded(airTime: number): void {
    this.bestAir = Math.max(this.bestAir, airTime);
    if (airTime > 0.12) {
      const t = this.truck;
      emitLanding(this.particles, Math.random, this.biome, t.x, this.terrain.heightAt(t.x), t.speed, airTime);
    }
    const bonus = this.run.onLanded(airTime);
    if (airTime < GAMEPLAY.minAirToast) return;
    this.toast
      .setText(bonus > 0 ? `AIR ${airTime.toFixed(2)}s  +${bonus}` : `AIR ${airTime.toFixed(2)}s`)
      .setAlpha(1)
      .setScale(1.25);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 150 });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 500 });
  }

  /** Beep once per blink of the low-fuel warning (the HUD dial blinks on the same tick). */
  private lowFuelBeep(): void {
    const f = this.run.fuel;
    if (this.run.over || f.empty || !f.low) {
      this.lastBeepTick = -1;
      return;
    }
    const tick = warnTick(this.run.time);
    if (tick !== this.lastBeepTick) {
      this.lastBeepTick = tick;
      this.beeper.lowFuel();
    }
  }

  /** Create gates just ahead of the camera and drop the ones left far behind. */
  private syncGates(): void {
    const cam = this.cameras.main;
    const left = cam.scrollX - 400;
    const right = cam.scrollX + VIEW_W + 400;
    const first = Math.max(1, this.run.checkpoints.reached);
    for (let i = first; i < first + 3; i++) {
      const x = this.checkpointX(i);
      if (x > left && x < right && !this.gates.has(i)) this.addCheckpointGate(i, x);
    }
    for (const [i, objs] of this.gates) {
      if (this.checkpointX(i) < left) {
        objs.forEach((o) => o.destroy());
        this.gates.delete(i);
      }
    }
  }

  private checkpointX(index: number): number {
    return this.startX + checkpointMeters(index) * PX_PER_METER;
  }

  private addCheckpointGate(index: number, x: number): void {
    this.terrain.ensure(x + 200);
    const y = this.terrain.heightAt(x) + 4;
    const zone = biomeChangesAt(index);
    const img = this.add
      .image(x, y, zone ? 'cp_gate_zone' : 'cp_gate')
      .setOrigin(0.5, 1)
      .setDepth(0.5);
    const label = this.add
      .text(x, y - 212 + (zone ? 28 : 35), `CHECKPOINT ${index}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(0.6);
    const objs: Phaser.GameObjects.GameObject[] = [img, label];
    if (zone) {
      objs.push(
        this.add
          .text(x, y - 212 + 47, `> ${zone.name.toUpperCase()}`, {
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setDepth(0.6),
      );
    }
    this.gates.set(index, objs);
  }

  /** Mini-celebration: chime, confetti, screen flash, banner and a gold flash on the HUD clock. */
  private celebrateCheckpoint(index: number, timeAdded: number, points: number, fuelAdded: number): void {
    const x = this.checkpointX(index);
    const y = this.terrain.heightAt(x) - 150;
    this.beeper.chime();
    this.hudBar.celebrate(this.run.time);
    this.cameras.main.flash(180, 255, 255, 200, false);
    const colors = [0xffe066, 0xff5a4a, 0x6fc4ff, 0x7dff8a, 0xffffff];
    for (let i = 0; i < 28; i++) {
      const piece = this.add
        .rectangle(x + Phaser.Math.Between(-90, 90), y, 8, 5, Phaser.Utils.Array.GetRandom(colors))
        .setDepth(9)
        .setAngle(Phaser.Math.Between(0, 180));
      this.tweens.add({
        targets: piece,
        x: piece.x + Phaser.Math.Between(-140, 140),
        y: y + Phaser.Math.Between(120, 260),
        angle: piece.angle + Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1300),
        ease: 'Quad.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
    const mins = Math.floor(timeAdded / 60);
    const secs = String(Math.round(timeAdded % 60)).padStart(2, '0');
    const lines = [`CHECKPOINT ${index}!`, `+${mins}:${secs}  +${points} BONUS`];
    if (fuelAdded > 0) lines.push(`FUEL +${Math.round(fuelAdded * 100)}%`);
    const zone = biomeChangesAt(index);
    if (zone) lines.push(`ENTERING ${zone.name.toUpperCase()}`);
    this.tweens.killTweensOf(this.cpToast);
    this.cpToast.setText(lines).setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.cpToast, scale: 1, duration: 160 });
    this.tweens.add({ targets: this.cpToast, alpha: 0, delay: 1600, duration: 500 });
  }

  private recover(): void {
    const x = this.truck.x;
    this.truck.reset(x, this.terrain.heightAt(x) - 50);
    this.truck.vx = 250;
    this.flippedTimer = 0;
  }

  private restart(): void {
    this.scene.restart();
  }

  private showGameOver(): void {
    const s = this.run.score;
    this.tweens.killTweensOf(this.warn);
    this.warn.setAlpha(0);
    const cx = VIEW_W / 2;
    const cy = 190;
    this.add
      .rectangle(cx, cy, 540, 250, 0x0b1230, 0.88)
      .setStrokeStyle(3, 0x8fa4d6)
      .setScrollFactor(0)
      .setDepth(30);
    const style = (size: number, color: string) => ({
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      align: 'center',
    });
    this.add
      .text(cx, cy - 90, TITLES[this.run.endReason ?? 'fuel'], style(34, '#ff5a4a'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31);
    this.add
      .text(
        cx,
        cy - 20,
        [
          `SCORE ${s.total}`,
          `${Math.floor(this.run.meters)} m   ${s.snacks} snacks   best air ${this.bestAir.toFixed(2)}s`,
          `best combo x${s.bestMultiplier}   (${s.bestChain} in a row)`,
          `checkpoints ${this.run.checkpoints.reached}   takedowns ${s.takedowns}`,
        ],
        { ...style(18, '#ffffff'), lineSpacing: 8 },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31);
    const again = this.add
      .text(cx, cy + 90, 'SPACE / ENTER / tap to drive again', style(16, '#ffe066'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31);
    this.tweens.add({ targets: again, alpha: 0.3, yoyo: true, repeat: -1, duration: 600 });
    this.input.on('pointerdown', this.tapRestart, this);
  }

  private tapRestart(): void {
    if (this.run.over && this.time.now - this.overAt > 400) {
      this.input.off('pointerdown', this.tapRestart, this);
      this.restart();
    }
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    if (!this.debug) return;
    const t = this.truck;
    const cos = Math.cos(t.angle);
    const sin = Math.sin(t.angle);
    t.wheelContacts.forEach((c) => {
      g.lineStyle(2, c.inContact ? 0xff3030 : 0x30ff30, 1);
      g.strokeCircle(c.x, c.y, PHYSICS.wheelRadius);
    });
    g.fillStyle(0xff00ff, 1);
    for (const b of TRUCK.body) {
      g.fillCircle(t.x + b.x * cos - b.y * sin, t.y + b.x * sin + b.y * cos, 4);
    }
    g.lineStyle(1, 0xffffff, 0.6);
    g.lineBetween(this.cameras.main.scrollX, BASE_Y, this.cameras.main.scrollX + VIEW_W, BASE_Y);
    g.lineStyle(1, 0xffe066, 0.7); // pickup collect radius
    g.strokeCircle(t.x, t.y, 54);
    g.lineStyle(1, 0x30c0ff, 0.9); // collision circles: player, rivals, wrecks
    for (const c of truckCircles(t)) g.strokeCircle(c.x, c.y, c.r);
    for (const r of this.race.rivals) {
      g.lineStyle(1, r.laneKey === 0 ? 0xff5a4a : 0x886666, 0.9);
      for (const c of truckCircles(r.truck)) g.strokeCircle(c.x, c.y, c.r);
    }
    g.lineStyle(1, 0xff9f45, 0.9);
    for (const w of this.run.wrecks.items) {
      if (!w.solid || w.far) continue;
      for (const c of wreckCircles(w)) g.strokeCircle(c.x, c.y, c.r);
    }
  }

  private updateHud(): void {
    const t = this.truck;
    const r = this.run;
    this.hudBar.update({
      dt: Math.min(this.game.loop.delta / 1000, 1 / 20),
      fuel: r.fuel.level,
      damage: r.damage.level,
      cpNext: r.checkpoints.nextIndex,
      cpTimeLeft: r.checkpoints.timeLeft,
      cpProgress: r.checkpoints.progress(r.meters),
      multiplier: r.score.multiplier,
      meters: r.meters,
      speedKmh: Math.max(0, t.speed) / 6,
      score: r.score.score,
      bonus: r.score.bonus,
      time: r.time,
    });

    const pos = this.race.position(t.x);
    this.posText
      .setText(this.race.drafting ? [`POS ${pos.place}/${pos.of}`, 'DRAFT'] : `POS ${pos.place}/${pos.of}`)
      .setColor(pos.place === 1 ? '#ffe066' : '#ffffff');

    const lines: string[] = [];
    if (t.airTime > 0) lines.push(`AIR ${t.airTime.toFixed(2)}s   BEST ${this.bestAir.toFixed(2)}s`);
    if (!this.autoThrottle) lines.push('AUTO-GAS OFF (T)');
    if (this.debug) {
      lines.push(
        `angle ${t.angle.toFixed(2)}  vy ${t.vy.toFixed(0)}  grounded ${t.grounded}`,
        `wheels ${t.wheelContacts.map((c) => (c.inContact ? '■' : '□')).join('')}  body ${t.bodyContact}`,
        `fuel ${(r.fuel.level * 100).toFixed(1)}%  chain ${r.score.chain}  next cans ${r.pickups.fuelXs.slice(-2).map((x) => x.toFixed(0)).join(', ')}`,
        `rivals ${this.race.rivals.map((r) => `#${r.number}${r.laneKey === 0 ? 'n' : r.laneKey === 1 ? 'f' : '~'}`).join(' ')}  draft ${this.race.draft.toFixed(2)}  wrecks ${this.run.wrecks.items.length}  wrench +${Math.round(WRENCH.restore * 100)}%`,
        `seed ${this.seed}  terrain [${this.terrain.startX.toFixed(0)}, ${this.terrain.endX.toFixed(0)}]`,
      );
    }
    this.hud.setText(lines);
  }
}
