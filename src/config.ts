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
  engineForce: 380, // per wheel
  topSpeed: 900, // px/s along the ground
  brakeForce: 420, // per wheel
  reverseForce: 160,
  reverseTop: 260,
  rollingResistance: 0.08, // along-ground drag coefficient at contacts
  driveLever: 0.2, // fraction of the real lever arm used for drive torque (anti-wheelie)
  airDrag: 0.04,

  // Lean (pitch) control
  airTorque: 11000,
  groundTorque: 4200,
  airAngularDamping: 0.9, // per second
  maxAngularVelocity: 7,
} as const;

/** Truck contact layout in chassis-local px (x forward, y down). */
export const TRUCK = {
  wheels: [
    { x: -42, y: 22 }, // rear
    { x: 42, y: 22 }, // front
  ],
  body: [
    { x: -30, y: -30 }, // cab roof rear
    { x: 8, y: -30 }, // cab roof front
    { x: -58, y: -6 }, // tail
    { x: 58, y: -2 }, // nose
  ],
  bodyRadius: 4,
};

export const CAMERA = {
  /** Fraction of the screen width the truck sits from the left edge. */
  xAnchor: 0.3,
  /** Fraction of the screen height the truck sits from the top. */
  yAnchor: 0.62,
  yLerp: 4, // per second
  lookAhead: 0.18, // seconds of velocity added to x target
};

/** Reference camera scrollY when the truck rests on the baseline; used for parallax Y. */
export const SCROLL_Y0 = BASE_Y - 40 - VIEW_H * CAMERA.yAnchor;

export const GAMEPLAY = {
  /** Airtime (s) below which a landing is not announced. */
  minAirToast: 0.35,
  /** Seconds stuck upside down before auto-recovery. */
  flipRecoverTime: 2,
  startX: 200,
  flatStartPx: 900,
  /** Endless-runner mode: the truck drives itself; brake and lean stay manual. T toggles. */
  autoGas: true,
};

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
  canRestore: 0.35,
  /** Below this the gauge blinks. */
  low: 0.25,
  /** Speed (px/s) assumed when guaranteeing that the next can is reachable (a slowish pace). */
  refSpeed: 380,
  /** Gap between cans, measured as a fraction of what ONE can restores (see roadmap, balance sheet). */
  minGapRatio: 0.5,
  maxGapRatio: 0.8,
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
  /** Time allowance per segment = length / pace (m/s). 8 m/s is a slow drive; top speed is ~22 m/s. */
  paceMps: 8,
  /** Extra seconds on the very first clock so the opening is forgiving. */
  startBuffer: 20,
  /** Tank fraction restored on reaching a checkpoint. */
  fuelBonus: 0.15,
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
  firstMeters: 400,
  gapMeters: [450, 800],
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
   * Depth lanes, like the original's pseudo-3D track: the near lane is the player's, rivals also
   * use a far lane (drawn higher and smaller) where nothing collides with the player. Rivals hop
   * between lanes with `laneSwitchTime`; a rival only drops into the player's lane when it is
   * clear of the player's truck (`laneGap`) and, if it is ahead, far enough up the road to be seen
   * coming (`warnGap`). Skilled rivals leave the near lane when a wreck lies within `wreckLook`.
   */
  laneSwitchTime: 0.5,
  laneGap: 170,
  warnGap: 480,
  /** Seconds between lane decisions (min, max). */
  laneRethink: [2.5, 5],
  wreckLook: 450,
  /** Far-lane look: pixels higher on screen and scale. */
  farOffset: 18,
  farScale: 0.9,
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
  truckH: 92,
  truckCx: 72,
  truckCy: 56,
  /** Side (px) of one square rotation frame; must hold the sprite turned to any angle. */
  frame: 176,
} as const;

/** Biomes rotate with the checkpoints: forest, desert, snow, swamp, then round again. */
export const BIOMES = {
  /** A new biome starts every this many checkpoints. */
  checkpointsPer: 2,
  /** Seconds the backdrop takes to cross-fade once the screen centre passes the border. */
  fadeSeconds: 1.6,
} as const;

/** Particles, mud spray and tire tracks. */
export const FX = {
  maxParticles: 360,
  /** Mud and dust thrown by a wheel on the ground: none below `minSpeed`, full rate at `fullSpeed`. */
  spray: { minSpeed: 160, fullSpeed: 800, perSecond: 46 },
  /** Tire tracks: a mark every `spacing` px, never joined across a gap larger than `maxGap`. */
  tracks: { minSpeed: 120, spacing: 12, maxGap: 90, max: 700, alpha: 0.55, width: 3 },
} as const;
