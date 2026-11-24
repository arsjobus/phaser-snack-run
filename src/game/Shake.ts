/**
 * Screen shake in whole pixels (pure TypeScript).
 *
 * Phaser's built-in `camera.shake` moves the whole camera, scroll-factor-0 layers included, by
 * fractional amounts. The sky and the parallax layers then slide off the screen edge (showing the
 * canvas background as a thin horizontal line) and textured layers are sampled between pixels
 * (hairline seams). This shake instead nudges only the world's scroll, always by an integer
 * number of pixels, so nothing is ever drawn between pixels and the screen-fixed layers (sky, HUD)
 * never leave the screen.
 */
export type ShakeRand = () => number;

export class ScreenShake {
  private left = 0;
  private total = 0;
  private amp = 0;

  constructor(private rand: ShakeRand = Math.random) {}

  /** Start (or strengthen) a shake: `seconds` long, `amplitude` px at the start, fading to 0. */
  kick(seconds: number, amplitude: number): void {
    const now = this.amplitude;
    if (amplitude < now) return; // never weaken a bigger shake that is still running
    this.left = this.total = Math.max(0.001, seconds);
    this.amp = amplitude;
  }

  /** Current strength in px. */
  get amplitude(): number {
    return this.total > 0 ? this.amp * (this.left / this.total) : 0;
  }

  get active(): boolean {
    return this.left > 0;
  }

  reset(): void {
    this.left = this.total = this.amp = 0;
  }

  /** Advance `dt` seconds and return this frame's offset: whole pixels only. */
  update(dt: number): { x: number; y: number } {
    if (this.left <= 0) return { x: 0, y: 0 };
    const a = this.amplitude;
    this.left = Math.max(0, this.left - dt);
    const jitter = () => Math.round((this.rand() * 2 - 1) * a);
    return { x: jitter(), y: Math.round(jitter() * 0.6) };
  }
}
