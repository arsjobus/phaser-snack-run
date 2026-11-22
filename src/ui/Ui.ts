import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { INK, UI, checkerSquares, hazardStripes, rankColor, textStyle, type TextKind } from './Theme';

/**
 * Drawing kit for every menu (start screen, garage, high scores, settings, credits, game over):
 * flat panels with a steel rim and rivets, buttons, a hazard-striped top bar, a checkered bottom
 * strip, rank medals and level pips. Everything is solid colour with a dark outline, like the trucks
 * and the road: no gradients. Scenes that redraw on every change pass a Container as `layer` and
 * clear it with `layer.removeAll(true)`.
 */
export type Layer = Phaser.GameObjects.Container;

/** Mixes a colour toward white (t > 0) or black (t < 0): one flat step lighter or darker. */
export function tone(color: number, t: number): number {
  const to = t >= 0 ? 255 : 0;
  const a = Math.abs(t);
  const ch = (sh: number) => Math.round(((color >> sh) & 255) * (1 - a) + to * a);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Adds a text object to the layer. `ox` is the horizontal origin (0 left, 0.5 centre, 1 right). */
export function label(
  scene: Phaser.Scene,
  layer: Layer,
  x: number,
  y: number,
  str: string | string[],
  kind: TextKind,
  size: number,
  color: string = INK.text,
  ox = 0.5,
  outline = 0,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, { ...textStyle(kind, size, color, outline), lineSpacing: 4 }).setOrigin(ox, 0.5);
  layer.add(t);
  return t;
}

/** The backdrop of every menu that has no scenery: dark navy with big, faint diagonal bands. */
export function flatBackdrop(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(UI.panel);
  const g = scene.add.graphics().setDepth(-5);
  g.fillStyle(0x0e1a3e, 1);
  for (const poly of hazardStripes(0, 0, VIEW_W, VIEW_H, 110)) g.fillPoints(poly, true);
}

/** Top bar: navy, a rim line, a hazard-striped edge and the screen's title in the display face. */
export function topBar(scene: Phaser.Scene, layer: Layer, title: string): void {
  const g = scene.add.graphics();
  g.fillStyle(UI.navy, 1);
  g.fillRect(0, 0, VIEW_W, 58);
  g.fillStyle(UI.rim, 1);
  g.fillRect(0, 56, VIEW_W, 2);
  g.fillStyle(UI.yellow, 1);
  g.fillRect(0, 58, VIEW_W, 9);
  g.fillStyle(UI.outline, 1);
  for (const poly of hazardStripes(0, 58, VIEW_W, 9, 9)) g.fillPoints(poly, true);
  g.fillRect(0, 67, VIEW_W, 3);
  layer.add(g);
  label(scene, layer, 28, 30, title, 'display', 28, INK.title, 0);
}

/** Bottom strip: a checkered flag edge, with `hint` (the keys) above it. */
export function bottomBar(scene: Phaser.Scene, layer: Layer, hint: string): void {
  const g = scene.add.graphics();
  const y = VIEW_H - 10;
  g.fillStyle(UI.white, 1);
  g.fillRect(0, y, VIEW_W, 10);
  g.fillStyle(UI.outline, 1);
  for (const [sx, sy, s] of checkerSquares(0, y, VIEW_W, 10, 10)) g.fillRect(sx, sy, s, s);
  layer.add(g);
  label(scene, layer, VIEW_W / 2, VIEW_H - 25, hint, 'body', 15, INK.dim);
}

function rivets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  for (const [rx, ry] of [
    [x + 9, y + 9],
    [x + w - 9, y + 9],
    [x + 9, y + h - 9],
    [x + w - 9, y + h - 9],
  ]) {
    g.fillStyle(UI.outline, 1);
    g.fillCircle(rx, ry, 3.6);
    g.fillStyle(0xb8c2dc, 1);
    g.fillCircle(rx, ry, 2.4);
  }
}

/** A flat panel: dark outline, steel-blue rim, dark navy face and rivets in the corners. */
export function panel(scene: Phaser.Scene, layer: Layer, x: number, y: number, w: number, h: number, tab?: string): void {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 13);
  g.fillStyle(UI.rim, 1);
  g.fillRoundedRect(x, y, w, h, 10);
  g.fillStyle(UI.panel, 1);
  g.fillRoundedRect(x + 4, y + 4, w - 8, h - 8, 7);
  rivets(g, x, y, w, h);
  layer.add(g);
  if (tab) {
    const tw = tab.length * 11 + 28;
    const t = scene.add.graphics();
    t.fillStyle(UI.outline, 1);
    t.fillRoundedRect(x + 18, y - 17, tw + 4, 26, 6);
    t.fillStyle(UI.yellow, 1);
    t.fillRoundedRect(x + 20, y - 15, tw, 22, 5);
    layer.add(t);
    label(scene, layer, x + 20 + tw / 2, y - 4, tab, 'display', 13, INK.dark);
  }
}

export interface ButtonSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Small key hint on the right ("ENTER", "G"). */
  hint?: string;
  selected?: boolean;
  /** Face colour of the selected state (default: logo yellow). */
  accent?: number;
  size?: number;
  onClick?: () => void;
  onHover?: () => void;
}

/**
 * A button. Idle: navy face with a steel rim. Selected: bright face and dark text. A lighter flat
 * band across the top third gives the shape without a gradient.
 */
export function button(scene: Phaser.Scene, layer: Layer, b: ButtonSpec): void {
  const g = scene.add.graphics();
  const face = b.selected ? (b.accent ?? UI.yellow) : UI.panelLight;
  const x = b.x - b.w / 2;
  const y = b.y - b.h / 2;
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(x - 3, y - 3, b.w + 6, b.h + 6, 11);
  g.fillStyle(b.selected ? UI.outline : UI.steel, 1);
  g.fillRoundedRect(x, y, b.w, b.h, 9);
  g.fillStyle(face, 1);
  g.fillRoundedRect(x + 3, y + 3, b.w - 6, b.h - 6, 7);
  g.fillStyle(tone(face, b.selected ? 0.28 : 0.08), 1);
  g.fillRoundedRect(x + 3, y + 3, b.w - 6, (b.h - 6) * 0.38, { tl: 7, tr: 7, bl: 0, br: 0 });
  layer.add(g);
  label(scene, layer, b.x, b.y + 1, b.text, 'display', b.size ?? 18, b.selected ? INK.dark : INK.soft);
  if (b.hint) label(scene, layer, x + b.w - 12, b.y + 1, b.hint, 'body', 13, b.selected ? '#3a2f00' : INK.dim, 1);
  if (b.onClick || b.onHover) {
    const zone = scene.add.zone(b.x, b.y, b.w, b.h).setScrollFactor(0).setInteractive({ useHandCursor: true });
    if (b.onClick) zone.on('pointerdown', b.onClick);
    if (b.onHover) zone.on('pointerover', b.onHover);
    layer.add(zone);
  }
}

/** A row background for lists (garage upgrades, settings): flat, rimmed when it is the selected row. */
export function rowPlate(scene: Phaser.Scene, layer: Layer, cx: number, y: number, w: number, h: number, selected: boolean): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(cx - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 9);
  g.fillStyle(selected ? UI.yellow : UI.steel, 1);
  g.fillRoundedRect(cx - w / 2, y - h / 2, w, h, 7);
  g.fillStyle(selected ? UI.navy : UI.panel, 1);
  g.fillRoundedRect(cx - w / 2 + (selected ? 3 : 2), y - h / 2 + (selected ? 3 : 2), w - (selected ? 6 : 4), h - (selected ? 6 : 4), 5);
  layer.add(g);
  return g;
}

/** Rank medal for the high-score table (gold, silver, bronze for the podium) with the place in it. */
export function rankBadge(scene: Phaser.Scene, layer: Layer, x: number, y: number, rank: number, r = 12): void {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillCircle(x, y, r + 2);
  g.fillStyle(rankColor(rank), 1);
  g.fillCircle(x, y, r);
  g.fillStyle(tone(rankColor(rank), 0.3), 1);
  g.slice(x, y, r - 2, Math.PI * 1.05, Math.PI * 1.95, false);
  g.fillPath();
  layer.add(g);
  label(scene, layer, x, y + 1, String(rank), 'display', Math.round(r * 1.1), rank <= 3 ? INK.dark : INK.text);
}

/** Level pips: `level` filled squares out of `max`. */
export function pips(scene: Phaser.Scene, layer: Layer, x: number, y: number, level: number, max: number): void {
  const g = scene.add.graphics();
  for (let i = 0; i < max; i++) {
    const px = x + i * 22;
    g.fillStyle(UI.outline, 1);
    g.fillRect(px - 2, y - 9, 18, 18);
    g.fillStyle(i < level ? UI.yellow : UI.panel, 1);
    g.fillRect(px, y - 7, 14, 14);
    if (i < level) {
      g.fillStyle(tone(UI.yellow, 0.35), 1);
      g.fillRect(px, y - 7, 14, 5);
    }
  }
  layer.add(g);
}

/** The logo plate from the HUD, large: yellow with a dark outline, CRUNCH in red over 4x4 in navy. */
export function logoPlate(scene: Phaser.Scene, layer: Layer, cx: number, cy: number, w: number, h: number, small: string): void {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(cx - w / 2 - 4, cy - h / 2 - 4, w + 8, h + 8, 16);
  g.fillStyle(UI.yellow, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
  g.fillStyle(tone(UI.yellow, 0.3), 1);
  g.fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 4, w - 8, h * 0.18, 6);
  g.fillStyle(UI.outline, 1);
  g.fillRect(cx - w / 2 + 14, cy + h * 0.18, w - 28, 3);
  layer.add(g);
  label(scene, layer, cx, cy - h * 0.14, 'CRUNCH 4x4', 'display', Math.round(h * 0.42), '#b83a1a');
  label(scene, layer, cx, cy + h * 0.33, small, 'display', Math.round(h * 0.2), '#14224a');
}
