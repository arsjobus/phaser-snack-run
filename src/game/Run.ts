import { CHECKPOINT, FUEL, PICKUPS, PX_PER_METER, WRENCH } from '../config';
import { CheckpointTrack } from './Checkpoint';
import { DamageMeter } from './Damage';
import { FuelTank } from './Fuel';
import { PickupField, type Pickup } from './Pickups';
import { ScoreKeeper } from './Score';
import type { Terrain } from './Terrain';
import { WreckField } from './Wrecks';

export type RunEvent =
  | { type: 'snack'; pickup: Pickup; points: number; multiplier: number }
  | { type: 'fuel'; pickup: Pickup; points: number; added: number }
  | { type: 'wrench'; pickup: Pickup; repaired: number }
  | { type: 'miss'; pickup: Pickup }
  | { type: 'empty' }
  | { type: 'checkpoint'; index: number; timeAdded: number; fuelAdded: number; points: number }
  | { type: 'timeup' }
  | { type: 'damage'; amount: number }
  | { type: 'over'; reason: EndReason };

export type EndReason = 'fuel' | 'time' | 'wreck';

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
  readonly checkpoints = new CheckpointTrack();
  readonly damage = new DamageMeter();
  readonly wrecks: WreckField;
  readonly pickups: PickupField;
  over = false;
  endReason: EndReason | null = null;
  time = 0;
  meters = 0;

  constructor(
    seed: number,
    terrain: Terrain,
    private startX: number,
  ) {
    this.wrecks = new WreckField(seed, terrain, startX);
    this.pickups = new PickupField(seed, terrain, startX, this.wrecks);
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

    for (const c of this.checkpoints.update(dt, this.meters)) {
      if (c.type === 'reached') {
        const fuelAdded = this.fuel.add(CHECKPOINT.fuelBonus);
        const points = this.score.addBonus(c.points);
        events.push({
          type: 'checkpoint',
          index: c.index,
          timeAdded: c.timeAdded,
          fuelAdded,
          points,
        });
      } else if (CHECKPOINT.timeoutEndsRun) {
        events.push({ type: 'timeup' });
        this.finish('time', events);
        return events;
      }
    }

    this.pickups.ensure(truck.x + PICKUPS.spawnAhead);

    for (const p of this.pickups.collect(truck.x, truck.y)) {
      if (p.kind === 'snack') {
        const multiplier = this.score.multiplier;
        events.push({ type: 'snack', pickup: p, points: this.score.collectSnack(), multiplier });
      } else if (p.kind === 'wrench') {
        events.push({ type: 'wrench', pickup: p, repaired: this.repair(WRENCH.restore) });
      } else {
        const added = this.fuel.add(FUEL.canRestore);
        events.push({ type: 'fuel', pickup: p, points: this.score.collectFuel(), added });
      }
    }
    for (const p of this.pickups.sweepMissed(truck.x)) {
      if (p.kind !== 'wrench') this.score.breakCombo(); // a wrench is not part of the chain
      events.push({ type: 'miss', pickup: p });
    }
    this.pickups.prune(truck.x);
    this.wrecks.prune(truck.x);

    // Empty tank: the truck coasts (a can within reach can still save it); the run ends once it
    // has stopped, or after a few seconds.
    if (
      this.fuel.empty &&
      (this.fuel.emptyTime > FUEL.coastMaxTime ||
        (this.fuel.emptyTime > 0.5 && Math.abs(truck.speed) < FUEL.coastStopSpeed))
    ) {
      this.finish('fuel', events);
    }
    return events;
  }

  /** Damage from a hard bump (rival or wreck). Full damage wrecks the truck and ends the run. */
  hurt(amount: number): RunEvent[] {
    const events: RunEvent[] = [];
    if (this.over) return events;
    const applied = this.damage.add(amount);
    if (applied > 0) events.push({ type: 'damage', amount: applied });
    if (this.damage.wrecked) this.finish('wreck', events);
    return events;
  }

  /** Repairs damage (wrench). Returns the amount actually repaired. */
  repair(amount: number): number {
    return this.over ? 0 : this.damage.repair(amount);
  }

  /** BONUS for wrecking a rival you rammed. Returns the points. */
  takedown(): number {
    return this.over ? 0 : this.score.addTakedown();
  }

  private finish(reason: EndReason, events: RunEvent[]): void {
    this.over = true;
    this.endReason = reason;
    events.push({ type: 'over', reason });
  }

  /** Air-time bonus for a landing. Returns the points. */
  onLanded(airTime: number): number {
    return this.over ? 0 : this.score.addAir(airTime);
  }
}
