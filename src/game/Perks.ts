/**
 * What the garage upgrades do to a run, as plain multipliers (pure TypeScript, no saves in here):
 * a bigger tank, a thriftier engine, tougher armor. `NO_PERKS` is the stock truck.
 */
export interface Perks {
  /** Tank capacity multiplier (1.4 = a 40% bigger tank). */
  tank: number;
  /** Fuel burned multiplier (0.8 = 20% less). */
  burn: number;
  /** Damage taken multiplier (0.8 = 20% less). */
  damage: number;
  /** God mode (a cheat): no damage, no fuel burn, the clock never ends the run, a rollover just rights the truck. */
  god?: boolean;
}

export const NO_PERKS: Perks = { tank: 1, burn: 1, damage: 1 };
