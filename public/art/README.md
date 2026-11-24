# Game art (SVG)

Every sprite that used to be drawn only in code is here as an SVG file, so the art can be changed
outside the code (Inkscape, Illustrator, Figma, or a text editor). The game loads these files at
start-up (`src/scenes/BootScene.ts`).

| Folder      | What is in it                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| `vehicles/` | truck bodies (`player-<paint>.svg`, `rival-<number>-<kind>.svg`), `tire.svg`, `show-car-N.svg` |
| `pickups/`  | `snack.svg`, `fuel-can.svg`, `wrench.svg`                                     |
| `hazards/`  | `rock-N`, `boulder-N`, `log-N`, `tires-N` (N = 0..2, the variants)            |
| `props/`    | start gate, checkpoint gate, biome gate, pyro stand, boost arch               |

## Rules for editing

- **Keep `width`, `height` and `viewBox` as they are.** A sprite's origin and anchor in the game depend on its size
  (a truck's chassis centre is at 72, 88 inside the 144 x 136 file; the tire is centred in its square).
- File names are free to change only together with `src/art/manifest.ts`, which maps each file to the
  texture key the game uses.
- Sprites are drawn at 1 SVG unit = 1 logical game pixel, facing right.
- Deleting a file is safe: the game draws that sprite from the code instead.
- `npm run art:export` rewrites **all** these files from the code. Only run it to reset your edits.
