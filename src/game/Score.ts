import { SCORING } from '../config';

/**
 * Score bookkeeping. Like the original, the HUD shows a running SCORE (snacks, fuel cans,
 * distance) and a separate BONUS tally (air time).
 */
export class ScoreKeeper {
  snackScore = 0;
  distanceScore = 0;
  bonus = 0;
  snacks = 0;
  /** Pickups collected in a row without missing one. */
  chain = 0;
  bestChain = 0;
  bestMultiplier = 1;
  /** Rivals you rammed to wrecks. */
  takedowns = 0;

  get multiplier(): number {
    return Math.min(SCORING.maxCombo, 1 + Math.floor(this.chain / SCORING.comboStep));
  }

  get score(): number {
    return this.snackScore + this.distanceScore;
  }

  get total(): number {
    return this.score + this.bonus;
  }

  /** Returns the points awarded (already multiplied). */
  collectSnack(): number {
    const points = SCORING.snack * this.multiplier;
    this.snackScore += points;
    this.snacks++;
    this.extendChain();
    return points;
  }

  /** Cans give flat points and keep the chain alive but are not multiplied. */
  collectFuel(): number {
    this.snackScore += SCORING.fuelCan;
    this.extendChain();
    return SCORING.fuelCan;
  }

  /** Called when a pickup slips past. */
  breakCombo(): void {
    this.chain = 0;
  }

  /** Air bonus for one landing; returns the points awarded. */
  addAir(airTime: number): number {
    const points = Math.floor(airTime / SCORING.airStep) * SCORING.airPoints;
    this.bonus += points;
    return points;
  }

  /** Flat BONUS points (checkpoints). Returns the points awarded. */
  addBonus(points: number): number {
    this.bonus += points;
    return points;
  }

  /** BONUS for a takedown. Returns the points awarded. */
  addTakedown(): number {
    this.takedowns++;
    return this.addBonus(SCORING.takedown);
  }

  /** Distance points follow the furthest point reached, so reversing never costs score. */
  setDistance(meters: number): void {
    this.distanceScore = Math.max(this.distanceScore, Math.floor(meters * SCORING.perMeter));
  }

  private extendChain(): void {
    this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
  }
}
