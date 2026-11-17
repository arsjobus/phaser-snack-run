import Phaser from 'phaser';
import {
  BASE_Y,
  CAMERA,
  GAMEPLAY,
  PHYSICS,
  PX_PER_METER,
  SCROLL_Y0,
  TERRAIN_STEP,
  TRUCK,
  VIEW_H,
  VIEW_W,
} from '../config';
import { hashSeed } from '../game/Rng';
import { Parallax } from '../game/Parallax';
import { Terrain } from '../game/Terrain';
import { TruckPhysics } from '../game/TruckPhysics';
import { TruckView } from '../game/TruckView';
import type { InputState } from '../game/Input';

const FIXED_DT = 1 / 60 / PHYSICS.substeps;

export class GameScene extends Phaser.Scene {
  private terrain!: Terrain;
  private truck!: TruckPhysics;
  private view!: TruckView;
  private parallax!: Parallax;
  private ground!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private acc = 0;
  private seed = 0;
  private autoThrottle = false;
  private debug = false;
  private bestAir = 0;
  private flippedTimer = 0;
  private startX = GAMEPLAY.startX;

  constructor() {
    super('Game');
  }

  create(): void {
    const param = new URLSearchParams(window.location.search).get('seed');
    this.seed = param ? hashSeed(param) : Math.floor(Math.random() * 2 ** 31);

    this.terrain = new Terrain(this.seed);
    this.parallax = new Parallax(this);
    this.ground = this.add.graphics().setDepth(1);
    this.truck = new TruckPhysics(this.startX, BASE_Y - 45);
    this.view = new TruckView(this);
    this.debugGfx = this.add.graphics().setDepth(5);

    this.hud = this.add
      .text(12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(10);
    this.hint = this.add
      .text(
        VIEW_W / 2,
        VIEW_H - 26,
        '→/D gas   ←/A brake/reverse   ↑/W lean back   ↓/S lean forward   R reset   T auto-gas   H debug',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 3,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10);
    this.toast = this.add
      .text(VIEW_W / 2, 90, '', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffe066',
        stroke: '#000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 9000, duration: 1200 });

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,R,T,H') as Record<string, Phaser.Input.Keyboard.Key>;

    this.terrain.ensure(this.startX + VIEW_W + 1500);
    const cam = this.cameras.main;
    cam.setScroll(this.truck.x - VIEW_W * CAMERA.xAnchor, SCROLL_Y0);
  }

  private readInput(): InputState {
    const k = this.keys;
    const c = this.cursors;
    const gas = c.right.isDown || k.D.isDown || this.autoThrottle;
    const brake = c.left.isDown || k.A.isDown;
    const back = c.up.isDown || k.W.isDown;
    const fwd = c.down.isDown || k.S.isDown;
    return { throttle: gas ? 1 : 0, brake: brake ? 1 : 0, lean: (fwd ? 1 : 0) - (back ? 1 : 0) };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    const J = Phaser.Input.Keyboard.JustDown;
    if (J(this.keys.R)) this.recover();
    if (J(this.keys.T)) this.autoThrottle = !this.autoThrottle;
    if (J(this.keys.H)) this.debug = !this.debug;

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

    // Auto-recover when stuck upside down
    this.flippedTimer = this.truck.flipped && this.truck.speed < 80 ? this.flippedTimer + dt : 0;
    if (this.flippedTimer > GAMEPLAY.flipRecoverTime) this.recover();

    this.updateCamera(dt);
    this.view.update(this.truck, this.terrain, dt);
    this.drawGround();
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

    strip(0x7b5233, 0, null); // dirt
    strip(0x674327, 44, null); // deeper dirt
    strip(0x9a6b3d, 0, 9); // sunlit crust
    strip(0x57391f, 9, 14); // crust shadow line
  }

  private onLanded(airTime: number): void {
    this.bestAir = Math.max(this.bestAir, airTime);
    if (airTime < GAMEPLAY.minAirToast) return;
    this.toast
      .setText(`AIR ${airTime.toFixed(2)}s`)
      .setAlpha(1)
      .setScale(1.25);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 150 });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 500 });
  }

  private recover(): void {
    const x = this.truck.x;
    this.truck.reset(x, this.terrain.heightAt(x) - 50);
    this.truck.vx = 250;
    this.flippedTimer = 0;
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
  }

  private updateHud(): void {
    const t = this.truck;
    const km = Math.max(0, t.speed) / 6;
    const meters = Math.max(0, (t.x - this.startX) / PX_PER_METER);
    const lines = [
      `SPEED  ${km.toFixed(0).padStart(4)} km/h`,
      `DIST   ${meters.toFixed(0).padStart(4)} m`,
      `AIR    ${t.airTime.toFixed(2)}s   BEST ${this.bestAir.toFixed(2)}s`,
    ];
    if (this.autoThrottle) lines.push('AUTO-GAS ON');
    if (this.debug) {
      lines.push(
        `angle ${t.angle.toFixed(2)}  vy ${t.vy.toFixed(0)}  grounded ${t.grounded}`,
        `wheels ${t.wheelContacts.map((c) => (c.inContact ? '■' : '□')).join('')}  body ${t.bodyContact}`,
        `seed ${this.seed}  terrain [${this.terrain.startX.toFixed(0)}, ${this.terrain.endX.toFixed(0)}]`,
      );
    }
    this.hud.setText(lines);
  }
}
