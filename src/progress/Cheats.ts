import { PROGRESSION } from '../config';
import { ACHIEVEMENTS } from './Achievements';
import { dayKey } from './Day';
import { SKINS } from './Skins';
import { isGodMode, setGodMode } from './Session';
import { addCoins, UPGRADE_IDS, type SaveData } from './Progress';

/**
 * Invisible, classic-style cheat codes (pure TypeScript, no Phaser): on the start screen the player
 * taps arrow keys (or the D-pad / left stick) and a correct sequence switches a cheat on. Nothing on
 * screen hints at them. The matcher keeps the last few inputs, so a code works wherever it starts, and
 * no code ends with another, so two can never fire at once.
 */
export type CheatKey = 'U' | 'D' | 'L' | 'R';
export type CheatId = 'god' | 'unlock' | 'coins' | 'achievements';

export const CHEAT_CODES: Record<CheatId, readonly CheatKey[]> = {
  /** Up Up Down Down Left Right Left Right (a nod to the classic). Toggles. */
  god: ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R'],
  /** Left Left Right Right Up Down Up Down. */
  unlock: ['L', 'L', 'R', 'R', 'U', 'D', 'U', 'D'],
  /** Down Down Up Up Right Left Right Left. */
  coins: ['D', 'D', 'U', 'U', 'R', 'L', 'R', 'L'],
  /** Up Down Left Right Up Down Left Right. */
  achievements: ['U', 'D', 'L', 'R', 'U', 'D', 'L', 'R'],
};

/** What "max coins" puts in the bank. */
export const CHEAT_MAX_COINS = PROGRESSION.maxCoins;

const LONGEST = Math.max(...Object.values(CHEAT_CODES).map((c) => c.length));

export class CheatMatcher {
  private buf: CheatKey[] = [];

  /** Feeds one input; returns the cheat it completed, if any. */
  push(key: CheatKey): CheatId | null {
    this.buf.push(key);
    if (this.buf.length > LONGEST) this.buf.shift();
    for (const id of Object.keys(CHEAT_CODES) as CheatId[]) {
      const code = CHEAT_CODES[id];
      if (this.buf.length >= code.length && code.every((k, i) => this.buf[this.buf.length - code.length + i] === k)) {
        this.buf = [];
        return id;
      }
    }
    return null;
  }

  reset(): void {
    this.buf = [];
  }
}

export interface CheatResult {
  id: CheatId;
  /** The words for the toast on the start screen. */
  message: string;
  /** Locale key of the same message (what the game shows). */
  messageKey: string;
  /** For toggles: the new state. */
  on?: boolean;
}

/** Applies a cheat: unlock and max coins change the save (the caller writes it); god mode is session-only. */
export function applyCheat(save: SaveData, id: CheatId): CheatResult {
  switch (id) {
    case 'god':
      // Not saved: this switch lasts for the page only, so a reload turns it off again.
      setGodMode(!isGodMode());
      return { id, on: isGodMode(), message: isGodMode() ? 'GOD MODE ON' : 'GOD MODE OFF', messageKey: isGodMode() ? 'cheat.godOn' : 'cheat.godOff' };
    case 'unlock':
      for (const u of UPGRADE_IDS) save.upgrades[u] = PROGRESSION.upgrades[u].max;
      for (const s of SKINS) if (!save.ownedSkins.includes(s.id)) save.ownedSkins.push(s.id);
      return { id, message: 'EVERYTHING UNLOCKED', messageKey: 'cheat.unlock' };
    case 'coins':
      save.coins = Math.max(save.coins, CHEAT_MAX_COINS);
      return { id, message: 'MAX COINS', messageKey: 'cheat.coins' };
    case 'achievements': {
      const today = dayKey();
      for (const achievement of ACHIEVEMENTS) {
        if (save.achievements[achievement.id]) continue;
        save.achievements[achievement.id] = today;
        addCoins(save, achievement.reward);
      }
      return { id, message: 'ALL ACHIEVEMENTS UNLOCKED', messageKey: 'cheat.achievements' };
    }
  }
}
