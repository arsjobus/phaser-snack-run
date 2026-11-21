/** Device-agnostic control state. Phase 8 will add touch/gamepad producers for this shape. */
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
export function playerInput(held: { gas: boolean; brake: boolean }, engineOn: boolean): InputState {
  return { throttle: engineOn && held.gas ? 1 : 0, brake: engineOn && held.brake ? 1 : 0, lean: 0 };
}
