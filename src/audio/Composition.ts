/**
 * The game's theme, composed for this project (no part of any existing tune): a funky big-beat
 * groove in A minor, four bars of Am - F - G - E, 16 sixteenth-note steps per bar. It is split
 * into four stems (pad, drums, bass, lead) so the mixer can layer them with speed and combo.
 * All pitches are MIDI note numbers; the sequencer transposes them per biome.
 */

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

/** Chord per bar: root (bass register) and the triad on top of it, as semitones above the root. */
export const CHORDS = [
  { root: 45, tones: [0, 3, 7] }, // Am
  { root: 41, tones: [0, 4, 7] }, // F
  { root: 43, tones: [0, 4, 7] }, // G
  { root: 40, tones: [0, 4, 7] }, // E (the dominant: pulls back to Am)
] as const;

/** Bass riff, semitones above the bar's root per step (null = rest). Root, octave and fifth fit all four chords. */
export const BASS: ReadonlyArray<number | null> = [
  0, null, null, 0, null, 0, 12, null,
  0, null, 7, null, 0, null, 7, 12,
];

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'ohat';
export interface DrumHit {
  voice: DrumVoice;
  vel: number;
}

/** Drum pattern per step of one bar (big-beat feel: hard backbeat, off-beat kicks, busy hats). */
export function drumsAt(stepInBar: number, bar: number, fill: boolean): DrumHit[] {
  const hits: DrumHit[] = [];
  if ([0, 6, 10].includes(stepInBar) || (stepInBar === 14 && bar % 2 === 1)) {
    hits.push({ voice: 'kick', vel: stepInBar === 0 ? 1 : 0.8 });
  }
  if (stepInBar === 4 || stepInBar === 12) hits.push({ voice: 'snare', vel: 1 });
  if (fill && stepInBar >= 12 && stepInBar % 2 === 1) hits.push({ voice: 'snare', vel: 0.5 + (stepInBar - 12) * 0.12 });
  if (stepInBar % 2 === 0) hits.push({ voice: stepInBar === 14 ? 'ohat' : 'hat', vel: stepInBar % 4 === 2 ? 0.7 : 0.45 });
  else hits.push({ voice: 'hat', vel: 0.2 }); // ghost 16ths
  return hits;
}

export interface LeadNote {
  step: number;
  midi: number;
  len: number;
}

/** The hook: one phrase per bar, built on the chord of that bar. */
export const LEAD: ReadonlyArray<ReadonlyArray<LeadNote>> = [
  [
    { step: 0, midi: 76, len: 2 }, { step: 3, midi: 79, len: 1 }, { step: 4, midi: 76, len: 2 },
    { step: 8, midi: 72, len: 2 }, { step: 10, midi: 74, len: 2 }, { step: 12, midi: 76, len: 3 },
  ],
  [
    { step: 0, midi: 72, len: 2 }, { step: 3, midi: 69, len: 1 }, { step: 4, midi: 72, len: 2 },
    { step: 8, midi: 77, len: 2 }, { step: 10, midi: 76, len: 2 }, { step: 12, midi: 72, len: 3 },
  ],
  [
    { step: 0, midi: 74, len: 2 }, { step: 3, midi: 71, len: 1 }, { step: 4, midi: 74, len: 2 },
    { step: 8, midi: 79, len: 2 }, { step: 10, midi: 74, len: 2 }, { step: 12, midi: 71, len: 3 },
  ],
  [
    { step: 0, midi: 76, len: 2 }, { step: 3, midi: 76, len: 1 }, { step: 4, midi: 80, len: 2 },
    { step: 8, midi: 76, len: 2 }, { step: 10, midi: 71, len: 2 }, { step: 12, midi: 68, len: 2 },
    { step: 14, midi: 71, len: 2 },
  ],
];
