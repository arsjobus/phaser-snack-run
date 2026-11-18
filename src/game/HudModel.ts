/** Pure helpers behind the HUD (no Phaser), so they can be unit-tested. */

/** Screen angle (radians, clockwise from +x) of a half-dial needle: 0 = far left, 1 = far right. */
export function needleAngle(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return Math.PI + v * Math.PI;
}

/** Remaining clock as m:ss, rounding up so it never shows 0:00 while time is left. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Blink phase at 2 Hz: lit for the first half of each 0.5 s tick, dark for the second. */
export function blinkLit(time: number): boolean {
  return Math.floor(time * 4) % 2 === 0;
}

/** Index of the current 0.5 s warning tick; a change means "beep now". */
export function warnTick(time: number): number {
  return Math.floor(time * 2);
}

/**
 * Damped spring that gives a gauge needle a little lag and overshoot. Fixed inner steps keep it
 * stable at any frame time.
 */
export class NeedleSpring {
  value: number;
  private vel = 0;

  constructor(
    start = 0,
    private k = 120,
    private c = 13,
  ) {
    this.value = start;
  }

  step(target: number, dt: number): number {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vel += (this.k * (target - this.value) - this.c * this.vel) * h;
      this.value += this.vel * h;
    }
    return this.value;
  }
}
