import { ART, TRUCK } from '../config';
import type { BodyKind } from '../game/Rival';
import { axleY, tireRadius } from '../game/Tires';

/**
 * Chassis geometry of the drawn trucks (pure numbers, so it can be tested without a canvas). Every
 * y is in the BODY's own frame: 0 is the chassis centre of the un-lifted truck, y grows downwards,
 * and the lifted body is drawn `lift` px higher than the axles.
 */

/** Underside of each body's main shell, before the skirt below is added. */
export const BODY_BOTTOM: Record<BodyKind, number> = { suv: 24, pickup: 24, monster: 10, jeep: 24, van: 24, buggy: 22 };

/** Half length of the body: wheel arches are cut off at the bumpers. */
export const BODY_HALF = 63;

/** How far every body's underside is lowered (a rocker panel / skirt) so the tires can reach up into arches. */
export const SKIRT = 14;

/** Air (px) between a tire and the arch around it, so the suspension can move without the tire touching the body. */
export const ARCH_GAP = 3;

/** Every arch cuts at least this deep (px) up into the body, so no truck has a flat bottom. */
export const MIN_ARCH_DEPTH = 13;

/** Body-frame y of the axles (the tire centres at rest): the lift puts the body this far above them. */
export function axleBodyY(wheel: number): number {
  const lift = TRUCK.lift + (tireRadius(wheel) - tireRadius(1));
  return axleY(wheel) + lift;
}

/** Radius of the cut-out around a tire: the tire plus its gap. */
export const archRadius = (wheel: number): number => tireRadius(wheel) + ARCH_GAP;

/** Body-frame y of the top of the wheel arch. */
export const archTop = (wheel: number): number => axleBodyY(wheel) - archRadius(wheel);

/** Body-frame y of the underside after the skirt: low enough that every arch is at least `MIN_ARCH_DEPTH` deep. */
export function undersideY(kind: BodyKind, wheel: number): number {
  return Math.max(BODY_BOTTOM[kind] + SKIRT, archTop(wheel) + MIN_ARCH_DEPTH);
}

/** How far (px) the tire's top reaches up past the underside, i.e. into the arch. */
export const tireOverlap = (kind: BodyKind, wheel: number): number => undersideY(kind, wheel) - (axleBodyY(wheel) - tireRadius(wheel));

/** Half width (px) of the arch's opening along the underside. */
export function archHalfWidth(kind: BodyKind, wheel: number): number {
  const r = archRadius(wheel);
  const dy = axleBodyY(wheel) - undersideY(kind, wheel);
  return Math.sqrt(Math.max(0, r * r - dy * dy));
}

/** x (px from the chassis centre) of the two axles, where the arches are centred. */
export const AXLE_X = Math.abs(TRUCK.wheels[0].x);

/**
 * The player's CRUNCH badge on the SUV door: centred under the two side windows and between their
 * lower edge and the paint stripe, so it covers neither. (Window and stripe numbers match `drawTruck`.)
 */
export const SUV_WINDOWS = { x0: -38, x1: 12, bottom: -11 } as const;
export const SUV_STRIPE_TOP = 9;
export const PLAYER_BADGE = { cx: (SUV_WINDOWS.x0 + SUV_WINDOWS.x1) / 2, cy: -1, w: 52, h: 16 } as const;

/** The texture's chassis centre, re-exported so the art tests can place the chassis frame on the canvas. */
export const CHASSIS_CENTRE = { x: ART.truckCx, y: ART.truckCy } as const;
