import Phaser from 'phaser';
import {
  BASE_Y,
  ART,
  CAMERA,
  FX,
  GAMEPLAY,
  LANES,
  PHYSICS,
  OBSTACLES,
  OBSTACLE_KINDS,
  PX_PER_METER,
  SCROLL_Y0,
  TRUCK,
  VIEW_H,
  VIEW_W,
  WRECKS,
  WRENCH,
} from '../config';
import { obstacleKey } from '../art/props';
import { RIVAL_PAINT, playerTruckKey, rivalTruckKey, shade } from '../art/trucks';
import { AudioSystem, biomeIndex } from '../audio/AudioSystem';
import { biomeAtX, biomeChangesAt, biomeSegments, type Biome } from '../game/Biomes';
import { checkpointMeters } from '../game/Checkpoint';
import { truckCircles } from '../game/Collision';
import { PlayerLane, laneDepth, laneLift, laneProject, laneScale, laneShade } from '../game/Lanes';
import { NO_PERKS } from '../game/Perks';
import { obstacleCircles } from '../game/Obstacles';
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
import { playerInput, type InputState } from '../game/Input';
import { unlockAchievements, type Achievement } from '../progress/Achievements';
import { dailySeed, dayKey } from '../progress/Daily';
import { loadSave, perksFor, recordRun, writeSave, type RunResult, type SaveData } from '../progress/Progress';
import { defaultStore, type KeyValueStore } from '../progress/Storage';

const FIXED_DT = 1 / 60 / PHYSICS.substeps;
const TUFT_SPACING = 72;
/** The ground is drawn in steps of this many px (finer than the terrain samples: the track is a spline). */
const RENDER_STEP = 8;
/** Depth of the far edge of the dirt field, and how many slivers it is drawn from (a smooth gradient). */
const FIELD_DEPTH = LANES.count - 1 + 0.7;
const FIELD_BANDS = 14;
const MUD_CELL = 130;

/** Deterministic hash of two integers into [0, 1): scatters tufts and mud patches by world position. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Blend two 0xRRGGBB colours (t = 0 gives a, 1 gives b). */
function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

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
  private audio!: AudioSystem;
  private race!: Race;
  private fx!: Phaser.GameObjects.Graphics;
  private posText!: Phaser.GameObjects.Text;
  private rivalViews = new Map<number, RivalView>();
  private wreckSprites = new Map<number, WreckSprite>();
  private obstacleSprites = new Map<number, Phaser.GameObjects.Image>();
  private lane = new PlayerLane();
  private laneHud!: Phaser.GameObjects.Graphics;
  private store: KeyValueStore = defaultStore();
  private save!: SaveData;
  private daily = false;
  private day = dayKey();
  private achClock = 0;
  private banked: (RunResult & { achievements: Achievement[] }) | null = null;
  private achToast!: Phaser.GameObjects.Text;
  private particles = new ParticleSystem();
  private tracks = new TrackMarks();
  private decals!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
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
  private debug = false;
  private bestAir = 0;
  private flippedTimer = 0;
  private overAt = 0;
  private startX = GAMEPLAY.startX;
  private lastBeepTick = -1;

  constructor() {
    super('Game');
  }

  /** `daily: true` starts the daily challenge: the day's seed, and the stock truck for everyone. */
  init(data?: { daily?: boolean }): void {
    this.daily = data?.daily === true || new URLSearchParams(window.location.search).has('daily');
  }

  create(): void {
    // Scene instances are reused on restart, so reset every piece of run state here.
    this.acc = 0;
    this.debug = false;
    this.bestAir = 0;
    this.flippedTimer = 0;
    this.overAt = 0;
    this.sprites.clear();
    this.gates.clear();
    this.rivalViews.clear();
    this.wreckSprites.clear();
    this.obstacleSprites.clear();
    this.lane = new PlayerLane();
    this.banked = null;
    this.achClock = 0;
    this.day = dayKey();
    this.save = loadSave(this.store);
    this.particles = new ParticleSystem();
    this.tracks = new TrackMarks();
    this.sprayAcc.clear();
    this.smokeClock = 0;
    this.lastBeepTick = -1;
    this.audio?.dispose(); // a restart reuses the scene: silence the previous run's score and engine
    this.audio = new AudioSystem(this.sound);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.dispose());

    const param = new URLSearchParams(window.location.search).get('seed');
    this.seed = this.daily
      ? dailySeed(this.day)
      : param
        ? hashSeed(param)
        : Math.floor(Math.random() * 2 ** 31);

    this.terrain = new Terrain(this.seed);
    // The daily challenge is the same stock truck for everyone; otherwise garage upgrades apply.
    this.run = new RunModel(this.seed, this.terrain, this.startX, this.daily ? NO_PERKS : perksFor(this.save));
    this.race = new Race(this.seed, this.terrain, this.run.wrecks, this.startX, this.run.obstacles);
    this.biome = biomeAtX(this.startX, this.startX);
    this.parallax = new Parallax(this, this.biome.id);
    this.ground = this.add.graphics().setDepth(1);
    this.decals = this.add.graphics().setDepth(1.2);
    this.shadows = this.add.graphics().setDepth(1.5);
    this.addStartGate();
    this.truck = new TruckPhysics(this.startX, BASE_Y - 45);
    this.truck.autoLevel = true; // no air control: a gentle assist keeps it landing on its wheels
    this.view = new TruckView(this, playerTruckKey(this.save.skin));
    this.fx = this.add.graphics().setDepth(4.5);
    this.debugGfx = this.add.graphics().setDepth(5);
    this.hudBar = new Hud(this);
    this.laneHud = this.add.graphics().setScrollFactor(0).setDepth(10);

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
          'HOLD →/D to accelerate   ←/A brake   ↑/W and ↓/S drift across the field (hold)   R reset   M mute   N music   H debug',
          'Drift sideways to dodge rocks, logs and boulders · you cannot slip through other cars · tuck in behind a rival to draft',
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
    this.achToast = this.add
      .text(VIEW_W / 2, 196, '', { ...text(20, '#ffd34d'), align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 9000, duration: 1200 });
    if (this.daily) this.flash('DAILY CHALLENGE  ' + this.day);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,Q,E,G,R,T,H,M,N,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

    this.terrain.ensure(this.startX + VIEW_W + 1500);
    const cam = this.cameras.main;
    cam.setScroll(this.truck.x - VIEW_W * CAMERA.xAnchor, SCROLL_Y0);
  }

  private addStartGate(): void {
    const y = this.terrain.heightAt(GATE_X) + 4;
    this.add.image(GATE_X, y, 'start_gate').setOrigin(0.5, 1).setDepth(0.5);
  }

  /** No auto-gas and no air control: the truck only drives while the gas is held. */
  private readInput(): InputState {
    if (this.run.over) return { throttle: 0, brake: 0, lean: 0 };
    const k = this.keys;
    const c = this.cursors;
    return playerInput(
      { gas: c.right.isDown || k.D.isDown, brake: c.left.isDown || k.A.isDown },
      this.run.engineOn, // a dry tank means no throttle and no brake torque
    );
  }

  /** Up/W (or Q): away from the camera, Down/S (or E): towards it. Held, so the drift is smooth. */
  private readLaneDir(): -1 | 0 | 1 {
    if (this.run.over) return 0;
    const c = this.cursors;
    const k = this.keys;
    const far = c.up.isDown || k.W.isDown || k.Q.isDown;
    const near = c.down.isDown || k.S.isDown || k.E.isDown;
    return far === near ? 0 : far ? 1 : -1;
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    const J = Phaser.Input.Keyboard.JustDown;
    if (this.run.over) {
      if (J(this.keys.G)) this.scene.start('Garage');
      else if (J(this.keys.D)) this.restart(!this.daily);
      else if (J(this.keys.R) || J(this.keys.SPACE) || J(this.keys.ENTER)) this.restart();
    } else {
      if (J(this.keys.R)) this.recover();
    }
    if (J(this.keys.H)) this.debug = !this.debug;
    if (J(this.keys.M)) {
      this.sound.mute = !this.sound.mute;
      this.flash(this.sound.mute ? 'SOUND OFF' : 'SOUND ON');
    }
    if (J(this.keys.N)) this.flash(this.audio.toggleMusic() ? 'MUSIC ON' : 'MUSIC OFF');

    // Fixed-step physics (substeps keep the stiff suspension stable)
    const input = this.readInput();
    // Depth: hold Up/Down to drift. A vehicle alongside stops the drift, and rubbing it hurts.
    const limits = this.race.depthLimits(this.truck, this.lane.f);
    const laneStep = this.lane.update(dt, this.readLaneDir(), limits.lo, limits.hi);
    if (laneStep.changedFrom !== null) this.onLaneChanged(laneStep.changedFrom);
    if (laneStep.blocked) {
      const by = laneStep.blocked === 'hi' ? limits.hiBy : limits.loBy;
      const ev = by ? this.race.sideswipe(this.truck, by, laneStep.impactSpeed) : null;
      if (ev) this.onRaceEvent(ev);
    }
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

    for (const e of this.run.update(dt, { x: this.truck.x, y: this.truck.y, speed: this.truck.speed, lane: this.lane.f })) {
      this.onRunEvent(e);
    }
    for (const e of this.race.update(dt, this.truck, this.run.meters, !this.run.over, this.lane.f, this.lane.target)) {
      this.onRaceEvent(e);
    }
    this.checkAchievements(dt);
    this.lowFuelBeep();
    this.audio.update({
      speed: this.truck.speed,
      throttle: input.throttle > 0,
      grounded: this.truck.grounded,
      engineOn: this.run.engineOn,
      over: this.run.over,
      multiplier: this.run.score.multiplier,
      fuel: this.run.fuel.level,
      biome: biomeIndex(this.biome.id),
    });

    // Auto-recover when stuck upside down
    this.flippedTimer =
      !this.run.over && this.truck.flipped && this.truck.speed < 80 ? this.flippedTimer + dt : 0;
    if (this.flippedTimer > GAMEPLAY.flipRecoverTime) this.recover();

    this.updateCamera(dt);
    this.view.update(this.truck, this.terrain, dt, this.lane.f);
    this.syncBiome();
    this.drawGround();
    this.syncPickups(time / 1000);
    this.syncRivals(dt);
    this.syncWrecks(dt);
    this.syncObstacles();
    this.drawShadows();
    this.updateFx(dt);
    this.drawDecals();
    this.syncGates();
    this.parallax.update(this.cameras.main.scrollX, this.cameras.main.scrollY, dt);
    this.drawDebug();
    this.updateHud();
    this.drawLaneHud();
  }

  /** The player drifted across a lane boundary: score the dodge, whoosh, kick up a little mud. */
  private onLaneChanged(from: number): void {
    this.run.laneChanged(this.truck.x, from);
    this.audio.swerve();
    const t = this.truck;
    emitDust(this.particles, Math.random, this.biome, t.x - 30, this.terrain.heightAt(t.x) - laneLift(from), t.speed, 5, 0.8);
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
    const x0 = Math.floor(cam.scrollX / RENDER_STEP) * RENDER_STEP - RENDER_STEP;
    const x1 = cam.scrollX + VIEW_W + RENDER_STEP * 2;
    const bottom = cam.scrollY + VIEW_H + 80;
    g.clear();

    // Paint one strip of terrain between xa and xb, in steps of RENDER_STEP (the track is a smooth
    // spline, so the strips follow it without visible corners). Segment borders are clipped to the
    // step grid, so neighbouring biomes meet exactly at the checkpoint gate.
    const strip = (color: number, topOffset: number, bottomOffset: number | null, xa: number, xb: number) => {
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(xa, this.terrain.heightAt(xa) + topOffset);
      for (let x = Math.ceil(xa / RENDER_STEP) * RENDER_STEP; x < xb; x += RENDER_STEP) {
        if (x > xa) g.lineTo(x, this.terrain.heightAt(x) + topOffset);
      }
      g.lineTo(xb, this.terrain.heightAt(xb) + topOffset);
      if (bottomOffset === null) {
        g.lineTo(xb, bottom);
        g.lineTo(xa, bottom);
      } else {
        g.lineTo(xb, this.terrain.heightAt(xb) + bottomOffset);
        for (let x = Math.floor(xb / RENDER_STEP) * RENDER_STEP; x > xa; x -= RENDER_STEP) {
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
      // The dirt field behind the near lane: one wide, flat field like the reference's, drawn from
      // the far edge down in thin slivers that darken a little with distance. There are no steps or
      // lips, so it reads as open ground rather than a staircase of troughs.
      for (let i = FIELD_BANDS; i >= 1; i--) {
        const f = (FIELD_DEPTH * i) / FIELD_BANDS;
        const nearer = (FIELD_DEPTH * (i - 1)) / FIELD_BANDS;
        strip(shade(c.crust, 1 - 0.05 * f), -laneLift(f), -laneLift(nearer) + 1.5, xa, xb);
      }
      strip(shade(c.crust, 0.6), -laneLift(FIELD_DEPTH) - 2, -laneLift(FIELD_DEPTH) + 1, xa, xb); // contact line with the tree line
      strip(c.crust, 0, 10, xa, xb); // the near lane's sunlit crust
      strip(c.crustShadow, 10, 15, xa, xb);
      strip(c.rut1, 22, 26, xa, xb); // tire ruts in the foreground, like the reference's rutted mud
      strip(c.rut2, 33, 36, xa, xb);
      this.drawMud(seg.biome, xa, xb);
      this.drawTufts(seg.biome, xa, xb);
    }
  }

  /** Dark mud patches scattered over the whole field (deterministic by world position). */
  private drawMud(biome: Biome, xa: number, xb: number): void {
    const g = this.ground;
    const c = biome.ground;
    const patch = mixColor(c.crust, c.crustShadow, 0.75);
    for (let k = Math.floor(xa / MUD_CELL) - 1; k * MUD_CELL < xb; k++) {
      for (let j = 0; j < 2; j++) {
        if (hash01(k, 11 + j) > 0.55) continue;
        const x = k * MUD_CELL + hash01(k, 21 + j) * MUD_CELL;
        if (x < xa || x > xb) continue;
        const f = hash01(k, 31 + j) * (FIELD_DEPTH - 0.1);
        const sc = laneScale(f);
        const y = this.terrain.heightAt(x) - laneLift(f) + 3;
        g.fillStyle(patch, 0.45);
        g.fillEllipse(x, y, (46 + hash01(k, 41 + j) * 80) * sc, (6 + hash01(k, 51 + j) * 6) * sc);
      }
    }
  }

  /**
   * Verge tufts (grass, dry scrub, frost or reeds), scattered by world position over EVERY lane of
   * the field, drawn from the far rows to the near ones so nearer tufts cover farther ones.
   */
  private drawTufts(biome: Biome, xa: number, xb: number): void {
    const g = this.ground;
    const { color, shape } = biome.tuft;
    const rows = 5;
    for (let row = rows - 1; row >= 0; row--) {
      for (let k = Math.floor(xa / TUFT_SPACING) - 1; k * TUFT_SPACING < xb; k++) {
        if (hash01(k, 100 + row) > 0.17) continue;
        const x = k * TUFT_SPACING + hash01(k, 200 + row) * TUFT_SPACING;
        if (x < xa || x > xb) continue;
        const f = -0.1 + ((row + hash01(k, 300 + row)) * (LANES.count - 0.7)) / rows;
        this.tuft(g, shape, shade(color, 1 - 0.07 * f), x, this.terrain.heightAt(x) - laneLift(f) + 1, laneScale(f));
      }
    }
  }

  /** One tuft standing at (x, y), `s` times its full size. */
  private tuft(g: Phaser.GameObjects.Graphics, shape: Biome['tuft']['shape'], color: number, x: number, y: number, s: number): void {
    g.fillStyle(color, 1);
    switch (shape) {
      case 'grass':
        g.fillTriangle(x - 5 * s, y, x - 1 * s, y, x - 4 * s, y - 9 * s);
        g.fillTriangle(x - 2 * s, y, x + 2 * s, y, x, y - 12 * s);
        g.fillTriangle(x + 1 * s, y, x + 5 * s, y, x + 4 * s, y - 8 * s);
        break;
      case 'scrub': // low, wide dry bush with a woody centre
        g.fillTriangle(x - 9 * s, y, x - 2 * s, y, x - 7 * s, y - 7 * s);
        g.fillTriangle(x - 4 * s, y, x + 5 * s, y, x + 1 * s, y - 10 * s);
        g.fillTriangle(x + 2 * s, y, x + 9 * s, y, x + 7 * s, y - 6 * s);
        break;
      case 'frost': // snow clumps with an icy crystal
        g.fillEllipse(x, y - 2 * s, 16 * s, 6 * s);
        g.fillTriangle(x - 2 * s, y - 3 * s, x + 2 * s, y - 3 * s, x, y - 11 * s);
        break;
      case 'reed': // tall thin blades with a cattail
        g.fillRect(x - 4 * s, y - 16 * s, 1.5 * s, 16 * s);
        g.fillRect(x, y - 20 * s, 1.5 * s, 20 * s);
        g.fillRect(x + 4 * s, y - 14 * s, 1.5 * s, 14 * s);
        g.fillStyle(0x5b3a1e, 1);
        g.fillRect(x - 0.5 * s, y - 26 * s, 3 * s, 7 * s);
        break;
    }
  }

  /**
   * Soft ground shadows under pickups, obstacles, wrecks and every truck, drawn on the ground at
   * the thing's own depth. They tell you which lane something is in at a glance (a snack floating
   * at truck height is hard to place in depth without one), and a pickup's shadow tightens as it
   * gets closer to the ground.
   */
  private drawShadows(): void {
    const g = this.shadows;
    g.clear();
    const cam = this.cameras.main;
    const left = cam.scrollX - 120;
    const right = cam.scrollX + VIEW_W + 120;
    const blob = (x: number, lane: number, w: number, h: number, alpha: number) => {
      const sc = laneScale(lane);
      g.fillStyle(0x000000, alpha);
      g.fillEllipse(x, this.terrain.heightAt(x) - laneLift(lane) + 2 * sc, w * sc, h * sc);
    };
    for (const p of this.run.pickups.items) {
      if (p.taken || p.x < left || p.x > right) continue;
      const height = this.terrain.heightAt(p.x) - p.y;
      const near = Math.max(0, Math.min(1, 1 - height / 110)); // 1 on the ground, fading as it floats higher
      const w = (p.kind === 'wrench' ? 34 : 26) * (0.65 + 0.35 * near);
      blob(p.x, p.lane, w, 8 * (0.65 + 0.35 * near), 0.14 + 0.24 * near);
    }
    for (const o of this.run.obstacles.items) {
      if (!o.solid || o.x < left || o.x > right) continue;
      blob(o.x, o.lane, OBSTACLE_KINDS[o.kind].radius * 2 + (OBSTACLE_KINDS[o.kind].offsets.length > 1 ? 50 : 14), 9, 0.3);
    }
    for (const w of this.run.wrecks.items) {
      if (!w.solid || w.x < left || w.x > right) continue;
      blob(w.x, w.lane, 112, 12, 0.28);
    }
    for (const r of this.race.rivals) {
      if (r.truck.x < left || r.truck.x > right) continue;
      blob(r.truck.x, r.laneF, 116, 13, r.truck.grounded ? 0.3 : 0.18);
    }
    const t = this.truck;
    blob(t.x, this.lane.f, 116, 13, t.grounded ? 0.32 : 0.2);
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
    let lift = 0;
    const y = (x: number) => this.terrain.heightAt(x) + 3 - lift;
    for (const seg of this.tracks.segments) {
      if (seg.x0 > right) continue;
      if (!open || seg.color !== color || seg.x0 !== endX || seg.lift !== lift) {
        if (open) g.strokePath();
        g.lineStyle(FX.tracks.width, seg.color, FX.tracks.alpha);
        lift = seg.lift;
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
        sprite = this.add.image(p.x, p.y, key);
        if (p.kind === 'wrench') sprite.setAngle(-14);
        this.sprites.set(p.id, sprite);
      }
      if (!sprite) continue;
      if (visible) {
        // Placed in the pickup's lane: higher, smaller and darker further away.
        const gy = this.terrain.heightAt(p.x);
        const bob = p.kind !== 'wrench' ? Math.sin(seconds * 4 + p.id) * 3 : 0;
        const shadeV = laneShade(p.lane);
        sprite
          .setPosition(p.x, laneProject(gy, p.y + bob, p.lane))
          .setScale(laneScale(p.lane))
          .setTint(Phaser.Display.Color.GetColor(shadeV, shadeV, shadeV))
          .setDepth(laneDepth(p.lane, 0.04));
      } else if (!p.taken) {
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

  /** Brief centre-screen label for the sound toggles. */
  private flash(msg: string): void {
    this.toast.setText(msg).setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 700, duration: 400 });
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
          this.audio.wrench();
          const label = e.repaired > 0 ? `REPAIR -${Math.round(e.repaired * 100)}%` : 'WRENCH';
          this.popup(e.pickup.x, this.liftY(e.pickup.x, e.pickup.y, e.pickup.lane) - 24, label, e.repaired > 0 ? '#9be0ff' : '#c9ced6');
        } else if (e.type === 'snack') {
          this.audio.snack(e.multiplier);
          const label = e.multiplier > 1 ? `+${e.points} x${e.multiplier}` : `+${e.points}`;
          this.popup(e.pickup.x, this.liftY(e.pickup.x, e.pickup.y, e.pickup.lane) - 18, label, '#ffe066');
        } else {
          this.audio.fuel();
          this.popup(e.pickup.x, this.liftY(e.pickup.x, e.pickup.y, e.pickup.lane) - 24, `FUEL +${Math.round(e.added * 100)}%`, '#7dff8a');
          this.tweens.killTweensOf(this.warn);
          this.warn.setAlpha(0);
        }
        break;
      }
      case 'checkpoint':
        this.celebrateCheckpoint(e.index, e.timeAdded, e.points, e.fuelAdded);
        break;
      case 'empty':
        this.audio.empty();
        this.tweens.killTweensOf(this.warn);
        this.warn.setText('OUT OF FUEL!').setAlpha(1);
        break;
      case 'nearmiss': {
        this.audio.reward();
        const o = e.obstacle;
        this.popup(this.truck.x + 40, this.liftY(o.x, o.y, o.lane) - 40, `CLOSE CALL +${e.points}`, '#9be0ff');
        break;
      }
      case 'over':
        this.overAt = this.time.now;
        this.audio.gameOver();
        this.showGameOver(this.bankRun());
        break;
      case 'damage':
        this.popup(this.truck.x, this.truck.y - 70, `DAMAGE +${Math.round(e.amount * 100)}%`, '#ff6a5a');
        break;
      case 'miss':
      case 'timeup':
        break;
    }
  }

  /** Screen y of a physics point (x, y) seen in lane position `lane`. */
  private liftY(x: number, y: number, lane: number): number {
    return laneProject(this.terrain.heightAt(x), y, lane);
  }

  /** Bumps, crashes, wrecks and takedowns from the race model. */
  private onRaceEvent(e: RaceEvent): void {
    switch (e.type) {
      case 'bump': {
        const hard = e.damage > 0;
        const y = this.liftY(e.x, e.y, e.lane);
        this.audio.thud(hard);
        emitDust(this.particles, Math.random, this.biome, e.x, y, 0, hard ? 8 : 4);
        if (hard) emitCrash(this.particles, Math.random, e.x, y - 8, Math.min(1, e.impact / 520), e.with === 'obstacle' ? 0x8c909a : 0xf2c200);
        if (e.with === 'obstacle' && e.kind) this.popup(e.x, y - 50, e.kind.toUpperCase() + '!', '#ffb066');
        if (hard) {
          this.cameras.main.shake(140, Math.min(0.012, 0.004 + e.impact / 60000));
          for (const ev of this.run.hurt(e.damage)) this.onRunEvent(ev);
        }
        break;
      }
      case 'rivalCrash': {
        // A rival drove into something: bigger crashes get sparks and a crunch you can hear.
        const y = this.liftY(e.x, e.y, e.lane);
        emitDust(this.particles, Math.random, this.biome, e.x, y, 0, 6);
        if (e.impact > 200) {
          this.audio.thud(true);
          emitCrash(this.particles, Math.random, e.x, y - 8, Math.min(1, e.impact / 520), 0x8c909a);
          this.popup(e.x, y - 50, `#${e.number} CRASH`, '#ffb066');
        }
        break;
      }
      case 'wrecked':
        this.audio.thud(true);
        emitCrash(this.particles, Math.random, e.x, this.liftY(e.x, e.y, e.lane) - 10, 1, RIVAL_PAINT[Math.max(0, RIVAL_STYLES.findIndex((st) => st.number === e.number))].body);
        break;
      case 'takedown': {
        const points = this.run.takedown();
        this.audio.takedown();
        this.popup(e.x, this.liftY(e.x, e.y, e.lane) - 60, `TAKEDOWN #${e.number}  +${points}`, '#ff9f45');
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
    const scale = laneScale(w.lane);
    const gy = this.terrain.heightAt(w.x);
    // Upside down: the sprite's pivot is the chassis centre, so sit it a little above the roof line.
    const y = laneProject(gy, w.y - 12, w.lane);
    const fade = w.solid ? 1 : Math.max(0, 1 - w.age / WRECKS.debrisLife);
    const dim = Math.round(0x77 * (laneShade(w.lane) / 255));
    const tint = (dim << 16) | (dim << 8) | Math.min(255, dim + 5);
    const depth = w.solid ? laneDepth(w.lane, 0.0) : 4;
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
      this.puffSmoke(
        t.x + 44 * cos + 14 * sin,
        laneProject(this.terrain.heightAt(t.x), t.y + 44 * sin - 14 * cos, this.lane.f),
        dmg >= 0.75 ? 0x1a1a1a : 0x6e6e72,
      );
    }
    if (this.smokeClock <= 0) this.smokeClock = dmg >= 0.75 ? 0.07 : 0.14;

    this.wheelFx('p', t.wheelContacts, t.speed, dt, this.lane.f, !this.lane.swerving);
    for (const r of this.race.rivals) {
      this.wheelFx(`r${r.id}`, r.truck.wheelContacts, r.truck.speed, dt, r.laneF, Math.abs(r.laneF - Math.round(r.laneF)) <= 0.2, true);
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
        const y = laneProject(this.terrain.heightAt(t.x), t.y - 46 + i * 16, this.lane.f);
        g.lineBetween(t.x + 120 - along, y, t.x + 160 - along + 40, y);
      }
    }
  }

  /**
   * Spray and tire tracks for the wheels of one vehicle at depth `lane` (further lanes spray less).
   * Tracks are only laid while the vehicle holds its depth (`settled`); a rival's are drawn on its
   * nearest whole lane (`snap`), the player's exactly where the truck is.
   */
  private wheelFx(
    key: string,
    wheels: { inContact: boolean; x: number; y: number }[],
    speed: number,
    dt: number,
    lane: number,
    settled: boolean,
    snap = false,
  ): void {
    const biome = this.biome;
    const lift = laneLift(lane);
    const share = 1 - 0.25 * lane;
    const markLift = snap ? laneLift(Math.round(lane)) : Math.round(lift * 2) / 2;
    wheels.forEach((c, i) => {
      const k = `${key}${i}`;
      const rolling = c.inContact && Math.abs(speed) > FX.tracks.minSpeed && !this.run.over && settled;
      const gy = this.terrain.heightAt(c.x);
      this.tracks.add(k, c.x, rolling, biomeAtX(c.x, this.startX).track, markLift);
      if (!c.inContact) return;
      const acc = (this.sprayAcc.get(k) ?? 0) + sprayRate(speed) * dt * Math.max(0.2, share);
      const n = Math.floor(acc);
      this.sprayAcc.set(k, acc - n);
      if (n <= 0) return;
      const y = gy - lift;
      emitMud(this.particles, Math.random, biome, c.x, y, speed, lane > 1.5 ? 0 : n);
      emitDust(this.particles, Math.random, biome, c.x, y, speed, Math.max(1, Math.round(n / 2)), Math.max(0.6, share));
    });
  }

  private onLanded(airTime: number): void {
    this.bestAir = Math.max(this.bestAir, airTime);
    if (airTime > 0.12) {
      const t = this.truck;
      emitLanding(this.particles, Math.random, this.biome, t.x, this.terrain.heightAt(t.x), t.speed, airTime);
    }
    this.audio.land(airTime);
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
      this.audio.lowFuel();
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
    this.audio.checkpoint();
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

  private restart(daily = this.daily): void {
    this.scene.restart({ daily });
  }

  /** Banks the finished run once: coins, lifetime stats, the score table and any achievements. */
  private bankRun(): RunResult & { achievements: Achievement[] } {
    if (this.banked) return this.banked;
    const summary = this.run.summary(this.daily);
    const result = recordRun(this.save, summary, this.day);
    const achievements = unlockAchievements(this.save, summary, this.day);
    writeSave(this.store, this.save);
    this.banked = { ...result, achievements };
    return this.banked;
  }

  /** While driving: unlock achievements as soon as their condition holds, with a toast. */
  private checkAchievements(dt: number): void {
    this.achClock += dt;
    if (this.run.over || this.achClock < 0.5) return;
    this.achClock = 0;
    const fresh = unlockAchievements(this.save, this.run.summary(this.daily), this.day);
    if (fresh.length === 0) return;
    writeSave(this.store, this.save);
    this.audio.reward();
    this.tweens.killTweensOf(this.achToast);
    this.achToast
      .setText(fresh.map((a) => `ACHIEVEMENT: ${a.name}  +${a.reward} coins`))
      .setAlpha(1);
    this.tweens.add({ targets: this.achToast, alpha: 0, delay: 2200, duration: 600 });
  }

  private showGameOver(result: RunResult & { achievements: Achievement[] }): void {
    const s = this.run.score;
    this.tweens.killTweensOf(this.warn);
    this.warn.setAlpha(0);
    const cx = VIEW_W / 2;
    const cy = 205;
    this.add
      .rectangle(cx, cy, 760, 330, 0x0b1230, 0.9)
      .setStrokeStyle(3, 0x8fa4d6)
      .setScrollFactor(0)
      .setDepth(30);
    const style = (size: number, color: string, align = 'center') => ({
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      align,
    });
    const put = (x: number, y: number, text: string | string[], st: object, ox = 0.5) =>
      this.add.text(x, y, text, st).setOrigin(ox, 0.5).setScrollFactor(0).setDepth(31);

    const title = TITLES[this.run.endReason ?? 'fuel'] + (this.daily ? '  (DAILY)' : '');
    put(cx, cy - 138, title, style(32, '#ff5a4a'));
    const left = cx - 360;
    const sm = this.run.summary(this.daily);
    put(
      left + 20,
      cy - 58,
      [
        `SCORE ${s.total}${result.newBestScore ? '  NEW BEST!' : ''}`,
        `${sm.meters} m${result.newBestMeters ? ' (best!)' : ''}   ${s.snacks} snacks`,
        `best air ${this.bestAir.toFixed(2)}s   combo x${s.bestMultiplier} (${s.bestChain})`,
        `checkpoints ${sm.checkpoints}   takedowns ${s.takedowns}`,
        `lane changes ${sm.laneChanges}   close calls ${sm.nearMisses}`,
        '',
        `+${result.coins} COINS   bank ${this.save.coins}`,
        result.dailyBest !== null ? `DAILY BEST ${result.dailyBest}${result.dailyFirst ? '  (+bonus)' : ''}` : '',
      ],
      { ...style(15, '#ffffff', 'left'), lineSpacing: 7 },
      0,
    );

    // The high-score table, with this run's place highlighted.
    const rx = cx + 130;
    put(rx + 100, cy - 92, 'TOP SCORES', style(16, '#9be0ff'));
    this.save.highScores.slice(0, 7).forEach((h, i) => {
      const mine = result.rank === i + 1;
      put(
        rx,
        cy - 64 + i * 22,
        `${String(i + 1).padStart(2)}. ${String(h.score).padStart(7)}  ${String(h.meters).padStart(5)}m ${h.daily ? 'D' : ' '}`,
        style(14, mine ? '#ffe066' : '#c9d3ee', 'left'),
        0,
      );
    });
    if (result.achievements.length) {
      put(
        cx,
        cy + 100,
        result.achievements.map((a) => `ACHIEVEMENT: ${a.name}  +${a.reward} coins`),
        style(14, '#ffd34d'),
      );
    }
    const again = put(
      cx,
      cy + 140,
      `SPACE / tap: drive again   G: garage   D: ${this.daily ? 'free run' : 'daily challenge'}`,
      style(16, '#ffe066'),
    );
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
      g.lineStyle(1, r.inLane(this.lane.f) ? 0xff5a4a : 0x886666, 0.9);
      for (const c of truckCircles(r.truck)) g.strokeCircle(c.x, c.y, c.r);
    }
    g.lineStyle(1, 0xff9f45, 0.9);
    for (const w of this.run.wrecks.items) {
      if (!w.solid || Math.abs(w.lane - this.lane.f) >= LANES.hitBand) continue;
      for (const c of wreckCircles(w)) g.strokeCircle(c.x, c.y, c.r);
    }
    g.lineStyle(1, 0xc0c4cc, 0.9);
    for (const o of this.run.obstacles.items) {
      if (!o.solid || Math.abs(o.lane - this.lane.f) >= LANES.hitBand) continue;
      for (const c of obstacleCircles(o)) g.strokeCircle(c.x, c.y, c.r);
    }
  }

  /** Sprites for obstacles near the screen: placed in their lane; loose ones tumble and fade when hit. */
  private syncObstacles(): void {
    const cam = this.cameras.main;
    const left = cam.scrollX - 250;
    const right = cam.scrollX + VIEW_W + 250;
    const live = new Set<number>();
    for (const o of this.run.obstacles.items) {
      if (o.x < left || o.x > right) continue;
      live.add(o.id);
      const key = obstacleKey(o.kind, o.variant);
      let img = this.obstacleSprites.get(o.id);
      if (!img) {
        img = this.add.image(0, 0, key);
        this.obstacleSprites.set(o.id, img);
      }
      const r = OBSTACLE_KINDS[o.kind].radius;
      const h = img.height;
      // At rest the sprite stands on the ground; once knocked loose it tumbles about its centre.
      const cy = o.solid ? o.y + r - 1 - h / 2 : o.y;
      const gy = this.terrain.heightAt(o.x);
      const shadeV = laneShade(o.lane);
      img
        .setPosition(o.x, laneProject(gy, cy, o.lane))
        .setRotation(o.angle)
        .setScale(laneScale(o.lane))
        .setTint(Phaser.Display.Color.GetColor(shadeV, shadeV, shadeV))
        .setAlpha(o.solid ? 1 : Math.max(0, 1 - o.age / OBSTACLES.debrisLife))
        .setDepth(o.solid ? laneDepth(o.lane, 0.02) : 4);
    }
    for (const [id, img] of this.obstacleSprites) {
      if (!live.has(id)) {
        img.destroy();
        this.obstacleSprites.delete(id);
      }
    }
  }

  /** A little lane radar under the race position: where you are and what is ahead, lane by lane. */
  private drawLaneHud(): void {
    const g = this.laneHud;
    g.clear();
    const x0 = VIEW_W - 112;
    const w = 100;
    const rowH = 11;
    const top = 66;
    const yOf = (lane: number) => top + (LANES.count - 1 - lane) * rowH + rowH / 2 - 1;
    const t = this.truck;
    const xOf = (x: number) => x0 + 14 + Math.max(0, Math.min(1, (x - t.x) / 1500)) * (w - 18);
    g.fillStyle(0x0b1230, 0.6);
    g.fillRoundedRect(x0 - 4, top - 4, w + 8, LANES.count * rowH + 6, 4);
    for (let l = 0; l < LANES.count; l++) {
      g.fillStyle(l === this.lane.target ? 0x2a3f7a : 0x16224a, 0.95);
      g.fillRect(x0, yOf(l) - rowH / 2 + 1, w, rowH - 2);
    }
    for (const o of this.run.obstacles.items) {
      if (!o.solid || o.x < t.x - 60 || o.x > t.x + 1500) continue;
      g.fillStyle(OBSTACLE_KINDS[o.kind].loose ? 0xaeb2bb : 0xe8e8ee, 1);
      g.fillRect(xOf(o.x) - 2, yOf(o.lane) - 2, 4, 4);
    }
    for (const wr of this.run.wrecks.items) {
      if (!wr.solid || wr.x < t.x - 60 || wr.x > t.x + 1500) continue;
      g.fillStyle(0xff9f45, 1);
      g.fillRect(xOf(wr.x) - 3, yOf(wr.lane) - 2, 6, 4);
    }
    for (const r of this.race.rivals) {
      if (r.truck.x < t.x - 200 || r.truck.x > t.x + 1500) continue;
      g.fillStyle(0xff5a4a, 1);
      g.fillCircle(Math.max(x0 + 3, xOf(r.truck.x)), yOf(r.laneF), 3);
    }
    g.fillStyle(0xffe066, 1);
    const py = yOf(this.lane.f);
    g.fillTriangle(x0 + 2, py - 4, x0 + 2, py + 4, x0 + 11, py);
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
    if (this.debug) {
      lines.push(
        `angle ${t.angle.toFixed(2)}  vy ${t.vy.toFixed(0)}  grounded ${t.grounded}`,
        `wheels ${t.wheelContacts.map((c) => (c.inContact ? '■' : '□')).join('')}  body ${t.bodyContact}`,
        `fuel ${(r.fuel.level * 100).toFixed(1)}%  chain ${r.score.chain}  next cans ${r.pickups.fuelXs.slice(-2).map((x) => x.toFixed(0)).join(', ')}`,
        `lane ${this.lane.f.toFixed(2)}->${this.lane.target}  rivals ${this.race.rivals.map((r) => `#${r.number}@${r.laneF.toFixed(1)}`).join(' ')}  draft ${this.race.draft.toFixed(2)}  wrecks ${this.run.wrecks.items.length}  obstacles ${this.run.obstacles.items.length}  wrench +${Math.round(WRENCH.restore * 100)}%`,
        `seed ${this.seed}  terrain [${this.terrain.startX.toFixed(0)}, ${this.terrain.endX.toFixed(0)}]`,
      );
    }
    this.hud.setText(lines);
  }
}
