# UI art plan (Phase 8.5)

Goal: every menu looks like it belongs to the same racing game as the trucks, the road and the HUD.

## Look
- **Flat and outlined**, like the trucks and the road: solid colours, a dark outline (`UI.outline`), no gradients. Depth comes from one lighter flat band on the top third of a shape.
- **Palette** is the HUD's: navy (`0x14224a`), panel navy (`0x0b1230`), steel-blue rim (`0x8fa4d6`), the logo plate's yellow (`0xf2c200`), flag red, a green for money and good news, cyan for headings.
- **Racing motifs:** a yellow/black hazard strip under every title bar, a checkered-flag strip along the bottom, riveted steel-rimmed panels, gold/silver/bronze medals for the podium, square level pips, and the logo plate for the game's name.

## Type
- Primary (display): **Russo One**, for titles, buttons and big numbers.
- Secondary (text): **Rajdhani** semi-bold/bold, for labels, descriptions and tables.
- Both are SIL OFL 1.1 (free to use and bundle, not public domain). Fonts are named only in `src/ui/Fonts.ts`; swap them there.

## Kit (`src/ui/`)
`Theme.ts` (palette, text styles, hazard/checker geometry, all pure and tested), `Ui.ts` (flat backdrop, top bar, bottom bar, panel, button, row plate, rank badge, pips, logo plate), `Fonts.ts`, `MenuModel.ts`.

## Screens
| Screen | Built from |
| --- | --- |
| Start (`MenuScene`) | the real forest scenery and truck lineup, logo plate, four buttons: Play, Garage, Settings, Credits |
| Garage and high scores | top bar, tab buttons, row plates, pips, rimmed score table with medals and a lifetime panel |
| Settings | two columns of row plates: sound and screen, keys |
| Credits | logo plate and a rimmed panel (text in `src/credits.ts`) |
| Game over | rimmed panel, medal table with this run highlighted, five buttons |

## Next
Real UI sprites (nine-slice panels, button art) can replace the drawn ones inside `Ui.ts` without touching the scenes.
