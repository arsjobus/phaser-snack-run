import { BASE_Y, COLLISION, LANES, OBSTACLE_KINDS, RIVALS } from '../config';
import { collideTrucks, damageForImpact } from './Collision';
import { sameLane } from './Lanes';
import type { ObstacleField, ObstacleKind } from './Obstacles';
import { Rival, RIVAL_STYLES } from './Rival';
import { Rng } from './Rng';
import type { Terrain } from './Terrain';
import type { TruckPhysics } from './TruckPhysics';
import type { WreckField } from './Wrecks';

export type RaceEvent =
  /**
   * A bump. `damage` is what the PLAYER suffers (0 for a soft bump). `lane` is where it happened (a
   * lane position, for drawing the sparks at the right depth); `kind` names the obstacle hit.
   */
  | {
      type: 'bump';
      with: 'rival' | 'wreck' | 'obstacle';
      impact: number;
      damage: number;
      x: number;
      y: number;
      lane: number;
      kind?: ObstacleKind;
    }
  /** A rival hit an obstacle or wreck on its own (nobody to credit). */
  | { type: 'rivalCrash'; rivalId: number; number: number; kind: ObstacleKind | 'wreck'; impact: number; x: number; y: number; lane: number }
  | { type: 'takedown'; rivalId: number; number: number; x: number; y: number; lane: number }
  | { type: 'wrecked'; rivalId: number; number: number; x: number; y: number; lane: number };

/**
 * The race around the player: spawns rivals (a small grid at the start, then more as the run
 * goes on), steers them between the depth lanes (dodging wrecks and obstacles, or not), resolves
 * every bump, turns dead rivals into wrecks, awards the slipstream boost and works out the race
 * position. Pure TypeScript, driven by the scene each frame (`stepPhysics` inside the fixed-step
 * loop, `update` once per frame).
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
  /** The player's lane position and wanted lane, as of the last `update`. */
  private playerLane: number = LANES.startLane;
  private playerTarget: number = LANES.startLane;

  constructor(
    seed: number,
    private terrain: Terrain,
    private wrecks: WreckField,
    startX: number,
    private obstacles?: ObstacleField,
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

  /**
   * One frame of the race. `playerLane` is the player's lane position (what collisions use) and
   * `playerTarget` the lane they are heading for (rivals keep clear of both).
   */
  update(
    dt: number,
    player: TruckPhysics,
    meters: number,
    playerAlive = true,
    playerLane = 0,
    playerTarget = playerLane,
  ): RaceEvent[] {
    const events: RaceEvent[] = [];
    this.time += dt;
    this.playerLane = playerLane;
    this.playerTarget = playerTarget;
    this.spawn(dt, player, meters);

    this.chooseLanes(dt, player);
    for (const r of this.rivals) {
      r.think(player.x, this.terrain);
      r.watch(dt);
    }

    // Player vs rivals, wrecks and obstacles (only in the same lane).
    if (playerAlive) {
      for (const r of this.rivals) {
        if (!r.inLane(playerLane)) continue;
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
          lane: playerLane,
        });
      }
      const w = this.wrecks.collide(player, playerLane);
      if (w) {
        events.push({
          type: 'bump',
          with: 'wreck',
          impact: w.impact,
          damage: damageForImpact(w.impact),
          x: w.x,
          y: w.y,
          lane: playerLane,
        });
      }
      const ob = this.obstacles?.collide(player, playerLane);
      if (ob) {
        const kind = ob.obstacle.kind;
        events.push({
          type: 'bump',
          with: 'obstacle',
          impact: ob.impact,
          damage: damageForImpact(ob.impact) * OBSTACLE_KINDS[kind].damageScale,
          x: ob.x,
          y: ob.y,
          lane: playerLane,
          kind,
        });
      }
    }

    // Rivals vs each other, wrecks and obstacles (no player damage; the rival pays).
    for (let i = 0; i < this.rivals.length; i++) {
      const a = this.rivals[i];
      for (let j = i + 1; j < this.rivals.length; j++) {
        if (sameLane(a.laneF, this.rivals[j].laneF)) collideTrucks(a.truck, this.rivals[j].truck);
      }
      const w = this.wrecks.collide(a.truck, a.laneF);
      if (w) {
        a.damage = Math.min(1, a.damage + damageForImpact(w.impact) * COLLISION.rivalDamageScale);
        events.push(this.rivalCrash(a, 'wreck', w.impact, w.x, w.y));
      }
      const ob = this.obstacles?.collide(a.truck, a.laneF);
      if (ob) {
        const kind = ob.obstacle.kind;
        a.damage = Math.min(
          1,
          a.damage + damageForImpact(ob.impact) * OBSTACLE_KINDS[kind].damageScale * COLLISION.rivalDamageScale,
        );
        events.push(this.rivalCrash(a, kind, ob.impact, ob.x, ob.y));
      }
    }

    // Dead rivals become wrecks; a recent ram by the player makes it a takedown.
    for (const r of [...this.rivals]) {
      if (!r.dead) continue;
      const t = r.truck;
      const lane = Math.round(r.laneF);
      this.wrecks.addFromRival(t.x, Math.atan(this.terrain.slopeAt(t.x)), r.style, t.vx, lane);
      this.rivals.splice(this.rivals.indexOf(r), 1);
      const at = { x: t.x, y: t.y, lane: r.laneF };
      events.push({ type: 'wrecked', rivalId: r.id, number: r.number, ...at });
      if (this.time - r.lastPlayerHit <= RIVALS.takedownWindow) {
        events.push({ type: 'takedown', rivalId: r.id, number: r.number, ...at });
      }
    }

    this.updateDraft(dt, player);
    this.wrecks.update(dt);
    this.obstacles?.update(dt);
    this.despawn(player);
    return events;
  }

  private rivalCrash(r: Rival, kind: ObstacleKind | 'wreck', impact: number, x: number, y: number): RaceEvent {
    return { type: 'rivalCrash', rivalId: r.id, number: r.number, kind, impact, x, y, lane: r.laneF };
  }

  /** Slipstream: stay close behind a rival, level with it, and the draft builds up. */
  private updateDraft(dt: number, player: TruckPhysics): void {
    let inZone = false;
    for (const r of this.rivals) {
      const t = r.truck;
      const gap = t.x - 58 - (player.x + 58); // tail of the rival to nose of the player
      if (
        sameLane(r.laneF, this.playerLane) &&
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
   * Lane decisions, one lane at a time. A rival first looks `hazardLook` px up its lane: a wreck or
   * obstacle it notices (a skill-based chance, decided once per hazard) makes it swerve to a free
   * neighbouring lane at once; one it does not notice it drives straight into. A rival that has
   * been crawling (stuck behind something fixed) swerves out too. Otherwise, every few seconds, an
   * aggressive rival steps towards the player's lane and a timid one steps away from it. A lane is
   * free when it is clear of hazards and rivals and, if it is the player's lane (or the one the
   * player is heading for), the rival is clear of the truck and, if ahead, far enough up the road
   * to be seen coming.
   */
  private chooseLanes(dt: number, player: TruckPhysics): void {
    for (const r of this.rivals) {
      r.laneTimer -= dt;
      const hazard = this.hazardAhead(r.truck.x, r.lane, RIVALS.hazardLook);
      if (hazard) {
        let saw = r.seen.get(hazard.key);
        if (saw === undefined) {
          if (r.seen.size > 48) r.seen.clear();
          saw = this.rng.next() < r.noticeChance;
          r.seen.set(hazard.key, saw);
        }
        if (saw && this.swerve(r, player)) continue;
      }
      if (r.crawlTime > RIVALS.stuckTime) {
        r.crawlTime = 0;
        if (this.swerve(r, player)) continue;
      }
      if (r.laneTimer > 0) continue;
      const [lo, hi] = RIVALS.laneRethink;
      r.laneTimer = this.rng.range(lo, hi);
      const towards = Math.sign(Math.round(this.playerTarget) - r.lane);
      const wants = this.rng.next() < r.aggression;
      let step: number;
      if (wants) {
        step = towards;
      } else if (sameLane(r.lane, this.playerTarget, 1)) {
        // In the player's lane and not wanting to be: leave, preferring the roomier side.
        step = r.lane >= LANES.count / 2 ? 1 : -1;
        if (!this.laneFree(r, r.lane + step, player)) step = -step;
      } else {
        step = this.rng.int(-1, 1); // wander
      }
      if (step !== 0 && this.laneFree(r, r.lane + step, player)) r.lane += step;
    }
  }

  /** Swerve a rival to a free neighbouring lane (either side, random order). Returns false if boxed in. */
  private swerve(r: Rival, player: TruckPhysics): boolean {
    const first = this.rng.next() < 0.5 ? 1 : -1;
    for (const step of [first, -first]) {
      if (this.laneFree(r, r.lane + step, player)) {
        r.lane += step;
        r.laneTimer = Math.max(r.laneTimer, 1);
        return true;
      }
    }
    return false;
  }

  /** The nearest solid wreck or obstacle in `lane` up to `distance` px ahead of x, with a key. */
  private hazardAhead(x: number, lane: number, distance: number): { key: string; x: number } | null {
    const w = this.wrecks.ahead(x, distance, lane);
    const o = this.obstacles?.ahead(x, distance, lane);
    if (w && (!o || w.x <= o.x)) return { key: `w${w.id}`, x: w.x };
    if (o) return { key: `o${o.id}`, x: o.x };
    return null;
  }

  /** Can rival `r` move into lane `lane` right now? See `chooseLanes` for the rules. */
  private laneFree(r: Rival, lane: number, player: TruckPhysics): boolean {
    if (lane < 0 || lane >= LANES.count) return false;
    if (this.hazardAhead(r.truck.x - 60, lane, RIVALS.hazardLook * 0.8)) return false;
    if (sameLane(lane, this.playerLane, 1) || sameLane(lane, this.playerTarget, 1)) {
      const dx = r.truck.x - player.x;
      const clear = Math.abs(dx) > RIVALS.laneGap && (dx < 0 || dx > RIVALS.warnGap);
      if (!clear) return false;
    }
    for (const o of this.rivals) {
      if (o !== r && sameLane(o.lane, lane, 1) && Math.abs(o.truck.x - r.truck.x) < RIVALS.laneGap) return false;
    }
    return true;
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
    r.lane = r.laneF = this.spawnLane();
    r.truck.vx = speed;
    this.rivals.push(r);
    r.laneTimer = this.rng.range(0.5, 2);
    return r;
  }

  /** A lane for a new rival: random, but not the player's (so nobody appears on top of the truck). */
  private spawnLane(): number {
    const open: number[] = [];
    for (let l = 0; l < LANES.count; l++) {
      if (!sameLane(l, this.playerLane, 1) && !sameLane(l, this.playerTarget, 1)) open.push(l);
    }
    const pool = open.length ? open : [LANES.count - 1];
    return pool[this.rng.int(0, pool.length - 1)];
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
