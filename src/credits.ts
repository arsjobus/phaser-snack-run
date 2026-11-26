/**
 * Everything the credits screen shows. Edit this file to change it: names go in `TEAM`, third-party
 * pieces in `THANKS` (every entry must also be in ASSETS.md).
 */
export interface CreditLine {
  role: string;
  /** Locale key for the role (`credits.role.*`); the English `role` is the fallback. */
  roleKey?: string;
  names: string[];
  /** Locale key for names that are a sentence rather than a proper name. */
  namesKey?: string;
}

export const GAME_TITLE = 'CRUNCH 4x4 | OFF-ROAD RACING';

/** The people who made the game. */
export const TEAM: readonly CreditLine[] = [
  { role: 'GAME DESIGN AND CODE', roleKey: 'credits.role.design', names: ['Alexander Shepherd'] },
  { role: 'ART, MUSIC AND SOUND', roleKey: 'credits.role.art', names: ['Made in code for this project'], namesKey: 'credits.made' },
];

/** Third-party pieces and what they are licensed under. */
export const THANKS: readonly CreditLine[] = [
  { role: 'ENGINE', roleKey: 'credits.role.engine', names: ['Phaser 3 (MIT)'] },
  { role: 'DISPLAY FONT', roleKey: 'credits.role.display', names: ['Russo One by Jovanny Lemonad (SIL OFL 1.1)'] },
  { role: 'TEXT FONT', roleKey: 'credits.role.text', names: ['Rajdhani by Indian Type Foundry (SIL OFL 1.1)'] },
  { role: 'INSPIRED BY', roleKey: 'credits.role.inspired', names: ['The late-90s Flash 4x4 racing games'], namesKey: 'credits.inspired' },
];

/** All lines in order, for the scrolling credits. */
export const ALL_CREDITS: readonly CreditLine[] = [...TEAM, ...THANKS];
