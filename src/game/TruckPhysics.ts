import { PHYSICS, RIVALS, TRUCK } from '../config';
import type { InputState } from './Input';
import type { Terrain } from './Terrain';

export interface ContactInfo {
  inContact: boolean;
  /** World position of the contact point centre. */
  x: number;
  y: number;
}

export interface StepEvents {
  /** Set on the frame the truck lands; value is the airtime in seconds. */
  landedAirTime: number | null;
}

/**
 * Rigid-body truck with spring/damper suspension at each wheel and stiff body contacts.
 * Pure TypeScript (no Phaser) so it can be unit-tested headlessly.
 * Coordinates: y-down, angle positive = clockwise on screen, truck faces +x.
 */
export class TruckPhysics {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle = 0;
  angVel = 0;

  wheelContacts: ContactInfo[] = TRUCK.wheels.map(() => ({ inContact: false, x: 0, y: 0 }));
  bodyContact = false;
  airTime = 0;
  grounded = false;
  /** Seconds spent with the body (roof) touching the ground. */
  roofTime = 0;
  /** Slipstream strength 0..1 (Phase 4): more engine force and a higher top speed. */
  boost = 0;
  /**
   * Passive landing assist: while airborne a gentle torque levels the truck with the slope below
   * (the player has no air control; this just keeps it landing on its wheels). Off for rivals,
   * which level themselves through their own lean input.
   */
  autoLevel = false;

  private airGrace = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = this.vy = this.angle = this.angVel = 0;
    this.airTime = this.airGrace = this.roofTime = 0;
    this.boost = 0;
  }

  /** Apply an impulse (px/s units, mass 1) at world point (px, py): collisions use this. */
  applyImpulse(px: number, py: number, jx: number, jy: number): void {
    this.vx += jx / PHYSICS.mass;
    this.vy += jy / PHYSICS.mass;
    this.angVel += ((px - this.x) * jy - (py - this.y) * jx) / PHYSICS.inertia;
    this.angVel = Math.max(
      -PHYSICS.maxAngularVelocity,
      Math.min(PHYSICS.maxAngularVelocity, this.angVel),
    );
  }

  /** Move the body without touching its velocity (positional push-out after a collision). */
  translate(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Advance by dt seconds (call with small, fixed dt). */
  step(dt: number, input: InputState, terrain: Terrain): StepEvents {
    const P = PHYSICS;
    let fx = 0;
    let fy = P.gravity * P.mass;
    let torque = 0;

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    const apply = (rx: number, ry: number, Fx: number, Fy: number) => {
      fx += Fx;
      fy += Fy;
      torque += rx * Fy - ry * Fx;
    };

    let wheelsDown = 0;
    let bodyDown = false;
    const force = P.engineForce * (1 + RIVALS.draftForce * this.boost);
    const top = P.topSpeed * (1 + RIVALS.draftTop * this.boost);

    const contact = (
      ox: number,
      oy: number,
      radius: number,
      k: number,
      c: number,
      drives: boolean,
      info: ContactInfo | null,
    ) => {
      // Rotated lever arm and world position
      const rx = ox * cos - oy * sin;
      const ry = ox * sin + oy * cos;
      const wx = this.x + rx;
      const wy = this.y + ry;
      const g = terrain.heightAt(wx);
      const pen = wy + radius - g;
      if (info) {
        info.x = wx;
        info.y = wy;
        info.inContact = pen > 0;
      }
      if (pen <= 0) return;

      // Ground normal (points up/out of the ground) and tangent (towards +x)
      const slope = terrain.slopeAt(wx);
      const len = Math.hypot(slope, 1);
      const nx = slope / len;
      const ny = -1 / len;
      const tx = 1 / len;
      const ty = slope / len;

      // Point velocity: v + omega x r
      const pvx = this.vx - this.angVel * ry;
      const pvy = this.vy + this.angVel * rx;
      const vn = pvx * nx + pvy * ny;
      const vt = pvx * tx + pvy * ty;

      const penN = Math.min(pen * -ny, 30);
      let Fn = k * penN - c * vn;
      Fn = Math.max(0, Math.min(Fn, P.maxSpringForce));
      apply(rx, ry, nx * Fn, ny * Fn);

      // Along-ground forces
      let Ft = -P.rollingResistance * vt;
      // Engine braking: off the throttle (and not braking) the truck slows by itself, so it only
      // keeps its speed while the driver holds the gas.
      if (drives && input.throttle <= 0 && input.brake <= 0) Ft -= P.coastDrag * vt;
      if (drives) {
        if (input.throttle > 0) {
          Ft += input.throttle * force * Math.max(0, 1 - vt / top);
        }
        if (input.brake > 0) {
          if (vt > 30) Ft -= input.brake * P.brakeForce;
          else Ft -= input.brake * P.reverseForce * Math.max(0, 1 + vt / P.reverseTop);
        }
      } else {
        // Body scraping the dirt: lots of friction
        Ft -= 3 * vt;
      }
      // Drive/brake force acts close to the centre of mass height so it doesn't pop wheelies
      // (the full lever arm would make the truck flip backwards under throttle).
      const lever = drives ? P.driveLever : 1;
      fx += tx * Ft;
      fy += ty * Ft;
      torque += rx * ty * Ft - ry * lever * tx * Ft;

      if (drives) wheelsDown++;
      else bodyDown = true;
    };

    TRUCK.wheels.forEach((w, i) =>
      contact(w.x, w.y, P.wheelRadius, P.springK, P.springC, true, this.wheelContacts[i]),
    );
    for (const b of TRUCK.body) {
      contact(b.x, b.y, TRUCK.bodyRadius, P.bodyK, P.bodyC, false, null);
    }
    this.bodyContact = bodyDown;

    // Lean control (pitch)
    const airborne = wheelsDown === 0;
    // One wheel down (e.g. teetering off a ledge) still gets most of the air authority.
    const leanTorque =
      wheelsDown === 0 ? P.airTorque : wheelsDown === 1 ? P.airTorque * 0.8 : P.groundTorque;
    torque += input.lean * leanTorque;
    if (airborne && this.autoLevel) {
      const want = Math.atan(terrain.slopeAt(this.x + this.vx * 0.3));
      const lvl = 2.2 * (want - this.angle) - 0.45 * this.angVel;
      torque += Math.max(-1, Math.min(1, lvl)) * P.airTorque * P.autoLevelStrength;
    }
    if (airborne) {
      this.angVel *= Math.max(0, 1 - P.airAngularDamping * dt);
      fx -= P.airDrag * this.vx;
      fy -= P.airDrag * this.vy;
    }

    // Integrate (semi-implicit Euler)
    this.vx += (fx / P.mass) * dt;
    this.vy += (fy / P.mass) * dt;
    this.angVel += (torque / P.inertia) * dt;
    this.angVel = Math.max(-P.maxAngularVelocity, Math.min(P.maxAngularVelocity, this.angVel));
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angVel * dt;

    // Airtime bookkeeping with a short grace period so tiny bumps don't count as jumps
    const events: StepEvents = { landedAirTime: null };
    if (airborne) {
      this.airGrace += dt;
      if (this.airGrace > 0.08) this.airTime += dt;
    } else {
      if (this.airTime > 0) events.landedAirTime = this.airTime + 0.08;
      this.airTime = 0;
      this.airGrace = 0;
    }
    this.grounded = !airborne;
    this.roofTime = bodyDown && airborne ? this.roofTime + dt : 0;
    return events;
  }

  /** Forward speed in px/s (along the chassis heading). */
  get speed(): number {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  /** True when the truck is lying on its roof or side with no wheels down. */
  get flipped(): boolean {
    return this.roofTime > 0.2 || Math.abs(Math.cos(this.angle)) < 0.2;
  }
}
