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
