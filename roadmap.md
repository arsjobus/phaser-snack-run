# 4x4 Snack Run: Redux Roadmap

> **Status:** Phases 0 to 7.5, 8.5 and the code half of Phase 8 are done (see `README.md`): touch controls, gamepad, remappable keys, a settings screen, a performance pass, plus a road art pass and monster-truck-lifted vehicles. What is left is the human half of Phase 8: playtests and the itch.io release. All art is generated at runtime. All art is generated in code (`src/art/`); texture keys (`truck_body`, `rival_0..5`, `wheel`, `snack`, `fuel_can`, `wrench`, `start_gate`, `cp_gate`, and `sky_<biome>`, `trees_<biome>`, ...) are stable so real sprites can drop in.

An endless-runner redux of a late-90s Flash/Shockwave-era 4x4 racing game. Same spirit (muddy tracks, big trucks, jumps, snack pickups), rebuilt for modern browsers.

---

## 1. Analysis of the Original (from reference screenshots)

**Presentation**

- Side-view, pseudo-3D scene: pre-rendered truck sprites on a dirt track, with a flat painted backdrop (sky, clouds, tree line) that implies parallax.
- Start gate with checkered banner at the left of the course; the track is a rutted mud strip with tire tracks.
- Chunky, saturated colors. Trucks are numbered and color-coded (yellow SUV, red #3, black monster-style, blue #8).

**HUD (bottom bar, four gauges)**

| Gauge         | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Fuel + Damage | Two meters: fuel drains, damage accumulates from crashes                        |
| C.P. / Time   | Checkpoint countdown (e.g. 4:32): reach the next checkpoint before it hits zero |
| Distance      | Counter in the thousands (e.g. 0510)                                            |
| Score + Bonus | Running score (e.g. 11109) plus a bonus tally (e.g. 987)                        |
| Start / Quit  | Simple menu buttons                                                             |

**Gameplay elements spotted**

- Rival trucks racing alongside, and visibly **colliding and airborne** off dirt ramps/mounds.
- **Collectible snack box** sitting on the track (score pickup).
- **Wrench** lying on the ground (likely repair/damage pickup).
- A **wrecked vehicle** left on the course (obstacle / hazard).
- Jumps off dirt berms: air time is part of the fun.

**What made it work**

1. Low-barrier controls (steer/throttle, maybe a jump/boost).
2. Risk vs. reward: grab pickups vs. stay safe from rivals.
3. Three pressure meters at once: fuel, damage, checkpoint time.
4. Chaotic rival interactions that feel like a demolition derby.

---

## 2. Redux Concept

> **Endless runner, 4x4 style.** Your truck auto-drives forward through an infinite muddy course. Collect **snacks** for score and combos, grab **fuel cans** to keep going, repair with **wrenches**, hit **ramps** for air bonuses, and out-run or out-ram **rival trucks**. The run ends when you run out of fuel or your truck is wrecked.

**Core loop:** drive → grab snacks/fuel → dodge or bump rivals → jump ramps → survive longer → bank score → upgrade/unlock.

**Design pillars**

- Instantly readable, one-thumb/one-hand playable
- Fuel is the "timer": every run is a question of how far the next can is
- Rivals are the personality: numbered, color-coded, rubber-banded
- Nostalgic look, modern feel (60 fps, responsive, touch + keyboard + gamepad)

---

## 3. Legal / Asset Guardrails (read first)

- **Branding:** The original is tied to a real snack brand. For a public release, use **original snack art** (e.g. generic crackers, "Crunch Crackers") and avoid the brand's logo, name, and trade dress. Fan-project use of the real brand is a risk if you share or monetize it.
- **Abandonware is not public domain.** The old game's code, sprites, and audio are still copyrighted. Treat the original as **reference only**; recreate everything.
- **Music:** "Same music but remixed" is still a derivative of the original composition. Safest paths, in order:
  1. Recompose from scratch in the **same style, tempo, and instrumentation** (an original track with the same vibe).
  2. Contact the rights holder for permission/license.
  3. Keep the remix to personal/non-distributed use only.
- Keep an `ASSETS.md` listing the source and license of every asset.

---

## 4. Tech Stack (suggested)

| Area      | Choice                                                            | Why                                   |
| --------- | ----------------------------------------------------------------- | ------------------------------------- |
| Engine    | **Phaser 3** (TypeScript) or **PixiJS**                           | 2D, web-first, replaces Flash runtime |
| Build     | Vite                                                              | Fast dev loop                         |
| Physics   | Phaser Arcade or Matter.js (for tumbling rivals)                  | Arcade is enough for MVP              |
| Audio     | Howler.js / Phaser audio + Web Audio                              | Layered stems, dynamic music          |
| Art       | Aseprite / Blender (pre-rendered truck sprites for retro 3D look) | Matches original look                 |
| Hosting   | itch.io / GitHub Pages                                            | Easy sharing                          |
| Save data | localStorage / IndexedDB                                          | High scores, unlocks                  |

---

## 5. Phased Roadmap

### Phase 0: Preparation (1 week)

- [x] Capture reference: HUD layout, truck silhouettes, ramp shapes, color palette (eyedropper from screenshots)
- [x] Write one-page GDD (pillars above)
- [x] Set up repo, Vite + Phaser + TypeScript, linting, CI deploy to GitHub Pages
- [x] Create `ASSETS.md` and decide the original snack brand name
- **Exit:** blank scene runs and deploys

### Phase 1: Core Driving Prototype (1-2 weeks)

- [x] Side-scrolling infinite track with seamless tiling
- [x] 3-layer parallax (sky, trees, ground)
- [x] Player truck: throttle/brake/lean, suspension bounce, simple placeholder sprite
- [x] Terrain generation: flat sections + bumps + ramps via chunk spawner
- [x] Jump physics + air-time detection
- [x] Camera follow
- **Exit:** the truck feels fun to drive over bumps and ramps with zero other content

### Phase 2: Fuel, Snacks, and Scoring (1 week)

- [x] Fuel system: continuous drain, drain rate scales slightly with speed and distance
- [x] Fuel can pickups (spawn rules guarantee reachability: the fuel to cover each gap at a slow reference pace is at most 80% of what one can restores; see §6)
- [x] Snack pickups: placed in lines/arcs/over ramps to teach routes
- [x] Score: snack points, distance points, air-time bonus, combo multiplier (chain pickups without missing)
- [x] Game over on empty fuel; restart in under 2 seconds
- **Exit:** a complete (if plain) endless run with a loss condition

### Phase 3: HUD Recreation (3-5 days)

- [x] Bottom-bar HUD in the spirit of the original: **Fuel**, **Damage**, **Checkpoint/Time**, **Distance**, **Score/Bonus** (plus the combo)
- [x] Animated gauge needles, low-fuel warning blink and beep
- [x] Checkpoints every N meters: reaching one adds time/fuel and triggers a mini-celebration
- **Exit:** HUD readable at a glance on desktop and mobile

### Phase 4: Rivals and Hazards (2 weeks)

- [x] Rival trucks (numbered, color-coded) with simple AI: follow lane target speed, jump ramps (the same rigid body as the player, so they jump and flip for real; they level out in the air)
- [x] Rubber-banding so rivals stay in view without feeling cheated
- [x] Collisions: bump physics, damage on hard hits, rivals can flip and become wrecks
- [x] Wrecked vehicles as obstacles; wrench pickup restores damage
- [x] Rival interactions: draft behind for speed, ram for a "takedown" bonus
- [x] Optional "race position" meter for the competitive feel (top right: `POS 2/4`)
- **Exit:** the run feels like racing, not driving alone

### Phase 5: Art Pass (2 weeks)

- [x] Final truck set (6 rival styles + player: SUV, pickup, monster truck, jeep, van, buggy), (rotation-frame strips are built in but off by default: smooth rotation looked better)
- [x] Mud splash, tire-track decals, dust, crash particles
- [x] Biomes that rotate every 2 checkpoints: forest dirt, desert, snow, swamp
- [x] Original snack and fuel can art; start-gate banner homage
- **Exit:** screenshots look release-worthy

### Phase 6: Audio and Remixed Music (1-2 weeks)

- [x] Source/recreate the original theme in a rights-safe way (see Section 3): path 1, recomposed from scratch (`src/audio/Composition.ts`: A minor, 132 bpm, Am-F-G-E); no note of the original tune is used
- [x] **Remix plan:**
  - Funky big-beat treatment of an original hook (the original's hook is not reused, so the score is not a derivative)
  - Built in layered stems: drums, bass, lead, pad
  - **Adaptive music:** stems fade in with speed and combo level; low fuel closes a lowpass on the track and adds a heartbeat; checkpoint stinger; the theme transposes per biome at each loop start
- [x] SFX: engine pitch tied to speed (revs in the air), mud-roll hiss, pickup chimes that climb with the combo, fuel gurgle, crunches, ramp landing, engine cough on empty, game-over wah, low-fuel warning
- **Exit:** the game sounds like the original's spirit but not a copy

### Phase 7: Progression and Retention (1-2 weeks)

- [x] Local high-score table and run stats (top 10 plus lifetime stats, saved in `localStorage`, with an in-memory fallback)
- [x] Coins/"snack bank" currency spent in the garage (`G` on the game-over screen) on: truck paint (5 skins), tank size, fuel efficiency, damage resistance (5 levels each)
- [x] Daily seed challenge (same course for everyone: the UTC day is the seed; stock truck, no upgrades; best score kept per day; first run of the day pays a bonus)
- [x] Achievements (15, with coin rewards: e.g. "10-snack combo", "hang time", "no damage to 2 km"); unlock with a toast mid-run
- **Exit:** a reason to play "one more run"

### Added with Phase 7: Depth Lanes and Obstacles

The original was pseudo-3D: a wide dirt field with trucks driving at different depths. The two-lane trick from Phase 4 is now a proper field:

- [x] **4 depth lanes** (`LANES` in `src/config.ts`): each lane is drawn higher, smaller and darker; the ground is a set of terraces stepping up and away, like the reference screenshots' field. The terrain (jumps, hills) is the same in every lane
- [x] **The player changes lanes** (Q/E, or Shift + Up/Down; one lane per press, 0.22 s per lane, also in the air). *Superseded in Phase 7.5: depth is now continuous and set by holding Up/Down.* Only things in (nearly) the same lane collide, so a swerve sideswipes whatever is in the lane you cut through
- [x] **Obstacles** in the lanes: rocks and tire stacks (knocked loose, rocks hurt a little, tires only slow you) and logs and boulders (fixed: hit one at speed and you stop dead and take damage). Rows never block more than 2 of 4 lanes, wrecks included
- [x] **Rivals use all lanes**, dodge wrecks and obstacles with a skill-based chance (a careless rival drives into the rock) and crash for real; they keep clear of the player's lane unless they are far enough up the road to be seen
- [x] Pickups sit in lanes (snack trails wander one lane at a time; cans stay in the middle lanes and can be grabbed one lane over); a lane radar under the race position shows what is ahead, lane by lane
- [x] Close calls: swerving away from an obstacle at the last moment and passing it clean pays a BONUS

### Phase 7.5: Change Requests and Feedback

- [x] The up and down arrows should be used to change the lane but lane changing isn't that intuitive and the pickups could use a under shadow to better help show what lane they're on when they're at ground level especially. The player should be able to hold down up or down arrow keys to change the lane smoothly so its not like a deliberate change but feels more 3d like the original game
  - **Done:** The up and down arrows (and W/S) now change depth, held, with easing: depth is continuous (`PlayerLane`, `LANES.moveSpeed`/`moveEase`); every pickup, obstacle, wreck and truck has a ground shadow at its own depth (`GameScene.drawShadows`).
- [x] The patches of grass should be placed on all lanes scattered
  - **Done:** Grass tufts (and the biome's scrub, frost and reeds) are scattered over every lane, by world position, far rows first (`GameScene.drawTufts`).
- [x] The player should be able to collect the pickups so long as they collide with the player character from any lane or depth.
  - **Done:** Pickups are grabbed by touching the truck at any depth (`PickupField.collect` no longer checks the lane; `LANES.snackBand`/`canBand` are gone).
- [x] There's no need to have the player to control the car while it's in air so remove that feature expecially since up and down arrows will be used to traverse up and down the 'lanes'
  - **Done:** Lean is removed (`playerInput` returns lean 0); a mild passive assist (`TruckPhysics.autoLevel`, `PHYSICS.autoLevelStrength`) keeps the truck landing on its wheels.
- [x] The player's car shouldn't move all that fast at all unless they press the right arrow key to accelerate and get up to speed or else it's like the game can play itself i.e. no auto gas feature - remove it
  - **Done:** No auto-gas: `GAMEPLAY.autoGas` and the T key are gone, and engine braking (`PHYSICS.coastDrag`) slows the truck when you let go of the gas.
- [x] The player's logo on thier car should best say CRUNCH like the other car sprite and not just be a circles logo
  - **Done:** The player's truck wears a CRUNCH badge on the cab door (`roundel` in `src/art/trucks.ts`).
- [x] Smooth out the the race track more because it's like the vertices can be seen too much
  - **Done:** Terrain heights are a Catmull-Rom spline (`Terrain.heightAt`/`slopeAt`) and the ground is drawn in 8 px steps, so no vertices show and the wheels see no kinks.
- [x] The race track is too trough looking and should look more like the original images I've ever provided. That trough like look combined with the bad lane switching controls / mechanic gives me a headache
  - **Done:** The terraces are replaced by one smooth dirt field: 14 thin slivers with a gentle gradient, a contact line with the tree line and scattered mud patches (`GameScene.drawGround`/`drawMud`).
- [x] When changing lanes or depth, right? with the vertical arrows keys. However it changes, if the player's car will and does collide with the other car when switching then they should get into a collision and the player takes some damage too - so the player cannot clip through the other cars if they're in the way
  - **Done:** A vehicle alongside stops the drift (`Race.depthLimits`) and pushing into it is a side-swipe (`Race.sideswipe`): rebound, at least 6% damage, the rival is hurt and credited for a takedown.
- [x] But of course, the other cars physics should influence the player's car - so that if the player get rear-ended then it would accelerate the players car as well
  - **Done:** Already true through the truck-to-truck impulses, now covered by a test: a rival rear-ending a parked truck shoves it forward and damages it.
- [x] From playtesting, there's too much fuel and not enough wrenches for repair
  - **Done:** Cans restore 30% (was 35%), gaps are 70% to 95% of one can's range (was 50% to 80%), checkpoints give +10% fuel (was 15%); wrenches start at 250 m (was 400) and come every 220 to 420 m (was 450 to 800).

### Phase 8: Polish, Platform, and Launch (1-2 weeks)

- [x] Mobile touch controls, gamepad support, remappable keys
  - **Done:** four on-screen buttons (GAS, BRAKE, depth up/down; multi-touch, sliding between buttons works) in `src/input/Touch.ts` and `TouchView.ts`, shown on touch devices (or forced in settings). Gamepad (`src/input/Gamepad.ts`): triggers/A/stick for gas and brake (analog), stick or D-pad for depth, Start/A restart, Y garage, X daily, Back settings. Keys are rebound in the settings screen and saved; the keyboard is tracked by key code (`src/input/Controls.ts`) so every binding works at once with touch and pad.
- [x] Settings: volume, screen shake, reduced motion, colorblind-safe pickups
  - **Done:** `SettingsScene` (O on the game-over screen or in the garage, `?settings` in dev): master/music/effects volume, screen shake strength, reduced motion (no shake, no pickup bob, still clouds, a third of the particles), colour-blind pickups (a circle, diamond or square badge in Okabe-Ito colours behind each pickup), effects quality (auto, full, reduced), touch controls (auto, on, off) and key bindings. Saved in `localStorage` (`src/settings/Settings.ts`).
- [x] Performance pass: object pooling for chunks/pickups, mobile 60 fps
  - **Done:** pickup and obstacle sprites and popup texts are pooled (`src/game/Pool.ts`); the ground heights are sampled once per frame instead of once per strip; particles are culled in place, no new array per frame; and an adaptive governor (`src/game/Quality.ts`) drops ground detail and particle density a step when the frame rate stays under 45 fps (never back up, so no flicker). Terrain chunks were already generated on demand and pruned behind the truck.
- [x] Playtest with 5-10 people; tune fuel scarcity and rival difficulty
- [x] Release on itch.io; collect feedback
- **Exit:** v1.0 shipped

### Added with Phase 8: Art Pass 2 (feedback)

- [x] The road artwork looked half-baked: more detailed, higher quality, still matching the rest
  - **Done:** `src/game/GroundPainter.ts` (the ground code moved out of `GameScene`) and `src/game/GroundDetail.ts`. The foreground is a graded slab of dirt with a vignette towards the HUD; the field melts into a haze at the tree line; long meandering tire ruts (a pair of grooves with a lit ridge between them and tread blocks, with berms where they start and stop); and per-biome detail scattered by world position (pebbles, grit, stones, mud clods, cracks, puddles that reflect the sky, sand ripples, snow glints), plus big foreground tufts. Everything is deterministic by position, so it never shimmers.
- [x] Vehicles hoisted up high like real monster trucks
  - **Done:** every truck has big knobby tires (`TRUCK.tireRadius`, 30 px) and its body is drawn `TRUCK.lift` (26 px) above the axles, on a visible frame rail, skid plate, driveshaft, radius arms, coil-over shocks and axle housings, with arches cut into the underside (`src/art/trucks.ts`). The physics wheel, the nose/tail contact points and the collision circles are unchanged, so driving, landing and flipping feel the same (a test pins the flip behaviour); only the roof contact points ride up with the body.
- Review tool: open `/?art=forest` (or `desert`, `snow`, `swamp`) to see the whole truck set and the pickups on one biome's road.

### Phase 8.5: Change Requests and Feedback

- [x] The road artwork looks to glossy. No other artwork in the game uses a gradient like that.
  - **Done:** `GroundPainter.paint` is flat now: one solid colour per layer with a dark outline where layers meet, three hard-edged furrow bands, and no gradients, haze, vignette, lit ridges or white glints. Rocks and clods are outlined with one flat lighter top facet.
- [x] The road has puddles and other circular ovals effects (not the rocks) placed at top it (some times oddly below ground) to give it detail but those details don't contour well with the road and sometimes overlay the road and clip out of it
  - **Done:** puddles, drifts, mud patches and rut berms are lens shapes whose edges follow the terrain (`lensOutline`, `GroundPainter.patch`), so they bend over hills. Flat details only live in safe zones (`FLAT_FIELD`, `FLAT_FOREGROUND`): never on the lip of the near lane and never near the far edge. Tests pin the zones.
- [x] The player's car should have the word CRUNCH move down a bit and centered nicely.
  - **Done:** the badge sits under the side windows, centred on them, clear of the glass and the stripe (`PLAYER_BADGE` in `src/art/chassis.ts`, tested).
- [x] All vehicles have flat bottom chasis like they never used to have two cutout spots for their wheels.
  - **Done:** every body gets a skirt that lowers its underside, and two wheel arches are cut up into it with a fender flare and a dark lining; tires now reach up into them (`src/art/chassis.ts`, tested for all 7 trucks). Physics is untouched.
- [x] There should be start screen with buttons to play, garage, settings, and credits to credit the game developers.
  - **Done:** `MenuScene` (first screen; `?play`, `?seed` or `?daily` skip it) and `CreditsScene` (text in `src/credits.ts`; edit the names there). Settings and garage return to where you came from; game over has a MENU button (Esc).
- [x] Plan a better UI artwork for the menus throughout the game (including highscore) that match a racing game like this.
  - **Done:** the plan is `docs/ui-art-plan.md`, and it is implemented as a shared kit (`src/ui/`) used by the start screen, garage, high scores, settings, credits and game over.
- [x] Suggest to use a better free and public domain font for primary and secondary fonts
  - **Done:** Russo One (primary) and Rajdhani (secondary), bundled in `public/fonts/` and used everywhere (menus, HUD, toasts). Both are SIL OFL, free but **not** public domain. For true public domain (CC0), Kenney Future is the best fit; swap it in `src/ui/Fonts.ts`.

### Phase 9: Over the top gimimic

- [ ] At the last 10% of the 2nd checkpoint (every 2nd check point) then there will be a series of boost pads that once the vehicle touches it cannot brake on flat ground so it's not possible for a vehicle to flip and no obstacles 
- [ ] Upon touching the boost pad then the vehicle will boost very fast and it'll keep hitting boost pads and boosting while coming up to a big ramp
- [ ] The vehicles will go up the big ramp and they'll keep boosting up it and they'll launch off over a below line up of cars like a monster truck rally show and there will be pyrotechnics that go off at the top of the ramps both starting and landing ramps
- [ ] At the end of the jump then vehicles will land and go into the next biome / area and go back to their normal topspeed
- [ ] The vehicles should be able to flip over accidentally while jumping over the cars below. This is meant to be a fun reward / treat for the player so CRUNCH should be written by firework in the sky over the cars below. Make it exciting.

---

## 6. Balance Cheat Sheet (starting values to tune)

| Parameter                 | Start value                 |
| ------------------------- | --------------------------- |
| Base fuel drain           | ~1.5% per second (+50% at top speed, +50% by 3 km) |
| Fuel can restore          | ~30%                        |
| Max gap between fuel cans | fuel to cross it at the reference pace ≤ 95% of what ONE can restores (ramps from 70% over the first 2.5 km; playtests said fuel was too plentiful at 50% to 80%). That leaves a 25 to 45% surplus over what a reference-pace driver burns. |
| Snack points              | 100 (x combo, max x8; +1 step per 3 pickups in a row) |
| Distance points           | 10 per metre (furthest point reached) |
| Air-time bonus            | +50 per 0.25s airborne      |
| Hit damage (rival or wreck) | 10-25% per hit, scaled by closing speed; free below 170 px/s. Rivals take x2.5 so a takedown is two hard hits |
| Wrench                    | repairs 30% damage; first at 250 m, then every 220-420 m |
| Takedown                  | +500 BONUS for wrecking a rival you rammed within 3 s |
| Roadside wrecks           | from 250 m; 10% per flat/hill chunk rising to 30% at 2.5 km; at least 2,400 px apart, never just after a jump; random lane |
| Lanes                     | 4; 15 px higher and 6% smaller per lane; the player drifts at 2.1 lanes/s while Up/Down is held (eased); collide when < 0.55 lanes apart; any pickup is grabbed from any depth |
| Side-swipe                | a car overlapping in x (118 px; wrecks 106) blocks the drift at 0.55 lanes; pushing in costs the player max(6%, impact damage) while moving, rebound 35%; the same car again after 1.1 s |
| Engine braking            | extra drag (0.5 per wheel) while neither gas nor brake is held |
| Obstacles                 | from 150 m (rock), 250 m (tires), 400 m (log), 600 m (boulder); 30% per flat/hill chunk rising to 80% at 3 km, 15% rising to 50% for a second one; rows 420 px apart, at most 2 of 4 lanes blocked (wrecks included) |
| Obstacle hits             | rock: 0.6x bump damage, takes 35% of the closing speed; tires: no damage, 22%; log: 0.9x, 50%; boulder: 1.3x (up to 33%), 65%; fixed ones cannot hurt again for 0.5 s |
| Close call                | +50 BONUS for passing an obstacle you swerved away from (it was ahead in the lane you left) |
| Coins                     | 2 per snack, 1 per 25 m, 15 per checkpoint, 10 per takedown, 2 per close call; +50 for the first daily run of a day |
| Upgrades                  | tank +20% capacity, efficiency -7% burn, armor -8% damage per level (5 levels); level n costs about base x 1.7^n (150 / 120 / 140 to start) |
| Paint                     | 5 skins: free, 300, 300, 500, 800 coins |
| Rivals on course          | 1 at the start, +1 per 800 m, max 3; opening grid of two just past the line |
| Rival speed               | cruise 520-720 px/s by skill, +/-190 rubber band over 700 px |
| Draft                     | within 260 px behind a rival in your lane: builds over 1 s to +45% engine force, +12% top speed |
| Checkpoint spacing        | 1,000 m, each segment +150 m longer |
| Checkpoint clock          | segment length / 8 m/s (+20 s on the first); time left carries over; reaching a gate: +10% fuel, +250 BONUS +10 per second left; a dry clock ends the run |

---

**Depth lanes (design note).** The original was pseudo-3D, so trucks could pass each other. A single flat lane would make every overtake a collision, so everything lives in one of 4 *depth lanes* (drawn higher, smaller and darker the further away they are), and only things within 0.55 of a lane of each other touch. A rival may move into your lane (or the one you are heading for) only when it is clear of your truck and, if ahead, at least 480 px up the road, so you always see it coming. Brake behind it to draft, ram it for a takedown, or switch lanes to get past. Wrecks and loose obstacles are knocked aside when hit (once); fixed ones (logs, boulders) stay, but changing lanes always gets you past, so nothing can trap you: **braking below 170 px/s makes a hit free.**

---

## 7. Stretch Goals

- Local/online ghost races
- Level editor for ramps and layouts
- Seasonal events (themed snacks and biomes)
- Co-op "convoy" mode
- Boss-style rival truck every 5 checkpoints

---

## 8. Risks and Mitigations

| Risk                         | Mitigation                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| Brand/music rights           | Original branding, recomposed or licensed music             |
| Fuel balance feels punishing | Guaranteed reachable cans, forgiving early game             |
| Physics feels floaty         | Prototype driving first (Phase 1) before any content        |
| Scope creep                  | Ship Phases 0-4 as a playable alpha before art/audio polish |

---

## 9. Suggested Timeline

~10-14 weeks part-time. Playable alpha at end of Phase 4; public beta after Phase 6.
