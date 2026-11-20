import Phaser from 'phaser';
import { AUDIO, FUEL } from '../config';
import { BIOME_LIST } from '../game/Biomes';
import { Sequencer, type SeqEvent } from './Sequencer';
import { engineFreq, lowFuelCutoff, midiToHz, snackNote, speedNorm, stemLevels, type StemLevels } from './Mix';

/** What the audio needs to know each frame. */
export interface AudioState {
  /** Forward speed, px/s. */
  speed: number;
  throttle: boolean;
  grounded: boolean;
  /** False with a dry tank. */
  engineOn: boolean;
  over: boolean;
  multiplier: number;
  /** Tank, 0..1. */
  fuel: number;
  /** Biome the truck is rolling on (index into BIOME_LIST). */
  biome: number;
}

type Stem = keyof StemLevels;

/**
 * Everything you hear, synthesized at runtime with Web Audio (no audio files):
 *  - the adaptive score: pad / drums / bass / lead stems, scheduled by `Sequencer`, faded by speed
 *    and combo, lowpass-filtered as the tank runs low (plus a heartbeat) and stung at checkpoints;
 *  - the engine, pitched by speed, plus a mud-roll hiss;
 *  - one-shot SFX: pickups, crunches, landings, warnings.
 * Everything feeds Phaser's master mute node, so M mutes it all. The context stays suspended until
 * the first key press or tap; until then every call here is a no-op.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private seq = new Sequencer();
  private started = false;
  private stopped = false;
  private musicOn = true;
  private noise: AudioBuffer | null = null;

  private musicIn: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicOut: GainNode | null = null;
  private sfx: GainNode | null = null;
  private stems = {} as Record<Stem, GainNode>;
  private engine: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private roll: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private lastBiome = 0;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = sound.context;
    this.ctx = ctx;

    this.musicOut = ctx.createGain();
    this.musicOut.gain.value = AUDIO.musicVolume;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = AUDIO.lowFuelCutoff.open;
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.musicFilter);
    this.musicFilter.connect(this.musicOut);
    this.musicOut.connect(sound.masterMuteNode);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = AUDIO.sfxVolume;
    this.sfx.connect(sound.masterMuteNode);

    for (const stem of ['pad', 'drums', 'bass', 'lead'] as const) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicIn);
      this.stems[stem] = g;
    }
    this.noise = this.makeNoise(ctx);
  }

  private get live(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && !this.stopped;
  }

  /** M-independent switch for just the music (N key). Returns the new state. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    if (this.ctx && this.musicOut) {
      this.musicOut.gain.setTargetAtTime(this.musicOn ? AUDIO.musicVolume : 0, this.ctx.currentTime, 0.05);
    }
    return this.musicOn;
  }

  /** Per-frame: schedule music, fade stems, move the filter and drive the engine. */
  update(s: AudioState): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.stopped) return;
    const now = ctx.currentTime;
    if (!this.started) {
      this.started = true;
      this.seq.resync(now);
    } else if (this.seq.time < now - 0.05) {
      this.seq.resync(now); // the tab stalled or the context was suspended: pick up from here
    }
    if (s.biome !== this.lastBiome) {
      this.lastBiome = s.biome;
      this.seq.setTranspose(AUDIO.biomeTranspose[s.biome % AUDIO.biomeTranspose.length] ?? 0);
    }

    const levels = stemLevels(s.speed, s.multiplier, s.over);
    for (const stem of Object.keys(levels) as Stem[]) {
      this.stems[stem].gain.setTargetAtTime(levels[stem], now, AUDIO.stemFade);
    }
    const dry = s.fuel < FUEL.low && !s.over;
    this.musicFilter!.frequency.setTargetAtTime(lowFuelCutoff(s.over ? 1 : s.fuel), now, 0.25);
    for (const e of this.seq.advance(now + AUDIO.lookahead, levels, dry)) this.play(e);
    this.updateEngine(s, now);
  }

  // ---- music voices ---------------------------------------------------------------------------

  private play(e: SeqEvent): void {
    switch (e.stem) {
      case 'drums':
        this.drum(e.voice, e.time, e.vel);
        break;
      case 'bass':
        this.bass(e.midi, e.time, e.dur);
        break;
      case 'lead':
        this.lead(e.midi, e.time, e.dur);
        break;
      case 'pad':
        this.pad(e.midis, e.time, e.dur);
        break;
      case 'heart':
        this.heart(e.voice, e.time);
        break;
    }
  }

  private drum(voice: 'kick' | 'snare' | 'hat' | 'ohat', t: number, vel: number): void {
    const out = this.stems.drums;
    if (voice === 'kick') {
      const o = this.osc('sine', 150, t, out, 0.0001);
      o.osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      this.env(o.gain, t, 0.002, 0.26, 0.9 * vel);
      o.osc.stop(t + 0.3);
    } else if (voice === 'snare') {
      this.noiseHit(t, 0.17, 0.5 * vel, 'highpass', 1500, out);
      const o = this.osc('triangle', 190, t, out, 0.0001);
      o.osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      this.env(o.gain, t, 0.002, 0.12, 0.35 * vel);
      o.osc.stop(t + 0.16);
    } else {
      this.noiseHit(t, voice === 'ohat' ? 0.2 : 0.04, 0.22 * vel, 'highpass', 7000, out);
    }
  }

  private bass(midi: number, t: number, dur: number): void {
    const out = this.stems.bass;
    const f = midiToHz(midi);
    const o = this.osc('sawtooth', f, t, out, 0.0001);
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    o.osc.disconnect();
    o.osc.connect(lp);
    lp.connect(o.gain);
    this.env(o.gain, t, 0.005, dur, 0.5);
    o.osc.stop(t + dur + 0.05);
    const sub = this.osc('sine', f, t, out, 0.0001);
    this.env(sub.gain, t, 0.005, dur, 0.4);
    sub.osc.stop(t + dur + 0.05);
  }

  private lead(midi: number, t: number, dur: number): void {
    const out = this.stems.lead;
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = this.ctx!.createGain();
    lp.connect(g);
    g.connect(out);
    this.env(g, t, 0.01, dur, 0.22);
    for (const cents of [-7, 7]) {
      const o = this.ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToHz(midi);
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private pad(midis: number[], t: number, dur: number): void {
    const out = this.stems.pad;
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = this.ctx!.createGain();
    lp.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.35);
    g.gain.setValueAtTime(0.11, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    for (const m of midis) {
      for (const cents of [-9, 9]) {
        const o = this.ctx!.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiToHz(m);
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
  }

  /** Soft "lub-dub", through the stem-independent music bus so the low-pass muffles it too. */
  private heart(voice: 'lub' | 'dub', t: number): void {
    const o = this.osc('sine', voice === 'lub' ? 58 : 48, t, this.musicIn!, 0.0001);
    this.env(o.gain, t, 0.005, 0.16, voice === 'lub' ? 0.9 : 0.6);
    o.osc.stop(t + 0.2);
  }

  /** Bright checkpoint stinger over the music, in the current key. */
  stinger(): void {
    if (!this.live) return;
    const root = 69 + this.seq.transpose;
    [0, 4, 7, 12, 16].forEach((n, i) => {
      this.blip('square', midiToHz(root + n), 0.2, 0.1, i * 0.07);
    });
  }

  // ---- engine ---------------------------------------------------------------------------------

  private updateEngine(s: AudioState, now: number): void {
    const ctx = this.ctx!;
    if (!this.engine) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      filter.connect(gain);
      gain.connect(this.sfx!);
      const oscs = (['sawtooth', 'square'] as const).map((type) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.connect(filter);
        o.start();
        return o;
      });
      this.engine = { oscs, filter, gain };
      const rollFilter = ctx.createBiquadFilter();
      rollFilter.type = 'bandpass';
      rollFilter.frequency.value = 500;
      rollFilter.Q.value = 0.6;
      const rollGain = ctx.createGain();
      rollGain.gain.value = 0;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(rollFilter);
      rollFilter.connect(rollGain);
      rollGain.connect(this.sfx!);
      src.start();
      this.roll = { src, filter: rollFilter, gain: rollGain };
    }
    const e = this.engine;
    const n = speedNorm(s.speed);
    const f = engineFreq(s.speed, s.throttle, s.grounded);
    e.oscs[0].frequency.setTargetAtTime(f, now, 0.06);
    e.oscs[1].frequency.setTargetAtTime(f * 0.5, now, 0.06);
    e.filter.frequency.setTargetAtTime(380 + 900 * n, now, 0.1);
    const on = s.engineOn && !s.over;
    e.gain.gain.setTargetAtTime(on ? 0.05 + 0.05 * n : 0, now, on ? 0.1 : 0.15);
    const r = this.roll!;
    r.filter.frequency.setTargetAtTime(350 + 700 * n, now, 0.1);
    r.gain.gain.setTargetAtTime(s.grounded && !s.over ? 0.18 * n : 0, now, 0.1);
  }

  // ---- one-shot SFX ---------------------------------------------------------------------------

  /** Pickup chime that climbs the scale with the combo. */
  snack(multiplier: number): void {
    if (!this.live) return;
    const f = midiToHz(snackNote(multiplier));
    this.blip('triangle', f, 0.12, 0.16, 0);
    this.blip('sine', f * 2, 0.08, 0.05, 0);
  }

  /** Fuel can: a gurgle plus two blips. */
  fuel(): void {
    if (!this.live) return;
    this.noiseHit(this.ctx!.currentTime, 0.35, 0.35, 'bandpass', 600, this.sfx!, 300, 1000);
    this.blip('triangle', 392, 0.12, 0.14, 0.05);
    this.blip('triangle', 523, 0.2, 0.14, 0.15);
  }

  /** Landing thump, scaled by air time. */
  land(airTime: number): void {
    if (!this.live || airTime < 0.15) return;
    const t = this.ctx!.currentTime;
    const power = Math.min(1, 0.25 + airTime * 0.8);
    const o = this.osc('sine', 130, t, this.sfx!, 0.0001);
    o.osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(o.gain, t, 0.003, 0.22, 0.6 * power);
    o.osc.stop(t + 0.25);
    this.noiseHit(t, 0.14, 0.3 * power, 'lowpass', 900, this.sfx!);
  }

  /** Crunch for a bump: a short dull knock, or a long metal crunch for a hard hit. */
  thud(hard: boolean): void {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, hard ? 0.3 : 0.1, hard ? 0.55 : 0.25, hard ? 'bandpass' : 'lowpass', hard ? 1800 : 700, this.sfx!);
    const o = this.osc(hard ? 'sawtooth' : 'sine', hard ? 90 : 110, t, this.sfx!, 0.0001);
    o.osc.frequency.exponentialRampToValueAtTime(hard ? 45 : 70, t + 0.2);
    this.env(o.gain, t, 0.003, hard ? 0.25 : 0.12, hard ? 0.35 : 0.3);
    o.osc.stop(t + 0.3);
  }

  /** Two quick notes for a wrench. */
  wrench(): void {
    if (!this.live) return;
    this.blip('triangle', 520, 0.08, 0.13, 0);
    this.blip('triangle', 780, 0.14, 0.13, 0.08);
  }

  /** Short fanfare for a takedown. */
  takedown(): void {
    if (!this.live) return;
    [440, 554, 660, 880].forEach((f, i) => this.blip('square', f, i === 3 ? 0.24 : 0.09, 0.14, i * 0.08));
  }

  /** Rising three-note chime for a checkpoint (the score stings alongside it). */
  checkpoint(): void {
    if (!this.live) return;
    this.blip('triangle', 660, 0.12, 0.14, 0);
    this.blip('triangle', 880, 0.12, 0.14, 0.1);
    this.blip('triangle', 1320, 0.26, 0.14, 0.2);
    this.stinger();
  }

  /** Low-fuel warning, once per blink of the HUD dial. */
  lowFuel(): void {
    if (!this.live) return;
    this.blip('square', 880, 0.09, 0.12, 0);
  }

  /** The engine coughs as the tank runs dry. */
  empty(): void {
    if (!this.live) return;
    [110, 96, 80, 62].forEach((f, i) => this.blip('square', f, 0.12, 0.3, [0, 0.18, 0.4, 0.75][i]));
  }

  /** Descending "wah-wah" when the run ends. The music is faded out by `update` (all stem levels go to 0). */
  gameOver(): void {
    if (!this.live) return;
    [64, 62, 60, 57].forEach((m, i) => this.blip('sawtooth', midiToHz(m), i === 3 ? 0.7 : 0.28, 0.14, i * 0.3));
  }

  // ---- plumbing -------------------------------------------------------------------------------

  /** Silence everything and release the nodes (scene shutdown / restart). */
  dispose(): void {
    this.stopped = true;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.engine?.gain.gain.cancelScheduledValues(t);
    this.engine?.oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
    try {
      this.roll?.src.stop();
    } catch {
      /* already stopped */
    }
    // Detach the buses so notes already scheduled in the lookahead window fall silent.
    this.musicOut?.disconnect();
    this.sfx?.disconnect();
    this.engine = null;
    this.roll = null;
  }

  private osc(type: OscillatorType, freq: number, t: number, out: AudioNode, startGain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(startGain, t);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    return { osc, gain };
  }

  /** Quick attack, exponential decay to silence over `dur`. */
  private env(g: GainNode, t: number, attack: number, dur: number, peak: number): void {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
  }

  /** One short tone on the SFX bus (not filtered by the low-fuel muffle). */
  private blip(type: OscillatorType, freq: number, dur: number, vol: number, delay: number): void {
    const t = this.ctx!.currentTime + delay;
    const o = this.osc(type, freq, t, this.sfx!, 0.0001);
    this.env(o.gain, t, 0.005, dur, vol);
    o.osc.stop(t + dur + 0.03);
  }

  /** A burst of filtered white noise; optionally sweeping the filter from `f` to `fTo`. */
  private noiseHit(
    t: number,
    dur: number,
    vol: number,
    type: BiquadFilterType,
    f: number,
    out: AudioNode,
    sweepFrom?: number,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(sweepFrom ?? f, t);
    if (sweepTo !== undefined) filter.frequency.linearRampToValueAtTime(sweepTo, t + dur);
    const gain = ctx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    this.env(gain, t, 0.002, dur, vol);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}

/** Index of the biome a world position is in, for transposing the theme. */
export function biomeIndex(id: string): number {
  return Math.max(0, BIOME_LIST.findIndex((b) => b.id === id));
}
