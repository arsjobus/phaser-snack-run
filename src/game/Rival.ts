import { LANES, PHYSICS, RIVALS } from '../config';
import type { InputState } from './Input';
import { sameLane } from './Lanes';
import type { Terrain } from './Terrain';
import { TruckPhysics } from './TruckPhysics';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Body shapes of the truck set (see `src/art/trucks.ts`). The player drives the first, `suv`. */
export type BodyKind = 'suv' | 'pickup' | 'monster' | 'jeep' | 'van' | 'buggy';

/**
 * The rival set (index = texture style): number plate, livery name, body shape and how much bigger
 * than the standard 20 px wheel its tires are drawn (the physics is the same for every truck).
 * The first three match the reference's cast: red #3, blue #8 and a black monster truck.
 */
export const RIVAL_STYLES = [
  { number: 3, name: 'red', kind: 'suv', wheel: 1 },
  { number: 8, name: 'blue', kind: 'pickup', wheel: 1.05 },
  { number: 5, name: 'black', kind: 'monster', wheel: 1.2 },
  { number: 7, name: 'green', kind: 'jeep', wheel: 1.1 },
  { number: 2, name: 'orange', kind: 'van', wheel: 0.95 },
  { number: 9, name: 'purple', kind: 'buggy', wheel: 1.15 },
] as const satisfies readonly { number: number; name: string; kind: BodyKind; wheel: number }[];

/** Tire scale of the player's truck. */
export const PLAYER_WHEEL = 1;

/**
 * A rival truck: the same rigid body as the player (so it bumps, jumps and flips for real) driven
 * by a small AI. The AI cruises at a skill-dependent speed, speeds up when it is behind the player
 * and eases off when it is far ahead (rubber banding), and levels itself in the air so it lands on
 * its wheels. Lane changes are decided by `Race`; the rival just animates them (`lane` is the wanted
 * lane, `laneF` the animated position that collisions and drawing use). Pure TypeScript.
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
  /** Wanted depth lane, the animated lane position (a float while swerving) and the re-think timer. */
  lane = 1;
  laneF = 1;
  laneTimer = 0;
  /** Hazards (wreck/obstacle keys) this rival has looked at: true = it saw it and will dodge. */
  seen = new Map<string, boolean>();
  /** Seconds spent crawling (for getting unstuck behind a fixed obstacle). */
  crawlTime = 0;

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

  /** Chance that this rival notices a given hazard in time and dodges it (rises with skill). */
  get noticeChance(): number {
    return Math.min(1, RIVALS.noticeBase + RIVALS.noticeSkill * this.skill * this.skill);
  }

  /** True when this rival is close enough to lane position `lane` to touch things in it. */
  inLane(lane: number): boolean {
    return sameLane(this.laneF, lane);
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

  /** Per frame: swerve towards the wanted lane, and track how long the rival is stuck or on its roof. */
  watch(dt: number): void {
    const goal = Math.max(0, Math.min(LANES.count - 1, this.lane));
    const rate = dt / RIVALS.laneSwitchTime;
    this.laneF = goal > this.laneF ? Math.min(goal, this.laneF + rate) : Math.max(goal, this.laneF - rate);
    const t = this.truck;
    this.flipTime = t.flipped && Math.abs(t.speed) < 220 ? this.flipTime + dt : 0;
    this.crawlTime = !t.flipped && t.speed < 80 ? this.crawlTime + dt : 0;
  }

  get dead(): boolean {
    return this.damage >= 1 || this.flipTime > RIVALS.flipWreckTime;
  }
}
