import { FUEL, PICKUPS, PX_PER_METER } from '../config';
import { FuelTank } from './Fuel';
import { PickupField, type Pickup } from './Pickups';
import { ScoreKeeper } from './Score';
import type { Terrain } from './Terrain';

export type RunEvent =
  | { type: 'snack'; pickup: Pickup; points: number; multiplier: number }
  | { type: 'fuel'; pickup: Pickup; points: number; added: number }
  | { type: 'miss'; pickup: Pickup }
  | { type: 'empty' }
  | { type: 'over' };

export interface TruckSample {
  x: number;
  y: number;
  /** Forward speed, px/s. */
  speed: number;
}

/**
 * One endless run: fuel, score, pickups and the loss condition. Pure TypeScript (no Phaser),
 * stepped once per frame with the truck's state, so it is unit-testable headlessly.
 */
export class RunModel {
  readonly fuel = new FuelTank();
  readonly score = new ScoreKeeper();
  readonly pickups: PickupField;
  over = false;
  time = 0;
  meters = 0;

  constructor(
    seed: number,
    terrain: Terrain,
    private startX: number,
  ) {
    this.pickups = new PickupField(seed, terrain, startX);
  }

  /** False once the tank is dry or the run is over: the scene should cut throttle and brake. */
  get engineOn(): boolean {
    return !this.over && !this.fuel.empty;
  }

  update(dt: number, truck: TruckSample): RunEvent[] {
    const events: RunEvent[] = [];
    if (this.over) return events;
    this.time += dt;

    this.meters = Math.max(this.meters, (truck.x - this.startX) / PX_PER_METER);
    this.score.setDistance(this.meters);

    const wasEmpty = this.fuel.empty;
    this.fuel.update(dt, truck.speed, Math.max(0, (truck.x - this.startX) / PX_PER_METER));
    if (this.fuel.empty && !wasEmpty) events.push({ type: 'empty' });

    this.pickups.ensure(truck.x + PICKUPS.spawnAhead);

    for (const p of this.pickups.collect(truck.x, truck.y)) {
      if (p.kind === 'snack') {
        const multiplier = this.score.multiplier;
        events.push({ type: 'snack', pickup: p, points: this.score.collectSnack(), multiplier });
      } else {
        const added = this.fuel.add(FUEL.canRestore);
        events.push({ type: 'fuel', pickup: p, points: this.score.collectFuel(), added });
      }
    }
    for (const p of this.pickups.sweepMissed(truck.x)) {
      this.score.breakCombo();
      events.push({ type: 'miss', pickup: p });
    }
    this.pickups.prune(truck.x);

    // Empty tank: the truck coasts (a can within reach can still save it); the run ends once it
    // has stopped, or after a few seconds.
    if (
      this.fuel.empty &&
      (this.fuel.emptyTime > FUEL.coastMaxTime ||
        (this.fuel.emptyTime > 0.5 && Math.abs(truck.speed) < FUEL.coastStopSpeed))
    ) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  /** Air-time bonus for a landing. Returns the points. */
  onLanded(airTime: number): number {
    return this.over ? 0 : this.score.addAir(airTime);
  }
}
