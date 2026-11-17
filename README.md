# 4x4 Snack Run

An endless-runner redux of a classic Flash-era 4x4 racer. Muddy tracks, big trucks, ramps, snacks and fuel.

**Status:** Phase 0 (setup) and Phase 1 (core driving prototype) are done. See [`roadmap.md`](roadmap.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload             |
| `npm run build`     | Typecheck + production build to `dist/`     |
| `npm run preview`   | Serve the production build                  |
| `npm test`          | Headless physics and terrain tests (Vitest) |
| `npm run lint`      | ESLint                                      |
| `npm run typecheck` | TypeScript only                             |
| `npm run format`    | Prettier                                    |

## Controls

→/D gas · ←/A brake/reverse · ↑/W lean back · ↓/S lean forward · R reset · T auto-gas · H debug overlay

Add `?seed=anything` to the URL for a repeatable course (used later for daily challenges).

## What's in Phase 1

- Infinite, seeded terrain built from chunks: flats, hills, washboard, kicker ramps and tabletops. Difficulty ramps with distance.
- Truck physics: spring/damper suspension at each wheel, 4WD drive, brake/reverse, pitch control, hard body contacts, airtime detection.
- Four-layer parallax (clouds, hills, trees, bushes) with seamless tiling.
- Follow camera with look-ahead and smoothed vertical tracking.
- Procedural placeholder art, so there are no binary assets in the repo.

## Layout

```
src/
  config.ts            all tuning values (gravity, suspension, engine, camera...)
  main.ts              Phaser bootstrap
  game/
    Terrain.ts         infinite heightfield + chunk generator
    TruckPhysics.ts    pure-TS rigid body (no Phaser), unit-tested
    TruckView.ts       placeholder visuals
    Parallax.ts        tiling background layers
    Input.ts, Rng.ts
  scenes/
    BootScene.ts       generates placeholder textures
    GameScene.ts       loop, camera, HUD, input
tests/                 Vitest: terrain + physics
docs/GDD.md            one-page design doc
ASSETS.md              asset and licence register
```

## Tuning the feel

Everything lives in `src/config.ts`. The physics runs at a fixed 240 Hz (4 substeps per frame) so the stiff suspension stays stable. If you change `springK`/`springC`, run `npm test` to catch regressions.

## Legal

Original branding only; the original game is reference material. Read `ASSETS.md` before adding any asset or music.

## Deploy

Push to `main`: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages (enable Pages → Source: GitHub Actions in repo settings). The build uses a relative base path, so the `dist/` folder also works on itch.io as-is.
