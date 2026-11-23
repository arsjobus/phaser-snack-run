import type Phaser from 'phaser';
import { LANES, VIEW_H, VIEW_W } from '../config';
import { shade } from '../art/trucks';
import { biomeSegments, type Biome } from './Biomes';
import {
  FIELD_DEPTH,
  FLAT_FIELD,
  FLAT_FOREGROUND,
  FOREGROUND_DEPTH,
  RUT_CELL,
  RUT_DEPTHS,
  RUT_PAIR,
  groundDetails,
  hash01,
  lensOutline,
  puddleSite,
  ruttedAt,
  rutWobble,
  type Detail,
} from './GroundDetail';
import { laneLift, laneScale } from './Lanes';
import { nextStuntAfter } from './Stunt';
import type { Terrain } from './Terrain';

type G = Phaser.GameObjects.Graphics;

const TUFT_SPACING = 72;
/** The ground is drawn in steps of this many px (finer than the terrain samples: the track is a spline). */
export const RENDER_STEP = 8;
/** Hard-edged furrow bands in the field (flat colour steps, not a gradient). */
const FURROWS = 3;
const MUD_CELL = 130;
/** The dark outline the rest of the art uses (trucks, props): ground edges get it too. */
const OUTLINE = 0x1a120a;

/** Blend two 0xRRGGBB colours (t = 0 gives a, 1 gives b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Paints the terrain in flat, outlined colour like the rest of the art (no gradients): the
 * cross-section of dirt, a wide dirt field behind the near lane, the foreground below it, and on top
 * of those long meandering tire ruts, pebbles, stones, clods, cracks, puddles, ripples or drifts (by
 * biome), mud patches and grass tufts. Anything that lies flat (puddles, mud, ruts, cracks) is a
 * shape that follows the terrain, so it bends over hills and stays inside the road.
 * Everything is deterministic by world position (see `GroundDetail`),
 * so repainting every frame never shimmers. Heights are looked up once per frame on the render grid
 * (`RENDER_STEP`) instead of once per strip, which is most of the cost of this painter.
 */
export class GroundPainter {
  private heights = new Float32Array(0);
  private gridX0 = 0;
  /** Detail density, 0 (none) to 1.5; the settings' effects level feeds this. */
  detail = 1;

  constructor(
    private g: G,
    private terrain: Terrain,
    private startX: number,
  ) {}

  private h(x: number): number {
    const i = (x - this.gridX0) / RENDER_STEP;
    return Number.isInteger(i) && i >= 0 && i < this.heights.length ? this.heights[i] : this.terrain.heightAt(x);
  }

  /** `forced` paints one biome across the whole span (the art preview). */
  paint(scrollX: number, scrollY: number, forced?: Biome): void {
    const g = this.g;
    const x0 = Math.floor(scrollX / RENDER_STEP) * RENDER_STEP - RENDER_STEP;
    const x1 = scrollX + VIEW_W + RENDER_STEP * 2;
    const n = Math.ceil((x1 - x0) / RENDER_STEP) + 2;
    if (this.heights.length < n) this.heights = new Float32Array(n);
    this.gridX0 = x0;
    for (let i = 0; i < n; i++) this.heights[i] = this.terrain.heightAt(x0 + i * RENDER_STEP);
    const bottom = scrollY + VIEW_H + 80;
    g.clear();

    // One strip of terrain between xa and xb whose top and bottom edges follow the track at the given
    // pixel offsets (bottom = null: down to the bottom of the screen).
    const strip = (color: number, top: number, bot: number | null, xa: number, xb: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(xa, this.h(xa) + top);
      for (let x = Math.ceil(xa / RENDER_STEP) * RENDER_STEP; x < xb; x += RENDER_STEP) {
        if (x > xa) g.lineTo(x, this.h(x) + top);
      }
      g.lineTo(xb, this.h(xb) + top);
      if (bot === null) {
        g.lineTo(xb, bottom);
        g.lineTo(xa, bottom);
      } else {
        g.lineTo(xb, this.h(xb) + bot);
        for (let x = Math.floor(xb / RENDER_STEP) * RENDER_STEP; x > xa; x -= RENDER_STEP) {
          if (x < xb) g.lineTo(x, this.h(x) + bot);
        }
        g.lineTo(xa, this.h(xa) + bot);
      }
      g.closePath();
      g.fillPath();
    };

    const segments = forced ? [{ biome: forced, x0, x1 }] : biomeSegments(x0, x1, this.startX);
    for (const seg of segments) {
      const c = seg.biome.ground;
      const { x0: xa, x1: xb } = seg;
      // Flat, cel-shaded like the rest of the art: every layer is ONE solid colour with a dark
      // outline where it meets the next, and no gradients, vignettes, haze or glints.
      //   cross-section (the slab of dirt under the near lane) -> dark outline -> foreground
      //   -> the dirt field behind the near lane -> outline at the tree line.
      strip(c.deep, 0, null, xa, xb); // the slab: one colour all the way down
      const fgBottom = -laneLift(-FOREGROUND_DEPTH - 1);
      strip(c.dirt, 15, null, xa, xb); // the foreground: a flat step in front of the lip
      strip(shade(c.dirt, 0.82), 15 + (fgBottom - 15) * 0.55, null, xa, xb); // one hard step towards the HUD
      // The field behind the near lane: a single flat colour, with three hard-edged furrow bands (no blend).
      const far = -laneLift(FIELD_DEPTH);
      strip(c.crust, far, 0, xa, xb);
      for (let i = 0; i < FURROWS; i++) {
        const fa = FIELD_DEPTH * ((i * 2 + 1) / (FURROWS * 2));
        const fb = fa + FIELD_DEPTH / (FURROWS * 2) - 0.12;
        strip(shade(c.crust, 0.94), -laneLift(fb), -laneLift(fa), xa, xb);
      }
      strip(OUTLINE, far - 2, far + 1.5, xa, xb); // contact line with the tree line
      strip(c.crust, 0, 10, xa, xb); // the near lane's crust
      strip(c.crustShadow, 10, 15, xa, xb); // its shaded edge
      strip(OUTLINE, -1.5, 1.5, xa, xb); // the lip outline
      strip(OUTLINE, 15, 18, xa, xb); // outline under the slab's step
      this.mud(seg.biome, xa, xb);
      this.ruts(seg.biome, xa, xb);
      this.details(seg.biome, xa, xb);
      this.tufts(seg.biome, xa, xb);
    }
  }

  /**
   * A flat patch lying ON the ground: a lens whose top and bottom edges follow the track at depth `f`
   * (so it bends with the hills and can never stick out of the ground the way an ellipse did), `hh`
   * px tall in the middle (both scaled by the depth); `inset` (px) shrinks it from both ends for an inner layer.
   */
  private patch(color: number, alpha: number, x0: number, x1: number, f: number, hh: number, inset = 0): void {
    const g = this.g;
    const sc = laneScale(f);
    const a = x0 + inset;
    const b = x1 - inset;
    if (b - a < 2) return;
    const steps = Math.max(3, Math.ceil((b - a) / RENDER_STEP));
    const pts = lensOutline(a, b, steps, hh * sc);
    g.fillStyle(color, alpha);
    g.beginPath();
    pts.top.forEach((p, i) => {
      const y = this.h(p.x) - laneLift(f) + p.dy;
      if (i === 0) g.moveTo(p.x, y);
      else g.lineTo(p.x, y);
    });
    for (let i = pts.bottom.length - 1; i >= 0; i--) {
      const p = pts.bottom[i];
      g.lineTo(p.x, this.h(p.x) - laneLift(f) + p.dy);
    }
    g.closePath();
    g.fillPath();
  }

  /** Dark mud patches scattered over the field and foreground, as flat lenses that follow the ground. */
  private mud(biome: Biome, xa: number, xb: number): void {
    const c = biome.ground;
    const patchColor = mixColor(c.crust, c.crustShadow, 0.7);
    for (let k = Math.floor(xa / MUD_CELL) - 1; k * MUD_CELL < xb; k++) {
      for (let j = 0; j < 3; j++) {
        if (hash01(k, 11 + j) > 0.55) continue;
        const x = k * MUD_CELL + hash01(k, 21 + j) * MUD_CELL;
        if (x < xa || x > xb) continue;
        // Field patches stay between the lip and the far edge; foreground patches stay well below the lip.
        const f =
          j === 2
            ? -(FLAT_FOREGROUND + hash01(k, 61) * (FOREGROUND_DEPTH * 0.7 - FLAT_FOREGROUND))
            : FLAT_FIELD[0] + hash01(k, 31 + j) * (FLAT_FIELD[1] - FLAT_FIELD[0]);
        const w = 46 + hash01(k, 41 + j) * 80;
        const hh = 6 + hash01(k, 51 + j) * 6;
        this.patch(patchColor, 1, x - w / 2, x + w / 2, f, hh);
      }
    }
  }

  /**
   * Long tire ruts along the field and the foreground. Each is a vehicle's pair of tire tracks seen in
   * perspective: two dark grooves a little apart in depth, tread blocks across the near ones,
   * meandering, breaking off here and there with a small berm of pushed-up dirt at each end. Flat
   * colour only: a groove is a dark line, nothing is lit.
   */
  private ruts(biome: Biome, xa: number, xb: number): void {
    const g = this.g;
    const c = biome.ground;
    const groove = shade(c.rut1, 0.7);
    const berm = shade(c.crust, 0.9);
    RUT_DEPTHS.forEach((f, ri) => {
      for (let cell = Math.floor(xa / RUT_CELL) - 1; cell * RUT_CELL < xb; cell++) {
        const cellX0 = cell * RUT_CELL;
        if (!ruttedAt(ri, cellX0)) continue;
        // A rut runs for most of its cell, starting and ending a little off the cell edge.
        const rx0 = cellX0 + hash01(cell, 500 + ri) * 30;
        const rx1 = cellX0 + RUT_CELL - hash01(cell, 520 + ri) * 40;
        const cx0 = Math.max(xa, rx0);
        const cx1 = Math.min(xb, rx1);
        if (cx1 <= cx0) continue;
        const line = (color: number, alpha: number, w: number, depth: number, from: number, to: number) => {
          const sc = laneScale(depth);
          g.lineStyle(w * sc, color, alpha);
          g.beginPath();
          let first = true;
          for (let x = Math.ceil(from / RENDER_STEP) * RENDER_STEP; x <= to; x += RENDER_STEP) {
            const y = this.h(x) - laneLift(depth) + rutWobble(ri, x) * sc;
            if (first) {
              g.moveTo(x, y);
              first = false;
            } else g.lineTo(x, y);
          }
          g.strokePath();
        };
        const f2 = f - RUT_PAIR;
        for (const d of [f, f2]) line(groove, 0.8, 3.2, d, cx0, cx1);
        if (f < 0.8) {
          const sc = laneScale(f);
          g.lineStyle(1.1 * sc, groove, 0.7);
          g.beginPath();
          for (let x = Math.ceil(cx0 / 13) * 13; x <= cx1; x += 13) {
            const y = this.h(x) - laneLift(f) + rutWobble(ri, x) * sc;
            g.moveTo(x, y - 1.8 * sc);
            g.lineTo(x + 3 * sc, y + 1.8 * sc);
          }
          g.strokePath();
        }
        // Berms of pushed-up dirt where the tracks start and stop (flat lenses on the ground).
        for (const bx of [rx0, rx1]) {
          if (bx < xa || bx > xb) continue;
          this.patch(berm, 1, bx - 6, bx + 6, f - RUT_PAIR / 2, 5);
        }
      }
    });
  }

  /** True on (or just before) a show stage: its pads, ramps and pit leave no room for a puddle. */
  private onStage(x: number): boolean {
    const s = nextStuntAfter(x, this.startX);
    return x >= s.x0 - 400;
  }

  private details(biome: Biome, xa: number, xb: number): void {
    for (const d of groundDetails(biome.id, xa, xb, this.detail)) this.detailOne(biome, d);
  }

  /** A flat, outlined rock or clod: dark outline, one body colour, one lighter top facet (no highlights). */
  private blob(x: number, y: number, w: number, h: number, body: number, top: number): void {
    const g = this.g;
    g.fillStyle(0x000000, 0.2); // contact shadow on the ground
    g.fillEllipse(x + w * 0.1, y + 0.5, w * 1.15, Math.max(1.5, h * 0.35));
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(x, y - h * 0.4, w + 2, h + 2);
    g.fillStyle(body, 1);
    g.fillEllipse(x, y - h * 0.4, w, h);
    g.fillStyle(top, 1);
    g.fillEllipse(x - w * 0.08, y - h * 0.58, w * 0.6, h * 0.45);
  }

  private detailOne(biome: Biome, d: Detail): void {
    const g = this.g;
    const c = biome.ground;
    const sc = laneScale(d.f) * d.size;
    const x = d.x;
    const y = this.h(x) - laneLift(d.f) + 2 * sc;
    const dark = shade(c.crust, 0.7);
    const stone = mixColor(c.crust, 0x8f8a82, 0.6);
    const stoneTop = mixColor(c.crust, 0xb9b4aa, 0.6);
    switch (d.kind) {
      case 'pebble': {
        const w = (4.4 + d.seed * 3) * sc;
        this.blob(x, y, w, w * 0.75, shade(stone, 0.85), stone);
        break;
      }
      case 'gravel': {
        // A little scatter of grit: five flat specks in two tones.
        for (let k = 0; k < 5; k++) {
          const gx = x + (hash01(Math.floor(d.seed * 9973), k) - 0.5) * 16 * sc;
          const gy = y + (hash01(Math.floor(d.seed * 9973), k + 9) - 0.5) * 4 * sc;
          const r = (1 + hash01(Math.floor(d.seed * 9973), k + 17) * 1.4) * sc;
          g.fillStyle(k % 2 ? shade(stone, 0.8) : stone, 1);
          g.fillEllipse(gx, gy, r * 2, r * 1.4);
        }
        break;
      }
      case 'stone': {
        const w = (9 + d.seed * 6) * sc;
        this.blob(x, y, w, w * 0.7, shade(stone, 0.9), stoneTop);
        break;
      }
      case 'clod': {
        const w = (8 + d.seed * 6) * sc;
        const mud = shade(mixColor(c.crust, c.crustShadow, 0.7), 0.9);
        this.blob(x, y, w, w * 0.62, mud, mixColor(mud, c.crust, 0.35));
        break;
      }
      case 'crack': {
        // Dried-mud cracks: a short zigzag with two branches, lying on the ground at its depth.
        g.lineStyle(1.4 * sc, shade(c.crustShadow, 0.8), 0.85);
        g.beginPath();
        const len = (16 + d.seed * 12) * sc;
        const yy = (dx: number, dy: number) => this.h(x + dx) - laneLift(d.f) + dy * sc;
        g.moveTo(x - len, yy(-len, 0));
        g.lineTo(x - len * 0.5, yy(-len * 0.5, -2));
        g.lineTo(x - len * 0.1, yy(-len * 0.1, 1.5));
        g.lineTo(x + len * 0.4, yy(len * 0.4, -1.5));
        g.lineTo(x + len, yy(len, 1));
        g.moveTo(x - len * 0.1, yy(-len * 0.1, 1.5));
        g.lineTo(x + len * 0.05, yy(len * 0.05, 4.5));
        g.moveTo(x + len * 0.4, yy(len * 0.4, -1.5));
        g.lineTo(x + len * 0.55, yy(len * 0.55, -4.5));
        g.strokePath();
        break;
      }
      case 'puddle': {
        // A flat pool lying on the ground: a dark wet rim lens, a water lens and a paler band of
        // reflected sky. All three follow the terrain, so the pool bends with the hill under it.
        const w = (40 + d.seed * 38) * d.size * laneScale(d.f);
        const hh = 5 + d.seed * 4;
        // Only on level ground or in a dip of the track (never on a slope, and not on the show stage).
        if (!puddleSite((px) => this.h(px), x - w / 2 - 2, x + w / 2 + 2) || this.onStage(x)) break;
        const water = mixColor(biome.sky[1], c.crustShadow, biome.id === 'swamp' ? 0.55 : biome.id === 'snow' ? 0.05 : 0.32);
        this.patch(OUTLINE, 0.6, x - w / 2 - 2, x + w / 2 + 2, d.f, hh + 3);
        this.patch(water, 1, x - w / 2, x + w / 2, d.f, hh);
        this.patch(mixColor(biome.sky[0], water, 0.5), 1, x - w / 2, x + w / 2, d.f, hh * 0.45, w * 0.12);
        break;
      }
      case 'ripple': {
        // Wind ripples in sand (or a reed bed's water lines): two long arcs lying along the ground.
        const len = (30 + d.seed * 26) * sc;
        for (let k = 0; k < 2; k++) {
          g.lineStyle(1.4 * sc, k ? shade(c.crust, 0.9) : dark, k ? 0.9 : 0.7);
          g.beginPath();
          for (let s = 0; s <= 6; s++) {
            const px = x - len / 2 + (len * s) / 6;
            const py = this.h(px) - laneLift(d.f) + k * 4 * sc - Math.sin((s / 6) * Math.PI) * 2.2 * sc;
            if (s === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.strokePath();
        }
        break;
      }
      case 'sparkle': {
        // Snow drift: a flat blue-grey patch lying on the ground, with a smaller darker core.
        const w = (24 + d.seed * 26) * sc;
        const drift = mixColor(c.crust, 0x9fb4cf, 0.55);
        this.patch(drift, 1, x - w / 2, x + w / 2, d.f, 5 + d.seed * 3);
        this.patch(shade(drift, 0.92), 1, x - w / 2, x + w / 2, d.f, 2.4, w * 0.18);
        break;
      }
    }
  }

  /**
   * Verge tufts (grass, dry scrub, frost or reeds), scattered by world position over EVERY lane of
   * the field, drawn from the far rows to the near ones so nearer tufts cover farther ones.
   */
  private tufts(biome: Biome, xa: number, xb: number): void {
    const g = this.g;
    const { color, shape } = biome.tuft;
    const rows = 5;
    for (let row = rows - 1; row >= 0; row--) {
      for (let k = Math.floor(xa / TUFT_SPACING) - 1; k * TUFT_SPACING < xb; k++) {
        if (hash01(k, 100 + row) > 0.17) continue;
        const x = k * TUFT_SPACING + hash01(k, 200 + row) * TUFT_SPACING;
        if (x < xa || x > xb) continue;
        const f = -0.1 + ((row + hash01(k, 300 + row)) * (LANES.count - 0.7)) / rows;
        this.tuft(g, shape, shade(color, 1 - 0.07 * f), x, this.h(x) - laneLift(f) + 1, laneScale(f));
      }
    }
    // A few big tufts in the foreground, where they overlap the dirt and frame the screen's bottom edge.
    for (let k = Math.floor(xa / 150) - 1; k * 150 < xb; k++) {
      if (hash01(k, 700) > 0.3) continue;
      const x = k * 150 + hash01(k, 701) * 150;
      if (x < xa || x > xb) continue;
      const f = -1.2 - hash01(k, 702) * (FOREGROUND_DEPTH - 1.6);
      this.tuft(g, shape, shade(color, 1 - 0.07 * f), x, this.h(x) - laneLift(f) + 1, laneScale(f));
    }
  }

  /** One tuft standing at (x, y), `s` times its full size. */
  private tuft(g: G, shape: Biome['tuft']['shape'], color: number, x: number, y: number, s: number): void {
    g.fillStyle(color, 1);
    switch (shape) {
      case 'grass':
        g.fillTriangle(x - 5 * s, y, x - 1 * s, y, x - 4 * s, y - 9 * s);
        g.fillTriangle(x - 2 * s, y, x + 2 * s, y, x, y - 12 * s);
        g.fillTriangle(x + 1 * s, y, x + 5 * s, y, x + 4 * s, y - 8 * s);
        break;
      case 'scrub': // low, wide dry bush with a woody centre
        g.fillTriangle(x - 9 * s, y, x - 2 * s, y, x - 7 * s, y - 7 * s);
        g.fillTriangle(x - 4 * s, y, x + 5 * s, y, x + 1 * s, y - 10 * s);
        g.fillTriangle(x + 2 * s, y, x + 9 * s, y, x + 7 * s, y - 6 * s);
        break;
      case 'frost': // snow clumps with an icy crystal
        g.fillEllipse(x, y - 2 * s, 16 * s, 6 * s);
        g.fillTriangle(x - 2 * s, y - 3 * s, x + 2 * s, y - 3 * s, x, y - 11 * s);
        break;
      case 'reed': // tall thin blades with a cattail
        g.fillRect(x - 4 * s, y - 16 * s, 1.5 * s, 16 * s);
        g.fillRect(x, y - 20 * s, 1.5 * s, 20 * s);
        g.fillRect(x + 4 * s, y - 14 * s, 1.5 * s, 14 * s);
        g.fillStyle(0x5b3a1e, 1);
        g.fillRect(x - 0.5 * s, y - 26 * s, 3 * s, 7 * s);
        break;
    }
  }
}
