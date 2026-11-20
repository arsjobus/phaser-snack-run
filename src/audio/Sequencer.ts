import { AUDIO } from '../config';
import { BASS, BARS, CHORDS, LEAD, LOOP_STEPS, STEPS_PER_BAR, drumsAt, type DrumVoice } from './Composition';
import type { StemLevels } from './Mix';

/** Stems below this level are not scheduled at all (they are inaudible, so skip the work). */
export const AUDIBLE = 0.02;

export type SeqEvent =
  | { stem: 'drums'; time: number; voice: DrumVoice; vel: number }
  | { stem: 'bass'; time: number; midi: number; dur: number }
  | { stem: 'lead'; time: number; midi: number; dur: number }
  | { stem: 'pad'; time: number; midis: number[]; dur: number }
  | { stem: 'heart'; time: number; voice: 'lub' | 'dub' };

/**
 * Turns the composition into timed events on the audio clock, a window at a time. Pure (no Web
 * Audio), so it is unit-tested. The renderer calls `advance(now + lookahead, ...)` every frame.
 */
export class Sequencer {
  /** Index of the next step to schedule (counts forever; the loop is `LOOP_STEPS` long). */
  step = 0;
  /** Audio-clock time of that step. */
  time = 0;
  private shift = 0;
  private pending = 0;

  constructor(public bpm: number = AUDIO.bpm) {}

  get stepSeconds(): number {
    return 60 / this.bpm / 4;
  }

  /** Current transposition (semitones). */
  get transpose(): number {
    return this.shift;
  }

  /** Request a transposition; it takes effect when the 4-bar loop next starts, so chords never clash. */
  setTranspose(semitones: number): void {
    this.pending = semitones;
  }

  /** Begin (or restart after a stall) a little after `now`; the loop position is kept. */
  resync(now: number): void {
    this.time = now + 0.06;
  }

  advance(until: number, levels: StemLevels, heartbeat: boolean): SeqEvent[] {
    const out: SeqEvent[] = [];
    while (this.time < until) {
      const inLoop = this.step % LOOP_STEPS;
      if (inLoop === 0) this.shift = this.pending;
      this.stepEvents(inLoop, this.time, levels, heartbeat, out);
      this.step++;
      this.time += this.stepSeconds;
    }
    return out;
  }

  private stepEvents(inLoop: number, t: number, levels: StemLevels, heartbeat: boolean, out: SeqEvent[]): void {
    const bar = Math.floor(inLoop / STEPS_PER_BAR) % BARS;
    const s = inLoop % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const sh = this.shift;
    const sec = this.stepSeconds;

    if (s === 0 && levels.pad > AUDIBLE) {
      out.push({ stem: 'pad', time: t, midis: chord.tones.map((x) => chord.root + 24 + x + sh), dur: sec * STEPS_PER_BAR });
    }
    if (levels.drums > AUDIBLE) {
      const fill = bar === BARS - 1 && levels.drums > 0.6;
      for (const h of drumsAt(s, bar, fill)) out.push({ stem: 'drums', time: t, voice: h.voice, vel: h.vel });
    }
    if (levels.bass > AUDIBLE) {
      const off = BASS[s];
      if (off !== null) out.push({ stem: 'bass', time: t, midi: chord.root + off + sh, dur: sec * 0.9 });
    }
    if (levels.lead > AUDIBLE) {
      for (const n of LEAD[bar]) {
        if (n.step === s) out.push({ stem: 'lead', time: t, midi: n.midi + sh, dur: sec * n.len * 0.92 });
      }
    }
    // "lub-dub" every two beats while the tank is nearly dry.
    if (heartbeat && s % 8 === 0) out.push({ stem: 'heart', time: t, voice: 'lub' });
    if (heartbeat && s % 8 === 3) out.push({ stem: 'heart', time: t, voice: 'dub' });
  }
}
