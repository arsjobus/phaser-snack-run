/**
 * Truck damage, 0 (pristine) to 1 (wrecked). Nothing hurts the truck yet: Phase 4 (collisions,
 * rivals, wrecks) calls `add`, and the wrench pickup calls `repair`. The HUD already shows it.
 */
export class DamageMeter {
  level = 0;

  get wrecked(): boolean {
    return this.level >= 1;
  }

  /** Returns the damage actually applied. */
  add(amount: number): number {
    const before = this.level;
    this.level = Math.min(1, this.level + Math.max(0, amount));
    return this.level - before;
  }

  /** Returns the damage actually repaired. */
  repair(amount: number): number {
    const before = this.level;
    this.level = Math.max(0, this.level - Math.max(0, amount));
    return before - this.level;
  }
}
