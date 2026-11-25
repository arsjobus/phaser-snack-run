/**
 * State that lasts only as long as the page does (pure TypeScript). It is deliberately never written to
 * the save: a reload starts the game with it off, so a cheat such as god mode cannot carry over into a
 * fresh visit. Scene changes within the page keep it.
 */
let godMode = false;

export function isGodMode(): boolean {
  return godMode;
}

export function setGodMode(on: boolean): void {
  godMode = on;
}
