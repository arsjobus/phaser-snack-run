import { PROGRESSION } from '../config';
import { SKINS } from './Skins';
import { isGodMode, setGodMode } from './Session';
import { UPGRADE_IDS, type SaveData } from './Progress';

/**
 * Invisible, classic-style cheat codes (pure TypeScript, no Phaser): on the start screen the player
 * taps arrow keys (or the D-pad / left stick) and a correct sequence switches a cheat on. Nothing on
 * screen hints at them. The matcher keeps the last few inputs, so a code works wherever it starts, and
 * no code ends with another, so two can never fire at once.
 */
export type CheatKey = 'U' | 'D' | 'L' | 'R';
export type CheatId = 'god' | 'unlock' | 'coins';

export const CHEAT_CODES: Record<CheatId, readonly CheatKey[]> = {
  /** Up Up Down Down Left Right Left Right (a nod to the classic). Toggles. */
  god: ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R'],
  /** Left Left Right Right Up Down Up Down. */
  unlock: ['L', 'L', 'R', 'R', 'U', 'D', 'U', 'D'],
  /** Down Down Up Up Right Left Right Left. */
  coins: ['D', 'D', 'U', 'U', 'R', 'L', 'R', 'L'],
};

/** What "max coins" puts in the bank. */
export const CHEAT_MAX_COINS = 999_999;

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
  /** For toggles: the new state. */
  on?: boolean;
}

/** Applies a cheat: unlock and max coins change the save (the caller writes it); god mode is session-only. */
export function applyCheat(save: SaveData, id: CheatId): CheatResult {
  switch (id) {
    case 'god':
      // Not saved: this switch lasts for the page only, so a reload turns it off again.
      setGodMode(!isGodMode());
      return { id, on: isGodMode(), message: isGodMode() ? 'GOD MODE ON' : 'GOD MODE OFF' };
    case 'unlock':
      for (const u of UPGRADE_IDS) save.upgrades[u] = PROGRESSION.upgrades[u].max;
      for (const s of SKINS) if (!save.ownedSkins.includes(s.id)) save.ownedSkins.push(s.id);
      return { id, message: 'EVERYTHING UNLOCKED' };
    case 'coins':
      save.coins = Math.max(save.coins, CHEAT_MAX_COINS);
      return { id, message: 'MAX COINS' };
  }
}
