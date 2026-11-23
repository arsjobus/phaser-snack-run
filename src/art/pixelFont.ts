import type Phaser from 'phaser';

/** 3x5 pixel glyphs (digits and the letters the art needs): no font loading, no text objects. */
export const PIXEL_FONT: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  N: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

/** Width in px of `text` at `scale` (glyphs are 3 wide with a 1 px gap). */
export function pixelTextWidth(text: string, scale: number): number {
  return Math.max(0, text.length * 4 - 1) * scale;
}

/** Draw `text` with its top-left corner at (x, y). Unknown characters are skipped (blank). */
export function drawPixelText(
  g: Phaser.GameObjects.Graphics,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: number,
): void {
  g.fillStyle(color, 1);
  [...text].forEach((ch, n) => {
    const glyph = PIXEL_FONT[ch];
    if (!glyph) return;
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] === '1') g.fillRect(x + (n * 4 + gx) * scale, y + gy * scale, scale, scale);
      }
    });
  });
}

/** Draw `text` centred on (cx, cy). */
export function drawPixelTextCentered(
  g: Phaser.GameObjects.Graphics,
  text: string,
  cx: number,
  cy: number,
  scale: number,
  color: number,
): void {
  drawPixelText(g, text, Math.round(cx - pixelTextWidth(text, scale) / 2), Math.round(cy - (5 * scale) / 2), scale, color);
}
