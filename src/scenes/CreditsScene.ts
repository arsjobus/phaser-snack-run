import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { ALL_CREDITS, GAME_TITLE } from '../credits';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK } from '../ui/Theme';
import { backButton, bottomBar, flatBackdrop, label, logoPlate, panel, topBar, type Layer } from '../ui/Ui';
import { applyView } from '../ui/Resolution';
import { t } from '../i18n';

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
    applyView(this);
    this.edges = new PadEdges();
    flatBackdrop(this);
    const layer: Layer = this.add.container(0, 0);
    topBar(this, layer, t('credits.title'));
    logoPlate(this, layer, VIEW_W / 2, 124, 380, 70, t('menu.subtitle'));
    // Keep the credits panel above the fixed Back button, with enough room for every role/name pair.
    const panelY = 170;
    const panelHeight = 260;
    panel(this, layer, 130, panelY, 700, panelHeight);
    const sectionStep = 43;
    // Center the full block, including the rendered text height, inside the panel's inner face.
    const nameOffset = 16;
    const textHeight = 18;
    const contentHeight = ALL_CREDITS.length === 0
      ? 0
      : (ALL_CREDITS.length - 1) * sectionStep + nameOffset + textHeight;
    const firstY = panelY + (panelHeight - contentHeight) / 2 + textHeight / 2;
    ALL_CREDITS.forEach((c, i) => {
      const y = firstY + i * sectionStep;
      label(this, layer, VIEW_W / 2, y, c.roleKey ? t(c.roleKey) : c.role, 'body', 15, INK.cyan);
      label(this, layer, VIEW_W / 2, y + nameOffset, (c.namesKey ? t(c.namesKey) : c.names.join('  ')), 'display', 17, INK.text);
    });
    backButton(this, layer, VIEW_W / 2, 472, () => this.back());
    bottomBar(this, layer, `${GAME_TITLE}   ·   ${t('credits.hint')}`);
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
