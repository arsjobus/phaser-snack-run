import { PHYSICS, TRUCK } from '../config';
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
      if (drives) {
        if (input.throttle > 0) {
          Ft += input.throttle * P.engineForce * Math.max(0, 1 - vt / P.topSpeed);
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
