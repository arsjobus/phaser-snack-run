/**
 * The one-shot sound effects. Each one is an mp3 in `public/assets/audio/`, so you can edit or replace
 * any of them: drop your own file in with the same name (or change `file` here) and reload.
 *
 * `volume` is the playback gain (0..1+, before the player's SFX volume setting). The mp3s that
 * ship are normalised to about -1 dB, so turn a sound up or down here rather than in the file.
 * `scripts/make-sfx.py` can regenerate the originals.
 */
export interface SfxDef {
  readonly file: string;
  readonly volume: number;
}

export const SFX = {
  /** G5 chime; the game pitches it up the pentatonic scale as the combo grows. */
  snack: { file: 'snack.mp3', volume: 0.18 },
  fuel: { file: 'fuel.mp3', volume: 0.15 },
  /** Played at full power; turned down for short hops. */
  land: { file: 'land.mp3', volume: 0.68 },
  thudSoft: { file: 'thud-soft.mp3', volume: 0.29 },
  thudHard: { file: 'thud-hard.mp3', volume: 0.59 },
  wrench: { file: 'wrench.mp3', volume: 0.14 },
  takedown: { file: 'takedown.mp3', volume: 0.17 },
  /** Chime plus the bright stinger. */
  checkpoint: { file: 'checkpoint.mp3', volume: 0.25 },
  swerve: { file: 'swerve.mp3', volume: 0.07 },
  reward: { file: 'reward.mp3', volume: 0.14 },
  lowFuel: { file: 'low-fuel.mp3', volume: 0.14 },
  empty: { file: 'empty.mp3', volume: 0.36 },
  /** Mid-stage whoosh; the game shifts its pitch up for each pad of the stage. */
  boost: { file: 'boost.mp3', volume: 0.3 },
  pyro: { file: 'pyro.mp3', volume: 1.0 },
  /** The game varies its pitch a little each time. */
  rocket: { file: 'rocket.mp3', volume: 0.09 },
  /** Loud shell; the finale plays it quieter. */
  burst: { file: 'burst.mp3', volume: 0.43 },
  /** Fanfare plus the bright stinger. */
  showLanded: { file: 'show-landed.mp3', volume: 0.26 },
  gameOver: { file: 'game-over.mp3', volume: 0.17 },
  /** The secret-code jingle on the start screen. */
  cheat: { file: 'cheat.mp3', volume: 0.3 },
} as const satisfies Record<string, SfxDef>;

export type SfxKey = keyof typeof SFX;
export const SFX_KEYS = Object.keys(SFX) as SfxKey[];

/** Phaser cache key of a sound effect. */
export function sfxCacheKey(key: SfxKey): string {
  return `sfx-${key}`;
}

/** URL (relative to the page, so it works on itch.io and GitHub Pages) of a sound effect. */
export function sfxUrl(key: SfxKey): string {
  return `assets/audio/${SFX[key].file}`;
}
