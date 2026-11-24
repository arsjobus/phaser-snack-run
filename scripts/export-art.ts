/**
 * Writes every code-drawn sprite (`src/art/manifest.ts`) to `public/art/<group>/<file>.svg`.
 *
 *   npm run art:export
 *
 * The game loads these files at start-up, so after exporting you can edit them in Inkscape,
 * Illustrator, Figma or any text editor and reload the game. Keep each file's `width`, `height`
 * and `viewBox` (the sprite's origin and anchor depend on it). Re-running this script overwrites
 * the files, so run it only when you want to reset them to the code's drawing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Phaser from 'phaser';
import { artAssets, artPath } from '../src/art/manifest';
import { SvgGraphics } from '../src/art/SvgGraphics';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let count = 0;
for (const asset of artAssets()) {
  const g = new SvgGraphics();
  asset.draw(g as unknown as Phaser.GameObjects.Graphics);
  const file = resolve(root, artPath(asset));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, g.toSvg(asset.w, asset.h));
  count++;
}
console.log(`Wrote ${count} SVG files to public/art/`);
