/** Central tuning file. Everything feel-related lives here. */

export const VIEW_W = 960;
export const VIEW_H = 540;

/** World y (px, y-down) of the flat "baseline" the terrain generator wanders around. */
export const BASE_Y = 500;
/** Horizontal spacing of terrain height samples. */
export const TERRAIN_STEP = 16;
/** World pixels per displayed metre. */
export const PX_PER_METER = 40;

export const PHYSICS = {
  gravity: 1250, // px/s^2
  substeps: 4, // per 1/60 s frame
  mass: 1,
  inertia: 2400,

  // Suspension at each wheel (spring/damper along the ground normal)
  wheelRadius: 20,
  springK: 85,
  springC: 9,
  maxSpringForce: 4000,

  // Hard body contacts (roof, bumpers): stiff and grippy
  bodyK: 500,
  bodyC: 28,

  // Drivetrain (4WD: both wheels drive)
  engineForce: 1140, // per wheel
  topSpeed: 900, // px/s along the ground
  brakeForce: 420, // per wheel
  reverseForce: 160,
  reverseTop: 260,
  rollingResistance: 0.08, // along-ground drag coefficient at contacts
  /** Extra drag per wheel while neither gas nor brake is held (engine braking). */
  coastDrag: 0.5,
  driveLever: 0.2, // fraction of the real lever arm used for drive torque (anti-wheelie)
  airDrag: 0.04,

  // Lean (pitch) control
  airTorque: 11000,
  groundTorque: 4200,
  /** Strength (0..1 of the air torque) of the player's passive landing assist. */
  autoLevelStrength: 1,
  airAngularDamping: 0.9, // per second
  maxAngularVelocity: 7,
} as const;

/** How far (px) every truck's body is hoisted above its axles: they are monster-truck lifted. */
const LIFT = 32;

/**
 * Truck contact layout in chassis-local px (x forward, y down). The physics wheel (`wheelRadius`)
 * is unchanged, but the tires are DRAWN `tireRadius` big and the body is drawn `lift` px higher on
 * visible axles and shocks, so the roof contact points ride up with it (a flipped truck must rest
 * on its drawn roof); the tail and nose points stay inside the tires' outlines, where they were, so
 * landings and flips behave as they did before the lift. The collision circles (`COLLISION.circles`) keep covering the tires
 * and lower body, which is what rocks and other trucks actually hit.
 */
export const TRUCK = {
  wheels: [
    { x: -42, y: 22 }, // rear
    { x: 42, y: 22 }, // front
  ],
  body: [
    { x: -30, y: -30 - LIFT }, // cab roof rear
    { x: 8, y: -30 - LIFT }, // cab roof front
    { x: -58, y: -6 }, // tail: inside the rear tire's outline, so it stays where it was
    { x: 58, y: -2 }, // nose: same, inside the front tire
  ],
  bodyRadius: 4,
  /** Drawn radius (px) of a standard tire; a style's `wheel` factor scales it. */
  tireRadius: 24,
  lift: LIFT,
};

export const CAMERA = {
  /** Fraction of the screen width the truck sits from the left edge. */
  xAnchor: 0.3,
  /** Fraction of the screen height the truck sits from the top. */
  yAnchor: 0.62,
  yLerp: 4, // per second
  lookAhead: 0.18, // seconds of velocity added to x target
  /** The show camera (Phase 9.5): how fast it settles on the truck, and where the truck sits (fractions of the screen). */
  focusRise: 9, // per second, easing the framing in (fast: the camera goes straight to the truck)
  focusFall: 3.2, // per second, easing it back out to the normal offset in mid air
  focusYLerp: 10, // vertical follow speed while focused, so the climb never leaves the frame
  focusXAnchor: 0.5,
  focusYAnchor: 0.56,
};

/** Reference camera scrollY when the truck rests on the baseline; used for parallax Y. */
export const SCROLL_Y0 = BASE_Y - 40 - VIEW_H * CAMERA.yAnchor;

export const GAMEPLAY = {
  /** Airtime (s) below which a landing is not announced. */
  minAirToast: 0.35,
  /** Seconds stuck upside down before the player truck is wrecked. */
  flipRecoverTime: 2,
  startX: 200,
  flatStartPx: 900,
};

/**
 * Depth field, like the original's pseudo-3D dirt field: every vehicle, pickup and obstacle sits at
 * a depth between 0 (nearest the camera, lowest, biggest) and `count - 1` (furthest); each step of
 * depth is drawn `spacing` px higher, a little smaller and darker. Pickups, obstacles and wrecks
 * sit on whole lanes, but the player's depth is continuous: hold Up/W to drift away from the camera
 * and Down/S to drift towards it. The terrain is shared, so jumps and hills are the same at every
 * depth; only things at (nearly) the same depth and the same x touch each other.
 */
export const LANES = {
  count: 4,
  /** The player starts here (1 = second from the camera), so there is room to dodge both ways. */
  startLane: 1,
  /** Pixels each lane sits higher on screen than the one below it. */
  spacing: 15,
  /** Scale lost per lane (lane 3 is drawn at 1 - 3 * 0.06 = 82%). */
  scaleStep: 0.06,
  /** Brightness lost per lane (0.09 = 9% darker each). */
  tintStep: 0.09,
  /** Draw order: lane f sits at depthBase - depthStep * f (+ a small per-entity offset). */
  depthBase: 2.9,
  depthStep: 0.4,
  /** Two things collide only when their depths are closer than this (a swerve counts). */
  hitBand: 0.55,
  /** Depth speed (lanes per second) of the player while Up/Down is held, and how fast it eases in. */
  moveSpeed: 2.1,
  moveEase: 10,
  /** Gas or brake (0..1, analog on a pad) needed to change lanes: the truck must be driven across, not slid. */
  minDriveToSteer: 0.2,
  /** Share of its speed the player rebounds with when a lane change hits another vehicle. */
  rebound: 0.35,
  /** Another vehicle blocks a depth move when its x is closer than this (px): the trucks overlap. */
  blockX: 118,
  /** Same for a wreck (smaller than a truck). */
  blockXWreck: 106,
  /** Side-swipe damage: impact = closing speed * `sideSlip` + the lane speed in px/s * `sideLane`. */
  sideSlip: 0.6,
  sideLane: 55,
  /** A side-swipe always costs at least this much damage while the truck is moving (0..1). */
  sideMinDamage: 0.06,
  /** Seconds before the same vehicle can be side-swiped (and hurt the player) again. */
  sideCooldown: 1.1,
  /** Pickups are grabbed by touching the truck at ANY depth (no lane check). */
} as const;

/** Fuel tank. Fuel is the run's clock: it drains continuously and cans refill it. */
export const FUEL = {
  start: 1,
  /** Tank fraction drained per second at standstill on the first metre. */
  baseDrain: 0.015,
  /** Extra drain at top speed (0.5 = +50%). Fast driving burns more per second, less per metre. */
  speedFactor: 0.5,
  /** Extra drain reached at `distanceRampMeters` (0.5 = +50%). */
  distanceFactor: 0.5,
  distanceRampMeters: 3000,
  /** Tank fraction restored by one can. */
  canRestore: 0.3,
  /** Below this the gauge blinks. */
  low: 0.25,
  /** Speed (px/s) assumed when guaranteeing that the next can is reachable (a slowish pace). */
  refSpeed: 380,
  /** Gap between cans, measured as a fraction of what ONE can restores (see roadmap, balance sheet). */
  minGapRatio: 0.7,
  maxGapRatio: 0.95,
  /** Distance over which the gap ratio ramps from min to max. */
  gapRampMeters: 2500,
  /** With the tank empty the truck coasts; the run ends below this speed (px/s)... */
  coastStopSpeed: 30,
  /** ...or after this many seconds, whichever comes first. */
  coastMaxTime: 5,
} as const;

/**
 * Checkpoints: a gate every `firstMeters` (each segment `growthMeters` longer than the last).
 * Reaching one adds time and fuel; running out of time ends the run (like the original's C.P. clock).
 */
export const CHECKPOINT = {
  /** Length of the first segment (m). */
  firstMeters: 1000,
  /** Each following segment is this much longer (m). */
  growthMeters: 150,
  /**
   * The pace (m/s) a good player drives a segment at: playtesters reach the first checkpoint
   * (1,000 m) in about 60 s, so 1000 / 60. The clock is this pace's time times a slack factor.
   */
  playerMps: 1000 / 60,
  /**
   * Slack on the clock: the first segment gets 1.5x a good player's time (90 s for the first
   * checkpoint), and each later one `slackStep` less, down to `slackFloor`, so the clock stays
   * tight but fair as the run goes on.
   */
  slackFirst: 1.5,
  slackStep: 0.06,
  slackFloor: 1.2,
  /** Most seconds of clock left at a gate that carry over into the next segment (the rest still pays BONUS). */
  carryCap: 25,
  /** Tank fraction restored on reaching a checkpoint. */
  fuelBonus: 0.1,
  /** BONUS points for reaching one: flat + per second left on the clock. */
  basePoints: 250,
  pointsPerSecondLeft: 10,
  /** False makes the clock cosmetic (no loss on zero). */
  timeoutEndsRun: true,
  /** The clock blinks red below this many seconds. */
  warnSeconds: 10,
} as const;

export const SCORING = {
  snack: 100,
  fuelCan: 50,
  /** Points per metre driven. */
  perMeter: 10,
  maxCombo: 8,
  /** Pickups in a chain needed per +1 multiplier step. */
  comboStep: 3,
  /** Bonus awarded per full `airStep` seconds airborne. */
  airStep: 0.25,
  airPoints: 50,
  /** BONUS for wrecking a rival that you rammed (see `RIVALS.takedownWindow`). */
  takedown: 500,
  /** BONUS for dodging an obstacle by changing lanes at the last moment and passing it. */
  nearMiss: 50,
};

export const PICKUPS = {
  /** Distance above the ground (px) at which pickups float, about truck-centre height. */
  hover: 46,
  spacing: 56,
  maxLine: 6,
  /** Snack arc over a jump, relative to the lip: x offsets and heights above the lip's ground.
   *  Fitted to simulated flights (the truck leaves ramps low and lands ~150-270 px past the lip);
   *  the collect radius covers faster, higher jumps. */
  arcX: [70, 125, 180, 235, 290],
  arcY: [52, 62, 62, 48, 28],
  /** Truck-centre to pickup-centre distance (px) that collects it. */
  collectRadius: 54,
  /** A pickup this far behind the truck counts as missed (breaks the combo). */
  missMargin: 110,
  /** Spawn this far ahead of the truck (px). */
  spawnAhead: 2600,
  /** Keep this much behind the truck (px). */
  keepBehind: 500,
};

/** Wrench pickups: lie on the ground (like the reference) and repair damage. */
export const WRENCH = {
  /** Damage repaired by one wrench (damage runs 0..1). */
  restore: 0.3,
  /** Height of the wrench centre above the ground (px). */
  hover: 16,
  /** Metres to the first wrench, then the (min, max) metres between wrenches. */
  firstMeters: 250,
  gapMeters: [220, 420],
  /** A wrench never sits this close (px) to a can, a wreck or a jump. */
  clearance: 160,
} as const;

/** Truck-to-truck and truck-to-wreck collisions. */
export const COLLISION = {
  /** Body circles in chassis-local px, used for truck vs truck/wreck contact. */
  circles: [
    { x: -36, y: 4, r: 26 },
    { x: 0, y: -6, r: 28 },
    { x: 36, y: 4, r: 26 },
  ],
  /** Bounciness of truck-to-truck bumps (0 = dead stop, 1 = perfect bounce). */
  restitution: 0.3,
  /** Closing speed (px/s) below which a bump is free: braking and creeping is safe. */
  softSpeed: 170,
  /** Closing speed (px/s) below which contact is just rubbing: no event, no sound. */
  bumpSpeed: 60,
  /** Closing speed at which damage reaches its maximum. */
  hardSpeed: 520,
  /** Damage per hit runs from min to max with closing speed (balance sheet: 10-25%). */
  minDamage: 0.1,
  maxDamage: 0.25,
  /** Rivals are flimsier than the player so a takedown takes two hard hits, not six. */
  rivalDamageScale: 2.5,
  /** Seconds before the same pair can hurt each other again. */
  hitCooldown: 0.45,
  /** Largest positional push-out per frame (px), so contacts never teleport a truck. */
  maxPush: 14,
  /** A solid wreck that is hit takes this share of the truck's closing speed off the truck. */
  wreckDrag: 0.45,
  /** Small hop given to a truck that ploughs through a wreck (px/s upward). */
  wreckHop: 140,
  /** Bounce off a fixed obstacle (boulder, log). */
  obstacleRestitution: 0.25,
  /** Seconds a fixed obstacle that was just hit cannot hurt anyone again (it still pushes out). */
  obstacleCooldown: 0.5,
} as const;

/** Wrecked vehicles lying on the course. */
export const WRECKS = {
  /** No static wrecks before this many metres. */
  startMeters: 250,
  /** Chance per eligible chunk: from `chanceMin` at the start up to `chanceMax` at `rampMeters`. */
  chanceMin: 0.1,
  chanceMax: 0.3,
  rampMeters: 2500,
  /** Minimum distance between static wrecks (px) and from a jump's landing (px). */
  minSpacing: 2400,
  landingClear: 420,
  /** Two circles that make up a lying wreck: x offsets and common radius. */
  halfLength: 24,
  radius: 24,
  /** Debris (a wreck that was hit) is flung and fades out over this many seconds. */
  debrisLife: 1.4,
} as const;

/**
 * Roadside obstacles in the lanes: rocks and tire stacks are knocked loose on contact (a rock
 * hurts, a tire stack only slows you), logs and boulders stay put and are the real hazard: hit
 * one at speed and you stop dead and take damage. Obstacles are placed per terrain chunk (never on
 * a ramp or table, never just after a jump), and a row never blocks more than `maxBlocked` of the
 * lanes together with wrecks, so there is always a way through. A fixed obstacle can be avoided by
 * switching lanes, which always works, so nothing can trap a truck for good.
 */
export const OBSTACLE_KINDS = {
  /** radius: collision circle (px); offsets: circle centres along the ground; damageScale: x the
   *  normal bump damage; drag: share of the closing speed the hit takes off the truck. */
  rock: { radius: 15, offsets: [0], damageScale: 0.6, drag: 0.35, loose: true, fromMeters: 150, weight: 5 },
  tires: { radius: 17, offsets: [0], damageScale: 0, drag: 0.22, loose: true, fromMeters: 250, weight: 3 },
  log: { radius: 13, offsets: [-23, 23], damageScale: 0.9, drag: 0.5, loose: false, fromMeters: 400, weight: 3 },
  boulder: { radius: 27, offsets: [0], damageScale: 1.3, drag: 0.65, loose: false, fromMeters: 600, weight: 2 },
} as const;

export const OBSTACLES = {
  /** No obstacles before this many metres. */
  startMeters: 150,
  /** Chance per eligible chunk: from `chanceMin` at the start up to `chanceMax` at `rampMeters`. */
  chanceMin: 0.3,
  chanceMax: 0.8,
  rampMeters: 3000,
  /** A chance for a second obstacle in the row, rising with distance (min, max). */
  pairChance: [0.15, 0.5],
  /** Obstacles and wrecks within this many px of each other (along the road) form one row. */
  rowGap: 300,
  /** Minimum distance between rows (px). */
  rowSpacing: 420,
  /** At most this many lanes of a row may be blocked (count - 2 keeps two lanes open). */
  maxBlocked: 2,
  /** Keep clear of a jump's landing (px). */
  landingClear: 420,
  /** Loose obstacles fly off and fade over this many seconds. */
  debrisLife: 1.2,
  /** A dodge is counted once the truck has driven this far (px) past the obstacle. */
  passMargin: 40,
  /** Switching lanes marks obstacles from this far behind to this far ahead (px) in the old lane. */
  dodgeBehind: 40,
  dodgeAhead: 380,
} as const;

/** Rival trucks. */
export const RIVALS = {
  /** Rivals on the course at once: 1 at the start, +1 every `perMeters`, up to `max`. */
  max: 3,
  perMeters: 800,
  /** Seconds between spawns. */
  spawnCooldown: 3.5,
  /** Spawn this far ahead of / behind the player (px, off screen). */
  aheadMin: 1200,
  aheadMax: 1600,
  behind: 900,
  /** Rivals that fall this far behind / ahead are quietly removed (px). */
  despawnBehind: 1500,
  despawnAhead: 2600,
  /** The opening grid: rivals' x offsets from the start line. */
  grid: [320, 640],
  /** Cruise speed range per rival (px/s); skill picks a spot in it. */
  cruiseMin: 520,
  cruiseMax: 720,
  /** Rubber band: up to +/- this many px/s depending on distance to the player. */
  bandSpeed: 190,
  bandDistance: 700,
  /** Never target below this (px/s), or above the truck's top speed. */
  floorSpeed: 360,
  /**
   * Rivals use the same depth lanes as the player (see `LANES`). Each re-decides its lane every few
   * seconds, one lane at a time. Moving into the player's lane (or the one the player is heading
   * for) needs a clear gap (`laneGap`) and, if the rival is ahead, enough road to be seen coming
   * (`warnGap`). Rivals look `hazardLook` px ahead for wrecks and obstacles in their lane and
   * dodge them with a chance that grows with skill (`noticeBase`, `noticeSkill`): a careless rival
   * simply drives into the rock, which is how rivals crash on their own. A rival that has been
   * crawling for `stuckTime` seconds swerves to a free lane.
   */
  laneSwitchTime: 0.5,
  hazardLook: 520,
  noticeBase: 0.15,
  noticeSkill: 0.85,
  stuckTime: 0.8,
  laneGap: 170,
  warnGap: 480,
  /** Seconds between lane decisions (min, max). */
  laneRethink: [2.5, 5],
  /** Flipped (or dead-slow upside down) for this long and the rival becomes a wreck. */
  flipWreckTime: 1.4,
  /** Rammed within this many seconds counts as your takedown. */
  takedownWindow: 3,
  /** Draft: slipstream zone behind a rival. */
  draftGap: 260,
  draftHeight: 60,
  draftMinSpeed: 300,
  /** Seconds in the zone to reach full effect, and seconds to fade out. */
  draftBuild: 1,
  draftFade: 0.6,
  /** At full draft: engine force and top speed multipliers (extra). */
  draftForce: 0.45,
  draftTop: 0.12,
} as const;

/**
 * Phase 9: the monster-truck show. In the last `fraction` of every `BIOMES.checkpointsPer`-th
 * segment (the ones that end at a biome border) the course turns into a stage: a row of boost pads
 * (the first ones on the flat, the rest up the ramp face), one big launch ramp, a pit of parked
 * cars, a landing ramp and pyrotechnics on both ramps. The pads' surge cannot be braked, the
 * stage has no obstacles, and flying over the cars spells CRUNCH in fireworks. All lengths are px
 * along the road and multiples of `TERRAIN_STEP`.
 */
export const STUNT = {
  /** The stage sits inside the last share of the segment that ends at a biome border. */
  fraction: 0.1,
  /** Flat run-out between the landing and the biome gate. */
  gateMargin: 192,
  /** Flat approach before the first pad. */
  lead: 288,
  /** Pads on the flat: how many, their length along the road and the gap between them. */
  flatPads: 4,
  padLength: 112,
  padGap: 128,
  /** Pads on the ramp face, as shares of the ramp's length. */
  rampPads: [0.28, 0.5, 0.72],
  /** The launch ramp: length, height, and the curve exponent (higher = flatter start, steeper lip). */
  rampLength: 1040,
  rampHeight: 288,
  rampCurve: 1.9,
  /** The sheer face behind the lip. */
  lipDrop: 64,
  /** The pit between the ramps, and the parked cars in it. */
  pitLength: 1280,
  carSpacing: 140,
  /** The landing ramp: a wall up to a table, then a long gentle slope down. */
  landWall: 64,
  landHeight: 112,
  landTop: 96,
  landSlope: 0.4,
  /** Flat road after the landing ramp. */
  runout: 192,
  // --- the show camera (Phase 9.5) ---
  /** The framing locks on the truck this far past the start of the first pad (px): 0 = the moment it hits the first boost. */
  camLead: 0,
  /** The framing lets go this far before the landing wall (px), while the truck is still in the air, so the normal view is back by touchdown. */
  camRelease: 340,
  /** Slow motion: it starts this far before the lip (px), runs at this game speed, and eases in/out at `slowRate` per second. */
  slowLead: 420,
  slowScale: 0.68,
  slowRate: 5,
  /** The slow motion and the framing hold this long (real seconds) after the landing so the finale is seen. */
  slowHold: 1.4,
  /** Clear flat road after the stunt landing (metres). */
  clearRunoutMeters: 50,

  // --- the surge ---
  /** Seconds a pad keeps the surge alive (the clock stops while airborne). */
  surgeTime: 1.1,
  /** After landing the surge lasts at most this long, then it fades. */
  landSurge: 0.25,
  /** Engine force and top speed multipliers at full surge. */
  forceMult: 1.8,
  topMult: 1.18,
  /** Speed (px/s) each pad kicks along the road. */
  padKick: 170,
  /** Seconds to reach full surge and to fade back to normal. */
  rise: 0.18,
  fall: 1.2,
  /** Extra drag (per second) on the speed above the normal top speed while the surge fades. */
  overspeedDrag: 2.4,
  /** Share of the pitch torque used to hold the truck level on the ground while surging. */
  stabilize: 1.6,
  /** Share of the player's landing assist that stays on in the air while surging (1 = all of it). */
  airAssist: 1,
  /** Launch spin is disabled so the truck consistently lands on its wheels. */
  kick: 0,

  /** Snack arc over the pit, fitted to simulated flights (x from the lip, truck-centre height above the lip's ground). */
  arcX: [210, 305, 400, 495, 590, 685, 780, 875, 970, 1065, 1160, 1255],
  arcY: [133, 164, 188, 205, 215, 217, 212, 200, 181, 154, 121, 80],

  // --- the show ---
  /** The fireworks start when the truck is this far before the lip (px). */
  skyLead: 560,
  /** Seconds between rockets, and how long a rocket takes to climb to its letter. */
  rocketGap: 0.07,
  rocketClimb: 0.7,
  /** Letter dot grid: spacing between dots and between letters (px). */
  dot: 12,
  letterAdvance: 84,
  /** Height of the lettering centre above the lip. */
  skyHeight: 250,
  /** Seconds the lettering lingers. */
  skyLife: 4.2,
  /** Pyro fountains burn this long (s) once triggered, starting this far (px) before the truck arrives. */
  pyroTime: 1.8,
  pyroLead: 380,

  // --- scoring and safety ---
  /** BONUS for landing the jump, plus per parked car flown over, and per flip. */
  clearBonus: 1000,
  carBonus: 150,
  flipBonus: 500,
  /** No damage from bumps while surging and for this long after the landing (s). */
  grace: 2.5,
  /** A truck left upside down during the show is set back on its wheels after this long (s). */
  rightAfter: 0.9,
  /** Rivals do not spawn from this far before the stage until the landing (px). */
  noSpawnBefore: 1800,
} as const;

/** Art pass (Phase 5): pre-rendered trucks, biomes, and particle effects. */
export const ART = {
  /**
   * Frames in each truck's pre-rendered rotation strip (the original used pre-rendered sprites).
   * The body snaps to the nearest frame while the wheels stay exact, which looks steppy at speed,
   * so it is off (0) by default: one sprite, rotated smoothly. Try 48+ if you want the retro look.
   */
  rotationFrames: 0,
  /** Un-rotated truck sprite (px) and where the chassis centre sits in it. */
  truckW: 144,
  truckH: 136,
  truckCx: 72,
  truckCy: 88,
  /** Side (px) of one square rotation frame; must hold the sprite turned to any angle. */
  frame: 200,
} as const;

/** Biomes rotate with the checkpoints: forest, desert, snow, swamp, then round again. */
export const BIOMES = {
  /** A new biome starts every this many checkpoints. */
  checkpointsPer: 2,
  /** Seconds the backdrop takes to cross-fade once the screen centre passes the border. */
  fadeSeconds: 1.6,
  /** Width (px) of the strip centred on a biome border where the ground colours blend into the next biome's. */
  groundBlend: 360,
} as const;

/** Particles, mud spray and tire tracks. */
export const FX = {
  maxParticles: 360,
  /** Mud and dust thrown by a wheel on the ground: none below `minSpeed`, full rate at `fullSpeed`. */
  spray: { minSpeed: 160, fullSpeed: 800, perSecond: 46 },
  /** Tire tracks: a mark every `spacing` px, never joined across a gap larger than `maxGap`. */
  tracks: { minSpeed: 120, spacing: 12, maxGap: 90, max: 700, alpha: 0.55, width: 3 },
} as const;

/** Audio (Phase 6): an original adaptive score plus synthesized SFX, all generated at runtime. */
export const AUDIO = {
  /** Tempo of the original theme; one bar is 16 sixteenth-note steps, the hook runs 4 bars. */
  bpm: 132,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  /** How far ahead (s) the sequencer schedules notes on the audio clock. */
  lookahead: 0.25,
  /** Time constant (s) of stem fades, so layers swell in rather than switch. */
  stemFade: 0.5,
  /**
   * Stem thresholds: [from, to] ranges of speed (0..1 of top speed) over which a layer fades in.
   * The pad is always on; drums join first, then bass; the lead joins with speed or combo.
   */
  drumsSpeed: [0.12, 0.35],
  bassSpeed: [0.3, 0.6],
  leadSpeed: [0.62, 0.92],
  /** The lead also joins from combo x2 (quietly) to this multiplier (full). */
  leadCombo: [2, 5],
  /** Low fuel closes a lowpass on the music from `open` Hz (tank at FUEL.low) down to `closed` (dry). */
  lowFuelCutoff: { open: 18000, closed: 800 },
  /** Semitone shift of the whole theme per biome (forest, desert, snow, swamp), applied at a loop start. */
  biomeTranspose: [0, 2, -2, 3],
} as const;

/** Progression (Phase 7): coins, upgrades, high scores. All saved locally. */
export const PROGRESSION = {
  saveKey: 'snack-run:save',
  /** Entries kept in the high-score table. */
  highScores: 10,
  /** Coins (the "snack bank") earned by a run. */
  coins: {
    perSnack: 2,
    /** One coin per this many metres. */
    meters: 25,
    perCheckpoint: 15,
    perTakedown: 10,
    perNearMiss: 2,
  },
  /**
   * Garage upgrades. Level n costs `cost * growth^n` (n from 0); each level adds `perLevel`:
   * tank = bigger capacity (a can or checkpoint then fills a smaller share of it, and you start
   * with more fuel); efficiency = less fuel burned; armor = less damage taken.
   */
  upgrades: {
    tank: { name: 'Tank size', blurb: '+20% capacity per level', max: 5, cost: 330, growth: 1.8, perLevel: 0.2 },
    efficiency: { name: 'Fuel efficiency', blurb: '-7% fuel burned per level', max: 5, cost: 260, growth: 1.8, perLevel: 0.07 },
    armor: { name: 'Damage resistance', blurb: '-8% damage taken per level', max: 5, cost: 310, growth: 1.8, perLevel: 0.08 },
  },
} as const;
