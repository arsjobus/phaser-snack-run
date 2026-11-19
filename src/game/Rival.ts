import { PHYSICS, RIVALS } from '../config';
import type { InputState } from './Input';
import type { Terrain } from './Terrain';
import { TruckPhysics } from './TruckPhysics';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Numbers and liveries of the rival set (index = texture style). Matches the reference's cast. */
export const RIVAL_STYLES = [
  { number: 3, name: 'red' },
  { number: 8, name: 'blue' },
  { number: 5, name: 'black' },
  { number: 7, name: 'green' },
] as const;

/** Which depth lane a rival is in right now: 0 = the player's, 1 = the far lane, -1 = swerving. */
export type LaneKey = 0 | 1 | -1;

/**
 * A rival truck: the same rigid body as the player (so it bumps, jumps and flips for real) driven
 * by a small AI. The AI cruises at a skill-dependent speed, speeds up when it is behind the player
 * and eases off when it is far ahead (rubber banding), and levels itself in the air so it lands on
 * its wheels. Lane changes are decided by `Race`; the rival just animates them. Pure TypeScript.
 */
export class Rival {
  readonly truck: TruckPhysics;
  /** 0 (sloppy) .. 1 (clean). */
  readonly skill: number;
  /** 0 (keeps out of your way) .. 1 (loves your lane). */
  readonly aggression: number;
  readonly cruise: number;
  damage = 0;
  /** Seconds spent upside down and (nearly) stopped. */
  flipTime = 0;
  /** Race time of the last bump with the player; -Infinity if never. */
  lastPlayerHit = -Infinity;
  /** Race time of the last reported bump with the player (for the hit cooldown). */
  lastBump = -Infinity;
  input: InputState = { throttle: 0, brake: 0, lean: 0 };
  /** Wanted lane (0 near, 1 far) and how far the swerve has got (0 = near, 1 = far). */
  lane: 0 | 1 = 1;
  laneBlend = 1;
  laneTimer = 0;

  constructor(
    readonly id: number,
    readonly style: number,
    x: number,
    y: number,
    skill: number,
    aggression: number,
  ) {
    this.truck = new TruckPhysics(x, y);
    this.skill = skill;
    this.aggression = aggression;
    this.cruise = RIVALS.cruiseMin + (RIVALS.cruiseMax - RIVALS.cruiseMin) * skill;
  }

  get number(): number {
    return RIVAL_STYLES[this.style % RIVAL_STYLES.length].number;
  }

  /** The lane the rival counts as being in for collisions. */
  get laneKey(): LaneKey {
    if (this.laneBlend < 0.35) return 0;
    if (this.laneBlend > 0.65) return 1;
    return -1;
  }

  /** Target speed (px/s): cruise, plus the rubber band towards the player. */
  targetSpeed(playerX: number): number {
    const behind = clamp((playerX - this.truck.x) / RIVALS.bandDistance, -1, 1);
    return clamp(this.cruise + behind * RIVALS.bandSpeed, RIVALS.floorSpeed, PHYSICS.topSpeed * 0.97);
  }

  /** Decide this frame's controls. */
  think(playerX: number, terrain: Terrain): void {
    const t = this.truck;
    const target = this.targetSpeed(playerX);
    const speed = t.speed;
    const throttle = speed < target ? 1 : 0;
    const brake = speed > target + 140 ? 1 : 0;

    // Lean: in the air (or in a wheelie) PD-control the pitch towards the landing slope.
    let lean = 0;
    const lookX = t.x + t.vx * 0.3;
    const want = Math.atan(terrain.slopeAt(lookX)) + (1 - this.skill) * 0.25;
    if (!t.grounded || Math.abs(t.angle) > 0.5) {
      lean = clamp(2.2 * (want - t.angle) - 0.45 * t.angVel, -1, 1);
    }
    this.input = { throttle, brake, lean };
  }

  /** Advance the body by one fixed physics step. */
  step(dt: number, terrain: Terrain): void {
    this.truck.step(dt, this.input, terrain);
  }

  /** Per frame: swerve towards the wanted lane, and track how long the rival is stuck on its roof. */
  watch(dt: number): void {
    const goal = this.lane;
    const rate = dt / RIVALS.laneSwitchTime;
    this.laneBlend = goal > this.laneBlend ? Math.min(goal, this.laneBlend + rate) : Math.max(goal, this.laneBlend - rate);
    const t = this.truck;
    this.flipTime = t.flipped && Math.abs(t.speed) < 220 ? this.flipTime + dt : 0;
  }

  get dead(): boolean {
    return this.damage >= 1 || this.flipTime > RIVALS.flipWreckTime;
  }
}
