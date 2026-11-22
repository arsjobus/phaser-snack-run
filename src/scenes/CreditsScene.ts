import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { ALL_CREDITS, GAME_TITLE } from '../credits';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK } from '../ui/Theme';
import { bottomBar, button, flatBackdrop, label, logoPlate, panel, topBar, type Layer } from '../ui/Ui';

/**
 * Credits: who made the game and what it is built with (the text lives in `src/credits.ts`).
 * Enter, Space, Esc, a click on Back, or the pad's A/B go back to the start screen.
 */
export class CreditsScene extends Phaser.Scene {
  private edges = new PadEdges();

  constructor() {
    super('Credits');
  }

  create(): void {
    this.edges = new PadEdges();
    flatBackdrop(this);
    const layer: Layer = this.add.container(0, 0);
    topBar(this, layer, 'CREDITS');
    logoPlate(this, layer, VIEW_W / 2, 124, 380, 70, 'SNACK RUN');
    panel(this, layer, 130, 178, 700, 262);
    const step = 40;
    ALL_CREDITS.forEach((c, i) => {
      const y = 204 + i * step;
      label(this, layer, VIEW_W / 2, y, c.role, 'body', 15, INK.cyan);
      label(this, layer, VIEW_W / 2, y + 19, c.names.join('  '), 'display', 17, INK.text);
    });
    button(this, layer, { x: VIEW_W / 2, y: 472, w: 220, h: 44, text: 'BACK', hint: 'ESC', selected: true, size: 18, onClick: () => this.back() });
    bottomBar(this, layer, `${GAME_TITLE}   ·   ENTER or ESC to go back`);
    const kb = this.input.keyboard!;
    const onKey = (e: KeyboardEvent) => {
      if (['Enter', 'NumpadEnter', 'Space', 'Escape', 'KeyC'].includes(e.code)) this.back();
    };
    kb.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', onKey));
  }

  update(): void {
    const e = this.edges.update(padButtons(firstPad()));
    if (e.confirm || e.back) this.back();
  }

  private back(): void {
    this.scene.start('Menu');
  }
}
