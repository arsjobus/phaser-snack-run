import Phaser from 'phaser';
import { AUDIO } from '../config';
import { BIOME_LIST } from '../game/Biomes';
import { engineFreq, snackNote, speedNorm } from './Mix';
import { SFX, sfxCacheKey, type SfxKey } from './sfx';

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
 * Music comes from the bgm.mp3 audio asset and every one-shot sound effect from its own mp3 in
 * public/audio (see `sfx.ts`), so they can be edited or swapped. Only the engine and the mud-roll
 * hiss are still synthesized at runtime, because they are continuous and follow speed.
 * Everything feeds Phaser's master mute node, so M mutes it all. The context stays suspended until
 * the first key press or tap; until then every call here is a no-op.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private stopped = false;
  private paused = false;
  private musicOn = true;
  private musicVol: number = AUDIO.musicVolume;
  private sfxVol: number = AUDIO.sfxVolume;
  private noise: AudioBuffer | null = null;
  private cache: Phaser.Cache.CacheManager | null = null;
  private buffers = new Map<SfxKey, AudioBuffer>();
  private activeSfx = new Set<AudioBufferSourceNode>();
  private bgm: (Phaser.Sound.BaseSound & { setVolume(value: number): void }) | null = null;

  private sfx: GainNode | null = null;
  private engine: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private roll: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = sound.context;
    this.ctx = ctx;
    this.cache = sound.game.cache;

    this.sfx = ctx.createGain();
    this.sfx.gain.value = AUDIO.sfxVolume;
    this.sfx.connect(sound.masterMuteNode);

    this.bgm = sound.add('bgm', { loop: true, volume: AUDIO.musicVolume }) as
      | (Phaser.Sound.BaseSound & { setVolume(value: number): void })
      | null;

    this.noise = this.makeNoise(ctx);
  }

  private get live(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && !this.stopped && !this.paused;
  }

  /** The player's music and SFX volume settings (0..1 each, on top of the mix in `AUDIO`). */
  setLevels(music: number, sfx: number): void {
    this.musicVol = AUDIO.musicVolume * music;
    this.sfxVol = AUDIO.sfxVolume * sfx;
    if (this.sfx) this.sfx.gain.value = this.paused ? 0 : this.sfxVol;
    this.bgm?.setVolume(this.musicOn ? this.musicVol : 0);
  }

  /** Silence and stop effects while leaving the background music untouched. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.sfx) this.sfx.gain.value = paused ? 0 : this.sfxVol;
    if (paused) {
      for (const source of this.activeSfx) source.stop();
      this.activeSfx.clear();
    }
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

  // ---- one-shot SFX (mp3 files, see sfx.ts) -----------------------------------------------------

  /** Pickup chime that climbs the scale with the combo. */
  snack(multiplier: number): void {
    this.play('snack', { rate: 2 ** ((snackNote(multiplier) - 79) / 12) });
  }

  /** Fuel can: a gurgle plus two blips. */
  fuel(): void {
    this.play('fuel');
  }

  /** Landing thump, scaled by air time. */
  land(airTime: number): void {
    if (airTime < 0.15) return;
    this.play('land', { gain: Math.min(1, 0.25 + airTime * 0.8) });
  }

  /** Crunch for a bump: a short dull knock, or a long metal crunch for a hard hit. */
  thud(hard: boolean): void {
    this.play(hard ? 'thudHard' : 'thudSoft');
  }

  /** Two quick notes for a wrench. */
  wrench(): void {
    this.play('wrench');
  }

  /** Short fanfare for a takedown. */
  takedown(): void {
    this.play('takedown');
  }

  /** Rising three-note chime for a checkpoint (the score stings alongside it). */
  checkpoint(): void {
    this.play('checkpoint');
  }

  /** A quick tire "swish" for a lane change. */
  swerve(): void {
    this.play('swerve');
  }

  /** Bright two-step chime for a dodge, an achievement or a purchase. */
  reward(): void {
    this.play('reward');
  }

  /** Low-fuel warning, once per blink of the HUD dial. */
  lowFuel(): void {
    this.play('lowFuel');
  }

  /** The engine coughs as the tank runs dry. */
  empty(): void {
    this.play('empty');
  }

  /** A boost pad: a rocket whoosh that climbs with each pad of the stage. */
  boost(count: number): void {
    const up = Math.min(5, Math.max(1, count));
    this.play('boost', { rate: 2 ** ((up - 3) * 0.12) });
  }

  /** A pyro jet: a low whump and a hiss. */
  pyro(): void {
    this.play('pyro');
  }

  /** A rocket going up: a rising whistle (pitch varies a little each time). */
  rocket(): void {
    this.play('rocket', { rate: 0.85 + Math.random() * 0.3 });
  }

  /** A shell bursting: a crack and a crackle (loud for a letter, quieter for the finale). */
  burst(loud = true): void {
    this.play('burst', { gain: loud ? 1 : 0.55 });
  }

  /** Fanfare for a landed show jump. */
  showLanded(): void {
    this.play('showLanded');
  }

  /** Descending "wah-wah" when the run ends. */
  gameOver(): void {
    this.play('gameOver');
  }

  // ---- plumbing -------------------------------------------------------------------------------

  /** Silence everything and release the nodes (scene shutdown / restart). */
  dispose(): void {
    this.stopped = true;
    this.bgm?.stop();
    for (const source of this.activeSfx) source.stop();
    this.activeSfx.clear();
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

  /** Play one of the sfx mp3s on the SFX bus. `rate` shifts pitch, `gain` scales the manifest volume. */
  private play(key: SfxKey, opts: { rate?: number; gain?: number } = {}): void {
    if (!this.live) return;
    const buffer = this.buffer(key);
    if (!buffer) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = SFX[key].volume * (opts.gain ?? 1);
    src.connect(gain);
    gain.connect(this.sfx!);
    this.activeSfx.add(src);
    src.onended = () => this.activeSfx.delete(src);
    src.start();
  }

  /** The decoded mp3 of a sound effect, or null if it failed to load (the game then plays it silent). */
  private buffer(key: SfxKey): AudioBuffer | null {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const buf: unknown = this.cache?.audio.get(sfxCacheKey(key));
    if (!(buf instanceof AudioBuffer)) return null;
    this.buffers.set(key, buf);
    return buf;
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
