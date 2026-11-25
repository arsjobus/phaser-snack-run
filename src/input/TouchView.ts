import { t } from '../i18n';
import Phaser from 'phaser';
import { TOUCH_BUTTONS, TOUCH_LAYOUT, type TouchButton } from './Touch';
import type { Held } from './Controls';
import { FONT_DISPLAY } from '../ui/Fonts';

const LABELS: Record<TouchButton, string> = { gas: 'GAS', brake: 'BRAKE', far: '▲', near: '▼' };
const COLORS: Record<TouchButton, number> = { gas: 0x2f9e4a, brake: 0xd2392b, far: 0x2f6fd6, near: 0x2f6fd6 };

/** Draws the on-screen buttons (screen-fixed, translucent) and lights the ones being held. */
export class TouchView {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private shown = true;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(9);
    for (const b of TOUCH_BUTTONS) {
      const r = TOUCH_LAYOUT[b];
      this.labels.push(
        scene.add
          .text(r.x + r.w / 2, r.y + r.h / 2, (b === 'gas' ? t('touch.gas') : b === 'brake' ? t('touch.brake') : LABELS[b]), {
            fontFamily: FONT_DISPLAY,
            fontSize: b === 'gas' || b === 'brake' ? '26px' : '34px',
            fontStyle: 'normal',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(9.1)
          .setAlpha(0.85),
      );
    }
  }

  setVisible(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.g.setVisible(on);
    this.labels.forEach((l) => l.setVisible(on));
    if (!on) this.g.clear();
  }

  draw(held: Held): void {
    if (!this.shown) return;
    const g = this.g;
    g.clear();
    const lit: Record<TouchButton, boolean> = { gas: held.gas > 0, brake: held.brake > 0, far: held.far, near: held.near };
    for (const b of TOUCH_BUTTONS) {
      const r = TOUCH_LAYOUT[b];
      g.fillStyle(COLORS[b], lit[b] ? 0.7 : 0.32);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 18);
      g.lineStyle(3, 0xffffff, lit[b] ? 0.95 : 0.5);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 18);
    }
  }
}
