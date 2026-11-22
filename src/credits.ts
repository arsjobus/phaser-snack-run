/**
 * Everything the credits screen shows. Edit this file to change it: names go in `TEAM`, third-party
 * pieces in `THANKS` (every entry must also be in ASSETS.md).
 */
export interface CreditLine {
  role: string;
  names: string[];
}

export const GAME_TITLE = 'CRUNCH 4x4 SNACK RUN';

/** The people who made the game. */
export const TEAM: readonly CreditLine[] = [
  { role: 'GAME DESIGN AND CODE', names: ['arsjobus'] },
  { role: 'ART, MUSIC AND SOUND', names: ['Made in code for this project'] },
];

/** Third-party pieces and what they are licensed under. */
export const THANKS: readonly CreditLine[] = [
  { role: 'ENGINE', names: ['Phaser 3 (MIT)'] },
  { role: 'DISPLAY FONT', names: ['Russo One by Jovanny Lemonad (SIL OFL 1.1)'] },
  { role: 'TEXT FONT', names: ['Rajdhani by Indian Type Foundry (SIL OFL 1.1)'] },
  { role: 'INSPIRED BY', names: ['The late-90s Flash 4x4 racing games'] },
];

/** All lines in order, for the scrolling credits. */
export const ALL_CREDITS: readonly CreditLine[] = [...TEAM, ...THANKS];
