/** What the start screen offers, in order (see `src/ui/` for how it is drawn). */
export const MENU_ITEMS = [
  { id: 'play', key: 'menu.play', text: 'PLAY', hint: 'ENTER', accent: 0xf2c200 },
  { id: 'garage', key: 'menu.garage', text: 'GARAGE', hint: 'G', accent: 0x9be0ff },
  { id: 'settings', key: 'menu.settings', text: 'SETTINGS', hint: 'O', accent: 0x7dff8a },
  { id: 'credits', key: 'menu.credits', text: 'CREDITS', hint: 'C', accent: 0xffb36b },
] as const;
export type MenuId = (typeof MENU_ITEMS)[number]['id'];

/**
 * The start sign on the start screen: it stands at the right, fully in view. `screenX` is its centre on
 * screen, `lane` the depth it stands at (a far lane lifts it clear of the button row), `width` the
 * texture's width.
 */
export const MENU_GATE = { screenX: 880, lane: 3.5, width: 132 } as const;
