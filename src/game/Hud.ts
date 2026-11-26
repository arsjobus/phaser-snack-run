import Phaser from 'phaser';
import { CHECKPOINT, FUEL, VIEW_H, VIEW_W } from '../config';
import { t } from '../i18n';
import { INK, UI, textStyle } from '../ui/Theme';
import { NeedleSpring, blinkLit, formatClock, formatDistance, needleAngle } from './HudModel';

export const HUD_H = 72;

export interface HudState {
  /** Tank, 0..1. */
  fuel: number;
  /** Truck damage, 0..1. */
  damage: number;
  multiplier: number;
  meters: number;
  speedKmh: number;
  score: number;
  bonus: number;
  /** Number of the next checkpoint (1-based). */
  cpNext: number;
  /** Seconds left on the checkpoint clock. */
  cpTimeLeft: number;
  /** 0..1 progress to the next checkpoint. */
  cpProgress: number;
  /** Seconds since the run began (drives blinking). */
  time: number;
  /** Frame time, for the needle springs. */
  dt: number;
}

const NAVY = UI.navy;
const PANEL = UI.panel;
const RIM = UI.rim;
const GREEN = UI.green;
const YELLOW = UI.yellow;
const RED = UI.red;

const DIAL_R = 32;
/** Panel layout: [left x, width]. Dials, clock, distance, score, combo. */
const PANELS = {
  gauges: [172, 200],
  clock: [384, 170],
  distance: [566, 140],
  score: [718, 130],
  combo: [860, 90],
} as const;

/**
 * Bottom-bar HUD in the style of the original: logo plate plus gauge panels. Fuel and Damage are
 * half-dials with sprung needles, C.P./Time is a countdown with a progress bar to the next gate,
 * then Distance, Score/Bonus and the combo. Low fuel blinks the dial and the scene beeps in step.
 */
export class Hud {
  private dyn: Phaser.GameObjects.Graphics;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private top = VIEW_H - HUD_H;
  private fuelNeedle = new NeedleSpring(1);
  private damageNeedle = new NeedleSpring(0);
  private pulseUntil = -1;

  constructor(private scene: Phaser.Scene) {
    const st = this.scene.add.graphics().setScrollFactor(0).setDepth(20);
    st.fillStyle(NAVY, 1);
    st.fillRect(0, this.top, VIEW_W, HUD_H);
    st.fillStyle(0x000000, 0.35);
    st.fillRect(0, this.top, VIEW_W, 3);
    st.fillStyle(RIM, 1);
    st.fillRect(0, this.top - 2, VIEW_W, 2);

    // Logo plate (original brand)
    st.fillStyle(UI.yellow, 1);
    st.fillRoundedRect(10, this.top + 8, 150, 56, 8);
    st.lineStyle(3, UI.outline, 1);
    st.strokeRoundedRect(10, this.top + 8, 150, 56, 8);
    this.label(85, this.top + 24, 'CRUNCH', '#b83a1a', 22, true);
    this.label(85, this.top + 47, '4x4', '#000000', 24, true);

    for (const [x, w] of Object.values(PANELS)) {
      st.fillStyle(PANEL, 1);
      st.fillRoundedRect(x, this.top + 6, w, 60, 14);
      st.lineStyle(2, RIM, 0.9);
      st.strokeRoundedRect(x, this.top + 6, w, 60, 14);
    }

    this.texts.fuelTitle = this.dialFace(st, 222, t('hud.fuel'), 'E', 'F', [
      [0, FUEL.low, RED],
      [FUEL.low, 0.5, YELLOW],
      [0.5, 1, GREEN],
    ]);
    this.dialFace(st, 322, t('hud.damage'), '0', 'X', [
      [0, 0.5, GREEN],
      [0.5, 0.75, YELLOW],
      [0.75, 1, RED],
    ]);

    // Clock panel: two readouts and a divider.
    const cx0 = PANELS.clock[0];
    st.lineStyle(1, RIM, 0.35);
    st.lineBetween(cx0 + 84, this.top + 14, cx0 + 84, this.top + 44);
    this.label(cx0 + 42, this.top + 15, t('hud.cp'), INK.hudLabel, 13, true);
    this.label(cx0 + 127, this.top + 15, t('hud.time'), INK.hudLabel, 13, true);

    this.label(PANELS.distance[0] + 70, this.top + 15, t('hud.distance'), INK.hudLabel, 13, true);
    this.label(PANELS.score[0] + 65, this.top + 15, t('hud.score'), INK.hudLabel, 13, true);
    this.label(PANELS.combo[0] + 45, this.top + 15, t('hud.combo'), INK.hudLabel, 13, true);

    this.dyn = scene.add.graphics().setScrollFactor(0).setDepth(21);
    this.texts.cp = this.value(cx0 + 42, this.top + 38, 26);
    this.texts.clock = this.value(cx0 + 127, this.top + 38, 26);
    this.texts.dist = this.value(PANELS.distance[0] + 70, this.top + 36, 24);
    this.texts.speed = this.label(PANELS.distance[0] + 70, this.top + 55, '', INK.hudLabel, 13, true);
    this.texts.score = this.value(PANELS.score[0] + 65, this.top + 33, 24);
    this.texts.bonus = this.label(PANELS.score[0] + 65, this.top + 54, '', INK.title, 13, true);
    this.texts.combo = this.value(PANELS.combo[0] + 45, this.top + 42, 28);
  }

  /** Flash the clock panel gold for a moment (checkpoint celebration). */
  celebrate(now: number): void {
    this.pulseUntil = now + 1.2;
  }

  private label(x: number, y: number, text: string, color: string, size: number, bold = false) {
    return this.scene.add
      .text(x, y, text, { ...textStyle(size >= 20 ? 'display' : 'body', size, color), fontStyle: size >= 20 ? 'normal' : bold ? 'bold' : 'normal' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setResolution(2)
      .setDepth(22);
  }

  private value(x: number, y: number, size: number) {
    return this.label(x, y, '', '#ffffff', size, true);
  }

  /** Static half-dial: coloured zone arc, ticks, end labels and title. */
  private dialFace(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    title: string,
    left: string,
    right: string,
    zones: ReadonlyArray<readonly [number, number, number]>,
  ): Phaser.GameObjects.Text {
    const cy = this.top + 44;
    g.fillStyle(0x070b20, 1);
    g.fillCircle(cx, cy, DIAL_R + 3);
    g.fillRect(cx - DIAL_R - 3, cy, (DIAL_R + 3) * 2, 6);
    for (const [a, b, color] of zones) {
      g.lineStyle(6, color, 1);
      g.beginPath();
      g.arc(cx, cy, DIAL_R - 6, needleAngle(a), needleAngle(b), false);
      g.strokePath();
    }
    g.lineStyle(2, 0xdfe8ff, 0.8);
    for (let i = 0; i <= 4; i++) {
      const a = needleAngle(i / 4);
      g.lineBetween(
        cx + Math.cos(a) * (DIAL_R - 1),
        cy + Math.sin(a) * (DIAL_R - 1),
        cx + Math.cos(a) * (DIAL_R - 4),
        cy + Math.sin(a) * (DIAL_R - 4),
      );
    }
    this.label(cx - DIAL_R + 4, cy + 8, left, '#dfe8ff', 11, true);
    this.label(cx + DIAL_R - 4, cy + 8, right, '#dfe8ff', 11, true);
    return this.label(cx, cy + 15, title, '#9fb4e8', 11, true);
  }

  private needle(g: Phaser.GameObjects.Graphics, cx: number, value: number): void {
    const cy = this.top + 44;
    const a = needleAngle(value);
    const len = DIAL_R - 5;
    g.lineStyle(5, 0x000000, 0.45);
    g.lineBetween(cx + 1, cy + 1, cx + Math.cos(a) * len + 1, cy + Math.sin(a) * len + 1);
    g.lineStyle(3, 0xffffff, 1);
    g.lineBetween(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.fillStyle(0xdfe8ff, 1);
    g.fillCircle(cx, cy, 4);
  }

  update(s: HudState): void {
    const g = this.dyn;
    g.clear();
    const lit = blinkLit(s.time);
    const lowFuel = s.fuel < FUEL.low && s.fuel > 0;
    const dry = s.fuel <= 0;

    // Fuel and damage dials with sprung needles; a low tank blinks a red rim.
    const fuelPos = this.fuelNeedle.step(s.fuel, s.dt);
    const damagePos = this.damageNeedle.step(s.damage, s.dt);
    this.needle(g, 222, fuelPos);
    this.needle(g, 322, damagePos);
    if (lowFuel || dry) {
      g.lineStyle(3, RED, lit || dry ? 1 : 0.25);
      g.strokeCircle(222, this.top + 44, DIAL_R + 3);
    }
    if (s.damage >= 0.75) {
      g.lineStyle(3, RED, lit ? 1 : 0.25);
      g.strokeCircle(322, this.top + 44, DIAL_R + 3);
    }
    this.texts.fuelTitle.setColor(lowFuel || dry ? (lit ? '#ff6a5a' : '#7a2a24') : '#9fb4e8');

    // Checkpoint clock + progress bar.
    const [px, pw] = PANELS.clock;
    const urgent = s.cpTimeLeft < CHECKPOINT.warnSeconds;
    const pulsing = s.time < this.pulseUntil;
    const barX = px + 12;
    const barW = pw - 24;
    const barY = this.top + 54;
    g.fillStyle(0x1b2b5a, 1);
    g.fillRoundedRect(barX, barY, barW, 8, 3);
    g.fillStyle(urgent ? RED : 0x6fc4ff, 1);
    g.fillRoundedRect(barX, barY, Math.max(4, barW * s.cpProgress), 8, 3);
    g.fillStyle(0xffffff, 1); // flag at the end of the bar
    g.fillRect(barX + barW - 2, barY - 3, 3, 14);
    if (pulsing) {
      g.lineStyle(4, 0xffe066, Math.floor(s.time * 8) % 2 === 0 ? 1 : 0.35);
      g.strokeRoundedRect(px, this.top + 6, pw, 60, 14);
    }

    const t = this.texts;
    t.cp.setText(String(s.cpNext).padStart(2, '0'));
    t.clock.setText(formatClock(s.cpTimeLeft));
    t.clock.setColor(urgent ? (lit ? '#ff6a5a' : '#8a3028') : pulsing ? '#ffe066' : '#ffffff');
    t.combo.setText(s.multiplier > 1 ? `x${s.multiplier}` : '--');
    t.combo.setColor(s.multiplier >= 8 ? '#ff7a45' : s.multiplier > 1 ? '#ffe066' : '#6b7aa8');
    t.dist.setText(formatDistance(s.meters));
    t.speed.setText(`${Math.round(s.speedKmh)} km/h`);
    t.score.setText(String(s.score).padStart(6, '0'));
    t.bonus.setText(`BONUS ${s.bonus}`);
  }
}
