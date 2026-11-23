# 4x4 Snack Run

An endless-runner redux of a classic Flash-era 4x4 racer. Muddy tracks, big trucks, ramps, snacks and fuel.

**Status:** Phases 0 to 7.5, Phase 9 (the monster-truck show), Phase 9.5 (feedback) and the code half of Phase 8 are done (touch, gamepad, remappable keys, settings, performance, a road art pass and lifted monster trucks); playtests and the itch.io release remain. Phases 0 to 7 were: setup, core driving, fuel/snacks/scoring, the HUD with checkpoints, rivals, collisions and wrecks, the art pass, audio, and now depth lanes with obstacles plus progression (a garage, high scores, a daily challenge and achievements). See [`roadmap.md`](roadmap.md).

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

→/D gas (**hold it: there is no auto-gas**; let go and engine braking slows you down) · ←/A brake/reverse · **↑/W and ↓/S: hold to drift away from / towards the camera through the depth field** (Q/E also work) · R reset upright · M mute all · N music on/off · H debug overlay · SPACE/ENTER/tap restart after game over · **G** garage and **D** daily challenge / free run (game-over screen)

**Gamepad:** RT/A/stick right gas (triggers are analog) · LT/B/X/stick left brake · stick or D-pad up/down drift · Start/A restart · Y garage · Back settings · LB reset · RB music. **Touch:** GAS, BRAKE and ▲/▼ buttons appear on touch devices. **O** opens the settings (also from the garage) where every driving key can be rebound.

There is no air control and no lean: the arrow keys steer through the field instead, and a gentle passive assist levels the truck in the air so it lands on its wheels.

Add `?seed=anything` to the URL for a repeatable course.

## What's in Phase 9 (the monster-truck show)

Before every second checkpoint (the biome borders: 2nd, 4th, 6th...) the last tenth of the segment is a stage:

- **Boost pads:** four on the flat, three up the ramp face, across the whole field (every lane). Each pad kicks the truck along the road and refreshes a **surge**: 1.8x engine force, 1.18x top speed. While it lasts the gas is forced on, the brake is dead and a stabiliser holds the truck level on the ground, so it cannot wheelie or flip. Rivals use the pads too.
- **No clutter:** the stage has no obstacles, wrecks, cans or wrenches, and no new rivals spawn on or just before it. A snack line runs along the pads and a long arc over the pit follows the real flight path.
- **The big ramp:** 288 px high with a curved face, then a sheer drop onto a pit with four rows of parked cars, and a landing table with a long slope down. Cars are scenery: trucks fly over them.
- **Pyrotechnics:** cold-spark fountains and flame jets on both sides of the road at the top of the launch ramp and of the landing table.
- **CRUNCH in fireworks:** one rocket per letter climbs from the pit, bursts, and its stars glide into a dot-matrix letter that hangs and twinkles above the cars, followed by a finale.
- **Accidents:** every launch adds a seeded random spin (the same for a given `?seed` course), so some jumps flip. Bumps do no damage while surging and for 2.5 s after the landing, and a truck left on its roof is set back on its wheels after 0.9 s.
- **Landing:** +1000 BONUS for clearing the pit, +150 per car, +500 per flip. The surge fades over about a second and the truck is back to its normal top speed for the next biome.
- **Where:** `Stunt.ts` (geometry, pure), `Show.ts` (the run through a stage, pure), `Fireworks.ts` (pure), `StageView.ts` (drawing), `art/show.ts`, tuning in `STUNT` in `config.ts`, tests in `tests/stage.test.ts`.

## Sound effects

Every one-shot effect is an mp3 in `public/audio/` (`snack.mp3`, `fuel.mp3`, `boost.mp3`, `thud-hard.mp3`, ...). To change one, drop your own mp3 over it with the same name (or edit its `file` in `src/audio/sfx.ts`); `volume` in that file is its playback level. The game pitches some of them on the fly: `snack` climbs the scale with the combo, `boost` rises with each pad and `rocket` varies a little. Check the licence of anything you add and list it in `ASSETS.md`. `npm test` fails if a listed file is missing.

## What's in Phase 8.5 (feedback)

- **Flat road:** no gradients; puddles, mud and berms are shapes that follow the terrain and stay on the road.
- **Trucks** have wheel arches cut into a lowered underside; the player's **CRUNCH** badge is centred under the windows.
- **Start screen** (Play, Garage, Settings, Credits) and a credits screen (`src/credits.ts`); a restyled garage, high scores, settings and game over built from one UI kit (`src/ui/`, plan in `docs/ui-art-plan.md`). `?play` skips the start screen.
- **Fonts:** Russo One and Rajdhani (SIL OFL), bundled.

## What's in Phase 8 (platform and polish) and the art pass

- **Controls everywhere:** keyboard (rebindable), gamepad and touch all feed one control state (`src/input/`); they can be mixed. Touch buttons are multi-touch and forgiving (a finger counts a little beyond a button's edge, sliding between buttons works). Nothing held means no throttle on every device.
- **Settings** (`src/scenes/SettingsScene.ts`, saved automatically): volumes, screen shake, reduced motion, colour-blind pickups, effects quality, touch controls, key bindings. Dev shortcuts: `/?settings`, `/?art=forest|desert|snow|swamp` (a review page with the whole truck set and pickups on one road).
- **Performance:** pooled sprites and popups, one height lookup per ground column per frame, in-place particle culling, and an adaptive effects governor (below 45 fps for 2.5 s lowers ground detail and particles one step; set Effects quality to Full or Reduced to override it).
- **Road:** a detailed foreground slab, a hazy far field, meandering paired tire ruts with tread, and per-biome pebbles, grit, stones, clods, cracks, puddles, sand ripples and snow glints.
- **Monster trucks:** every vehicle has big tires and a body hoisted on visible axles, shocks and a driveshaft. Driving and flipping feel the same as before.
- Not done (needs people, not code): the 5 to 10 person playtest and the itch.io release.

## What's in Phase 7.5 (playtest feedback)

- **Smooth depth control:** hold ↑/↓ (or W/S) to drift through the field. Depth is continuous (it eases in and out), not a hop between rails; pickups, obstacles and wrecks still sit on whole lanes (`LANES.moveSpeed` / `moveEase` in `src/config.ts`).
- **Other cars are solid:** you cannot slip through a car alongside. A rival or wreck that overlaps you in x stops the drift just short of touching, and pushing into it is a **side-swipe**: you rebound, you take at least 6% damage while moving (more with the speed difference), the rival takes damage, and a rubbed rival that wrecks counts as your takedown (one rub per car per 1.1 s). Rivals' own physics acts on you: a rear-end bump shoves your truck forward.
- **Pickups are grabbed from any depth** by touching the truck, and every pickup, obstacle, wreck and truck now has a **ground shadow** at its own depth (a pickup's shadow tightens as it gets closer to the ground), so you can tell which lane something is in.
- **No auto-gas, no air control:** the truck only drives while you hold →/D, and coasts to a stop (engine braking). Lean is gone; a mild landing assist (`PHYSICS.autoLevelStrength`) keeps the truck landing on its wheels.
- **Track:** one smooth wide dirt field instead of terraces (a gentle gradient with mud patches), and the terrain is a Catmull-Rom spline (smooth to look at and to drive on, no visible vertices). **Grass tufts** are scattered over every lane.
- **Player truck** wears a **CRUNCH** badge like the van.
- **Balance:** less fuel (a can restores 30%, cans spaced at 70% to 95% of one can's range; checkpoints give +10%) and more wrenches (the first at 250 m, then every 220 to 420 m).

## What's in Phase 7 (and depth lanes)

**Depth lanes and obstacles**

- **Four lanes**, like the original's wide dirt field: lane 0 is nearest the camera, each lane further away is drawn 15 px higher, 6% smaller and darker, and the ground is a set of terraces stepping up and away. Jumps and hills are the same in every lane. You start in lane 1.
- **Change depth** by holding **↑/W** (further away) or **↓/S** (nearer) (Phase 7.5: it used to be one lane per Q/E press). Only things in (nearly) the same lane touch, so cutting across a lane with a rival or an obstacle in it is a sideswipe. The lane radar under `POS` shows your lane, rivals, wrecks and obstacles ahead.
- **Obstacles** (`src/game/Obstacles.ts`): **rocks** and **tire stacks** are knocked loose when hit (a rock hurts a little, tires only slow you); **logs** and **boulders** stay put: hit one at speed and you stop dead and take damage (a boulder up to 33%). Rows of obstacles never block more than 2 of the 4 lanes (wrecks included), they never sit just after a jump, and snacks, cans and wrenches stay off them. A fixed obstacle can always be passed by switching lanes, so nothing traps a run.
- **Close calls:** swerve away from an obstacle at the last moment and drive past it clean for +50 BONUS.
- **Rivals** use all four lanes: they dodge wrecks and obstacles with a chance that rises with skill (a careless rival just drives into the rock and may wreck itself), get out of the way when they are stuck, and only move into your lane (or the one you are heading for) when they are clear of your truck and, if ahead, far enough up the road to be seen.
- **Pickups** sit in lanes: snack trails wander one lane at a time, so following one means a lane change now and then; fuel cans stay in the two middle lanes. Since Phase 7.5 any pickup can be grabbed from any depth.

**Progression** (`src/progress/`, all saved in `localStorage`; if it is blocked the game keeps progress in memory for the session)

- **Coins ("snack bank", shown with a snack-coin icon):** 2 per snack, 1 per 25 m, 15 per checkpoint, 10 per takedown, 2 per close call.
- **Garage** (press **G** on the game-over screen): upgrade **tank size** (+20% capacity per level), **fuel efficiency** (-7% burn) and **damage resistance** (-8% damage), 5 levels each, and buy **paint** (5 skins). ←/→ switch tab, ↑/↓ pick, ENTER buys or equips, SPACE drives; clicks and taps work too. Upgrades cost 330 / 260 / 310 coins for the first level and 1.8x more for each next one; paint costs 500 to 1,500. Unlocking everything is about 100 typical runs.
- **High scores:** a top-10 table (shown on the game-over screen and in the garage) plus lifetime stats (runs, distance, best air, best chain, ...).
- **Achievements:** 14 of them with coin rewards (a 10-snack combo, hang time, 2 km without damage, 5 takedowns, 25 lane changes, 10 close calls, ...), unlocked with a toast mid-run and listed in the garage.
- Tests cover save loading and sanitising (including corrupt data and a throwing store), upgrade pricing and perks, banking runs, the score table, determinism, and the achievements.

## What's in Phase 6

Music is `public/audio/bgm.mp3`, and every one-shot sound effect is its own mp3 in `public/audio/` (the list, with a playback volume for each, is `src/audio/sfx.ts`), so you can edit or swap any of them: replace the file, keep the name, reload. Only the engine hum and mud-roll hiss are still synthesized at runtime (Web Audio), since they follow your speed. `scripts/make-sfx.py` regenerates the original effects. Browsers keep audio locked until the first key press or tap, so the music starts then. `M` mutes everything, `N` just the music.

- **Score:** an original theme (`src/audio/Composition.ts`): a funky big-beat groove in A minor at 132 bpm over Am-F-G-E, four stems (pad, drums, bass, lead). It is **not** a remix of the original game's music (see roadmap §3, path 1: recompose).
- **Adaptive mix** (`src/audio/Mix.ts`, tuned in `AUDIO` in `src/config.ts`): the pad is always on; drums fade in with speed, then bass; the lead joins at high speed or from combo x2 (full at x5). Stems swell over about half a second rather than switching. A checkpoint plays a bright stinger in the current key; each biome transposes the theme (0, +2, -2, +3 semitones) at the next 4-bar loop start so chords never clash.
- **Low fuel:** below 25% a lowpass closes on the music (dry tank: muffled) and a soft lub-dub heartbeat starts, alongside the dial's warning beep.
- **Engine:** two oscillators (saw + sub square) pitched by speed and throttle, revving higher in the air, cut when the tank is dry (with a cough), plus a mud-roll hiss that follows ground speed.
- **SFX:** snack chime that climbs a pentatonic scale with the combo, fuel gurgle, wrench, dull knock vs. metal crunch for bumps, landing thump scaled by air time, takedown fanfare, game-over wah.
- **Structure:** the notes are scheduled ahead on the audio clock by a pure `Sequencer` (unit-tested without a browser); `AudioSystem` renders them. A scene restart disposes the old system so nothing doubles up.
- Tests cover the stem thresholds, the low-fuel filter curve, engine and snack pitch, the pattern data, sequencer timing and gating, the heartbeat, loop-aligned transposition and resync after a stall.

## What's in Phase 5

- **Truck set:** the player's yellow SUV plus six rival styles with their own body shapes, wheel sizes and liveries: #3 red SUV, #8 blue pickup (with cracker crates in the bed), #5 black monster truck, #7 green open jeep, #2 orange "CRUNCH" delivery van and #9 purple dune buggy. Each is drawn once into a texture. Pre-rendered rotation strips are built in (`ART.rotationFrames`, e.g. 48), but they are **off by default**: snapping to the nearest angle looked steppy next to the exact wheels, so bodies rotate smoothly. Wheels stay exact and sit in painted wheel wells; tires are knobby with caked mud and a bright spoke so spin reads.
- **Particles:** wheels throw **mud** (sand, slush) and dust back from the ground at speed, landings kick up a dust ring and clods (bigger after long jumps), hard bumps and wrecks burst into sparks, paint-coloured metal chunks and smoke. Mud and chunks land on the terrain and bounce.
- **Tire tracks:** wheels in the near lane leave dark tracks on the crust that stay until they scroll off screen (`FX.tracks`).
- **Biomes:** forest, desert, snowfield, swamp, then round again, switching every 2 checkpoints (`BIOMES.checkpointsPer`). The ground changes exactly at the gate; the five-layer backdrop (sky, clouds, hills/mesas/peaks, trees/cacti/pines/cypress, bushes/scrub/drifts/reeds) cross-fades as the screen centre passes the border. Biomes are visual only: physics and balance are unchanged. The far lane now rides on a raised dirt shelf so rivals there rest on something. A biome-change gate is orange with the new biome's name, and the checkpoint banner says `ENTERING DESERT`.
- **Props:** a 3D "Crunch Crackers" carton, a jerry can with a FUEL label and a start gate whose banner reads START (all lettering is drawn with a built-in 3x5 pixel font).
- Tests cover the biome rotation and segment splitting, rotation-frame lookup, the particle pool, effect rates and colours, and tire-track laying.

## What's in Phase 4

- **Rivals:** up to three numbered, colour-coded trucks (#3 red, #8 blue, #5 black, #7 green, #2 orange, #9 purple). They are the same rigid body as your truck, so they bump, jump ramps (and level out in the air) and flip for real. Two wait just past the start line; more arrive every 800 m, some from behind at speed.
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
    TruckView.ts       player visuals (pre-rendered body frame + spinning wheels)
    Fuel.ts            tank + drain model, with capacity and burn upgrades (pure TS)
    Lanes.ts           depth-lane geometry and the player's lane changes (pure TS)
    Obstacles.ts       rocks, tires, logs, boulders: placement, hits, dodges (pure TS)
    Perks.ts           what garage upgrades do to a run (pure TS)
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
    Parallax.ts        tiling background layers, one set per biome, cross-faded
    Biomes.ts          biome palettes, rotation by checkpoint, ground segments (pure TS)
    Particles.ts       capped particle pool, with homing particles (pure TS)
    Stunt.ts           the Phase 9 stage: layout, terrain offsets, pads (pure TS)
    Show.ts            a run through a stage: pads, cues, launch, landing, grace (pure TS)
    Fireworks.ts       CRUNCH lettering, rockets, shells, fountains (pure TS)
    StageView.ts       draws pads, parked cars, pyro stands and the fireworks
    Effects.ts         mud, dust, landing and crash emitters (pure TS)
    TrackMarks.ts      tire-track segments (pure TS)
    Rotation.ts        nearest pre-rendered rotation frame (pure TS)
    Input.ts, Rng.ts
  audio/               sfx.ts (the sound-effect mp3 list), Composition.ts (the theme), Sequencer.ts + Mix.ts (pure, tested), AudioSystem.ts (Web Audio: music, engine, SFX)
  art/                 procedural art: trucks.ts (6 bodies + rotation strips), backdrops.ts (per biome), props.ts, show.ts (parked cars, pyro stand, boost arch), pixelFont.ts
  progress/            Progress.ts (saves, coins, upgrades, scores), Achievements.ts, Skins.ts, Day.ts, Storage.ts (all pure TS)
  scenes/
    BootScene.ts       builds every texture from src/art
    GameScene.ts       loop, camera, HUD, input
    GarageScene.ts     the garage: upgrades, paint, scores, achievements
tests/                 Vitest: audio, terrain, physics, fuel, score, pickups, run, HUD, checkpoints, race, biomes, particles, tracks, lanes and obstacles, progression
docs/GDD.md            one-page design doc
ASSETS.md              asset and licence register
```

## Tuning the feel

Everything lives in `src/config.ts` (including `FUEL`, `SCORING`, `PICKUPS`, `CHECKPOINT`, `COLLISION`, `WRECKS`, `WRENCH`, `RIVALS`, `LANES`, `OBSTACLES` and `PROGRESSION`). The physics runs at a fixed 240 Hz (4 substeps per frame) so the stiff suspension stays stable. If you change `springK`/`springC`, run `npm test` to catch regressions.

## Legal

Original branding only; the original game is reference material. Read `ASSETS.md` before adding any asset or music.

## Deploy

Push to `main`: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages (enable Pages → Source: GitHub Actions in repo settings). The build uses a relative base path, so the `dist/` folder also works on itch.io as-is.
