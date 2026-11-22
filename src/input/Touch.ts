import { VIEW_H, VIEW_W } from '../config';
import type { Held } from './Controls';

/** On-screen controls (pure layout and hit-testing; `TouchView` draws them). Coordinates are game pixels. */
export type TouchButton = 'gas' | 'brake' | 'far' | 'near';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** HUD bar height is 72 px at the bottom; the buttons sit just above it. */
const BOTTOM = VIEW_H - 72 - 10;

export const TOUCH_LAYOUT: Readonly<Record<TouchButton, Rect>> = {
  gas: { x: VIEW_W - 178, y: BOTTOM - 120, w: 160, h: 120 },
  brake: { x: VIEW_W - 178 - 166, y: BOTTOM - 100, w: 150, h: 100 },
  far: { x: 18, y: BOTTOM - 168, w: 104, h: 78 },
  near: { x: 18, y: BOTTOM - 80, w: 104, h: 78 },
};

export const TOUCH_BUTTONS = Object.keys(TOUCH_LAYOUT) as TouchButton[];

/** A finger counts as on a button this many px beyond its edge, so thumbs do not slip off. */
export const TOUCH_SLOP = 14;

export function inRect(r: Rect, x: number, y: number, slop = 0): boolean {
  return x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop;
}

/** The button a finger is on (the nearest centre wins where slop overlaps), or null. */
export function buttonAt(x: number, y: number): TouchButton | null {
  let best: TouchButton | null = null;
  let bestD = Infinity;
  for (const b of TOUCH_BUTTONS) {
    const r = TOUCH_LAYOUT[b];
    if (!inRect(r, x, y, TOUCH_SLOP)) continue;
    const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Every finger currently down, turned into held controls (sliding between buttons just works). */
export function touchHeld(fingers: readonly { x: number; y: number }[]): Held {
  const h: Held = { gas: 0, brake: 0, far: false, near: false };
  for (const f of fingers) {
    switch (buttonAt(f.x, f.y)) {
      case 'gas':
        h.gas = 1;
        break;
      case 'brake':
        h.brake = 1;
        break;
      case 'far':
        h.far = true;
        break;
      case 'near':
        h.near = true;
        break;
    }
  }
  return h;
}

/** Whether to show the touch controls: forced on/off, or when the device has a touch screen. */
export function touchVisible(mode: 'auto' | 'on' | 'off', deviceHasTouch: boolean, touchedOnce: boolean): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return deviceHasTouch || touchedOnce;
}
