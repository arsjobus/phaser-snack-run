import { describe, expect, it } from 'vitest';
import { AUDIO, FUEL, PHYSICS } from '../src/config';
import { BASS, CHORDS, LEAD, LOOP_STEPS, STEPS_PER_BAR, drumsAt } from '../src/audio/Composition';
import {
  engineFreq,
  lowFuelCutoff,
  midiToHz,
  snackNote,
  speedNorm,
  stemLevels,
} from '../src/audio/Mix';
import { AUDIBLE, Sequencer, type SeqEvent } from '../src/audio/Sequencer';

const FULL = { pad: 1, drums: 1, bass: 1, lead: 1 };
const NONE = { pad: 0, drums: 0, bass: 0, lead: 0 };

/** Schedule exactly `loops` loops of the theme starting at time 0. */
function loops(seq: Sequencer, n: number, levels = FULL, heart = false): SeqEvent[] {
  seq.resync(-0.06);
  return seq.advance(n * LOOP_STEPS * seq.stepSeconds - 0.001, levels, heart);
}

describe('audio maths', () => {
  it('converts MIDI notes to Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
  });

  it('normalises speed to 0..1 of top speed', () => {
    expect(speedNorm(-50)).toBe(0);
    expect(speedNorm(PHYSICS.topSpeed / 2)).toBeCloseTo(0.5, 6);
    expect(speedNorm(PHYSICS.topSpeed * 2)).toBe(1);
  });

  it('layers stems in with speed: pad first, then drums, bass, lead', () => {
    const at = (kmh: number) => stemLevels((kmh / 100) * PHYSICS.topSpeed, 1, false);
    const idle = at(0);
    expect(idle.pad).toBeGreaterThan(0.4);
    expect(idle.drums).toBe(0);
    expect(idle.bass).toBe(0);
    expect(idle.lead).toBe(0);
    const mid = at(35);
    expect(mid.drums).toBeGreaterThan(0.9);
    expect(mid.bass).toBeGreaterThan(0.05);
    expect(mid.bass).toBeLessThan(0.9);
    expect(mid.lead).toBe(0);
    const top = at(100);
    expect(top.bass).toBeCloseTo(1, 6);
    expect(top.lead).toBeGreaterThan(0.6);
    // every stem is non-decreasing in speed
    let prev = at(0);
    for (let v = 1; v <= 100; v++) {
      const cur = at(v);
      for (const k of ['pad', 'drums', 'bass', 'lead'] as const) {
        expect(cur[k]).toBeGreaterThanOrEqual(prev[k] - 1e-9);
      }
      prev = cur;
    }
  });

  it('brings the lead in with the combo even at a slow pace', () => {
    const slow = PHYSICS.topSpeed * 0.3;
    expect(stemLevels(slow, 1, false).lead).toBe(0);
    expect(stemLevels(slow, 3, false).lead).toBeGreaterThan(0.1);
    expect(stemLevels(slow, 8, false).lead).toBeGreaterThan(0.8);
  });

  it('silences every stem when the run is over', () => {
    expect(stemLevels(PHYSICS.topSpeed, 8, true)).toEqual(NONE);
  });

  it('muffles the music as the tank runs low', () => {
    const { open, closed } = AUDIO.lowFuelCutoff;
    expect(lowFuelCutoff(1)).toBe(open);
    expect(lowFuelCutoff(FUEL.low)).toBe(open);
    expect(lowFuelCutoff(0)).toBeCloseTo(closed, 6);
    let prev: number = open;
    for (let f = FUEL.low; f >= 0; f -= 0.01) {
      const c = lowFuelCutoff(f);
      expect(c).toBeLessThanOrEqual(prev + 1e-6);
      prev = c;
    }
    expect(lowFuelCutoff(FUEL.low / 2)).toBeGreaterThan(closed);
    expect(lowFuelCutoff(FUEL.low / 2)).toBeLessThan(open);
  });

  it('pitches the engine with speed and throttle, and revs it in the air', () => {
    expect(engineFreq(600, true, true)).toBeGreaterThan(engineFreq(100, true, true));
    expect(engineFreq(300, true, true)).toBeGreaterThan(engineFreq(300, false, true));
    expect(engineFreq(300, true, false)).toBeGreaterThan(engineFreq(300, true, true));
    expect(engineFreq(0, false, true)).toBeGreaterThan(30);
    expect(engineFreq(PHYSICS.topSpeed * 2, true, false)).toBeLessThan(400);
  });

  it('climbs the scale with the combo and tops out', () => {
    const notes = [1, 2, 3, 4, 5, 6, 7, 8].map(snackNote);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    expect(snackNote(20)).toBe(snackNote(8));
    expect(snackNote(0)).toBe(snackNote(1));
  });
});

describe('composition', () => {
  it('has a 16-step bass riff, a 4-chord loop and a phrase per bar', () => {
    expect(BASS).toHaveLength(STEPS_PER_BAR);
    expect(CHORDS).toHaveLength(4);
    expect(LEAD).toHaveLength(4);
    expect(LOOP_STEPS).toBe(64);
  });

  it('keeps the hook inside its bar and inside a singable range', () => {
    for (const bar of LEAD) {
      for (const n of bar) {
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step + n.len).toBeLessThanOrEqual(STEPS_PER_BAR);
        expect(n.midi).toBeGreaterThanOrEqual(60);
        expect(n.midi).toBeLessThanOrEqual(84);
      }
    }
  });

  it('plays a backbeat: snare on 2 and 4, kick on the downbeat', () => {
    const voices = (s: number) => drumsAt(s, 0, false).map((h) => h.voice);
    expect(voices(0)).toContain('kick');
    expect(voices(4)).toContain('snare');
    expect(voices(12)).toContain('snare');
    expect(voices(8)).not.toContain('snare');
    // every step has at least a hat
    for (let s = 0; s < STEPS_PER_BAR; s++) expect(voices(s).some((v) => v === 'hat' || v === 'ohat')).toBe(true);
  });

  it('adds snare fill hits only when asked', () => {
    const count = (fill: boolean) =>
      Array.from({ length: STEPS_PER_BAR }, (_, s) => drumsAt(s, 3, fill)).flat().filter((h) => h.voice === 'snare').length;
    expect(count(true)).toBeGreaterThan(count(false));
  });
});

describe('sequencer', () => {
  it('spaces sixteenth notes by the tempo', () => {
    const seq = new Sequencer(120);
    expect(seq.stepSeconds).toBeCloseTo(0.125, 9);
    expect(new Sequencer().stepSeconds).toBeCloseTo(60 / AUDIO.bpm / 4, 9);
  });

  it('emits events in time order inside the window and nothing beyond it', () => {
    const seq = new Sequencer();
    seq.resync(10);
    const ev = seq.advance(11, FULL, false);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.time).toBeGreaterThanOrEqual(10.06 - 1e-9);
      expect(e.time).toBeLessThan(11);
    }
    for (let i = 1; i < ev.length; i++) expect(ev[i].time).toBeGreaterThanOrEqual(ev[i - 1].time);
    // the next window continues exactly where this one stopped (no gaps, no repeats)
    const stepBefore = seq.step;
    const resumeAt = seq.time;
    expect(resumeAt).toBeGreaterThanOrEqual(11);
    const next = seq.advance(12, FULL, false);
    expect(next[0].time).toBeGreaterThanOrEqual(resumeAt - 1e-9);
    expect(next[0].time).toBeLessThan(resumeAt + seq.stepSeconds);
    expect(seq.step).toBeGreaterThan(stepBefore);
  });

  it('plays the whole hook, one pad per bar and the full riff in a loop', () => {
    const ev = loops(new Sequencer(), 1);
    const count = (stem: SeqEvent['stem']) => ev.filter((e) => e.stem === stem).length;
    expect(count('pad')).toBe(4);
    expect(count('lead')).toBe(LEAD.flat().length);
    expect(count('bass')).toBe(BASS.filter((n) => n !== null).length * 4);
    expect(ev.filter((e) => e.stem === 'drums' && e.voice === 'kick').length).toBeGreaterThanOrEqual(12);
  });

  it('follows the chords: bass roots and pad tones per bar', () => {
    const seq = new Sequencer();
    const ev = loops(seq, 1);
    const bassBar = (b: number) =>
      ev.filter((e): e is Extract<SeqEvent, { stem: 'bass' }> => e.stem === 'bass' && e.time >= b * 16 * seq.stepSeconds - 0.06 && e.time < (b + 1) * 16 * seq.stepSeconds - 0.06);
    for (let b = 0; b < 4; b++) {
      const notes = bassBar(b).map((e) => e.midi);
      expect(Math.min(...notes)).toBe(CHORDS[b].root);
    }
    const pads = ev.filter((e): e is Extract<SeqEvent, { stem: 'pad' }> => e.stem === 'pad');
    expect(pads[1].midis.map((m) => m - (CHORDS[1].root + 24))).toEqual([...CHORDS[1].tones]);
  });

  it('skips stems whose level is inaudible', () => {
    const ev = loops(new Sequencer(), 1, { ...NONE, pad: 0.5 });
    expect(new Set(ev.map((e) => e.stem))).toEqual(new Set(['pad']));
    const drumsOnly = loops(new Sequencer(), 1, { ...NONE, drums: AUDIBLE + 0.01 });
    expect(new Set(drumsOnly.map((e) => e.stem))).toEqual(new Set(['drums']));
    expect(loops(new Sequencer(), 1, NONE)).toHaveLength(0);
  });

  it('adds a lub-dub heartbeat every two beats only while asked', () => {
    expect(loops(new Sequencer(), 1, FULL, false).some((e) => e.stem === 'heart')).toBe(false);
    const ev = loops(new Sequencer(), 1, FULL, true).filter((e) => e.stem === 'heart');
    expect(ev).toHaveLength((LOOP_STEPS / 8) * 2);
    expect(ev.filter((e) => e.stem === 'heart' && e.voice === 'lub')).toHaveLength(LOOP_STEPS / 8);
  });

  it('transposes only when the next 4-bar loop starts', () => {
    const seq = new Sequencer();
    seq.resync(0);
    const first = seq.advance(seq.time + 10 * seq.stepSeconds, FULL, false); // inside loop 1
    const rootA = first.find((e) => e.stem === 'bass');
    seq.setTranspose(2);
    expect(seq.transpose).toBe(0); // not yet
    seq.advance(seq.time + (LOOP_STEPS - seq.step - 1) * seq.stepSeconds + 0.001, FULL, false);
    expect(seq.transpose).toBe(0); // still the old loop's last step
    const next = seq.advance(seq.time + 4 * seq.stepSeconds, FULL, false);
    expect(seq.transpose).toBe(2);
    const bassNext = next.find((e) => e.stem === 'bass');
    expect(rootA && bassNext && rootA.stem === 'bass' && bassNext.stem === 'bass' && bassNext.midi - rootA.midi).toBe(2);
  });

  it('resyncs after a stall without losing its place in the loop', () => {
    const seq = new Sequencer();
    seq.resync(0);
    seq.advance(1, FULL, false);
    const step = seq.step;
    seq.resync(500);
    expect(seq.step).toBe(step);
    const ev = seq.advance(501, FULL, false);
    expect(ev[0].time).toBeGreaterThanOrEqual(500);
  });

  it('is deterministic', () => {
    expect(loops(new Sequencer(), 2)).toEqual(loops(new Sequencer(), 2));
  });
});
