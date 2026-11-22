import Phaser from 'phaser';
import { ART, TRUCK } from '../config';
import { PLAYER_WHEEL, RIVAL_STYLES, type BodyKind } from '../game/Rival';
import { Rng } from '../game/Rng';
import { axleY, tireRadius } from '../game/Tires';
import { SKINS } from '../progress/Skins';
import { drawPixelText, drawPixelTextCentered } from './pixelFont';
import { ARCH_GAP, BODY_BOTTOM, BODY_HALF, PLAYER_BADGE, undersideY } from './chassis';

export interface Paint {
  body: number;
  light: number;
  stripe: number;
  /** Number-roundel background. */
  plate: number;
}

/** The default paint job (the garage sells more: see `src/progress/Skins.ts`). */
export const PLAYER_PAINT: Paint = SKINS[0].paint;

/** One livery per rival style, in `RIVAL_STYLES` order. */
export const RIVAL_PAINT: readonly Paint[] = [
  { body: 0xd2392b, light: 0xff7a66, stripe: 0x111111, plate: 0xffffff }, // red #3
  { body: 0x2f6fd6, light: 0x7fb0ff, stripe: 0xffe066, plate: 0xffffff }, // blue #8
  { body: 0x2a2a2e, light: 0x5a5a62, stripe: 0xe8742a, plate: 0xffe066 }, // black #5
  { body: 0x2f9e4a, light: 0x7fe08f, stripe: 0xffffff, plate: 0xffffff }, // green #7
  { body: 0xe8742a, light: 0xffb36b, stripe: 0x7a1f0f, plate: 0xffffff }, // orange #2
  { body: 0x8a3fc4, light: 0xc48aff, stripe: 0xffe066, plate: 0xffffff }, // purple #9
];

const OUT = 0x111111;
const GLASS = 0x1b2b4a;
const GLARE = 0x6fa8d6;
const LAMP = 0xfff7c2;
const DARK = 0x333333;

/** Multiply each channel of a colour (`f` < 1 darkens). */
export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  color: number;
}

/** Truck-sprite texture key of the un-rotated body, the player's and each rival's. */
export const PLAYER_TRUCK_KEY = 'truck_body';
export const rivalTruckKey = (style: number): string => `rival_${style}`;
/** Texture key of the player's body in a garage paint job (the default paint keeps `truck_body`). */
export const playerTruckKey = (skinId: string): string =>
  skinId === SKINS[0].id ? PLAYER_TRUCK_KEY : `${PLAYER_TRUCK_KEY}_${skinId}`;
/** Key of the pre-rendered rotation strip made from a body texture. */
export const atlasKey = (key: string): string => `${key}_rot`;

/**
 * Draws one truck facing right into `g`, its chassis centre at (ART.truckCx, ART.truckCy). The
 * truck is monster-truck lifted: the body is drawn `TRUCK.lift` px higher (more for bigger tires)
 * on a visible frame rail, axles, driveshaft, shocks and radius arms, and the tires (separate
 * images, `TRUCK.tireRadius * wheel` big) sit in wheel arches cut up into the underside of the body
 * (the body's underside is lowered by a skirt so the arches have something to cut into; see
 * `src/art/chassis.ts`).
 */
export function drawTruck(
  g: Phaser.GameObjects.Graphics,
  kind: BodyKind,
  paint: Paint,
  number: number | null,
  wheel: number,
  seed: number,
): void {
  const lift = TRUCK.lift + (tireRadius(wheel) - tireRadius(1));
  const ox = ART.truckCx;
  const oy = ART.truckCy - lift; // the body's frame: everything below is drawn in the old coordinates
  const R = tireRadius(wheel);
  const axle = ART.truckCy + axleY(wheel); // where the axles (and the tire centres) are
  const bb = oy + undersideY(kind, wheel); // underside of the body (after the skirt)
  const body = paint.body;
  const dark = shade(body, 0.72);

  const rect = (color: number, x: number, y: number, w: number, h: number): void => {
    g.fillStyle(color, 1);
    g.fillRect(ox + x, oy + y, w, h);
  };
  const round = (color: number, x: number, y: number, w: number, h: number, r: number): void => {
    g.fillStyle(color, 1);
    g.fillRoundedRect(ox + x, oy + y, w, h, r);
  };
  const solid = (parts: Part[]): void => {
    for (const p of parts) round(OUT, p.x - 2, p.y - 2, p.w + 4, p.h + 4, p.r + 2);
    for (const p of parts) round(p.color, p.x, p.y, p.w, p.h, p.r);
  };
  const line = (w: number, color: number, x0: number, y0: number, x1: number, y1: number): void => {
    g.lineStyle(w, color, 1);
    g.lineBetween(ox + x0, oy + y0, ox + x1, oy + y1);
  };
  const disc = (color: number, x: number, y: number, r: number): void => {
    g.fillStyle(color, 1);
    g.fillCircle(ox + x, oy + y, r);
  };
  /** A wheel arch: the upper half of a disc around an axle, cut off at the bumpers and the body's underside. */
  const arch = (color: number, wx: number, r: number): void => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      pts.push({
        x: ox + Math.max(-BODY_HALF, Math.min(BODY_HALF, wx + Math.cos(a) * r)),
        y: Math.min(bb, axle + Math.sin(a) * r),
      });
    }
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
  };
  /** A wheel arch cut up into the body: a darker fender flare, the outline, then the dark well the tire sits in. */
  const well = (wx: number): void => {
    arch(shade(body, 0.62), wx, R + ARCH_GAP + 6);
    arch(OUT, wx, R + ARCH_GAP + 2);
    arch(0x120d0a, wx, R + ARCH_GAP);
    arch(0x2a1d14, wx, R + ARCH_GAP - 5); // a lighter mud-caked lining high in the arch
    arch(0x120d0a, wx, R + ARCH_GAP - 8);
  };
  /**
   * Number roundel on the door. The player's truck has no number: it wears a CRUNCH badge (the
   * snack's name, like the van's side panel) in a roundel-sized spot on the door instead.
   */
  const roundel = (cx: number, cy: number, r: number): void => {
    if (number === null) {
      const b = PLAYER_BADGE;
      round(OUT, b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h, 3);
      round(paint.plate, b.cx - b.w / 2 + 1, b.cy - b.h / 2 + 1, b.w - 2, b.h - 2, 2);
      drawPixelTextCentered(g, 'CRUNCH', ox + b.cx, oy + b.cy, 2, OUT);
      return;
    }
    disc(OUT, cx, cy, r + 1.5);
    disc(paint.plate, cx, cy, r);
    drawPixelTextCentered(g, String(number), ox + cx, oy + cy, 2, OUT);
  };
  const headlamp = (x: number, y: number): void => {
    rect(LAMP, x, y, 6, 8);
    rect(0xffffff, x + 1, y + 1, 2, 3);
  };

  // Undercarriage (drawn first, so the body covers the tops of the mounts): frame rail, skid plate,
  // driveshaft, radius arms, coil-over shocks and axle housings, all visible in the lift gap.
  {
    const steel = 0x555a63;
    const coil = 0xe8a020;
    const rail = (x: number, y: number, w: number, h: number, color: number): void => {
      g.fillStyle(OUT, 1);
      g.fillRect(ox + x - 1.5, y - 1.5, w + 3, h + 3);
      g.fillStyle(color, 1);
      g.fillRect(ox + x, y, w, h);
    };
    rail(-56, bb - 3, 112, 8, 0x2a2a2d); // frame rail
    rail(-52, bb + 4, 104, 2, 0x3c3c40);
    rail(-16, bb + 3, 32, 6, steel); // transfer case skid plate
    // Driveshaft between the two diffs, with U-joints.
    g.lineStyle(5, OUT, 1);
    g.lineBetween(ox - 42, axle, ox + 42, axle);
    g.lineStyle(3, 0x8a8f99, 1);
    g.lineBetween(ox - 42, axle, ox + 42, axle);
    g.fillStyle(OUT, 1);
    g.fillCircle(ox - 16, axle, 4.5);
    g.fillCircle(ox + 16, axle, 4.5);
    g.fillStyle(steel, 1);
    g.fillCircle(ox - 16, axle, 2.8);
    g.fillCircle(ox + 16, axle, 2.8);
    for (const wx of [-42, 42]) {
      const inward = wx < 0 ? 1 : -1; // towards the middle of the truck
      // Radius arm: from the axle diagonally up to the frame.
      g.lineStyle(7, OUT, 1);
      g.lineBetween(ox + wx, axle, ox + wx + inward * 30, bb + 1);
      g.lineStyle(4, 0x3c3c40, 1);
      g.lineBetween(ox + wx, axle, ox + wx + inward * 30, bb + 1);
      // Coil-over shock leaning outwards, with a bright spring.
      const x0 = ox + wx - inward * 12;
      const x1 = ox + wx - inward * 4;
      g.lineStyle(6, OUT, 1);
      g.lineBetween(x0, bb - 2, x1, axle - 4);
      g.lineStyle(2, 0xc9ccd2, 1);
      g.lineBetween(x0, bb - 2, x1, axle - 4);
      g.lineStyle(4, coil, 1);
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t0 = 0.12 + (i / steps) * 0.7;
        const t1 = t0 + 0.07;
        g.lineBetween(x0 + (x1 - x0) * t0, bb - 2 + (axle - 4 - (bb - 2)) * t0, x0 + (x1 - x0) * t1, bb - 2 + (axle - 4 - (bb - 2)) * t1);
      }
      // Axle housing and diff pumpkin behind the tire.
      g.fillStyle(OUT, 1);
      g.fillCircle(ox + wx, axle, 9);
      g.fillStyle(steel, 1);
      g.fillCircle(ox + wx, axle, 7);
      g.fillStyle(0x777b84, 1);
      g.fillCircle(ox + wx - 2, axle - 2, 2.4);
    }
  }

  // Skirt: lowers the body's underside so the arches below have metal to cut into (no flat bottoms).
  {
    const top = BODY_BOTTOM[kind] - 8;
    const x0 = kind === 'buggy' ? -48 : -BODY_HALF + 3;
    const w = kind === 'buggy' ? 98 : (BODY_HALF - 3) * 2;
    solid([{ x: x0, y: top, w, h: undersideY(kind, wheel) - top, r: 5, color: dark }]);
  }

  switch (kind) {
    case 'suv': {
      solid([
        { x: -62, y: -8, w: 124, h: 32, r: 7, color: body },
        { x: -44, y: -32, w: 60, h: 28, r: 7, color: body },
      ]);
      rect(shade(body, 0.8), -60, 16, 120, 7); // lower shade
      rect(paint.light, -40, -31, 52, 3); // roof highlight
      rect(paint.light, 22, -8, 38, 3); // hood highlight
      rect(paint.stripe, -62, 9, 124, 5);
      round(GLASS, -38, -27, 25, 16, 3);
      round(GLASS, -9, -27, 21, 16, 3);
      rect(GLARE, -36, -25, 9, 4);
      rect(GLARE, -7, -25, 8, 4);
      well(-42);
      well(42);
      roundel(number === null ? PLAYER_BADGE.cx : -22, number === null ? PLAYER_BADGE.cy : 3, 9);
      rect(DARK, -42, -36, 56, 3); // roof rack and spotlights
      rect(LAMP, -36, -40, 6, 4);
      rect(LAMP, -20, -40, 6, 4);
      headlamp(55, -3);
      rect(DARK, 54, 16, 11, 6); // bumpers
      rect(DARK, -66, 16, 8, 6);
      break;
    }
    case 'pickup': {
      solid([
        { x: -62, y: -6, w: 124, h: 30, r: 6, color: body },
        { x: -2, y: -30, w: 44, h: 26, r: 6, color: body },
        { x: -62, y: -14, w: 58, h: 10, r: 2, color: dark }, // bed sidewall
      ]);
      rect(0x26262a, -58, -11, 50, 6); // inside the bed
      round(0xc79a5b, -52, -20, 15, 11, 2); // two cracker crates
      round(0xe0b878, -36, -18, 13, 9, 2);
      rect(shade(body, 0.8), -60, 16, 120, 7);
      rect(paint.stripe, -62, 12, 124, 4);
      rect(paint.light, 4, -29, 34, 3);
      rect(paint.light, 22, -6, 38, 3);
      round(GLASS, 5, -25, 15, 17, 3);
      round(GLASS, 22, -25, 16, 17, 3);
      rect(GLARE, 7, -23, 6, 4);
      rect(GLARE, 24, -23, 6, 4);
      well(-42);
      well(42);
      roundel(14, 8, 8);
      rect(DARK, 2, -34, 36, 4); // light bar
      rect(LAMP, 6, -35, 5, 3);
      rect(LAMP, 17, -35, 5, 3);
      rect(LAMP, 28, -35, 5, 3);
      line(3, DARK, -4, -6, -4, -32); // headache rack
      headlamp(55, -2);
      rect(DARK, 54, 16, 11, 6);
      rect(DARK, -66, 16, 8, 6);
      break;
    }
    case 'monster': {
      // Fenders hug the big tires; the body rides high above them.
      const fr = R + 5;
      for (const wx of [-42, 42]) arch(OUT, wx, fr + 2);
      solid([
        { x: -58, y: -24, w: 116, h: 34, r: 8, color: body },
        { x: -28, y: -48, w: 54, h: 28, r: 8, color: body },
      ]);
      for (const wx of [-42, 42]) arch(body, wx, fr);
      rect(shade(body, 1.35), -56, -23, 112, 3);
      rect(paint.stripe, -58, -8, 116, 5); // flame stripe base
      for (let i = 0; i < 7; i++) g.fillTriangle(ox - 58 + i * 17, oy - 3, ox - 46 + i * 17, oy - 3, ox - 54 + i * 17, oy + 6);
      round(GLASS, -22, -43, 22, 16, 3);
      round(GLASS, 3, -43, 20, 16, 3);
      rect(GLARE, -20, -41, 8, 4);
      rect(GLARE, 5, -41, 7, 4);
      well(-42);
      well(42);
      roundel(0, -9, 8);
      rect(0x8a8f99, -38, -58, 4, 18); // exhaust stacks
      rect(0x8a8f99, -31, -58, 4, 18);
      rect(DARK, -24, -52, 44, 4); // roof lights
      for (const lx of [-20, -8, 4, 16]) rect(LAMP, lx, -56, 6, 4);
      rect(DARK, 58, -12, 8, 22); // bull bar
      headlamp(52, -14);
      break;
    }
    case 'jeep': {
      solid([
        { x: -60, y: -2, w: 122, h: 26, r: 6, color: body },
        { x: 12, y: -12, w: 50, h: 14, r: 5, color: body }, // hood
      ]);
      round(0x26262a, -42, -8, 50, 8, 2); // open cockpit
      round(0x3a3a40, -34, -18, 14, 18, 3); // seat
      disc(0xf1c27d, -24, -24, 6); // driver
      g.fillStyle(paint.stripe, 1);
      g.slice(ox - 24, oy - 25, 7, Math.PI, Math.PI * 2, false);
      g.fillPath();
      rect(0x111111, -21, -26, 5, 3); // visor
      line(4, OUT, -42, -2, -36, -38); // roll cage and windscreen
      line(4, OUT, -36, -38, 18, -38);
      line(4, OUT, 18, -38, 26, -12);
      line(3, OUT, -10, -38, -10, -4);
      line(1.5, paint.light, -36, -38, 18, -38);
      rect(shade(body, 0.8), -58, 16, 118, 7);
      rect(paint.stripe, -60, 9, 122, 4);
      rect(paint.light, 18, -12, 42, 3);
      well(-42);
      well(42);
      roundel(-14, 12, 7);
      disc(OUT, -64, 4, 10); // spare tire
      disc(0x2a2a2a, -64, 4, 8);
      disc(0xb8bcc4, -64, 4, 3);
      headlamp(56, -6);
      rect(DARK, 56, 16, 10, 6);
      break;
    }
    case 'van': {
      solid([{ x: -62, y: -34, w: 124, h: 58, r: 9, color: body }]);
      rect(paint.light, -58, -33, 100, 3);
      rect(shade(body, 0.8), -60, 17, 120, 6);
      rect(paint.stripe, -62, 11, 124, 5);
      drawPixelText(g, 'CRUNCH', ox - 56, oy - 28, 2, paint.plate);
      round(GLASS, -6, -28, 20, 15, 3);
      round(GLASS, 16, -28, 16, 15, 3);
      round(GLASS, 36, -28, 22, 15, 3); // windscreen
      rect(GLARE, -4, -26, 7, 4);
      rect(GLARE, 38, -26, 8, 4);
      line(2, OUT, 33, -30, 33, 8); // door line
      line(2, OUT, -14, -6, -14, 12); // sliding door
      well(-42);
      well(42);
      roundel(-34, 1, 8);
      rect(DARK, -30, -39, 24, 4); // roof vent
      rect(DARK, 62, 0, 4, 18); // front bumper
      headlamp(55, -4);
      rect(DARK, -66, 16, 6, 6);
      break;
    }
    case 'buggy': {
      solid([
        { x: -50, y: 2, w: 102, h: 20, r: 6, color: body },
        { x: 34, y: 4, w: 28, h: 14, r: 5, color: body }, // nose
        { x: -64, y: -4, w: 22, h: 14, r: 3, color: 0x555a63 }, // engine
      ]);
      rect(0x26262a, -30, -4, 40, 8); // cockpit
      line(3, OUT, -62, -2, -62, -22); // wing struts
      rect(OUT, -68, -26, 22, 6); // rear wing
      rect(paint.stripe, -66, -25, 18, 3);
      line(4, OUT, -34, 2, -26, -32); // roll cage
      line(4, OUT, -26, -32, 12, -32);
      line(4, OUT, 12, -32, 24, 2);
      line(3, OUT, -8, -32, -8, 2);
      line(1.5, paint.light, -26, -32, 12, -32);
      disc(OUT, -4, -17, 8.5); // helmeted driver
      disc(paint.stripe, -4, -17, 7);
      rect(OUT, -1, -20, 7, 5);
      rect(0x9be0ff, 0, -19, 5, 3);
      rect(paint.stripe, -50, 10, 102, 4);
      rect(paint.light, -46, 3, 80, 2);
      roundel(4, 12, 7);
      line(3, 0x8a8f99, -64, 8, -76, 14); // exhaust
      headlamp(56, 5);
      break;
    }
  }

  // Dried mud flicked up the lower body and roof.
  const rng = new Rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-58, 58);
    const y = kind === 'buggy' ? rng.range(6, 22) : rng.range(kind === 'monster' ? -6 : 8, 22);
    g.fillStyle(rng.next() < 0.5 ? 0x4a3220 : 0x6b4a2a, rng.range(0.35, 0.7));
    g.fillRect(ox + x, oy + y, rng.range(1.5, 4), rng.range(1, 2.5));
  }
}

/** Builds the un-rotated truck textures (the player's and one per rival style). */
export function makeTruckTextures(scene: Phaser.Scene): string[] {
  const keys: string[] = [];
  const build = (key: string, kind: BodyKind, paint: Paint, number: number | null, wheel: number, seed: number) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawTruck(g, kind, paint, number, wheel, seed);
    g.generateTexture(key, ART.truckW, ART.truckH);
    g.destroy();
    keys.push(key);
  };
  for (const skin of SKINS) build(playerTruckKey(skin.id), 'suv', skin.paint, null, PLAYER_WHEEL, 1);
  RIVAL_STYLES.forEach((st, i) => build(rivalTruckKey(i), st.kind, RIVAL_PAINT[i], st.number, st.wheel, 10 + i));
  return keys;
}

/**
 * Pre-renders a truck at `ART.rotationFrames` angles into one canvas texture (frames "0".."n-1",
 * frame k = the truck turned k * 360/n degrees clockwise, centred in its frame).
 */
export function makeRotationAtlas(scene: Phaser.Scene, key: string): void {
  const n = ART.rotationFrames;
  if (n <= 0) return;
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const size = ART.frame;
  const cols = Math.min(n, 8);
  const rows = Math.ceil(n / cols);
  const tex = scene.textures.createCanvas(atlasKey(key), cols * size, rows * size);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  for (let k = 0; k < n; k++) {
    const fx = (k % cols) * size;
    const fy = Math.floor(k / cols) * size;
    ctx.save();
    ctx.translate(fx + size / 2, fy + size / 2);
    ctx.rotate((k * Math.PI * 2) / n);
    ctx.drawImage(src, -ART.truckCx, -ART.truckCy);
    ctx.restore();
    tex.add(String(k), 0, fx, fy, size, size);
  }
  tex.refresh();
}
