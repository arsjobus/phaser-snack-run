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

/**
 * The Back button of the sub-menus (settings and credits): the same wide, bright yellow button with
 * the key hint, so it is the one thing on those screens that stands out. `focus` rings it when the
 * keyboard cursor is on it.
 */
export const BACK_BUTTON = { w: 220, h: 44, size: 18 } as const;
export function backButton(scene: Phaser.Scene, layer: Layer, x: number, y: number, onClick: () => void, focus = false, text = 'BACK'): void {
  if (focus) {
    const g = scene.add.graphics();
    g.lineStyle(3, UI.white, 1);
    g.strokeRoundedRect(x - BACK_BUTTON.w / 2 - 7, y - BACK_BUTTON.h / 2 - 7, BACK_BUTTON.w + 14, BACK_BUTTON.h + 14, 14);
    layer.add(g);
  }
  button(scene, layer, { x, y, w: BACK_BUTTON.w, h: BACK_BUTTON.h, text, hint: 'ESC', selected: true, size: BACK_BUTTON.size, onClick });
}

/**
 * The snack coin: a gold coin stamped with a little red cracker, so it reads as the snack bank's
 * money. Flat and outlined like the rest of the art. `r` is the coin's radius.
 */
export function coinIcon(scene: Phaser.Scene, layer: Layer, x: number, y: number, r = 10): void {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillCircle(x, y, r + 2);
  g.fillStyle(0xc99a00, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(UI.yellow, 1);
  g.fillCircle(x, y, r * 0.82);
  g.fillStyle(UI.yellowLight, 1);
  g.slice(x, y, r * 0.82, Math.PI * 1.1, Math.PI * 1.9, false);
  g.fillPath();
  // The cracker: a rounded square with four holes.
  const s = r * 0.95;
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2, 2);
  g.fillStyle(0xd9602e, 1);
  g.fillRoundedRect(x - s / 2, y - s / 2, s, s, 1.5);
  g.fillStyle(UI.yellowLight, 1);
  const d = s * 0.22;
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillCircle(x + ox * d, y + oy * d, Math.max(0.9, r * 0.09));
  layer.add(g);
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

// ---- trophies, the score plate and stat tiles (game over and the garage's high scores) ----------

/** The colours of a trophy for a place: gold, silver and bronze on the podium, plain steel after that. */
export function trophyColor(rank: number): number {
  return rank <= 3 ? rankColor(rank) : UI.steel;
}

/**
 * A trophy cup with the place on it. `h` is its height in px. The podium (1 to 3) gets the full cup with
 * handles, a shine and the place in dark ink on the bowl (gold also gets sparkles); every later place
 * gets a smaller steel cup so each row of a table still has its own little prize. `dim` greys it out
 * for an empty slot.
 */
export function trophy(scene: Phaser.Scene, layer: Layer, x: number, y: number, rank: number, h = 26, dim = false): void {
  const s = h / 26;
  const podium = rank <= 3;
  const base = dim ? tone(UI.steel, -0.35) : trophyColor(rank);
  const dark = tone(base, -0.35);
  const lite = tone(base, 0.55);
  const g = scene.add.graphics();
  const P = (pts: [number, number][]) => pts.map(([px, py]) => ({ x: x + px * s, y: y + py * s }));
  const ink = (pts: [number, number][], color: number) => {
    g.fillStyle(color, 1);
    g.fillPoints(P(pts), true);
    g.lineStyle(Math.max(1.5, 2 * s), UI.outline, 1);
    g.strokePoints(P(pts), true);
  };
  // Handles first (behind the bowl): two rings out to the sides.
  const hs = podium ? 1 : 0.8;
  for (const side of [-1, 1]) {
    g.lineStyle(Math.max(3, 5 * s), UI.outline, 1);
    g.strokeCircle(x + side * 8.5 * s * hs, y - 6 * s, 3.8 * s * hs);
    g.lineStyle(Math.max(1.5, 2.4 * s), dark, 1);
    g.strokeCircle(x + side * 8.5 * s * hs, y - 6 * s, 3.8 * s * hs);
  }
  // Base block, stem, then the bowl.
  ink([[-7, 10], [7, 10], [7, 13], [-7, 13]], dark);
  ink([[-5, 7], [5, 7], [5, 10], [-5, 10]], base);
  ink([[-1.8, 3], [1.8, 3], [2.4, 7], [-2.4, 7]], dark);
  ink([[-8, -12], [8, -12], [6.5, -1], [3, 3], [-3, 3], [-6.5, -1]], base);
  // Shine down the left of the bowl and a darker shoulder on the right.
  g.fillStyle(lite, dim ? 0.4 : 1);
  g.fillPoints(P([[-6, -10.5], [-3.6, -10.5], [-4.6, -2], [-5.6, -3]]), true);
  g.fillStyle(dark, 1);
  g.fillPoints(P([[5.2, -10.5], [6.6, -10.5], [5.4, -1.4], [3.8, 1.2], [3.2, 0.6]]), true);
  layer.add(g);
  if (podium && !dim) {
    label(scene, layer, x, y - 6 * s, String(rank), 'display', Math.max(9, Math.round(11 * s)), INK.dark);
    if (rank === 1) {
      const sp = scene.add.graphics();
      sp.fillStyle(UI.white, 1);
      for (const [px, py, r] of [[-13, -13, 2.6], [12, -15, 3.2], [14, -4, 1.8]]) {
        const cx = x + px * s;
        const cy = y + py * s;
        const rr = r * s;
        sp.fillPoints(
          [
            { x: cx, y: cy - rr * 1.7 },
            { x: cx + rr * 0.5, y: cy - rr * 0.5 },
            { x: cx + rr * 1.7, y: cy },
            { x: cx + rr * 0.5, y: cy + rr * 0.5 },
            { x: cx, y: cy + rr * 1.7 },
            { x: cx - rr * 0.5, y: cy + rr * 0.5 },
            { x: cx - rr * 1.7, y: cy },
            { x: cx - rr * 0.5, y: cy - rr * 0.5 },
          ],
          true,
        );
      }
      layer.add(sp);
    }
  }
}

/**
 * The big score plate on the game-over screen: hazard stripes along the top and bottom like the HUD's
 * title bar, the word SCORE small on the left and the number big. Returns the number's text object so a
 * caller can count it up.
 */
export function scorePlate(scene: Phaser.Scene, layer: Layer, x: number, y: number, w: number, h: number, value: string, hot: boolean): Phaser.GameObjects.Text {
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 11);
  g.fillStyle(hot ? UI.yellow : UI.rim, 1);
  g.fillRoundedRect(x, y, w, h, 8);
  g.fillStyle(UI.navy, 1);
  g.fillRect(x + 4, y + 9, w - 8, h - 18);
  g.fillStyle(UI.outline, 1);
  for (const [sy] of [[y + 3], [y + h - 9]]) {
    for (const poly of hazardStripes(x + 4, sy, w - 8, 6, 6)) g.fillPoints(poly, true);
  }
  layer.add(g);
  label(scene, layer, x + 16, y + h / 2 + 1, 'SCORE', 'display', 13, INK.cyan, 0);
  return label(scene, layer, x + w - 16, y + h / 2 + 2, value, 'display', 30, hot ? INK.title : INK.text, 1, 4);
}

export type StatGlyph = 'distance' | 'snack' | 'air' | 'combo' | 'flag' | 'takedown' | 'lanes' | 'close';

/** A little flat icon for a stat tile, centred on (x, y), about 22 px across. */
export function statGlyph(scene: Phaser.Scene, layer: Layer, x: number, y: number, kind: StatGlyph): void {
  const g = scene.add.graphics();
  const poly = (pts: [number, number][], color: number) => {
    const P = pts.map(([px, py]) => ({ x: x + px, y: y + py }));
    g.fillStyle(color, 1);
    g.fillPoints(P, true);
    g.lineStyle(1.5, UI.outline, 1);
    g.strokePoints(P, true);
  };
  switch (kind) {
    case 'distance':
      poly([[-10, -7], [-2, -7], [3, 0], [-2, 7], [-10, 7], [-5, 0]], UI.cyan);
      poly([[0, -7], [8, -7], [13, 0], [8, 7], [0, 7], [5, 0]], UI.white);
      break;
    case 'snack':
      g.fillStyle(UI.outline, 1);
      g.fillCircle(x, y, 10.5);
      g.fillStyle(0xd9a05b, 1);
      g.fillCircle(x, y, 9);
      g.fillStyle(0x5a3418, 1);
      for (const [px, py] of [[-3.5, -3], [3.5, -1.5], [-1, 4], [4, 5]]) g.fillCircle(x + px, y + py, 1.9);
      break;
    case 'air':
      poly([[-11, 6], [-4, -1], [0, 4], [6, -6], [11, 6]], UI.yellowLight);
      poly([[8, -9], [12, -3], [4, -3]], UI.white);
      break;
    case 'combo':
      poly([[2, -11], [-7, 2], [-1, 2], [-3, 11], [8, -3], [1, -3]], UI.yellow);
      break;
    case 'flag':
      g.lineStyle(3, UI.outline, 1);
      g.lineBetween(x - 7, y - 10, x - 7, y + 10);
      g.lineStyle(1.5, UI.white, 1);
      g.lineBetween(x - 7, y - 10, x - 7, y + 10);
      poly([[-6, -10], [10, -6], [-6, 0]], UI.green);
      break;
    case 'takedown':
      poly([[0, -11], [3, -4], [11, -6], [6, 0], [11, 6], [3, 4], [0, 11], [-3, 4], [-11, 6], [-6, 0], [-11, -6], [-3, -4]], 0xff9f45);
      break;
    case 'lanes':
      poly([[-6, -10], [-1, -3], [-4, -3], [-4, 9], [-8, 9], [-8, -3], [-11, -3]], UI.cyan);
      poly([[6, 10], [11, 3], [8, 3], [8, -9], [4, -9], [4, 3], [1, 3]], UI.white);
      break;
    case 'close':
      poly([[0, -11], [11, 9], [-11, 9]], UI.yellowLight);
      g.fillStyle(UI.outline, 1);
      g.fillRect(x - 1.3, y - 3, 2.6, 7);
      g.fillCircle(x, y + 6.8, 1.6);
      break;
  }
  layer.add(g);
}

/** A stat tile: a flat plate with an icon on the left, the number in the display face, a small caption under it. */
export function statTile(scene: Phaser.Scene, layer: Layer, x: number, y: number, w: number, h: number, glyph: StatGlyph, value: string, caption: string, hot = false): void {
  rowPlate(scene, layer, x + w / 2, y + h / 2, w, h, hot);
  statGlyph(scene, layer, x + 22, y + h / 2, glyph);
  label(scene, layer, x + 44, y + h / 2 - 6, value, 'display', 16, hot ? INK.title : INK.text, 0);
  label(scene, layer, x + 44, y + h / 2 + 11, caption, 'body', 12, INK.dim, 0);
}
