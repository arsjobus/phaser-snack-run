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
