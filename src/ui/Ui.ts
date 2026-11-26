import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { t } from '../i18n';
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
  maxWidth?: number,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, { ...textStyle(kind, size, color, outline), lineSpacing: 4 }).setOrigin(ox, 0.5);
  if (maxWidth !== undefined) fitText(t, maxWidth);
  layer.add(t);
  return t;
}

/** Reduce a translated label only as much as needed to keep it inside its layout cell. */
export function fitText(text: Phaser.GameObjects.Text, maxWidth: number, minSize = 11): Phaser.GameObjects.Text {
  while (text.width > maxWidth && Number.parseFloat(text.style.fontSize as string) > minSize) {
    text.setFontSize(Number.parseFloat(text.style.fontSize as string) - 1);
  }
  return text;
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
  label(scene, layer, 28, 30, title, 'display', 28, INK.title, 0, 0, VIEW_W - 56);
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
  label(scene, layer, VIEW_W / 2, VIEW_H - 25, hint, 'body', 15, INK.dim, 0.5, 0, VIEW_W - 40);
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
  selected?: boolean;
  /** Face colour of the selected state (default: logo yellow). */
  accent?: number;
  size?: number;
  onClick?: () => void;
  onHover?: () => void;
  /** Draw the shared keyboard/gamepad focus ring without changing the selected face. */
  focused?: boolean;
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
  if (b.focused ?? b.selected) {
    const ring = scene.add.graphics();
    ring.lineStyle(2, UI.white, 1);
    ring.strokeRoundedRect(x - 6, y - 6, b.w + 12, b.h + 12, 12);
    layer.add(ring);
  }
  label(scene, layer, b.x, b.y + 1, b.text, 'display', b.size ?? 18, b.selected ? INK.dark : INK.soft, 0.5, 0, b.w - 24);
  if (b.onClick || b.onHover) {
    const zone = scene.add.zone(b.x, b.y, b.w, b.h).setScrollFactor(0).setInteractive({ useHandCursor: true });
    if (b.onClick) zone.on('pointerdown', b.onClick);
    if (b.onHover) zone.on('pointerover', b.onHover);
    layer.add(zone);
  }
}

/**
 * The Back button of the sub-menus (settings and credits): the same wide, bright yellow button.
 * `focus` rings it when the
 * keyboard cursor is on it.
 */
export const BACK_BUTTON = { w: 220, h: 44, size: 18 } as const;
export function backButton(scene: Phaser.Scene, layer: Layer, x: number, y: number, onClick: () => void, focus = false, text = t('garage.backToMenu')): void {
  button(scene, layer, { x, y, w: BACK_BUTTON.w, h: BACK_BUTTON.h, text, selected: false, focused: focus, size: BACK_BUTTON.size, onClick });
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
  if (scene.textures.exists('crunch_logo') && scene.textures.get('crunch_logo').has('wordmark')) {
    layer.add(scene.add.image(cx, cy - h * 0.14, 'crunch_logo', 'wordmark').setDisplaySize(w * 0.85, h * 0.46));
  } else {
    label(scene, layer, cx, cy - h * 0.14, 'CRUNCH 4x4', 'display', Math.round(h * 0.42), '#b83a1a');
  }
  label(scene, layer, cx, cy + h * 0.33, small, 'display', Math.round(h * 0.2), '#000000');
}

/**
 * Rounds the corners of a polygon: every corner is replaced by a small quadratic curve that starts and
 * ends `r` px along its two edges (never more than half an edge). Returns the points to fill and stroke.
 */
export function roundPoly(pts: readonly [number, number][], r: number, steps = 5): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i + n - 1) % n];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    const lp = Math.hypot(px - cx, py - cy) || 1;
    const ln = Math.hypot(nx - cx, ny - cy) || 1;
    const tp = Math.min(r, lp / 2) / lp;
    const tn = Math.min(r, ln / 2) / ln;
    const ax = cx + (px - cx) * tp;
    const ay = cy + (py - cy) * tp;
    const bx = cx + (nx - cx) * tn;
    const by = cy + (ny - cy) * tn;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by });
    }
  }
  return out;
}

// ---- trophies, the score plate and stat tiles (game over and the garage's high scores) ----------

/** The colours of a trophy for a place: gold, silver and bronze on the podium, plain steel after that. */
export function trophyColor(rank: number): number {
  return rank <= 3 ? rankColor(rank) : UI.steel;
}

/**
 * A trophy cup with the place on it. `h` is its height in px. The podium (1 to 3) gets the full cup with
 * handles, a shine and the place in dark ink on the bowl; every later place
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
  // Every corner is softened so the cup has no hard right angles.
  const ink = (pts: [number, number][], color: number, round = 2) => {
    const soft = roundPoly(pts.map(([px, py]) => [x + px * s, y + py * s] as [number, number]), round * s);
    g.fillStyle(color, 1);
    g.fillPoints(soft, true);
    g.lineStyle(Math.max(1.5, 2 * s), UI.outline, 1);
    g.strokePoints(soft, true);
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
  ink([[-8, -12], [8, -12], [6.5, -1], [3, 3], [-3, 3], [-6.5, -1]], base, 3.2);
  // Shine down the left of the bowl and a darker shoulder on the right.
  g.fillStyle(lite, dim ? 0.4 : 1);
  g.fillPoints(P([[-6, -10.5], [-3.6, -10.5], [-4.6, -2], [-5.6, -3]]), true);
  g.fillStyle(dark, 1);
  g.fillPoints(P([[5.2, -10.5], [6.6, -10.5], [5.4, -1.4], [3.8, 1.2], [3.2, 0.6]]), true);
  layer.add(g);
  if (podium && !dim) {
    label(scene, layer, x, y - 6 * s, String(rank), 'display', Math.max(9, Math.round(11 * s)), INK.dark);
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
  label(scene, layer, x + 16, y + h / 2 + 1, t('ui.score'), 'display', 13, INK.cyan, 0);
  return label(scene, layer, x + w - 16, y + h / 2 + 2, value, 'display', 30, hot ? INK.title : INK.text, 1, 4);
}

export type StatGlyph = 'distance' | 'snack' | 'air' | 'combo' | 'flag' | 'takedown' | 'lanes' | 'close';

/**
 * A little flat icon for a stat tile, centred on (x, y), about 22 px across. Every shape has rounded
 * corners (see `roundPoly`) and the same 1.5 px outline. The snack is the real pickup's art (the
 * `snack` texture) so it matches what the player collects.
 */
export function statGlyph(scene: Phaser.Scene, layer: Layer, x: number, y: number, kind: StatGlyph): void {
  if (kind === 'snack' && scene.textures.exists('snack')) {
    layer.add(scene.add.image(x, y, 'snack').setDisplaySize(18, 23));
    return;
  }
  const g = scene.add.graphics();
  const poly = (pts: [number, number][], color: number, round = 2.4) => {
    const P = roundPoly(pts.map(([px, py]) => [x + px, y + py] as [number, number]), round);
    g.fillStyle(color, 1);
    g.fillPoints(P, true);
    g.lineStyle(1.5, UI.outline, 1);
    g.strokePoints(P, true);
  };
  const dot = (px: number, py: number, r: number, color: number) => {
    g.fillStyle(UI.outline, 1);
    g.fillCircle(x + px, y + py, r + 1.4);
    g.fillStyle(color, 1);
    g.fillCircle(x + px, y + py, r);
  };
  switch (kind) {
    case 'distance':
      poly([[-10.5, -7], [-3, -7], [2, 0], [-3, 7], [-10.5, 7], [-5.5, 0]], UI.cyan, 2.2);
      poly([[0, -7], [7.5, -7], [12.5, 0], [7.5, 7], [0, 7], [5, 0]], UI.white, 2.2);
      break;
    case 'snack': {
      // Fallback only (no texture loaded): a round cracker.
      dot(0, 0, 8.5, 0xd9a05b);
      g.fillStyle(0x5a3418, 1);
      for (const [px, py] of [[-3.5, -3], [3.5, -1.5], [-1, 4], [4, 5]]) g.fillCircle(x + px, y + py, 1.8);
      break;
    }
    case 'air': {
      // A ramp with the jump arc leaving its lip.
      poly([[-12, 8], [2, 8], [2, -2]], UI.yellowLight, 2.2);
      dot(6, -8, 1.7, UI.white);
      dot(10.5, -4.5, 1.7, UI.white);
      dot(12, 1.5, 1.7, UI.white);
      break;
    }
    case 'combo':
      poly([[2.5, -11.5], [-7.5, 1.5], [-1.5, 1.5], [-3, 11.5], [8, -2.5], [1.5, -2.5]], UI.yellow, 2);
      break;
    case 'flag':
      poly([[-8.5, -11], [-6, -11], [-6, 11], [-8.5, 11]], UI.white, 1.2);
      poly([[-6, -10], [10.5, -6.5], [-6, -1.5]], UI.green, 2.2);
      break;
    case 'takedown': {
      // An explosion starburst: ragged outer flame, hot inner flame, white core.
      const burst = (outer: number, inner: number, spikes: number, color: number, round: number, phase = 0) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < spikes * 2; i++) {
          const a = phase + (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          const tip = i % 2 === 0;
          const jitter = tip ? [1, 0.84, 0.95, 0.78, 1, 0.9, 0.82][(i / 2) % 7] : 1;
          const rad = (tip ? outer * jitter : inner) * 1;
          pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
        }
        poly(pts, color, round);
      };
      burst(12.5, 6.2, 9, 0xff7a2e, 1.3);
      burst(9, 4.4, 9, UI.yellow, 1, Math.PI / 9);
      g.fillStyle(UI.white, 1);
      g.fillCircle(x, y, 2.8);
      break;
    }
    case 'lanes':
      poly([[-6.5, -11], [-1.5, -4], [-4.5, -4], [-4.5, 10], [-8.5, 10], [-8.5, -4], [-11.5, -4]], UI.cyan, 1.8);
      poly([[6.5, 11], [11.5, 4], [8.5, 4], [8.5, -10], [4.5, -10], [4.5, 4], [1.5, 4]], UI.white, 1.8);
      break;
    case 'close': {
      // Caution sign: a rounded triangle with the "!" centred on the triangle's centroid, so the mark
      // sits dead centre horizontally and optically in the middle vertically.
      const top = -12;
      const base = 10;
      const half = 12.5;
      poly([[0, top], [half, base], [-half, base]], UI.yellowLight, 3.2);
      const cy = (top + base + base) / 3; // centroid of the triangle
      const barH = 6.2;
      const dotR = 1.5;
      const gap = 1.8;
      const total = barH + gap + dotR * 2;
      const y0 = cy - total / 2 + 0.6; // +0.6: the sign is wider at the bottom, so the mark sits a hair low
      g.fillStyle(UI.outline, 1);
      g.fillRoundedRect(x - 1.5, y + y0, 3, barH, 1.4);
      g.fillCircle(x, y + y0 + barH + gap + dotR, dotR + 0.1);
      break;
    }
  }
  layer.add(g);
}

/**
 * A stat tile: a flat plate with the icon in a round badge on the left, the number in the display face
 * and a small caption under it. The badge is centred in a square of the tile's height, so the icon
 * gutter is the same on the left, top and bottom.
 */
export function statTile(scene: Phaser.Scene, layer: Layer, x: number, y: number, w: number, h: number, glyph: StatGlyph, value: string, caption: string, hot = false): void {
  rowPlate(scene, layer, x + w / 2, y + h / 2, w, h, hot);
  const bx = x + h / 2;
  const by = y + h / 2;
  const g = scene.add.graphics();
  g.fillStyle(UI.outline, 1);
  g.fillCircle(bx, by, h / 2 - 5);
  g.fillStyle(hot ? tone(UI.yellow, -0.55) : UI.navy, 1);
  g.fillCircle(bx, by, h / 2 - 6.5);
  layer.add(g);
  statGlyph(scene, layer, bx, by, glyph);
  const tx = x + h + 4;
  label(scene, layer, tx, y + h / 2 - 7, value, 'display', 17, hot ? INK.title : INK.text, 0);
  label(scene, layer, tx, y + h / 2 + 11, caption, 'body', 12, INK.dim, 0);
}

/**
 * A podium: three rounded blocks in gold, silver and bronze, the tallest in the middle. The heading icon
 * of a leaderboard (the trophy cups belong to the rows). About 28 px wide and 22 tall, centred on (x, y).
 */
export function podiumIcon(scene: Phaser.Scene, layer: Layer, x: number, y: number): void {
  const g = scene.add.graphics();
  const block = (cx: number, top: number, w: number, color: number) => {
    const bottom = 11;
    const left = x + cx - w / 2;
    g.fillStyle(UI.outline, 1);
    g.fillRoundedRect(left - 1.5, y + top - 1.5, w + 3, bottom - top + 3, 4);
    g.fillStyle(color, 1);
    g.fillRoundedRect(left, y + top, w, bottom - top, 3);
    g.fillStyle(tone(color, 0.5), 1);
    g.fillRoundedRect(left + 1.5, y + top + 1.5, w - 3, 3, 1.5);
  };
  block(-9, -2, 9, UI.silver);
  block(9, 2, 9, UI.bronze);
  block(0, -9, 10, UI.gold);
  layer.add(g);
}
