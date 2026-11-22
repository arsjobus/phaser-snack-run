import type { Held } from './Controls';

/** A gamepad as the browser reports it (the "standard" mapping), trimmed to what we read. */
export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** One-shot buttons (menus and run actions). */
export interface PadButtons {
  confirm: boolean;
  garage: boolean;
  daily: boolean;
  settings: boolean;
  reset: boolean;
  music: boolean;
  back: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const PAD_DEADZONE = 0.25;
/** Stick travel past which a stick counts as "pressed" for depth. */
export const PAD_STICK_PRESS = 0.4;

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

const btn = (p: PadSnapshot, i: number): number => {
  const b = p.buttons[i];
  // Triggers are analog (value); some browsers report a digital button as pressed with value 0.
  return b ? (b.pressed && b.value === 0 ? 1 : b.value) : 0;
};
const axis = (p: PadSnapshot, i: number): number => {
  const v = p.axes[i] ?? 0;
  return Math.abs(v) < PAD_DEADZONE ? 0 : v;
};

/**
 * Driving controls from a pad: right trigger / A / D-pad right / stick right = gas (the triggers
 * and the stick are analog), left trigger / B / D-pad left / stick left = brake, stick or D-pad
 * up/down = drift away from / towards the camera.
 */
export function padHeld(p: PadSnapshot | null): Held {
  if (!p) return { gas: 0, brake: 0, far: false, near: false };
  const lx = axis(p, 0);
  const ly = axis(p, 1);
  const gas = Math.max(btn(p, B.RT), btn(p, B.A), btn(p, B.RIGHT), lx > 0 ? lx : 0);
  const brake = Math.max(btn(p, B.LT), btn(p, B.B), btn(p, B.X), btn(p, B.LEFT), lx < 0 ? -lx : 0);
  return {
    gas: Math.min(1, gas),
    brake: Math.min(1, brake),
    far: btn(p, B.UP) > 0 || ly < -PAD_STICK_PRESS,
    near: btn(p, B.DOWN) > 0 || ly > PAD_STICK_PRESS,
  };
}

/** Which one-shot buttons are down right now (edges are found by `PadEdges`). */
export function padButtons(p: PadSnapshot | null): PadButtons {
  const none = { confirm: false, garage: false, daily: false, settings: false, reset: false, music: false, back: false, up: false, down: false, left: false, right: false };
  if (!p) return none;
  const on = (i: number) => btn(p, i) > 0.5;
  const ly = axis(p, 1);
  const lx = axis(p, 0);
  return {
    confirm: on(B.START) || on(B.A),
    garage: on(B.Y),
    daily: on(B.X),
    settings: on(B.BACK),
    reset: on(B.LB),
    music: on(B.RB),
    back: on(B.B),
    up: on(B.UP) || ly < -PAD_STICK_PRESS,
    down: on(B.DOWN) || ly > PAD_STICK_PRESS,
    left: on(B.LEFT) || lx < -PAD_STICK_PRESS,
    right: on(B.RIGHT) || lx > PAD_STICK_PRESS,
  };
}

/** Turns "is down" into "went down this frame". */
export class PadEdges {
  private prev: PadButtons | null = null;

  /** Buttons that are down now but were not on the previous call. The first call reports none. */
  update(now: PadButtons): Partial<PadButtons> {
    const out: Partial<PadButtons> = {};
    const prev = this.prev;
    for (const k of Object.keys(now) as (keyof PadButtons)[]) {
      if (now[k] && prev && !prev[k]) out[k] = true;
    }
    this.prev = now;
    return out;
  }
}

/** The first connected pad, or null (also when the Gamepad API is missing). */
export function firstPad(): PadSnapshot | null {
  try {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of list) if (p && p.connected) return p;
  } catch {
    // some browsers throw outside secure contexts
  }
  return null;
}
