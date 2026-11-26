# Performance Roadmap (mobile and desktop)

Goal: a steady 60 fps on a mid-range phone (about a 2020 Android, Mali/Adreno mid GPU) and on a
laptop with integrated graphics, with no stutter from garbage collection, and a fast start. Work
in phases; each phase ends with a measurement, so nothing is "optimised" on a hunch.

## Where the game stands today

What exists and should be kept:

- Logical view of 960x540 drawn at a render scale of 1x or 2x (`src/ui/RenderScale.ts`, max 2).
- Object pools for images and texts (`src/game/Pool.ts`), culling of pickups, obstacles and shadows to the view.
- A frame-time governor (`src/game/Quality.ts`) that steps effects quality 1 -> 0.6 -> 0.3 in `auto` mode;
  it scales ground detail and particles. It never steps back up (no flicker).
- A fixed physics step (`FIXED_DT`) with at most 40 sub-steps per frame.

Likely costs (to be confirmed by Phase 0, not assumed):

1. **The ground is repainted every frame.** `GroundPainter.paint` rebuilds a `Graphics` path set for the whole view
   (slab, field, furrows, ruts, details, tufts) plus the pads, shadows, decals and tracks. Vector `Graphics`
   re-tessellates on the CPU each frame; this is the biggest suspect on phones.
2. **Several full-width `Graphics` objects cleared and refilled each frame** (ground, shadows, decals, pads, sky show, sparks).
3. **Per-frame allocations:** shadow polygons (`Shadows.shadowPolygon` returns new arrays), `Phaser.Display.Color.GetColor`
   per sprite, tint objects, `Array.filter`/`map` in hot paths, closures in `drawShadows`.
4. **Texture memory:** 20 backdrop layers at 960 px wide (now SVG-rasterised at load), 12 show cars, 6 rival bodies
   x 32 rotation frames when the atlas is on (off by default), all rasterised at start-up.
5. **Start-up:** all SVG art is rasterised in the browser on load (64+ files), fonts load first, a 1 MB music file.
6. **Audio:** engine and mud hiss are synthesised at runtime (`AudioSystem`), music is an MP3 stream.
7. **HUD and menu text:** `Text` objects re-rendered to canvas whenever the string changes.

## Phase 0: Measure first (2 to 3 days)

- [ ] Add a dev-only profiler overlay (extend the H debug overlay): fps, frame ms (avg, p95, max), draw calls, game-object
      count, texture memory, JS heap, number of physics sub-steps, and ms spent in each part of `update`
      (physics, ground paint, shadows, decals, particles, HUD). Use `performance.now()` marks; strip in production.
- [ ] Add a `?perf` URL flag that runs a scripted 60-second autoplay (fixed seed, throttle held, lane sweep) and prints a JSON
      summary to the console, so runs are comparable between builds and devices.
- [ ] Record a baseline on three targets: a desktop laptop (integrated GPU), a mid-range Android phone (Chrome) and a
      low-end phone; at render scale 1x and 2x, effects `full` and `auto`. Save the numbers in `docs/perf-baseline.md`.
- [ ] Chrome DevTools: one Performance trace and one Memory allocation timeline per target; note GC pauses.
- **Exit:** a table of baseline numbers and a ranked list of the real hot spots. Phases 1 to 4 are re-ordered by it.

Budget to hold afterwards (adjust after the baseline): desktop 60 fps with p95 frame under 12 ms; mid phone 60 fps
with p95 under 16.6 ms; no GC pause over 8 ms during a run; time to first menu under 3 s on a mid phone over 4G.

## Phase 1: Quick wins (3 to 5 days)

Cheap changes with the least risk; take them whatever the baseline says.

- [ ] **Cap the render scale on weak devices.** Choose 1x on phones unless `devicePixelRatio` and GPU tier justify 2x;
      add a setting (`Resolution: auto / 1x / 2x`). Fewer pixels is the single largest win on mobile fill rate.
- [ ] **Cap the frame rate loop:** `fps: { target: 60, smoothStep: true }`, and skip rendering while the tab is hidden.
- [ ] **Stop allocating per frame.** Reuse point arrays in `Shadows` (a scratch buffer per vehicle), cache tint colours
      per lane (`laneShade` -> a lookup table), hoist closures out of `drawShadows`, replace `filter`/`map` in update paths with loops.
- [ ] **Skip work that cannot be seen:** do not repaint shadows, decals or pads that are off screen; do not run
      the stage view when no stage is within the view; skip particle updates at zero density.
- [ ] **Throttle expensive effects by quality:** screen shake overlay, glow blend modes (`ADD` layers are costly on
      tile-based GPUs), the track-mark count, mud and dust particle caps.
- [ ] Make the governor smarter: also step *up* after a long calm spell (30 s at 58+ fps) with hysteresis, and add a
      quality step that lowers the render scale before it removes effects.
- **Exit:** at least 25 percent lower mean frame time on the mid phone, measured with the Phase 0 harness.

## Phase 2: Rendering architecture (1 to 2 weeks)

Move the biggest per-frame costs from the CPU to cached textures.

- [ ] **Bake the ground into tiles.** The terrain is generated in fixed chunks. Paint each chunk (for example 512 px wide)
      once into a `RenderTexture` or a canvas texture, then scroll sprites of those chunks; repaint only a chunk that changes
      (biome blend, a new decal). Pool the chunk textures and recycle them as the camera moves.
- [ ] Keep the dynamic bits (ruts that react, tufts that sway, decals) as a small overlay with a per-frame budget.
- [ ] **Shadows as sprites for static things:** pickups, rocks and wrecks use one pre-rendered soft shadow image,
      positioned and scaled, instead of ellipses redrawn each frame. Keep the polygon shadows only for vehicles
      (they must bend with the ground), and batch all vehicles into one `Graphics` pass.
- [ ] **Batch the draw calls.** Pack pickups, hazards, props, shows cars and wheels into texture atlases (one atlas per
      group) so Phaser's WebGL renderer batches them; today each SVG is its own texture, which breaks batching.
      Add an `art:atlas` script that packs the exported SVG art to PNG atlases at 1x and 2x.
- [ ] Parallax layers: they are `TileSprite`s (cheap). Check that four biome sets x five layers are not all drawn when
      alpha is 0 (set `visible = false` when hidden), and avoid overdraw by not drawing the sky under opaque layers.
- [ ] Use `Phaser.WEBGL` explicitly, with `powerPreference: 'high-performance'`, `antialias: false`, `roundPixels: true`
      where the art allows; keep a canvas fallback only for very old devices.
- **Exit:** draw calls under 60 per frame in a typical scene; ground paint cost under 1 ms on the mid phone.

## Phase 3: CPU, memory and garbage collection (1 week)

- [ ] **Pool everything that spawns:** particles (already a fixed-capacity system), popups, tracks, pickups, obstacle
      sprites, wreck debris, text popups. Verify with the allocation timeline that steady-state allocation is near zero.
- [ ] **Physics:** keep the fixed step, but cap catch-up (already 40) lower on weak devices, and run rival physics at a
      lower rate when they are far off screen (they still need to move, they do not need every sub-step).
- [ ] **Spatial lookups:** obstacles, pickups and wrecks are scanned linearly each frame; index them by terrain chunk
      or keep sorted arrays so collision and culling touch only what is near the truck.
- [ ] **Terrain:** the Catmull-Rom `heightAt` is called many times per frame from many places. Cache per-frame results for
      repeated x values, or pre-sample into a typed array (`Float32Array`) at the render step.
- [ ] Replace per-frame `Text` updates in the HUD with bitmap text (`BitmapFont` generated from the two fonts), or update
      text only when the displayed value changes.
- [ ] Release textures that are not needed (the Art preview scene, unused biome backdrops until the biome is near).
- **Exit:** no GC pause over 8 ms in a 5-minute run; heap stays flat (no growth over 5 minutes).

## Phase 4: Loading and size (3 to 5 days)

- [ ] **Faster start:** rasterise art in parallel where possible, show real progress, and defer non-critical art
      (the 12 show cars, rival bodies after the first three) until after the menu is up.
- [ ] **Prebuilt atlases (from Phase 2)** replace 64+ individual SVG rasterisations at start-up; keep the SVGs as the
      editable source (`public/art/`) and the exporter as the build step.
- [ ] **Audio size:** re-encode `bgm.mp3` (about 1 MB) with a tighter bitrate or Ogg/Opus with an MP3 fallback; keep the
      SFX as small mono files; decode lazily.
- [ ] **Bundle:** build with code splitting (Phaser in its own long-cached chunk), enable gzip/brotli on the host, set
      long cache headers on hashed assets, and check the Vite bundle with a visualiser.
- [ ] Service worker for offline play and repeat visits (also needed for the Android work in `roadmap-android.md`).
- **Exit:** first menu in under 3 s on a mid phone over 4G, and under 1 s on a repeat visit.

## Phase 5: Device adaptation and guardrails (1 week)

- [ ] **Device tiers:** choose starting quality from a quick benchmark (the first 3 seconds of the menu scene), the
      `deviceMemory` and `hardwareConcurrency` hints, and the GPU renderer string; store the result and let the governor refine it.
- [ ] **Battery and heat:** a "battery saver" mode (30 fps cap, quality 0.3, no ADD-blend glow) offered when the Battery API
      reports low charge, or after sustained throttling is detected (frame times rise while the game load is steady).
- [ ] **Input latency:** keep input polling in the fixed step, avoid layout work on touch, and test that no touch handler allocates.
- [ ] **Background and context loss:** pause audio and the loop on `visibilitychange`; handle WebGL context loss and restore.
- [ ] **Regression guard:** a CI job that runs the `?perf` autoplay in headless Chrome with software rendering and fails if
      the physics/update cost (not the GPU cost) regresses by more than 15 percent; unit tests keep pure-logic costs honest.
- [ ] Document the budgets and the profiling workflow in `docs/performance.md`.
- **Exit:** the budgets hold on all three baseline devices; CI catches a regression before it ships.

## Order of work and risk

| Phase | Effort | Risk | Payoff on mobile |
| ----- | ------ | ---- | ---------------- |
| 0 Measure | 2 to 3 days | none | makes every later choice informed |
| 1 Quick wins | 3 to 5 days | low | high (render scale, allocations) |
| 2 Rendering | 1 to 2 weeks | medium (visual parity of the ground) | very high |
| 3 CPU and GC | 1 week | medium | medium to high (smooth frame pacing) |
| 4 Loading and size | 3 to 5 days | low | high for first impressions |
| 5 Adaptation and guardrails | 1 week | low | keeps the gains |

Rule for every change: measure before, measure after, keep it only if it helps on the mid-range phone without making the
desktop look worse. Visual parity checks use the Art preview scene (`?art`) and screenshots of each biome.
