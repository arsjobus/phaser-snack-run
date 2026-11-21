import { FUEL, PHYSICS } from '../config';

/** Tank fraction burned per second at `speed` px/s after `meters` driven. */
export function drainRate(speed: number, meters: number): number {
  const speedTerm = 1 + FUEL.speedFactor * Math.min(1, Math.max(0, speed) / PHYSICS.topSpeed);
  const distTerm = 1 + FUEL.distanceFactor * Math.min(1, Math.max(0, meters) / FUEL.distanceRampMeters);
  return FUEL.baseDrain * speedTerm * distTerm;
}

/** Tank fraction burned per world pixel when travelling at a steady `speed`. */
export function fuelPerPx(speed: number, meters: number): number {
  return drainRate(speed, meters) / speed;
}

/**
 * The tank: drains continuously (even when idle), refilled by cans, capped at 1. `level` is a
 * fraction of THIS tank. A bigger tank (`capacity` > 1, an upgrade) holds more, so the same burn or
 * the same can moves the gauge less; `burn` < 1 (an upgrade) is a thriftier engine.
 */
export class FuelTank {
  level: number = FUEL.start;
  /** Seconds spent empty (0 while there is fuel). */
  emptyTime = 0;

  constructor(
    readonly capacity = 1,
    readonly burn = 1,
  ) {}

  get empty(): boolean {
    return this.level <= 0;
  }

  get low(): boolean {
    return this.level < FUEL.low;
  }

  update(dt: number, speed: number, meters: number): void {
    if (this.empty) {
      this.emptyTime += dt;
      return;
    }
    this.level = Math.max(0, this.level - (drainRate(speed, meters) * this.burn * dt) / this.capacity);
  }

  /** Adds `amount` of a standard tank; returns the gauge fraction actually added (less when it tops out). */
  add(amount: number): number {
    const before = this.level;
    this.level = Math.min(1, this.level + amount / this.capacity);
    if (this.level > 0) this.emptyTime = 0;
    return this.level - before;
  }
}
