import { PHYSICS, TRUCK } from '../config';

/**
 * Tire geometry (pure). The physics wheel is `PHYSICS.wheelRadius`; the tire that is drawn is
 * `TRUCK.tireRadius * factor`, so a lifted truck's wheel centre is drawn `tireRise` px above the
 * physics wheel centre, which keeps the tread on the ground.
 */
export const tireRadius = (factor = 1): number => TRUCK.tireRadius * factor;

export const tireRise = (factor = 1): number => tireRadius(factor) - PHYSICS.wheelRadius;

/** Wheel rotation (radians) for driving `distance` px along the ground. */
export const tireSpin = (distance: number, factor = 1): number => distance / tireRadius(factor);

/** Chassis-local y of the drawn axle (the tire's centre when the truck sits on level ground). */
export const axleY = (factor = 1): number => TRUCK.wheels[0].y + PHYSICS.wheelRadius - tireRadius(factor);
