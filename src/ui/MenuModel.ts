/** What the start screen offers, in order (see `src/ui/` for how it is drawn). */
export const MENU_ITEMS = [
  { id: 'play', text: 'PLAY', hint: 'ENTER', accent: 0xf2c200 },
  { id: 'garage', text: 'GARAGE', hint: 'G', accent: 0x9be0ff },
  { id: 'settings', text: 'SETTINGS', hint: 'O', accent: 0x7dff8a },
  { id: 'credits', text: 'CREDITS', hint: 'C', accent: 0xffb36b },
] as const;
export type MenuId = (typeof MENU_ITEMS)[number]['id'];
