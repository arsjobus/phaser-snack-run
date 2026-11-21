import { hashSeed } from '../game/Rng';

/** UTC calendar day as `YYYY-MM-DD`: the daily challenge rolls over at the same moment for everyone. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** The seed of a day's challenge: same course (terrain, pickups, obstacles, wrecks) for everyone. */
export function dailySeed(day: string = dayKey()): number {
  return hashSeed(`snack-run-daily-${day}`);
}
