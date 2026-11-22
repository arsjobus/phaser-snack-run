# Asset Register

Every asset in the game must be listed here with its source and licence.

| Asset                                  | Type    | Source                                        | Licence         | Notes                                          |
| -------------------------------------- | ------- | --------------------------------------------- | --------------- | ---------------------------------------------- |
| Sky, clouds, hills, tree lines, bushes (x4 biomes: forest, desert, snow, swamp) | Texture | Generated in code (`src/art/backdrops.ts`) | Project licence | Original art |
| Player truck, wheel, 32-frame rotation strips | Texture | Generated in code (`src/art/trucks.ts`, `src/art/props.ts`) | Project licence | Original art |
| Snack box ("Crunch Crackers"), fuel can, wrench, start gate | Texture | Generated in code (`src/art/props.ts`) | Project licence | Original designs; lettering from the built-in pixel font (`src/art/pixelFont.ts`) |
| HUD bar, dials, logo plate ("CRUNCH 4x4") | UI      | Drawn in code (`src/game/Hud.ts`)             | Project licence | Original layout inspired by the reference's four-gauge bar; no brand marks |
| Rival trucks (6 body styles with number plates), wrecks | Texture | Generated in code (`src/art/trucks.ts`) | Project licence | Original designs (wrecks reuse the rival bodies upside down) |
| Bump, wrench, takedown, pickup, landing, engine and game-over sounds | Audio | Synthesized at runtime (`src/audio/AudioSystem.ts`) | Project licence | Oscillators and filtered noise, no samples |
| Obstacles: rocks, boulders, logs and a tire stack (3 variants each) | Texture | Generated in code (`src/art/props.ts`) | Project licence | Original designs |
| Player paint jobs (5 skins) | Texture | Generated in code (`src/art/trucks.ts`, colours in `src/progress/Skins.ts`) | Project licence | Recolours of the original SUV design |
| Lane-change swish and reward chime | Audio | Synthesized at runtime (`src/audio/AudioSystem.ts`) | Project licence | Filtered noise and oscillator tones, no samples |
| Checkpoint gates (normal and biome-change) | Texture | Generated in code (`src/art/props.ts`) | Project licence | Original design |
| Warning beeps, checkpoint chime and stinger | Audio | Synthesized at runtime (`src/audio/AudioSystem.ts`) | Project licence | Oscillator tones, no samples |
| Road detail (ruts, pebbles, stones, clods, cracks, puddles, ripples, glints), monster-truck tires and undercarriage | Texture | Drawn in code (`src/game/GroundPainter.ts`, `src/art/props.ts`, `src/art/trucks.ts`) | Project licence | Original art |
| Touch buttons, settings screen | UI | Drawn in code (`src/input/TouchView.ts`, `src/scenes/SettingsScene.ts`) | Project licence | No external assets |
| Music (adaptive theme: pad, drums, bass, lead stems) | Audio | Composed for this project (`src/audio/Composition.ts`), synthesized at runtime | Project licence | Original composition (A minor, 132 bpm, Am-F-G-E). Not derived from the original game's music; no samples |

## Rules

- **No real-brand assets.** The game uses an original snack brand (working name: _Crunch Crackers_). No logos, names or trade dress from the original game's sponsor.
- **The original game is reference only.** Its code, sprites and audio are still copyrighted. Recreate everything.
- **Music:** a remix is still a derivative of the original composition. Recompose in the same style, or get permission.
