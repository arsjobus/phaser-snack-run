import { PROGRESSION } from '../config';
import { NO_PERKS, type Perks } from '../game/Perks';
import type { EndReason, RunSummary } from '../game/Run';
import { DEFAULT_SKIN, SKINS, skinById } from './Skins';
import type { KeyValueStore } from './Storage';

/**
 * Everything the game remembers between runs (pure TypeScript, no Phaser): the snack bank, garage
 * upgrades, paint, the high-score table, lifetime stats and unlocked achievements.
 * Saved as one JSON blob; `sanitizeSave` accepts anything (old, hand-edited, corrupt) and returns
 * a valid save, so a bad blob can never break the game.
 */

export type UpgradeId = keyof typeof PROGRESSION.upgrades;
export const UPGRADE_IDS = Object.keys(PROGRESSION.upgrades) as UpgradeId[];

export interface HighScore {
  score: number;
  meters: number;
  snacks: number;
  /** UTC day (`YYYY-MM-DD`) the run was driven. */
  date: string;
  reason: EndReason | null;
}

export interface LifetimeStats {
  runs: number;
  meters: number;
  snacks: number;
  takedowns: number;
  nearMisses: number;
  laneChanges: number;
  coinsEarned: number;
  bestScore: number;
  bestMeters: number;
  /** Longest single jump (s). */
  bestAir: number;
  bestChain: number;
}

export interface SaveData {
  version: 1;
  /** The snack bank. */
  coins: number;
  upgrades: Record<UpgradeId, number>;
  skin: string;
  ownedSkins: string[];
  /** Best first, at most `PROGRESSION.highScores` entries. */
  highScores: HighScore[];
  stats: LifetimeStats;
  /** Unlocked achievements: id -> UTC day. */
  achievements: Record<string, string>;
}

export function emptyStats(): LifetimeStats {
  return {
    runs: 0,
    meters: 0,
    snacks: 0,
    takedowns: 0,
    nearMisses: 0,
    laneChanges: 0,
    coinsEarned: 0,
    bestScore: 0,
    bestMeters: 0,
    bestAir: 0,
    bestChain: 0,
  };
}

export function emptySave(): SaveData {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) upgrades[id] = 0;
  return {
    version: 1,
    coins: 0,
    upgrades,
    skin: DEFAULT_SKIN,
    ownedSkins: [DEFAULT_SKIN],
    highScores: [],
    stats: emptyStats(),
    achievements: {},
  };
}

const num = (v: unknown, min = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REASONS: readonly string[] = ['fuel', 'time', 'wreck'];

/** Turn anything into a valid save: unknown fields dropped, numbers clamped, lists trimmed. */
export function sanitizeSave(raw: unknown): SaveData {
  const out = emptySave();
  if (!isObject(raw)) return out;

  out.coins = Math.floor(num(raw.coins));
  if (isObject(raw.upgrades)) {
    for (const id of UPGRADE_IDS) {
      out.upgrades[id] = Math.min(PROGRESSION.upgrades[id].max, Math.floor(num(raw.upgrades[id])));
    }
  }
  if (Array.isArray(raw.ownedSkins)) {
    for (const id of raw.ownedSkins) {
      if (typeof id === 'string' && SKINS.some((s) => s.id === id) && !out.ownedSkins.includes(id)) out.ownedSkins.push(id);
    }
  }
  if (typeof raw.skin === 'string' && out.ownedSkins.includes(raw.skin)) out.skin = raw.skin;

  if (Array.isArray(raw.highScores)) {
    const list: HighScore[] = [];
    for (const e of raw.highScores) {
      if (!isObject(e) || typeof e.date !== 'string' || !DAY.test(e.date)) continue;
      list.push({
        score: Math.floor(num(e.score)),
        meters: Math.floor(num(e.meters)),
        snacks: Math.floor(num(e.snacks)),
        date: e.date,
        reason: typeof e.reason === 'string' && REASONS.includes(e.reason) ? (e.reason as EndReason) : null,
      });
    }
    out.highScores = list.sort((a, b) => b.score - a.score).slice(0, PROGRESSION.highScores);
  }
  if (isObject(raw.stats)) {
    for (const k of Object.keys(out.stats) as (keyof LifetimeStats)[]) out.stats[k] = num(raw.stats[k]);
  }
  if (isObject(raw.achievements)) {
    for (const [id, day] of Object.entries(raw.achievements)) {
      if (typeof day === 'string' && DAY.test(day)) out.achievements[id] = day;
    }
  }
  return out;
}

export function loadSave(store: KeyValueStore): SaveData {
  try {
    const text = store.getItem(PROGRESSION.saveKey);
    return text ? sanitizeSave(JSON.parse(text)) : emptySave();
  } catch {
    return emptySave();
  }
}

/** Returns false when the browser refused the write (full, blocked); progress then lasts until the page closes. */
export function writeSave(store: KeyValueStore, save: SaveData): boolean {
  try {
    store.setItem(PROGRESSION.saveKey, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ---- the garage -------------------------------------------------------------------------------

/** Coins for the NEXT level of an upgrade, or null when it is maxed. Level n costs base * growth^n (to the nearest 5). */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = PROGRESSION.upgrades[id];
  if (level >= u.max) return null;
  return Math.round((u.cost * Math.pow(u.growth, level)) / 5) * 5;
}

/** Buys the next level of an upgrade. Returns false if it is maxed or the bank is short. */
export function buyUpgrade(save: SaveData, id: UpgradeId): boolean {
  const cost = upgradeCost(id, save.upgrades[id]);
  if (cost === null || save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[id]++;
  return true;
}

/** Buys a paint job and puts it on. Returns false if owned already or the bank is short. */
export function buySkin(save: SaveData, id: string): boolean {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin || save.ownedSkins.includes(id) || save.coins < skin.cost) return false;
  save.coins -= skin.cost;
  save.ownedSkins.push(id);
  save.skin = id;
  return true;
}

/** Puts on a paint job you own. */
export function equipSkin(save: SaveData, id: string): boolean {
  if (!save.ownedSkins.includes(id)) return false;
  save.skin = skinById(id).id;
  return true;
}

/** The run multipliers for the upgrades bought so far. */
export function perksFor(save: SaveData): Perks {
  const u = PROGRESSION.upgrades;
  return {
    tank: 1 + u.tank.perLevel * save.upgrades.tank,
    burn: 1 - u.efficiency.perLevel * save.upgrades.efficiency,
    damage: 1 - u.armor.perLevel * save.upgrades.armor,
  };
}

export { NO_PERKS };

// ---- runs --------------------------------------------------------------------------------------

/** Coins a run earns. */
export function coinsForRun(s: RunSummary): number {
  const C = PROGRESSION.coins;
  const base =
    s.snacks * C.perSnack +
    s.meters / C.meters +
    s.checkpoints * C.perCheckpoint +
    s.takedowns * C.perTakedown +
    s.nearMisses * C.perNearMiss;
  return Math.floor(base);
}

export interface RunResult {
  coins: number;
  /** 1-based place in the high-score table, or null if it did not make the table. */
  rank: number | null;
  newBestScore: boolean;
  newBestMeters: boolean;
}

/** Banks a finished run: coins, lifetime stats and the high-score table. */
export function recordRun(save: SaveData, s: RunSummary, day: string): RunResult {
  const st = save.stats;
  const newBestScore = s.score > st.bestScore;
  const newBestMeters = s.meters > st.bestMeters;
  const coins = coinsForRun(s);

  save.coins += coins;
  st.runs++;
  st.meters += s.meters;
  st.snacks += s.snacks;
  st.takedowns += s.takedowns;
  st.nearMisses += s.nearMisses;
  st.laneChanges += s.laneChanges;
  st.coinsEarned += coins;
  st.bestScore = Math.max(st.bestScore, s.score);
  st.bestMeters = Math.max(st.bestMeters, s.meters);
  st.bestAir = Math.max(st.bestAir, s.bestAir);
  st.bestChain = Math.max(st.bestChain, s.bestChain);

  const entry: HighScore = {
    score: s.score,
    meters: s.meters,
    snacks: s.snacks,
    date: day,
    reason: s.endReason,
  };
  // The newest run goes below older runs with the same score.
  const at = save.highScores.findIndex((h) => h.score < entry.score);
  save.highScores.splice(at === -1 ? save.highScores.length : at, 0, entry);
  const rank = at === -1 ? save.highScores.length : at + 1;
  save.highScores = save.highScores.slice(0, PROGRESSION.highScores);

  return {
    coins,
    rank: rank <= PROGRESSION.highScores ? rank : null,
    newBestScore,
    newBestMeters,
  };
}
