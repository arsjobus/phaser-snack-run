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
};
