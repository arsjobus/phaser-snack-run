/** Device-agnostic control state. Keyboard, touch and gamepad all produce `Held` (src/input) which `playerInput` turns into this. */
export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 (also reverses when nearly stopped) */
  brake: number;
  /** -1 = lean back (nose up), +1 = lean forward (nose down) */
  lean: number;
}

export const NEUTRAL_INPUT: InputState = { throttle: 0, brake: 0, lean: 0 };

/**
 * The player's controls: gas and brake only. There is no auto-gas (the truck only drives while the
 * gas is held) and no lean (no control in the air or on the ground: Up/Down steer through the
 * depth field instead, see `PlayerLane`). A dry tank cuts both.
 */
export function playerInput(held: { gas: boolean | number; brake: boolean | number }, engineOn: boolean): InputState {
  // Booleans (keys, touch) are all-or-nothing; numbers (pad triggers, sticks) are analog 0..1.
  const amount = (v: boolean | number): number => Math.max(0, Math.min(1, Number(v)));
  return { throttle: engineOn ? amount(held.gas) : 0, brake: engineOn ? amount(held.brake) : 0, lean: 0 };
}
