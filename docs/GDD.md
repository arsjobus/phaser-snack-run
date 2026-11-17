# Game Design Document (one page)

**Working title:** 4x4 Snack Run
**Genre:** Side-view endless runner / physics racer
**Platform:** Browser (desktop first, mobile later)
**Inspiration:** A late-90s Flash/Shockwave-era 4x4 racing game (reference only; nothing is copied).

## Pillars

1. **Instantly readable:** one hand, three inputs (gas, brake, lean).
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

## Controls (Phase 1)

| Key   | Action                                |
| ----- | ------------------------------------- |
| → / D | Gas                                   |
| ← / A | Brake, then reverse                   |
| ↑ / W | Lean back (nose up)                   |
| ↓ / S | Lean forward (nose down)              |
| R     | Reset upright                         |
| T     | Toggle auto-gas (endless-runner mode) |
| H     | Debug overlay                         |

## Out of scope for v1

Online multiplayer, 3D, licensed music, real-brand assets.
