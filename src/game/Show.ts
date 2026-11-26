import { BIOMES, GAMEPLAY, STUNT } from '../config';
import { launchKick, nextStuntAfter, padAt, stuntLayout, type PadSpot, type StuntLayout } from './Stunt';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';

/** Finds the stage a vehicle is at (or heading for) without searching from the start every call. */
export class StageLocator {
  private cur: StuntLayout | null = null;
  private prevEnd = -Infinity;

  constructor(private startX: number = GAMEPLAY.startX) {}

  /** The first stage whose road ends after x. */
  at(x: number): StuntLayout {
    const c = this.cur;
    if (c && x < c.x1 && x >= this.prevEnd) return c;
    const next = nextStuntAfter(x, this.startX);
    this.cur = next;
    const before = next.index - BIOMES.checkpointsPer;
    this.prevEnd = before > 0 ? stuntLayout(before, this.startX).x1 : -Infinity;
    return next;
  }

  /** True when x is on a stage's road (from `lead` px before it to its end). */
  onStage(x: number, lead = 0): boolean {
    const s = this.at(x);
    return x >= s.x0 - lead && x < s.x1;
  }
}

/** What the player's run through a stage reports to the scene. */
export type ShowEvent =
  | { type: 'pad'; pad: PadSpot; layout: StuntLayout; count: number }
  | { type: 'pyro'; layout: StuntLayout; site: 'launch' | 'landing'; x: number; y: number }
  | { type: 'sky'; layout: StuntLayout }
  | { type: 'launch'; layout: StuntLayout }
  | { type: 'landed'; layout: StuntLayout; cleared: boolean; cars: number; flips: number; points: number };

interface StageState {
  pads: number;
  pyro: Set<string>;
  sky: boolean;
  air: boolean;
  launched: boolean;
  landed: boolean;
  /** Pitch travelled in the air (rad), for counting flips. */
  spin: number;
  lastAngle: number;
}

/**
 * The player's run through the stages: boost pads, a stable launch, the
 * pyrotechnics and the sky show cues, the landing and what it pays, and the grace period in which
 * bumps do no damage. Pure TypeScript; the scene calls `step` once per physics substep and reads
 * the events once per frame.
 */
export class StuntShow {
  events: ShowEvent[] = [];
  /** Seconds since the first step, for the grace timer. */
  time = 0;
  /** Bumps cost nothing until this time. */
  private graceUntil = -Infinity;
  private states = new Map<number, StageState>();
  private locator: StageLocator;

  constructor(
    private seed: number,
    startX: number = GAMEPLAY.startX,
  ) {
    this.locator = new StageLocator(startX);
  }

  /** True while the surge is on or the post-landing grace lasts: bumps must not damage the player. */
  immune(truck: TruckPhysics): boolean {
    return truck.surge > 0 || truck.surgeAmount > 0.05 || this.time < this.graceUntil;
  }

  /** True on the road of a stage (a little before, so cues have room). */
  onStage(x: number, lead = 0): boolean {
    return this.locator.onStage(x, lead);
  }

  /** The stage the truck at x is at or heading for (from the camera's lead to the end of the slope), else null. */
  stageNear(x: number): { layout: StuntLayout; landed: boolean } | null {
    const layout = this.locator.at(x - 120);
    if (x < layout.pads[0].x0 - STUNT.camLead - 200 || x > layout.landEndX + 400) return null;
    return { layout, landed: this.states.get(layout.index)?.landed === true };
  }

  /** Returns and clears the events since the last call. */
  drain(): ShowEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private state(index: number): StageState {
    let s = this.states.get(index);
    if (!s) {
      s = { pads: 0, pyro: new Set(), sky: false, air: false, launched: false, landed: false, spin: 0, lastAngle: 0 };
      this.states.set(index, s);
      if (this.states.size > 6) this.states.delete(this.states.keys().next().value as number);
    }
    return s;
  }

  step(dt: number, truck: TruckPhysics, terrain: Terrain): void {
    this.time += dt;
    const layout = this.locator.at(truck.x - 120);
    if (truck.x < layout.x0 - STUNT.pyroLead - 200 || truck.x > layout.landEndX + 400) return;
    const s = this.state(layout.index);

    // Boost pads: touched from the ground, on any lane.
    if (truck.grounded) {
      const pad = padAt(layout, truck.x);
      if (pad && truck.hitPad(pad.id, terrain)) {
        s.pads++;
        this.events.push({ type: 'pad', pad, layout, count: s.pads });
      }
    }

    // Cues that fire once as the truck approaches.
    for (const site of layout.pyro) {
      const key = site.site;
      if (!s.pyro.has(key) && truck.x >= site.x - STUNT.pyroLead) {
        s.pyro.add(key);
        this.events.push({ type: 'pyro', layout, site: site.site, x: site.x, y: site.y });
      }
    }
    if (!s.sky && truck.x >= layout.skyTriggerX) {
      s.sky = true;
      this.events.push({ type: 'sky', layout });
    }

    // The launch: leaving the ground over the lip gives the truck its chance spin.
    if (!s.launched && truck.x >= layout.lipX - 24 && !truck.grounded && truck.x < layout.pitX1) {
      s.launched = true;
      s.air = true;
      s.lastAngle = truck.angle;
      // The spring can leave a small downward velocity as the wheels lose the last
      // ramp sample. Carry the ramp's tangent through the lip so the truck does not
      // visibly dip before crossing the gap. The curve's derivative at its end is
      // rampHeight * rampCurve / rampLength (upward in world coordinates).
      truck.vy = -truck.vx * (STUNT.rampHeight * STUNT.rampCurve) / STUNT.rampLength;
      truck.angVel += launchKick(this.seed, layout.index);
      this.events.push({ type: 'launch', layout });
    }
    if (s.air) {
      s.spin += Math.abs(truck.angle - s.lastAngle);
      s.lastAngle = truck.angle;
      if (truck.grounded && truck.x > layout.lipX + 120) {
        s.air = false;
        s.landed = true;
        const cleared = truck.x >= layout.pitX1;
        const cars = cleared ? new Set(layout.cars.filter((c) => c.x < truck.x).map((c) => c.x)).size : 0;
        const flips = Math.floor(s.spin / (Math.PI * 2 * 0.8));
        const points = (cleared ? STUNT.clearBonus + cars * STUNT.carBonus : 0) + flips * STUNT.flipBonus;
        this.graceUntil = this.time + STUNT.grace;
        this.events.push({ type: 'landed', layout, cleared, cars, flips, points });
      }
    }
  }
}
