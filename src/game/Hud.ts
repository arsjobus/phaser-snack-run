import Phaser from 'phaser';
import { FUEL, VIEW_H, VIEW_W } from '../config';

export const HUD_H = 72;

export interface HudState {
  fuel: number;
  multiplier: number;
  meters: number;
  speedKmh: number;
  score: number;
  bonus: number;
  /** Seconds since the run began (drives the low-fuel blink). */
  time: number;
}

const NAVY = 0x14224a;
const PANEL = 0x0b1230;
const RIM = 0x8fa4d6;

/**
 * Bottom-bar HUD in the style of the original: logo plate plus gauge panels. Phase 2 shows
 * fuel, combo, distance and score/bonus; Phase 3 adds damage, checkpoint time and needles.
 */
export class Hud {
  private dyn: Phaser.GameObjects.Graphics;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private top = VIEW_H - HUD_H;

  constructor(private scene: Phaser.Scene) {
    const st = this.scene.add.graphics().setScrollFactor(0).setDepth(20);
    st.fillStyle(NAVY, 1);
    st.fillRect(0, this.top, VIEW_W, HUD_H);
    st.fillStyle(0x000000, 0.35);
    st.fillRect(0, this.top, VIEW_W, 3);
    st.fillStyle(RIM, 1);
    st.fillRect(0, this.top - 2, VIEW_W, 2);

    // Logo plate (original brand)
    st.fillStyle(0xf2c200, 1);
    st.fillRoundedRect(10, this.top + 8, 150, 56, 8);
    st.lineStyle(3, 0x111111, 1);
    st.strokeRoundedRect(10, this.top + 8, 150, 56, 8);
    this.label(85, this.top + 24, 'CRUNCH', '#b83a1a', 22, true);
    this.label(85, this.top + 47, '4x4', '#14224a', 24, true);

    for (const [x, w] of [
      [172, 250],
      [434, 150],
      [596, 150],
      [758, 192],
    ] as const) {
      st.fillStyle(PANEL, 1);
      st.fillRoundedRect(x, this.top + 6, w, 60, 14);
      st.lineStyle(2, RIM, 0.9);
      st.strokeRoundedRect(x, this.top + 6, w, 60, 14);
    }
    this.label(297, this.top + 14, 'FUEL', '#9fb4e8', 12, true);
    this.label(509, this.top + 14, 'COMBO', '#9fb4e8', 12, true);
    this.label(671, this.top + 14, 'DISTANCE', '#9fb4e8', 12, true);
    this.label(854, this.top + 14, 'SCORE', '#9fb4e8', 12, true);
    this.label(188, this.top + 52, 'E', '#ff7a6a', 14, true);
    this.label(406, this.top + 52, 'F', '#8ef08e', 14, true);

    this.dyn = scene.add.graphics().setScrollFactor(0).setDepth(21);
    this.texts.combo = this.value(509, this.top + 40, 28);
    this.texts.dist = this.value(671, this.top + 36, 24);
    this.texts.speed = this.label(671, this.top + 55, '', '#9fb4e8', 12, true);
    this.texts.score = this.value(854, this.top + 33, 24);
    this.texts.bonus = this.label(854, this.top + 54, '', '#ffe066', 13, true);
  }

  private label(x: number, y: number, text: string, color: string, size: number, bold = false) {
    return this.scene.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(22);
  }

  private value(x: number, y: number, size: number) {
    return this.label(x, y, '', '#ffffff', size, true);
  }

  update(s: HudState): void {
    const g = this.dyn;
    g.clear();

    // Fuel bar: segmented, green -> yellow -> red, blinks when low.
    const x0 = 204;
    const w = 190;
    const y0 = this.top + 28;
    const h = 20;
    g.fillStyle(0x1b2b5a, 1);
    g.fillRoundedRect(x0 - 2, y0 - 2, w + 4, h + 4, 5);
    const low = s.fuel < FUEL.low;
    const blinkOff = low && s.fuel > 0 && Math.floor(s.time * 4) % 2 === 0;
    const color = s.fuel > 0.5 ? 0x4cd964 : s.fuel > FUEL.low ? 0xffcc33 : 0xff4d3d;
    const segs = 20;
    const lit = Math.ceil(s.fuel * segs);
    if (!blinkOff) {
      for (let i = 0; i < lit; i++) {
        g.fillStyle(color, 1);
        g.fillRect(x0 + i * (w / segs) + 1, y0, w / segs - 2, h);
      }
    }
    if (low) {
      g.lineStyle(2, 0xff4d3d, blinkOff ? 0.4 : 1);
      g.strokeRoundedRect(x0 - 3, y0 - 3, w + 6, h + 6, 6);
    }

    const t = this.texts;
    t.combo.setText(s.multiplier > 1 ? `x${s.multiplier}` : '--');
    t.combo.setColor(s.multiplier >= 8 ? '#ff7a45' : s.multiplier > 1 ? '#ffe066' : '#6b7aa8');
    t.dist.setText(String(Math.floor(s.meters)).padStart(4, '0') + ' m');
    t.speed.setText(`${Math.round(s.speedKmh)} km/h`);
    t.score.setText(String(s.score).padStart(6, '0'));
    t.bonus.setText(`BONUS ${s.bonus}`);
  }
}
