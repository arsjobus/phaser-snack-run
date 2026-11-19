# 4x4 Snack Run

An endless-runner redux of a classic Flash-era 4x4 racer. Muddy tracks, big trucks, ramps, snacks and fuel.

**Status:** Phases 0 to 4 are done: setup, core driving, fuel/snacks/scoring, the HUD with checkpoints, and now rivals, collisions and wrecks. That makes it a playable alpha. See [`roadmap.md`](roadmap.md).

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

←/A brake/reverse · ↑/W lean back · ↓/S lean forward · →/D gas · R reset upright · T toggle auto-gas · M mute · H debug overlay · SPACE/ENTER/tap restart after game over

Auto-gas is **on** by default (endless-runner mode: the truck drives itself, you brake and lean). Flip `GAMEPLAY.autoGas` in `src/config.ts` or press T for manual throttle.

Add `?seed=anything` to the URL for a repeatable course (used later for daily challenges).

## What's in Phase 4

- **Rivals:** up to three numbered, colour-coded trucks (#3 red, #8 blue, #5 black, #7 green). They are the same rigid body as your truck, so they bump, jump ramps (and level out in the air) and flip for real. Two wait just past the start line; more arrive every 800 m, some from behind at speed.
- **Rubber banding:** each rival cruises at a skill-based speed, speeds up when behind you and eases off when far ahead, so the pack stays in view without teleporting.
- **Depth lanes:** like the original's pseudo-3D track, rivals use a near lane (yours) and a far lane (drawn higher, smaller, darker). Only same-lane trucks collide. A rival drops into your lane only when clear of your truck and, if ahead, at least 480 px up the road so you see it coming.
- **Collisions:** trucks are three body circles with impulse-based bumps. Below 170 px/s closing speed a bump is free; above it you take 10-25% damage (rivals take 2.5x). Full damage ends the run (`WRECKED`). Hard hits shake the screen; a damaged truck smokes.
- **Wrecks:** rivals that take too much damage or sit on their roof for 1.4 s become wrecks. Roadside hulks appear from 250 m (never right after a jump). A wreck is hit once, then flung away as debris, so it can never trap you. **Brake and creep into one to clear it for free.**
- **Wrench:** lies on the ground (first at 400 m, then every 450-800 m) and repairs 30% damage. Missing one does not break your combo.
- **Takedown:** wreck a rival you rammed within 3 s for +500 BONUS.
- **Draft:** tuck in within 260 px behind a rival in your lane for up to +45% engine force and +12% top speed (speed streaks and a `DRAFT` tag show it).
- **Race position:** `POS 2/4` at the top right.
- Tests cover collision maths and damage, wreck placement and one-hit behaviour, wrench placement and repair, lane rules, drafting, takedown credit, and long simulated runs.

## What's in Phase 3

- **HUD:** logo plate, then **Fuel** and **Damage** half-dials with sprung needles (a little lag and overshoot), the **C.P. / Time** readout with a progress bar to the next gate, **Distance** (plus km/h), **Score / Bonus** and the combo.
- **Low fuel:** below 25% the dial rim and title blink and the game beeps once per blink (synthesized with Web Audio, no files; M mutes). The tank runs dry: the rim stays red.
- **Checkpoints:** a gate every 1,000 m (each segment 150 m longer). The clock gives each segment `length / 8 m/s`, the time left carries over, and reaching a gate adds the next segment's time, +15% fuel and a BONUS payout. Confetti, a flash, a chime, a banner and a gold-flashing clock panel celebrate it.
- **Time up:** the clock hitting zero ends the run (`TIME UP`). Set `CHECKPOINT.timeoutEndsRun` to `false` in `src/config.ts` to make the clock cosmetic. The game-over panel now names the reason and counts checkpoints.
- **Damage:** the dial is live but nothing hurts the truck until Phase 4. `RunModel.hurt()` / `repair()` are the hooks; full damage ends the run (`WRECKED`).
- Tests cover the gauge maths, needle spring, checkpoint spacing and clock, the carry-over rules, and the run-level payouts and end reasons.

## What's in Phase 2

- **Fuel:** the tank drains continuously, faster at speed and further into the run (but it costs *less per metre* when you drive fast, so speed is rewarded). Cans restore 35%. The spawner guarantees each gap is crossable at a slow reference pace, so a missed can is the danger, not bad luck.
- **Snacks:** a starter line, then lines on flats and hills, and arcs over every ramp and table. Ground lines are free; arcs need a real jump.
- **Score:** snacks x combo (up to x8; the chain breaks when a pickup slips past), distance points, and a separate air-time BONUS tally, like the original's SCORE/BONUS.
- **Game over:** at an empty tank the engine cuts and the truck coasts (a can in reach can still save it). The run ends once it stops or after 5 s. SPACE/ENTER/tap restarts instantly.
- **Look:** closer to the reference screenshots: round-tree backdrop, rutted mud, a start gate, a lifted yellow SUV, and the bottom-bar HUD with a logo plate. Still all procedural placeholder art.
- Tests cover fuel, scoring, pickup placement (determinism, reachability) and a full simulated run with the real physics.

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
    Terrain.ts         infinite heightfield + chunk generator (records pieces for spawners)
    TruckPhysics.ts    pure-TS rigid body (no Phaser), unit-tested
    TruckView.ts       placeholder visuals
    Fuel.ts            tank + drain model (pure TS)
    Score.ts           score, combo, air bonus (pure TS)
    Pickups.ts         snack and fuel-can placement (pure TS)
    Run.ts             one run: ties the above together, loss condition (pure TS)
    Hud.ts             bottom-bar HUD (dials, clock, score)
    HudModel.ts        gauge angles, clock format, blink/beep timing, needle spring (pure TS)
    Checkpoint.ts      checkpoint spacing and countdown clock (pure TS)
    Damage.ts          damage meter (pure TS)
    Collision.ts       circle contacts, impulses, damage curve (pure TS)
    Wrecks.ts          roadside and rival wrecks, one-hit debris (pure TS)
    Rival.ts           rival truck + AI, lanes, liveries (pure TS)
    Race.ts            rival spawning, bumps, takedowns, draft, position (pure TS)
    RivalView.ts       rival visuals (far lane is higher/smaller/darker)
    Beeper.ts          synthesized warning beeps and chime
    Parallax.ts        tiling background layers
    Input.ts, Rng.ts
  scenes/
    BootScene.ts       generates placeholder textures
    GameScene.ts       loop, camera, HUD, input
tests/                 Vitest: terrain, physics, fuel, score, pickups, run, HUD, checkpoints, race
docs/GDD.md            one-page design doc
ASSETS.md              asset and licence register
```

## Tuning the feel

Everything lives in `src/config.ts` (including `FUEL`, `SCORING`, `PICKUPS`, `CHECKPOINT`, `COLLISION`, `WRECKS`, `WRENCH` and `RIVALS`). The physics runs at a fixed 240 Hz (4 substeps per frame) so the stiff suspension stays stable. If you change `springK`/`springC`, run `npm test` to catch regressions.

## Legal

Original branding only; the original game is reference material. Read `ASSETS.md` before adding any asset or music.

## Deploy

Push to `main`: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages (enable Pages → Source: GitHub Actions in repo settings). The build uses a relative base path, so the `dist/` folder also works on itch.io as-is.
