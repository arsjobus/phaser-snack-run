# Asset Register

Every asset in the game must be listed here with its source and licence.

| Asset                                  | Type    | Source                                        | Licence         | Notes                                          |
| -------------------------------------- | ------- | --------------------------------------------- | --------------- | ---------------------------------------------- |
| Sky, clouds, hills, tree lines, bushes | Texture | Generated in code (`src/scenes/BootScene.ts`) | Project licence | Placeholder; replaced in Phase 5               |
| Truck body, wheel                      | Texture | Generated in code (`src/scenes/BootScene.ts`) | Project licence | Placeholder; replaced in Phase 5               |
| Snack box ("Crunch Crackers"), fuel can, start gate | Texture | Generated in code (`src/scenes/BootScene.ts`) | Project licence | Original designs; placeholder until Phase 5    |
| HUD bar, dials, logo plate ("CRUNCH 4x4") | UI      | Drawn in code (`src/game/Hud.ts`)             | Project licence | Original layout inspired by the reference's four-gauge bar; no brand marks |
| Rival trucks (4 liveries with number plates), wrecks, wrench | Texture | Generated in code (`src/scenes/BootScene.ts`) | Project licence | Original designs (wrecks reuse the rival bodies upside down); placeholder until Phase 5 |
| Bump, wrench and takedown sounds | Audio | Synthesized at runtime (`src/game/Beeper.ts`) | Project licence | Oscillator tones, no samples; replaced in Phase 6 |
| Checkpoint gate                        | Texture | Generated in code (`src/scenes/BootScene.ts`) | Project licence | Original design; placeholder until Phase 5     |
| Warning beeps, checkpoint chime        | Audio   | Synthesized at runtime (`src/game/Beeper.ts`) | Project licence | Oscillator tones, no samples; replaced in Phase 6 |
| Music                                  | Audio   | _none yet_                                    | n/a             | Phase 6: recompose or license (see roadmap §3) |

## Rules

- **No real-brand assets.** The game uses an original snack brand (working name: _Crunch Crackers_). No logos, names or trade dress from the original game's sponsor.
- **The original game is reference only.** Its code, sprites and audio are still copyrighted. Recreate everything.
- **Music:** a remix is still a derivative of the original composition. Recompose in the same style, or get permission.
