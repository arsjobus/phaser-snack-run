# Game Design Document (one page)

**Working title:** 4x4 Snack Run
**Genre:** Side-view endless runner / physics racer
**Platform:** Browser (desktop first, mobile later)
**Inspiration:** A late-90s Flash/Shockwave-era 4x4 racing game (reference only; nothing is copied).

## Pillars

1. **Instantly readable:** one hand, three inputs (gas, brake, and Up/Down to drift across the field).
2. **Fuel is the clock:** every run is a question of how far the next can is.
3. **Rivals are the personality:** numbered, colour-coded trucks that bump, jump and wreck.
4. **Nostalgic look, modern feel:** chunky colours, 60 fps, instant restarts.

## Core loop

Drive → grab snacks and fuel → dodge or bump rivals → hit ramps for air → survive longer → bank score → upgrade.

## Reference notes (from the original's screenshots)

- Side view, painted parallax backdrop (sky, clouds, tree line), rutted dirt track, checkered start gate.
- Bottom HUD with four gauges: Fuel/Damage, Checkpoint time, Distance, Score/Bonus.
- Pickups on the track: snack box (score), wrench (repair).
- Hazards: wrecked vehicles, dirt ramps that launch trucks and rivals.
- Palette: saturated greens/blues, warm browns, yellow/red/black/blue trucks.

## Controls

| Key   | Action                                |
| ----- | ------------------------------------- |
| → / D | Gas (hold it: there is no auto-gas)   |
| ← / A | Brake, then reverse                   |
| ↑ / W (or Q) | Hold: drift away from the camera, through the depth field |
| ↓ / S (or E) | Hold: drift towards the camera |
| R     | Reset upright                         |
| Space / Enter / tap | Restart after game over |
| G     | Garage (from the game-over screen)    |
| M     | Mute all sound                        |
| N     | Music on/off                          |
| H     | Debug overlay                         |

## Out of scope for v1

Online multiplayer, 3D, licensed music, real-brand assets.
