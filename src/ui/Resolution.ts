import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { chooseRenderScale } from './RenderScale';

/**
 * Crisp rendering. The game is laid out in a VIEW_W x VIEW_H logical space, but the browser shows
 * it much larger than that (and on high-DPI screens far more so). A canvas that is only
 * VIEW_W x VIEW_H pixels gets stretched by the browser, which is what made the text fuzzy.
 *
 * So the canvas is created `renderScale()` times bigger in each direction, every scene's camera
 * is zoomed by the same factor (so all the game code keeps using logical coordinates) and every
 * Text object is rasterised at that factor too: one logical pixel is `renderScale()` real pixels.
 */

let scale = 1;

/** The factor in use (1 until `initRenderScale` runs). */
export const renderScale = (): number => scale;

/** Picks the factor from the window and installs the Text patch. Call once, before creating the Game. */
export function initRenderScale(): number {
  const w = typeof window === 'undefined' ? VIEW_W : window.innerWidth;
  const h = typeof window === 'undefined' ? VIEW_H : window.innerHeight;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  scale = chooseRenderScale(w, h, dpr);
  patchTextResolution();
  return scale;
}

type TextFn = (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => unknown;

/** Every `add.text` / `make.text` renders at the render scale unless the caller asks for something else. */
function patchTextResolution(): void {
  const wrap = (proto: { text: TextFn; __crisp?: boolean }) => {
    if (proto.__crisp) return;
    const original = proto.text;
    proto.text = function (this: unknown, x, y, text, style) {
      return original.call(this, x, y, text, { resolution: scale, ...style });
    };
    proto.__crisp = true;
  };
  wrap(Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFn });
}

/** Zooms a scene's main camera so logical coordinates fill the bigger canvas (top-left anchored). */
export function applyView(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(scale);
}

/** Pointer position in logical pixels (the canvas is `renderScale()` times bigger). */
export const toLogical = (v: number): number => v / scale;
