import { AUDIO, FUEL, PHYSICS } from '../config';

/** Pure audio maths (no Web Audio), so it can be unit-tested. */

export interface StemLevels {
  pad: number;
  drums: number;
  bass: number;
  lead: number;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function smoothstep(v: number, from: number, to: number): number {
  const t = clamp01((v - from) / (to - from));
  return t * t * (3 - 2 * t);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Speed as a fraction of the truck's top speed, 0..1. */
export function speedNorm(speed: number): number {
  return clamp01(Math.max(0, speed) / PHYSICS.topSpeed);
}

/** Target level of each music stem: layers fade in with speed and combo; none once the run is over. */
export function stemLevels(speed: number, multiplier: number, over: boolean): StemLevels {
  if (over) return { pad: 0, drums: 0, bass: 0, lead: 0 };
  const s = speedNorm(speed);
  const combo = smoothstep(multiplier, AUDIO.leadCombo[0], AUDIO.leadCombo[1]);
  const fast = smoothstep(s, AUDIO.leadSpeed[0], AUDIO.leadSpeed[1]);
  return {
    pad: 0.55 + 0.25 * s,
    drums: smoothstep(s, AUDIO.drumsSpeed[0], AUDIO.drumsSpeed[1]),
    bass: smoothstep(s, AUDIO.bassSpeed[0], AUDIO.bassSpeed[1]),
    lead: Math.max(0.85 * combo, 0.7 * fast),
  };
}

/** Lowpass cutoff (Hz) on the music: wide open until the tank is low, then closing towards empty. */
export function lowFuelCutoff(fuel: number): number {
  const { open, closed } = AUDIO.lowFuelCutoff;
  if (fuel >= FUEL.low) return open;
  const t = clamp01(fuel / FUEL.low); // 1 at the low mark, 0 when dry
  return closed * Math.pow(open / closed, t * t); // log sweep, closing faster near empty
}

/** Engine oscillator pitch (Hz): rises with speed and throttle, revs up when the wheels are off the ground. */
export function engineFreq(speed: number, throttle: boolean, grounded: boolean): number {
  const base = 52 + 80 * speedNorm(speed) + (throttle ? 10 : 0);
  return grounded ? base : base * 1.3;
}

/** Major pentatonic steps above the base note: a longer snack chain climbs the scale. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16] as const;
export const SNACK_BASE_MIDI = 79; // G5

/** MIDI note of the snack chime for a combo multiplier (1..max): rises, then tops out. */
export function snackNote(multiplier: number): number {
  const i = Math.min(PENTATONIC.length - 1, Math.max(0, Math.round(multiplier) - 1));
  return SNACK_BASE_MIDI + PENTATONIC[i];
}
