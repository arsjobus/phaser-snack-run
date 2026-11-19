import { BASE_Y, COLLISION, RIVALS } from '../config';
import { collideTrucks, damageForImpact } from './Collision';
import { Rival, RIVAL_STYLES } from './Rival';
import { Rng } from './Rng';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';
import type { WreckField } from './Wrecks';

export type RaceEvent =
  /** A bump. `damage` is what the PLAYER suffers (0 for a soft bump or a rival-on-rival one). */
  | { type: 'bump'; with: 'rival' | 'wreck'; impact: number; damage: number; x: number; y: number }
  | { type: 'takedown'; rivalId: number; number: number; x: number; y: number }
  | { type: 'wrecked'; rivalId: number; number: number; x: number; y: number };

/**
 * The race around the player: spawns rivals (a small grid at the start, then more as the run
 * goes on), steers them, resolves every bump, turns dead rivals into wrecks, awards the slipstream
 * boost and works out the race position. Pure TypeScript, driven by the scene each frame
 * (`stepPhysics` inside the fixed-step loop, `update` once per frame).
 */
export class Race {
  rivals: Rival[] = [];
  /** Seconds since the race began. */
  time = 0;
  /** Player's slipstream strength 0..1. */
  draft = 0;
  /** True while the player sits in a rival's slipstream. */
  drafting = false;

  private rng: Rng;
  private nextId = 1;
  private spawnTimer = 0;
  private startX: number;
  private startupDone = false;

  constructor(
    seed: number,
    private terrain: Terrain,
    private wrecks: WreckField,
    startX: number,
  ) {
    this.rng = new Rng((seed ^ 0x51ed270b) >>> 0);
    this.startX = startX;
  }

  /** How many rivals the course should hold at `meters`. */
  wanted(meters: number): number {
    return Math.min(RIVALS.max, 1 + Math.floor(Math.max(0, meters) / RIVALS.perMeters));
  }

  /** 1-based place of the player among the live rivals, and the field size. */
  position(playerX: number): { place: number; of: number } {
    const ahead = this.rivals.filter((r) => r.truck.x > playerX).length;
    return { place: 1 + ahead, of: 1 + this.rivals.length };
  }

  /** Step every rival's body by one fixed physics step. */
  stepPhysics(dt: number): void {
    for (const r of this.rivals) {
      this.terrain.ensure(r.truck.x + 600);
      r.step(dt, this.terrain);
    }
  }

  update(dt: number, player: TruckPhysics, meters: number, playerAlive = true): RaceEvent[] {
    const events: RaceEvent[] = [];
    this.time += dt;
    this.spawn(dt, player, meters);

    this.chooseLanes(dt, player);
    for (const r of this.rivals) {
      r.think(player.x, this.terrain);
      r.watch(dt);
    }

    // Player vs rivals (same lane only) and wrecks.
    if (playerAlive) {
      for (const r of this.rivals) {
        if (r.laneKey !== 0) continue;
        const hit = collideTrucks(player, r.truck);
        if (!hit || hit.impact < COLLISION.bumpSpeed) continue;
        if (this.time - r.lastBump < COLLISION.hitCooldown) continue;
        r.lastBump = this.time;
        r.lastPlayerHit = this.time;
        const base = damageForImpact(hit.impact);
        if (base > 0) {
          r.damage = Math.min(1, r.damage + base * COLLISION.rivalDamageScale);
        }
        events.push({
          type: 'bump',
          with: 'rival',
          impact: hit.impact,
          damage: base,
          x: hit.x,
          y: hit.y,
        });
      }
      const w = this.wrecks.collide(player);
      if (w) {
        events.push({
          type: 'bump',
          with: 'wreck',
          impact: w.impact,
          damage: damageForImpact(w.impact),
          x: w.x,
          y: w.y,
        });
      }
    }

    // Rivals vs each other and vs wrecks (no player damage).
    for (let i = 0; i < this.rivals.length; i++) {
      const a = this.rivals[i];
      if (a.laneKey === -1) continue; // mid-swerve: in nobody's lane
      for (let j = i + 1; j < this.rivals.length; j++) {
        if (this.rivals[j].laneKey === a.laneKey) collideTrucks(a.truck, this.rivals[j].truck);
      }
      const w = a.laneKey === 0 ? this.wrecks.collide(a.truck) : null;
      if (w) a.damage = Math.min(1, a.damage + damageForImpact(w.impact) * COLLISION.rivalDamageScale);
    }

    // Dead rivals become wrecks; a recent ram by the player makes it a takedown.
    for (const r of [...this.rivals]) {
      if (!r.dead) continue;
      const t = r.truck;
      this.wrecks.addFromRival(t.x, Math.atan(this.terrain.slopeAt(t.x)), r.style, t.vx, r.laneKey === 1);
      this.rivals.splice(this.rivals.indexOf(r), 1);
      const at = { x: t.x, y: t.y };
      events.push({ type: 'wrecked', rivalId: r.id, number: r.number, ...at });
      if (this.time - r.lastPlayerHit <= RIVALS.takedownWindow) {
        events.push({ type: 'takedown', rivalId: r.id, number: r.number, ...at });
      }
    }

    this.updateDraft(dt, player);
    this.wrecks.update(dt);
    this.despawn(player);
    return events;
  }

  /** Slipstream: stay close behind a rival, level with it, and the draft builds up. */
  private updateDraft(dt: number, player: TruckPhysics): void {
    let inZone = false;
    for (const r of this.rivals) {
      const t = r.truck;
      const gap = t.x - 58 - (player.x + 58); // tail of the rival to nose of the player
      if (
        r.laneKey === 0 &&
        gap > -20 &&
        gap < RIVALS.draftGap &&
        Math.abs(t.y - player.y) < RIVALS.draftHeight &&
        t.speed > RIVALS.draftMinSpeed &&
        player.speed > RIVALS.draftMinSpeed * 0.7
      ) {
        inZone = true;
        break;
      }
    }
    this.drafting = inZone;
    this.draft = inZone
      ? Math.min(1, this.draft + dt / RIVALS.draftBuild)
      : Math.max(0, this.draft - dt / RIVALS.draftFade);
    player.boost = this.draft;
  }

  /**
   * Lane decisions. Every few seconds a rival re-decides: leave the player's lane, or (the more
   * aggressive it is) take it. Taking it needs a clear gap, and if the rival is ahead it must be
   * far enough up the road for the player to see it coming. A skilled rival also leaves the
   * player's lane when a wreck lies ahead of it.
   */
  private chooseLanes(dt: number, player: TruckPhysics): void {
    for (const r of this.rivals) {
      r.laneTimer -= dt;
      const dx = r.truck.x - player.x;
      const wreckAhead = r.skill > 0.35 && this.wrecks.ahead(r.truck.x, RIVALS.wreckLook);
      if (wreckAhead && r.lane === 0) {
        r.lane = 1;
        continue;
      }
      if (r.laneTimer > 0) continue;
      const [lo, hi] = RIVALS.laneRethink;
      r.laneTimer = this.rng.range(lo, hi);
      const clear = Math.abs(dx) > RIVALS.laneGap && (dx < 0 || dx > RIVALS.warnGap);
      const wants = this.rng.next() < r.aggression;
      r.lane = wants && clear && !wreckAhead ? 0 : 1;
    }
  }

  private spawn(dt: number, player: TruckPhysics, meters: number): void {
    if (!this.startupDone) {
      this.startupDone = true;
      // The opening grid: the first rivals wait just ahead of the line.
      for (const dx of RIVALS.grid) this.add(this.startX + dx, 0);
      return;
    }
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);
    if (this.spawnTimer > 0 || this.rivals.length >= this.wanted(meters)) return;
    this.spawnTimer = RIVALS.spawnCooldown;
    // Half the time one arrives from behind at speed, otherwise it is waiting up the road.
    if (this.rng.next() < 0.5) {
      this.add(player.x + this.rng.range(RIVALS.aheadMin, RIVALS.aheadMax), Math.max(200, player.speed - 100));
    } else {
      this.add(player.x - RIVALS.behind, Math.max(300, player.speed + 160));
    }
  }

  private add(x: number, speed: number): Rival {
    this.terrain.ensure(x + 800);
    const style = this.nextStyle();
    const skill = this.rng.range(0.3, 1);
    const aggression = this.rng.range(0.2, 0.9);
    const ground = x < this.terrain.startX ? BASE_Y : this.terrain.heightAt(x);
    const r = new Rival(this.nextId++, style, x, ground - 48, skill, aggression);
    r.truck.vx = speed;
    this.rivals.push(r);
    r.laneTimer = this.rng.range(0.5, 2);
    return r;
  }

  /** Rotate through the liveries so no two live rivals look alike. */
  private nextStyle(): number {
    const used = new Set(this.rivals.map((r) => r.style));
    const free = RIVAL_STYLES.map((_, i) => i).filter((i) => !used.has(i));
    const pool = free.length ? free : RIVAL_STYLES.map((_, i) => i);
    return pool[this.rng.int(0, pool.length - 1)];
  }

  /** Rivals left far behind (or far ahead) are quietly removed; the spawner replaces them. */
  private despawn(player: TruckPhysics): void {
    this.rivals = this.rivals.filter(
      (r) =>
        r.truck.x > player.x - RIVALS.despawnBehind && r.truck.x < player.x + RIVALS.despawnAhead,
    );
  }
}
