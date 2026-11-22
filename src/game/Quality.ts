/**
 * Adaptive effects quality (pure). In `auto` mode the scene feeds every frame time in here; if the
 * game keeps running below `lowFps` for `window` seconds the quality steps down one level (it never
 * steps back up on its own, so it cannot flicker). Quality scales ground detail and particles.
 */
export const QUALITY_LEVELS = [1, 0.6, 0.3] as const;

export class QualityGovernor {
  private level = 0;
  private time = 0;
  private frames = 0;

  constructor(
    private lowFps = 45,
    private window = 2.5,
  ) {}

  get quality(): number {
    return QUALITY_LEVELS[this.level];
  }

  /** Returns true when this frame lowered the quality. Ignore stalls (tab in background): dt > 0.25 s. */
  update(dt: number): boolean {
    if (dt <= 0 || dt > 0.25 || this.level >= QUALITY_LEVELS.length - 1) return false;
    this.time += dt;
    this.frames++;
    if (this.time < this.window) return false;
    const fps = this.frames / this.time;
    this.time = 0;
    this.frames = 0;
    if (fps < this.lowFps) {
      this.level++;
      return true;
    }
    return false;
  }
}

/** Effects quality 0..1 from the setting: `auto` follows the governor. */
export function effectsQuality(effects: 'auto' | 'full' | 'reduced', governed: number): number {
  return effects === 'full' ? 1 : effects === 'reduced' ? 0.3 : governed;
}
