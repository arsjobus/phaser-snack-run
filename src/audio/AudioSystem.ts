import Phaser from 'phaser';
import { AUDIO } from '../config';
import { BIOME_LIST } from '../game/Biomes';
import { engineFreq, midiToHz, snackNote, speedNorm } from './Mix';

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

/**
 * Music comes from the bgm.mp3 audio asset. One-shot and engine sounds are synthesized at runtime:
 *  - synthesized engine, mud-roll hiss and stingers;
 *  - one-shot SFX: pickups, crunches, landings, warnings.
 * Everything feeds Phaser's master mute node, so M mutes it all. The context stays suspended until
 * the first key press or tap; until then every call here is a no-op.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private stopped = false;
  private musicOn = true;
  private musicVol: number = AUDIO.musicVolume;
  private noise: AudioBuffer | null = null;
  private bgm: (Phaser.Sound.BaseSound & { setVolume(value: number): void }) | null = null;

  private sfx: GainNode | null = null;
  private engine: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private roll: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = sound.context;
    this.ctx = ctx;

    this.sfx = ctx.createGain();
    this.sfx.gain.value = AUDIO.sfxVolume;
    this.sfx.connect(sound.masterMuteNode);

    this.bgm = sound.add('bgm', { loop: true, volume: AUDIO.musicVolume }) as
      | (Phaser.Sound.BaseSound & { setVolume(value: number): void })
      | null;

    this.noise = this.makeNoise(ctx);
  }

  private get live(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && !this.stopped;
  }

  /** The player's music and SFX volume settings (0..1 each, on top of the mix in `AUDIO`). */
  setLevels(music: number, sfx: number): void {
    this.musicVol = AUDIO.musicVolume * music;
    if (this.sfx) this.sfx.gain.value = AUDIO.sfxVolume * sfx;
    this.bgm?.setVolume(this.musicOn ? this.musicVol : 0);
  }

  /** M-independent switch for just the music (N key). Returns the new state. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    this.bgm?.setVolume(this.musicOn ? this.musicVol : 0);
    return this.musicOn;
  }

  /** Per-frame: keep the background track playing and drive the engine. */
  update(s: AudioState): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.stopped) return;
    const now = ctx.currentTime;

    if (this.bgm && !this.bgm.isPlaying) {
      this.bgm.play({ loop: true, volume: this.musicOn ? this.musicVol : 0 });
    }

    this.updateEngine(s, now);
  }

  /** Bright checkpoint stinger over the music, in the current key. */
  stinger(): void {
    if (!this.live) return;
    const root = 69;
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

  /** A quick tire "swish" for a lane change. */
  swerve(): void {
    if (!this.live) return;
    this.noiseHit(this.ctx!.currentTime, 0.16, 0.22, 'bandpass', 900, this.sfx!, 500, 1800);
  }

  /** Bright two-step chime for a dodge, an achievement or a purchase. */
  reward(): void {
    if (!this.live) return;
    this.blip('triangle', 784, 0.1, 0.13, 0);
    this.blip('triangle', 1175, 0.2, 0.13, 0.09);
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

  /** Descending "wah-wah" when the run ends. */
  gameOver(): void {
    if (!this.live) return;
    [64, 62, 60, 57].forEach((m, i) => this.blip('sawtooth', midiToHz(m), i === 3 ? 0.7 : 0.28, 0.14, i * 0.3));
  }

  // ---- plumbing -------------------------------------------------------------------------------

  /** Silence everything and release the nodes (scene shutdown / restart). */
  dispose(): void {
    this.stopped = true;
    this.bgm?.stop();
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
    // Detach the SFX bus so pending nodes fall silent.
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

/** Index of the biome at a world position. */
export function biomeIndex(id: string): number {
  return Math.max(0, BIOME_LIST.findIndex((b) => b.id === id));
}
