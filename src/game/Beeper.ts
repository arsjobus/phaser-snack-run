import Phaser from 'phaser';

/**
 * Tiny synthesized beeps for HUD warnings (no audio files). Routed through Phaser's master mute
 * node so M mutes them. Phase 6 replaces this with the real SFX/music system.
 */
export class Beeper {
  constructor(private sound: Phaser.Sound.BaseSoundManager) {}

  private tone(freq: number, dur: number, vol: number, type: OscillatorType, delay = 0): void {
    const mgr = this.sound;
    if (!(mgr instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = mgr.context;
    if (ctx.state !== 'running') return; // locked until the first key press / tap
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(mgr.masterMuteNode);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Low-fuel warning, once per blink. */
  lowFuel(): void {
    this.tone(880, 0.09, 0.12, 'square');
  }

  /** Rising three-note chime for a checkpoint. */
  chime(): void {
    this.tone(660, 0.12, 0.14, 'triangle');
    this.tone(880, 0.12, 0.14, 'triangle', 0.1);
    this.tone(1320, 0.26, 0.14, 'triangle', 0.2);
  }
}
