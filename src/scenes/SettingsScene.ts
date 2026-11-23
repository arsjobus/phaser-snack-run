import Phaser from 'phaser';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK, LIST, UI, wrapIndex } from '../ui/Theme';
import { backButton, bottomBar, flatBackdrop, label, rowPlate, topBar, type Layer } from '../ui/Ui';
import { defaultStore, type KeyValueStore } from '../progress/Storage';
import {
  ACTIONS,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  bindingText,
  cloneBindings,
  loadSettings,
  saveSettings,
  setBinding,
  type Action,
  type Settings,
} from '../settings/Settings';

/** How many rows sit in the left column of the settings screen. */
const LEFT_ROWS = 8;

type Row =
  | { kind: 'slider'; label: string; get: () => number; set: (v: number) => void }
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { kind: 'choice'; label: string; options: string[]; get: () => string; set: (v: string) => void }
  | { kind: 'bind'; action: Action }
  | { kind: 'reset' }
  | { kind: 'back' };

/**
 * Settings (Phase 8): volumes, screen shake, reduced motion, colour-blind pickups, effects quality,
 * touch controls and remappable keys. Reached with O from the game-over screen or the garage (or
 * the pad's Back button). Keyboard: Up/Down pick, Left/Right change, Enter changes or rebinds,
 * Esc goes back to where you came from (the start screen, the garage or the game-over screen).
 * Clicks and taps work on every row (a slider is set where you tap it). Drawn with the shared UI
 * kit (`src/ui/`) in two columns: sound and screen on the left, the keys on the right.
 */
export class SettingsScene extends Phaser.Scene {
  private store: KeyValueStore = defaultStore();
  private settings!: Settings;
  private from = 'Game';
  private row = 0;
  private rebinding: Action | null = null;
  private layer!: Layer;
  private rows: Row[] = [];
  private edges = new PadEdges();

  constructor() {
    super('Settings');
  }

  init(data?: { from?: string }): void {
    this.from = data?.from ?? 'Game';
  }

  create(): void {
    this.settings = loadSettings(this.store);
    this.row = 0;
    this.rebinding = null;
    this.edges = new PadEdges();
    flatBackdrop(this);
    this.layer = this.add.container(0, 0);
    const s = this.settings;
    this.rows = [
      { kind: 'slider', label: 'Master volume', get: () => s.master, set: (v) => (s.master = v) },
      { kind: 'slider', label: 'Music volume', get: () => s.music, set: (v) => (s.music = v) },
      { kind: 'slider', label: 'Effects volume', get: () => s.sfx, set: (v) => (s.sfx = v) },
      { kind: 'slider', label: 'Screen shake', get: () => s.shake, set: (v) => (s.shake = v) },
      { kind: 'toggle', label: 'Reduced motion', get: () => s.reducedMotion, set: (v) => (s.reducedMotion = v) },
      { kind: 'toggle', label: 'Colour-blind pickups', get: () => s.colorblind, set: (v) => (s.colorblind = v) },
      { kind: 'choice', label: 'Effects quality', options: ['auto', 'full', 'reduced'], get: () => s.effects, set: (v) => (s.effects = v as Settings['effects']) },
      { kind: 'choice', label: 'Touch controls', options: ['auto', 'on', 'off'], get: () => s.touch, set: (v) => (s.touch = v as Settings['touch']) },
      ...ACTIONS.map((action): Row => ({ kind: 'bind', action })),
      { kind: 'reset' },
      { kind: 'back' },
    ];
    const kb = this.input.keyboard!;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.draw();
  }

  update(): void {
    const e = this.edges.update(padButtons(firstPad()));
    if (this.rebinding) return;
    if (e.up) this.move(-1);
    if (e.down) this.move(1);
    if (e.left) this.change(-1);
    if (e.right) this.change(1);
    if (e.confirm) this.activate();
    if (e.back || e.settings) this.back();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.rebinding) {
      if (e.code === 'Escape') this.rebinding = null;
      else if (e.code !== 'Enter' && e.code !== 'NumpadEnter') {
        this.settings.bindings = setBinding(this.settings.bindings, this.rebinding, e.code);
        this.rebinding = null;
        this.commit();
        return;
      }
      this.draw();
      return;
    }
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move(1);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.change(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.change(1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate();
        break;
      case 'Escape':
      case 'KeyO':
        this.back();
        break;
    }
  }

  private move(d: number): void {
    this.row = wrapIndex(this.row, d, this.rows.length);
    this.draw();
  }

  /** Left/Right: a step on a slider, the other option on a choice, flips a toggle. */
  private change(d: number): void {
    const r = this.rows[this.row];
    if (r.kind === 'slider') r.set(Math.max(0, Math.min(1, Math.round((r.get() + d * 0.1) * 100) / 100)));
    else if (r.kind === 'toggle') r.set(!r.get());
    else if (r.kind === 'choice') r.set(r.options[(r.options.indexOf(r.get()) + d + r.options.length) % r.options.length]);
    else return;
    this.commit();
  }

  /** Enter / tap on a row. */
  private activate(): void {
    const r = this.rows[this.row];
    if (r.kind === 'bind') {
      this.rebinding = r.action;
      this.draw();
    } else if (r.kind === 'reset') {
      this.settings.bindings = cloneBindings(DEFAULT_BINDINGS);
      this.commit();
    } else if (r.kind === 'back') this.back();
    else if (r.kind === 'slider') {
      const v = r.get();
      r.set(v >= 1 ? 0 : Math.min(1, Math.round((v + 0.1) * 100) / 100));
      this.commit();
    } else this.change(1);
  }

  private commit(): void {
    saveSettings(this.store, this.settings);
    this.draw();
  }

  private back(): void {
    this.input.keyboard?.off('keydown');
    if (this.from === 'Menu') this.scene.start('Menu');
    else if (this.from === 'Garage') this.scene.start('Garage');
    else this.scene.start('Game');
  }

  /** Rows 0 to `LEFT_ROWS - 1` are the left column (sound and screen), the rest the right column (keys). */
  private text(x: number, y: number, str: string, size: number, color: string, ox = 0, display = false): Phaser.GameObjects.Text {
    return label(this, this.layer, x, y, str, display ? 'display' : 'body', size, color, ox);
  }

  private draw(): void {
    this.layer.removeAll(true);
    topBar(this, this.layer, 'SETTINGS');
    this.text(40, 90, 'SOUND AND SCREEN', 14, INK.cyan, 0, true);
    this.text(500, 90, 'KEYS', 14, INK.cyan, 0, true);
    this.rows.forEach((r, i) => {
      const left = i < LEFT_ROWS;
      const j = left ? i : i - LEFT_ROWS;
      const cx = left ? 250 : 712;
      const w = 430;
      // Rows are `LIST.rowGap` apart (the same standard as the garage and the achievements).
      const rowH = left ? 38 : 28;
      const step = rowH + LIST.rowGap;
      const y = 124 + j * step;
      const on = i === this.row;
      const lx = cx - w / 2 + LIST.padX;
      const vx = cx + 30; // where the value starts
      if (r.kind === 'back') {
        // The Back button looks exactly like the Credits one: wide, yellow, with its key hint.
        backButton(this, this.layer, cx, y + 14, () => this.back(), on);
        return;
      }
      rowPlate(this, this.layer, cx, y, w, rowH, on);
      const zone = this.add.zone(cx, y, w, rowH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.row = i;
        if (r.kind === 'slider' && p.x >= vx && p.x <= vx + 130) {
          r.set(Math.round(((p.x - vx) / 130) * 10) / 10);
          this.commit();
        } else this.activate();
      });
      this.layer.add(zone);
      const col = on ? INK.text : INK.soft;
      switch (r.kind) {
        case 'slider': {
          this.text(lx, y, r.label, 17, col);
          const v = r.get();
          const g = this.add.graphics();
          g.fillStyle(UI.outline, 1);
          g.fillRect(vx - 2, y - 8, 134, 16);
          g.fillStyle(UI.panelLight, 1);
          g.fillRect(vx, y - 6, 130, 12);
          g.fillStyle(UI.green, 1);
          g.fillRect(vx, y - 6, 130 * v, 12);
          this.layer.add(g);
          this.text(cx + w / 2 - 14, y, `${Math.round(v * 100)}%`, 16, col, 1);
          break;
        }
        case 'toggle':
          this.text(lx, y, r.label, 17, col);
          this.text(vx, y, r.get() ? 'ON' : 'OFF', 16, r.get() ? INK.good : INK.dim, 0, true);
          break;
        case 'choice':
          this.text(lx, y, r.label, 17, col);
          this.text(vx, y, r.get().toUpperCase(), 16, INK.cyan, 0, true);
          break;
        case 'bind': {
          this.text(lx, y, ACTION_LABELS[r.action], 16, col);
          const waiting = this.rebinding === r.action;
          this.text(cx + w / 2 - 14, y, waiting ? 'PRESS A KEY' : bindingText(this.settings.bindings, r.action), 14, waiting ? INK.title : INK.cyan, 1, true);
          break;
        }
        case 'reset':
          this.text(lx, y, 'Reset keys to defaults', 16, col);
          break;
      }
    });
    bottomBar(this, this.layer, this.rebinding ? 'PRESS THE NEW KEY   ESC cancels' : 'UP/DOWN pick   LEFT/RIGHT change   ENTER change / rebind   ESC back   saved automatically');
  }
}
