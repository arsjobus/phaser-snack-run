import { ACTIONS, type Action, type Bindings } from '../settings/Settings';

/** What the player is holding right now, whatever the device. Gas and brake are analog (0..1). */
export interface Held {
  gas: number;
  brake: number;
  far: boolean;
  near: boolean;
}

export const NO_HELD: Readonly<Held> = { gas: 0, brake: 0, far: false, near: false };

/** Several devices at once: the strongest of each control wins. */
export function mergeHeld(...parts: Held[]): Held {
  const out: Held = { gas: 0, brake: 0, far: false, near: false };
  for (const p of parts) {
    out.gas = Math.max(out.gas, p.gas);
    out.brake = Math.max(out.brake, p.brake);
    out.far = out.far || p.far;
    out.near = out.near || p.near;
  }
  return out;
}

/**
 * Keyboard state by `KeyboardEvent.code`, fed from key events. Keeping our own table (instead of
 * one Phaser Key object per key) is what makes the controls remappable: bindings are just codes.
 * `fresh` holds keys pressed since the last `endFrame`, for one-shot actions.
 */
export class KeyTracker {
  private down = new Set<string>();
  private fresh = new Set<string>();

  press(code: string): void {
    if (!this.down.has(code)) this.fresh.add(code);
    this.down.add(code);
  }

  release(code: string): void {
    this.down.delete(code);
  }

  /** Window lost focus: nothing is held any more. */
  clear(): void {
    this.down.clear();
    this.fresh.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per press. */
  justPressed(code: string): boolean {
    return this.fresh.has(code);
  }

  endFrame(): void {
    this.fresh.clear();
  }
}

const anyDown = (keys: KeyTracker, codes: readonly string[]): boolean => codes.some((c) => keys.isDown(c));

export function heldFromKeys(keys: KeyTracker, b: Readonly<Bindings>): Held {
  const far = anyDown(keys, b.far);
  const near = anyDown(keys, b.near);
  return { gas: anyDown(keys, b.gas) ? 1 : 0, brake: anyDown(keys, b.brake) ? 1 : 0, far, near };
}

/** True when any key bound to `action` was pressed this frame. */
export function actionPressed(keys: KeyTracker, b: Readonly<Bindings>, action: Action): boolean {
  return b[action].some((c) => keys.justPressed(c));
}

/** Depth direction from the two held flags: +1 away from the camera, -1 towards it, 0 for neither or both. */
export const laneDirOf = (h: Held): -1 | 0 | 1 => (h.far === h.near ? 0 : h.far ? 1 : -1);

export { ACTIONS };
