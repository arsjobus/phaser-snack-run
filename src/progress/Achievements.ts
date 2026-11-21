import { SCORING } from '../config';
import type { RunSummary } from '../game/Run';
import { UPGRADE_IDS, type SaveData } from './Progress';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Coins paid once, when it unlocks. */
  reward: number;
  /** Runs are checked against the run so far; profile achievements only look at the save (`run` is then null). */
  check: (save: SaveData, run: RunSummary | null) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'combo10',
    name: 'Snack Attack',
    description: 'Collect 10 pickups in a row',
    reward: 50,
    check: (_s, r) => !!r && r.bestChain >= 10,
  },
  {
    id: 'maxcombo',
    name: 'Max Munch',
    description: `Reach the x${SCORING.maxCombo} multiplier`,
    reward: 150,
    check: (_s, r) => !!r && r.bestMultiplier >= SCORING.maxCombo,
  },
  {
    id: 'air1',
    name: 'Hang Time',
    description: 'Stay airborne for half a second',
    reward: 75,
    check: (_s, r) => !!r && r.bestAir >= 0.5,
  },
  {
    id: 'air2',
    name: 'Rocket Truck',
    description: 'Stay airborne for 0.7 seconds (a drafted launch off a big ramp)',
    reward: 200,
    check: (_s, r) => !!r && r.bestAir >= 0.7,
  },
  {
    id: 'clean2k',
    name: 'Mint Condition',
    description: 'Drive 2 km without taking any damage',
    reward: 250,
    check: (_s, r) => !!r && r.cleanMeters >= 2000,
  },
  {
    id: 'takedown1',
    name: 'First Blood',
    description: 'Wreck a rival',
    reward: 50,
    check: (_s, r) => !!r && r.takedowns >= 1,
  },
  {
    id: 'takedown5',
    name: 'Demolition Derby',
    description: 'Wreck 5 rivals in one run',
    reward: 200,
    check: (_s, r) => !!r && r.takedowns >= 5,
  },
  {
    id: 'lanes25',
    name: 'Lane Hopper',
    description: 'Change lanes 25 times in one run',
    reward: 75,
    check: (_s, r) => !!r && r.laneChanges >= 25,
  },
  {
    id: 'close10',
    name: 'Close Shave',
    description: 'Dodge 10 obstacles with a last-moment lane change in one run',
    reward: 100,
    check: (_s, r) => !!r && r.nearMisses >= 10,
  },
  {
    id: 'cp5',
    name: 'Road Warrior',
    description: 'Reach checkpoint 5',
    reward: 150,
    check: (_s, r) => !!r && r.checkpoints >= 5,
  },
  {
    id: 'km5',
    name: 'Long Haul',
    description: 'Drive 5 km in one run',
    reward: 200,
    check: (_s, r) => !!r && r.meters >= 5000,
  },
  {
    id: 'daily1',
    name: 'Daily Driver',
    description: 'Finish a daily challenge run',
    reward: 75,
    check: (_s, r) => !!r && r.daily && r.endReason !== null,
  },
  {
    id: 'upgrade1',
    name: 'Garage Rat',
    description: 'Buy a garage upgrade',
    reward: 50,
    check: (s) => UPGRADE_IDS.some((id) => s.upgrades[id] > 0),
  },
  {
    id: 'paint1',
    name: 'Fresh Paint',
    description: 'Buy a new paint job',
    reward: 50,
    check: (s) => s.ownedSkins.length > 1,
  },
  {
    id: 'bank1k',
    name: 'Snack Bank',
    description: 'Earn 1000 coins in total',
    reward: 100,
    check: (s) => s.stats.coinsEarned >= 1000,
  },
];

/**
 * Unlocks every achievement whose condition now holds (and that is not unlocked yet): records the
 * day, pays the reward into the bank and returns the new ones. Safe to call as often as you like.
 */
export function unlockAchievements(save: SaveData, run: RunSummary | null, day: string): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id] || !a.check(save, run)) continue;
    save.achievements[a.id] = day;
    save.coins += a.reward;
    fresh.push(a);
  }
  return fresh;
}
