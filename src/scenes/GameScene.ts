import Phaser from 'phaser';
import {
  BASE_Y,
  CAMERA,
  FUEL,
  GAMEPLAY,
  PHYSICS,
  PX_PER_METER,
  SCROLL_Y0,
  TERRAIN_STEP,
  TRUCK,
  VIEW_H,
  VIEW_W,
} from '../config';
import { Beeper } from '../game/Beeper';
import { checkpointMeters } from '../game/Checkpoint';
import { HUD_H, Hud } from '../game/Hud';
import { warnTick } from '../game/HudModel';
import { hashSeed } from '../game/Rng';
import { Parallax } from '../game/Parallax';
import { RunModel, type RunEvent } from '../game/Run';
import { Terrain } from '../game/Terrain';
import { TruckPhysics } from '../game/TruckPhysics';
import { TruckView } from '../game/TruckView';
import type { InputState } from '../game/Input';

const FIXED_DT = 1 / 60 / PHYSICS.substeps;
const TUFT_SPACING = 72;
const GATE_X = GAMEPLAY.startX + 420;
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
    this.lastBeepTick = -1;
    this.beeper = new Beeper(this.sound);

    const param = new URLSearchParams(window.location.search).get('seed');
    this.seed = param ? hashSeed(param) : Math.floor(Math.random() * 2 ** 31);

    this.terrain = new Terrain(this.seed);
    this.run = new RunModel(this.seed, this.terrain, this.startX);
    this.parallax = new Parallax(this);
    this.ground = this.add.graphics().setDepth(1);
    this.addStartGate();
    this.truck = new TruckPhysics(this.startX, BASE_Y - 45);
    this.view = new TruckView(this);
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
        VIEW_H - HUD_H - 18,
        '←/A brake   ↑/W lean back   ↓/S lean forward   R reset   T auto-gas   M mute   H debug',
        text(13, '#ffffff'),
      )
      .setOrigin(0.5)
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
    this.add
      .text(GATE_X - 22, y - 212 + 36, 'START', {
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#111111',
      })
      .setOrigin(0.5)
      .setDepth(0.6);
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
      if (ev.landedAirTime !== null) this.onLanded(ev.landedAirTime);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === 40) this.acc = 0;
    this.terrain.prune(this.truck.x - 1800);

    for (const e of this.run.update(dt, this.truck)) this.onRunEvent(e);
    this.lowFuelBeep();

    // Auto-recover when stuck upside down
    this.flippedTimer =
      !this.run.over && this.truck.flipped && this.truck.speed < 80 ? this.flippedTimer + dt : 0;
    if (this.flippedTimer > GAMEPLAY.flipRecoverTime) this.recover();

    this.updateCamera(dt);
    this.view.update(this.truck, this.terrain, dt);
    this.drawGround();
    this.syncPickups(time / 1000);
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

  private drawGround(): void {
    const cam = this.cameras.main;
    const g = this.ground;
    const x0 = Math.floor(cam.scrollX / TERRAIN_STEP) * TERRAIN_STEP - TERRAIN_STEP;
    const x1 = cam.scrollX + VIEW_W + TERRAIN_STEP * 2;
    const bottom = cam.scrollY + VIEW_H + 80;
    g.clear();

    const strip = (color: number, topOffset: number, bottomOffset: number | null) => {
      g.fillStyle(color, 1);
      g.beginPath();
      for (let x = x0; x <= x1; x += TERRAIN_STEP) {
        const y = this.terrain.heightAt(x) + topOffset;
        if (x === x0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      if (bottomOffset === null) {
        g.lineTo(x1, bottom);
        g.lineTo(x0, bottom);
      } else {
        for (let x = x1; x >= x0; x -= TERRAIN_STEP)
          g.lineTo(x, this.terrain.heightAt(x) + bottomOffset);
      }
      g.closePath();
      g.fillPath();
    };

    strip(0x8a5d33, 0, null); // dirt
    strip(0x724a29, 44, null); // deeper dirt
    strip(0xa87a45, 0, 10); // sunlit crust
    strip(0x5b3a1e, 10, 15); // crust shadow line
    strip(0x6a4425, 22, 26); // tire ruts, like the reference's rutted mud
    strip(0x7a5230, 33, 36);

    // Scrub-grass tufts along the verge (deterministic by world position).
    g.fillStyle(0x6a9a3a, 1);
    for (let k = Math.floor(x0 / TUFT_SPACING); k * TUFT_SPACING < x1; k++) {
      const r = ((Math.imul(k, 2654435761) >>> 0) % 1000) / 1000;
      if (r > 0.6) continue;
      const x = k * TUFT_SPACING + r * 90;
      const y = this.terrain.heightAt(x) + 1;
      g.fillTriangle(x - 5, y, x - 1, y, x - 4, y - 9);
      g.fillTriangle(x - 2, y, x + 2, y, x, y - 12);
      g.fillTriangle(x + 1, y, x + 5, y, x + 4, y - 8);
    }
  }

  private syncPickups(seconds: number): void {
    const cam = this.cameras.main;
    const left = cam.scrollX - 60;
    const right = cam.scrollX + VIEW_W + 60;
    for (const p of this.run.pickups.items) {
      const visible = !p.taken && p.x > left && p.x < right;
      let sprite = this.sprites.get(p.id);
      if (visible && !sprite) {
        sprite = this.add.image(p.x, p.y, p.kind === 'fuel' ? 'fuel_can' : 'snack').setDepth(2.5);
        this.sprites.set(p.id, sprite);
      }
      if (!sprite) continue;
      if (visible) sprite.y = p.y + Math.sin(seconds * 4 + p.id) * 3;
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
      case 'fuel': {
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
        if (e.type === 'snack') {
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
      case 'miss':
      case 'timeup':
      case 'damage':
        break;
    }
  }

  private onLanded(airTime: number): void {
    this.bestAir = Math.max(this.bestAir, airTime);
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
    const img = this.add.image(x, y, 'cp_gate').setOrigin(0.5, 1).setDepth(0.5);
    const label = this.add
      .text(x, y - 212 + 35, `CHECKPOINT ${index}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(0.6);
    this.gates.set(index, [img, label]);
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
          `checkpoints ${this.run.checkpoints.reached}`,
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

    const lines: string[] = [];
    if (t.airTime > 0) lines.push(`AIR ${t.airTime.toFixed(2)}s   BEST ${this.bestAir.toFixed(2)}s`);
    if (!this.autoThrottle) lines.push('AUTO-GAS OFF (T)');
    if (this.debug) {
      lines.push(
        `angle ${t.angle.toFixed(2)}  vy ${t.vy.toFixed(0)}  grounded ${t.grounded}`,
        `wheels ${t.wheelContacts.map((c) => (c.inContact ? '■' : '□')).join('')}  body ${t.bodyContact}`,
        `fuel ${(r.fuel.level * 100).toFixed(1)}%  chain ${r.score.chain}  next cans ${r.pickups.fuelXs.slice(-2).map((x) => x.toFixed(0)).join(', ')}`,
        `seed ${this.seed}  terrain [${this.terrain.startX.toFixed(0)}, ${this.terrain.endX.toFixed(0)}]`,
      );
    }
    this.hud.setText(lines);
  }
}
