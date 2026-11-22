import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
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
 * Esc goes back. Clicks and taps work on every row (a slider is set where you tap it).
 */
export class SettingsScene extends Phaser.Scene {
  private store: KeyValueStore = defaultStore();
  private settings!: Settings;
  private from = 'Game';
  private row = 0;
  private rebinding: Action | null = null;
  private layer!: Phaser.GameObjects.Container;
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
    this.cameras.main.setBackgroundColor('#0b1230');
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
    this.row = (this.row + d + this.rows.length) % this.rows.length;
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
    this.scene.start(this.from === 'Garage' ? 'Garage' : 'Game', { daily: false });
  }

  private text(x: number, y: number, str: string, size: number, color: string, ox = 0): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, str, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(ox, 0.5);
    this.layer.add(t);
    return t;
  }

  private draw(): void {
    this.layer.removeAll(true);
    this.text(VIEW_W / 2, 26, 'SETTINGS', 28, '#ffe066', 0.5);
    const top = 62;
    const step = 22.5;
    this.rows.forEach((r, i) => {
      const y = top + i * step;
      const on = i === this.row;
      const box = this.add
        .rectangle(VIEW_W / 2, y, 820, step - 2, on ? 0x2a3f7a : 0x111a3c)
        .setStrokeStyle(on ? 2 : 1, on ? 0x9be0ff : 0x2a3668)
        .setInteractive({ useHandCursor: true });
      box.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.row = i;
        if (r.kind === 'slider' && p.x >= 640 && p.x <= 840) {
          r.set(Math.round(((p.x - 640) / 200) * 10) / 10);
          this.commit();
        } else this.activate();
      });
      this.layer.add(box);
      const col = on ? '#ffffff' : '#c9d3ee';
      const lx = 70;
      switch (r.kind) {
        case 'slider': {
          this.text(lx, y, r.label, 15, col);
          const v = r.get();
          const bar = this.add.rectangle(640, y, 200, 8, 0x0b1230).setOrigin(0, 0.5).setStrokeStyle(1, 0x44558a);
          const fill = this.add.rectangle(640, y, 200 * v, 8, 0x4cd964).setOrigin(0, 0.5);
          this.layer.add([bar, fill]);
          this.text(860, y, `${Math.round(v * 100)}%`, 15, col, 0);
          break;
        }
        case 'toggle':
          this.text(lx, y, r.label, 15, col);
          this.text(640, y, r.get() ? 'ON' : 'OFF', 15, r.get() ? '#7dff8a' : '#9aa7cf');
          break;
        case 'choice':
          this.text(lx, y, r.label, 15, col);
          this.text(640, y, r.get().toUpperCase(), 15, '#9be0ff');
          break;
        case 'bind': {
          this.text(lx, y, `Key: ${ACTION_LABELS[r.action]}`, 15, col);
          const waiting = this.rebinding === r.action;
          this.text(640, y, waiting ? 'PRESS A KEY (Esc cancels)' : bindingText(this.settings.bindings, r.action), 15, waiting ? '#ffe066' : '#9be0ff');
          break;
        }
        case 'reset':
          this.text(lx, y, 'Reset keys to defaults', 15, col);
          break;
        case 'back':
          this.text(lx, y, 'Back', 15, '#ffe066');
          break;
      }
    });
    this.text(
      VIEW_W / 2,
      VIEW_H - 22,
      '↑↓ pick   ←→ change   ENTER change / rebind   ESC back   (pad: stick/D-pad, A, B)   saved automatically',
      13,
      '#9aa7cf',
      0.5,
    );
  }
}
