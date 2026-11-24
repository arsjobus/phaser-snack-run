import { CAMERA, STUNT } from '../config';
import type { StuntLayout } from './Stunt';

/** What the show camera asks of the scene this frame. */
export interface ShowFraming {
  /** 0..1: how far the framing has moved from the driving camera to the show camera. */
  focus: number;
  /** Game speed factor (1 = normal, below 1 = slow motion). */
  timeScale: number;
}

/**
 * The show camera (pure TypeScript). The player's jump over the pit used to be over in a blink and
 * the camera trailed the truck, so the truck drifted off centre and the lettering got a glimpse.
 * Now the framing goes onto the truck (centred, no look-ahead, a fast vertical follow) the moment
 * it hits the first boost pad, and lets go again `camRelease` px before the landing wall, while the
 * truck is still in the air, so the normal view is back by touchdown. From `slowLead` before the lip
 * the game slows to `slowScale` and holds for `slowHold` real seconds after the landing so the CRUNCH
 * finale and the cars below are seen. A truck that never reaches the stage (or a run that ends)
 * releases both at once.
 */
export class ShowCam {
  focus = 0;
  timeScale = 1;
  private holdUntil = -Infinity;
  private clock = 0;

  /** The truck landed the show jump: keep the framing and the slow motion a moment longer. */
  landed(): void {
    this.holdUntil = this.clock + STUNT.slowHold;
  }

  reset(): void {
    this.focus = 0;
    this.timeScale = 1;
    this.holdUntil = -Infinity;
    this.clock = 0;
  }

  /**
   * `dt` is real time. `layout` is the stage the truck is at (or null), `x` the truck's x,
   * `over` true when the run has ended, `landed` true once this stage's jump is done.
   */
  update(dt: number, x: number, layout: StuntLayout | null, over: boolean, landed: boolean): ShowFraming {
    this.clock += dt;
    const holding = this.clock < this.holdUntil;
    const inFrame = !over && layout !== null && x >= layout.pads[0].x0 + STUNT.camLead && x < layout.pitX1 - STUNT.camRelease;
    const inSlow = !over && layout !== null && x >= layout.lipX - STUNT.slowLead && !(landed && !holding) && (x < layout.landX1 || holding);

    const rate = inFrame ? CAMERA.focusRise : CAMERA.focusFall;
    this.focus += ((inFrame ? 1 : 0) - this.focus) * (1 - Math.exp(-rate * dt));
    this.timeScale += ((inSlow ? STUNT.slowScale : 1) - this.timeScale) * (1 - Math.exp(-STUNT.slowRate * dt));
    if (over) this.timeScale = 1;
    return { focus: this.focus, timeScale: this.timeScale };
  }
}
