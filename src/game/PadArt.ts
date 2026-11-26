import { LANES } from '../config';
import { FIELD_DEPTH } from './GroundDetail';

/**
 * Geometry of a boost pad's artwork (pure TypeScript), in depth lanes like everything else on the
 * road: 0 is the near lane's ground line and `FIELD_DEPTH` the far edge of the dirt field.
 *
 * The pad covers the whole drivable field with a small margin at both edges, so its middle
 * (`PAD_MID`) is the middle of the road as drawn, and every chevron is centred on that line: the
 * tip sits on it and the two arms are the same distance above and below it.
 */
export const PAD_MARGIN = 0.12;
export const PAD_NEAR = PAD_MARGIN;
export const PAD_FAR = FIELD_DEPTH - PAD_MARGIN;
export const PAD_MID = (PAD_NEAR + PAD_FAR) / 2;
/** How far (lanes) the chevron's arms stay inside the pad's edges. */
export const CHEVRON_INSET = 0.5;

export interface LanePoint {
  x: number;
  lane: number;
}

/**
 * A right-pointing chevron `>` with its tip at x + `cw` and the arms at x: a six-point outline, `t`
 * thick, centred on `PAD_MID` in depth.
 */
export function chevronOutline(x: number, cw: number, t: number): LanePoint[] {
  const arm = (PAD_FAR - PAD_NEAR) / 2 - CHEVRON_INSET;
  const top = PAD_MID + arm;
  const bot = PAD_MID - arm;
  return [
    { x, lane: top },
    { x: x + cw, lane: PAD_MID },
    { x, lane: bot },
    { x: x + t, lane: bot },
    { x: x + cw + t, lane: PAD_MID },
    { x: x + t, lane: top },
  ];
}

/** Left edges of chevrons across a pad, keeping their full outline inside both ends. */
export function chevronStarts(w: number, count = 3, width = 26, thickness = 13, margin = 10): number[] {
  if (count <= 0) return [];
  const extent = width + thickness;
  const span = Math.max(0, w - 2 * margin - extent);
  return Array.from({ length: count }, (_, k) => margin + (count === 1 ? span / 2 : (k * span) / (count - 1)));
}

/** The chevron wave: whether chevron `k` is lit at `seconds` (a ripple towards the ramp). */
export const chevronLit = (k: number, seconds: number): boolean => 0.5 + 0.5 * Math.sin(seconds * 12 - k * 1.6) > 0.5;

/** The pad's colours: red arrows (lit, dim) on a dark panel with a dark outline. */
export const PAD_COLORS = { outline: 0x111111, panel: 0x2a2e36, lit: 0xe8402e, dim: 0x8f2418 } as const;

/** Screen y of a lane position over the ground at height `h`. */
export const padY = (h: number, lane: number): number => h - lane * LANES.spacing;
