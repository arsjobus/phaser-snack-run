# Game art (SVG)

The game's editable SVG source files live in `src/art/assets/` and are loaded directly by Vite.

| Folder      | What is in it                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| `vehicles/` | truck bodies (`player-<paint>.svg`, `rival-<number>-<kind>.svg`), `tire.svg`, `show-car-N.svg` |
| `pickups/`  | `snack.svg`, `fuel-can.svg`, `wrench.svg`                                     |
| `hazards/`  | `rock-N`, `boulder-N`, `log-N`, `tires-N` (N = 0..2, the variants)            |
| `props/`    | start gate, checkpoint gate, biome gate, pyro stand, boost arch               |

## Rules for editing

- **Keep `width`, `height` and `viewBox` as they are.** A sprite's origin and anchor in the game depend on its size
  (a truck's chassis centre is at 72, 88 inside the 144 x 136 file; the tire is centred in its square).
- File names determine the texture key used by the game; preserve established names when editing.
- Sprites are drawn at 1 SVG unit = 1 logical game pixel, facing right.
- The SVG files are the sole source of truth for these sprites.
