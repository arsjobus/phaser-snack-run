# 4x4 Snack Run: Redux Roadmap

> **Status:** Phases 0, 1 and 2 are complete (see `README.md`). Next up: Phase 3 (HUD recreation). A first-pass bottom-bar HUD already exists from Phase 2 and Phase 3 builds on it.

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

- [ ] Bottom-bar HUD in the spirit of the original: **Fuel**, **Damage**, **Checkpoint/Time**, **Distance**, **Score/Bonus**
- [ ] Animated gauge needles, low-fuel warning blink and beep
- [ ] Checkpoints every N meters: reaching one adds time/fuel and triggers a mini-celebration
- **Exit:** HUD readable at a glance on desktop and mobile

### Phase 4: Rivals and Hazards (2 weeks)

- [ ] Rival trucks (numbered, color-coded) with simple AI: follow lane target speed, jump ramps
- [ ] Rubber-banding so rivals stay in view without feeling cheated
- [ ] Collisions: bump physics, damage on hard hits, rivals can flip and become wrecks
- [ ] Wrecked vehicles as obstacles; wrench pickup restores damage
- [ ] Rival interactions: draft behind for speed, ram for a "takedown" bonus
- [ ] Optional "race position" meter for the competitive feel
- **Exit:** the run feels like racing, not driving alone

### Phase 5: Art Pass (2 weeks)

- [ ] Final truck set (4-6 rival styles + player), pre-rendered at multiple rotation frames
- [ ] Mud splash, tire-track decals, dust, crash particles
- [ ] Biomes that rotate every few checkpoints: forest dirt, desert, snow, swamp
- [ ] Original snack and fuel can art; start-gate banner homage
- **Exit:** screenshots look release-worthy

### Phase 6: Audio and Remixed Music (1-2 weeks)

- [ ] Source/recreate the original theme in a rights-safe way (see Section 3)
- [ ] **Remix plan:**
  - Keep the melodic hook and tempo feel
  - Change genre treatment (e.g. synthwave, big-beat breakbeat, or funky rock)
  - Rebuild in layered stems: drums, bass, lead, pad
  - **Adaptive music:** stems fade in with speed and combo level; low fuel filters the track and adds a heartbeat/alarm; checkpoint stinger
- [ ] SFX: engine pitch tied to speed, pickup chimes, crunch, ramp landing, low-fuel warning
- **Exit:** the game sounds like the original's spirit but not a copy

### Phase 7: Progression and Retention (1-2 weeks)

- [ ] Local high-score table and run stats
- [ ] Coins/"snack bank" currency spent on: truck skins, tank size, fuel efficiency, damage resistance
- [ ] Daily seed challenge (same course for everyone)
- [ ] Achievements (e.g. "10-snack combo", "longest air time", "no damage to 2 km")
- **Exit:** a reason to play "one more run"

### Phase 8: Polish, Platform, and Launch (1-2 weeks)

- [ ] Mobile touch controls, gamepad support, remappable keys
- [ ] Settings: volume, screen shake, reduced motion, colorblind-safe pickups
- [ ] Performance pass: object pooling for chunks/pickups, mobile 60 fps
- [ ] Playtest with 5-10 people; tune fuel scarcity and rival difficulty
- [ ] Release on itch.io; collect feedback
- **Exit:** v1.0 shipped

---

## 6. Balance Cheat Sheet (starting values to tune)

| Parameter                 | Start value                 |
| ------------------------- | --------------------------- |
| Base fuel drain           | ~1.5% per second (+50% at top speed, +50% by 3 km) |
| Fuel can restore          | ~35%                        |
| Max gap between fuel cans | fuel to cross it at the reference pace ≤ 80% of what ONE can restores (ramps from 50% over the first 2.5 km). A literal "80% of a full tank" cannot hold with a 35% can: arriving at a can with a near-empty tank you'd never reach the next one. |
| Snack points              | 100 (x combo, max x8; +1 step per 3 pickups in a row) |
| Distance points           | 10 per metre (furthest point reached) |
| Air-time bonus            | +50 per 0.25s airborne      |
| Wreck damage              | 10-25% per hit              |
| Checkpoint spacing        | ~1,000 m (increasing)       |

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
