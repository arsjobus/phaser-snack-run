import { VIEW_H, VIEW_W } from '../config';

/** Largest factor used (the canvas is factor^2 times the pixels of the logical view). */
export const MAX_RENDER_SCALE = 2;

/** Whole-number factor that makes the canvas about as big as it will be shown on this screen. */
export function chooseRenderScale(cssWidth: number, cssHeight: number, dpr: number): number {
  const need = Math.min((cssWidth * dpr) / VIEW_W, (cssHeight * dpr) / VIEW_H);
  return Math.max(1, Math.min(MAX_RENDER_SCALE, Math.ceil(need - 0.05)));
}
