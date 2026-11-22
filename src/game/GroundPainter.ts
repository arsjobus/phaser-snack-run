import type Phaser from 'phaser';
import { LANES, VIEW_H, VIEW_W } from '../config';
import { shade } from '../art/trucks';
import { biomeSegments, type Biome } from './Biomes';
import {
  FIELD_DEPTH,
  FOREGROUND_DEPTH,
  RUT_CELL,
  RUT_DEPTHS,
  RUT_PAIR,
  groundDetails,
  hash01,
  ruttedAt,
  rutWobble,
  type Detail,
} from './GroundDetail';
import { laneLift, laneScale } from './Lanes';
import type { Terrain } from './Terrain';

type G = Phaser.GameObjects.Graphics;

const TUFT_SPACING = 72;
/** The ground is drawn in steps of this many px (finer than the terrain samples: the track is a spline). */
export const RENDER_STEP = 8;
/** Slivers the dirt field is drawn from (a smooth gradient), and bands of the foreground. */
const FIELD_BANDS = 16;
const FOREGROUND_BANDS = 10;
const MUD_CELL = 130;

/** Blend two 0xRRGGBB colours (t = 0 gives a, 1 gives b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Paints the terrain: the cross-section of dirt, a wide dirt field behind the near lane that fades
 * into a haze at the tree line, the big foreground below the near lane, and on top of those long
 * meandering tire ruts, pebbles, stones, clods, cracks, puddles, ripples or sparkles (by biome),
 * mud patches and grass tufts. Everything is deterministic by world position (see `GroundDetail`),
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
      // Foreground cross-section: lit crust, then bands that darken towards the bottom of the screen
      // (the camera looks down on a big slab of dirt, not at two plain stripes).
      strip(c.dirt, 0, null, xa, xb);
      const fgBottom = -laneLift(-FOREGROUND_DEPTH - 1);
      for (let j = 0; j < FOREGROUND_BANDS; j++) {
        const t = j / (FOREGROUND_BANDS - 1);
        const top = 15 + (fgBottom - 15) * (j / FOREGROUND_BANDS);
        strip(mixColor(c.dirt, c.deep, Math.min(1, t * 1.15)), top, null, xa, xb);
      }
      // The dirt field behind the near lane: one wide, flat field, drawn from the far edge down in
      // thin slivers that darken with distance and melt into the haze at the tree line.
      for (let i = FIELD_BANDS; i >= 1; i--) {
        const f = (FIELD_DEPTH * i) / FIELD_BANDS;
        const nearer = (FIELD_DEPTH * (i - 1)) / FIELD_BANDS;
        const far = f / FIELD_DEPTH;
        let col = shade(c.crust, 1 - 0.05 * f);
        col = mixColor(col, seg.biome.sky[1], 0.3 * far * far);
        if (i % 2 === 0) col = shade(col, 0.985); // faint furrow banding
        strip(col, -laneLift(f), -laneLift(nearer) + 1.5, xa, xb);
      }
      strip(shade(c.crust, 0.6), -laneLift(FIELD_DEPTH) - 2, -laneLift(FIELD_DEPTH) + 1, xa, xb); // contact line with the tree line
      strip(mixColor(c.crust, 0xffffff, 0.18), -laneLift(FIELD_DEPTH) - 3, -laneLift(FIELD_DEPTH) - 2, xa, xb, 0.5); // rim light
      strip(c.crust, 0, 10, xa, xb); // the near lane's sunlit crust
      strip(mixColor(c.crust, 0xffffff, 0.22), 0, 1.5, xa, xb, 0.7); // its bright lip
      strip(c.crustShadow, 10, 15, xa, xb);
      strip(0x000000, 15, 19, xa, xb, 0.12); // soft shadow under the lip
      this.mud(seg.biome, xa, xb);
      this.ruts(seg.biome, xa, xb);
      this.details(seg.biome, xa, xb);
      this.tufts(seg.biome, xa, xb);
    }
    // A soft vignette towards the HUD: the foreground fades darker the nearer it gets to the camera.
    const vx0 = x0;
    const vx1 = x1;
    for (let i = 0; i < 8; i++) strip(0x000000, 30 + i * 11, null, vx0, vx1, 0.035);
  }

  /** Dark mud patches scattered over the whole field and foreground. */
  private mud(biome: Biome, xa: number, xb: number): void {
    const g = this.g;
    const c = biome.ground;
    const patch = mixColor(c.crust, c.crustShadow, 0.75);
    for (let k = Math.floor(xa / MUD_CELL) - 1; k * MUD_CELL < xb; k++) {
      for (let j = 0; j < 3; j++) {
        if (hash01(k, 11 + j) > 0.55) continue;
        const x = k * MUD_CELL + hash01(k, 21 + j) * MUD_CELL;
        if (x < xa || x > xb) continue;
        const f = -FOREGROUND_DEPTH * 0.7 * (j === 2 ? hash01(k, 61) : 0) + hash01(k, 31 + j) * (j === 2 ? 0 : FIELD_DEPTH - 0.1);
        const sc = laneScale(f);
        const y = this.h(x) - laneLift(f) + 3;
        const w = (46 + hash01(k, 41 + j) * 80) * sc;
        const hh = (6 + hash01(k, 51 + j) * 6) * sc;
        g.fillStyle(patch, 0.45);
        g.fillEllipse(x, y, w, hh);
        g.fillStyle(mixColor(patch, 0xffffff, 0.12), 0.25); // damp sheen on the lower edge
        g.fillEllipse(x + w * 0.05, y + hh * 0.2, w * 0.7, hh * 0.45);
      }
    }
  }

  /**
   * Long tire ruts along the field and the foreground. Each is a vehicle's pair of tire tracks seen in
   * perspective: two dark grooves a little apart in depth with a lit ridge of churned mud between
   * them, tread blocks across the near ones, meandering, breaking off here and there with a berm of
   * pushed-up dirt at each end.
   */
  private ruts(biome: Biome, xa: number, xb: number): void {
    const g = this.g;
    const c = biome.ground;
    const groove = shade(c.rut1, 0.6);
    const ridge = mixColor(c.crust, 0xffffff, 0.22);
    const lip = mixColor(c.crust, 0xffffff, 0.34);
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
        const line = (color: number, alpha: number, w: number, depth: number, off: number, from: number, to: number) => {
          const sc = laneScale(depth);
          g.lineStyle(w * sc, color, alpha);
          g.beginPath();
          let first = true;
          for (let x = Math.ceil(from / RENDER_STEP) * RENDER_STEP; x <= to; x += RENDER_STEP) {
            const y = this.h(x) - laneLift(depth) + rutWobble(ri, x) * sc + off * sc;
            if (first) {
              g.moveTo(x, y);
              first = false;
            } else g.lineTo(x, y);
          }
          g.strokePath();
        };
        const f2 = f - RUT_PAIR;
        // Ridge first (under both grooves), then grooves with a lit lip under each, then the tread.
        line(ridge, 0.5, 2.6, (f + f2) / 2, 0, cx0, cx1);
        for (const d of [f, f2]) {
          line(groove, 0.55, 3.2, d, 0, cx0, cx1);
          line(lip, 0.42, 1.2, d, 2.6, cx0, cx1);
        }
        if (f < 0.8) {
          const sc = laneScale(f);
          g.lineStyle(1.1 * sc, groove, 0.5);
          g.beginPath();
          for (let x = Math.ceil(cx0 / 13) * 13; x <= cx1; x += 13) {
            const y = this.h(x) - laneLift(f) + rutWobble(ri, x) * sc;
            g.moveTo(x, y - 1.8 * sc);
            g.lineTo(x + 3 * sc, y + 1.8 * sc);
          }
          g.strokePath();
        }
        // Berms of pushed-up dirt where the tracks start and stop.
        for (const [bx, on] of [
          [rx0, rx0 >= xa && rx0 <= xb],
          [rx1, rx1 >= xa && rx1 <= xb],
        ] as const) {
          if (!on) continue;
          const sc = laneScale(f);
          const by = this.h(bx) - laneLift(f) + rutWobble(ri, bx) * sc;
          g.fillStyle(ridge, 0.55);
          g.fillEllipse(bx, by - 0.6 * sc, 9 * sc, 5 * sc);
        }
      }
    });
  }

  private details(biome: Biome, xa: number, xb: number): void {
    for (const d of groundDetails(biome.id, xa, xb, this.detail)) this.detailOne(biome, d);
  }

  private detailOne(biome: Biome, d: Detail): void {
    const g = this.g;
    const c = biome.ground;
    const sc = laneScale(d.f) * d.size;
    const x = d.x;
    const y = this.h(x) - laneLift(d.f) + 2 * sc;
    const dark = shade(c.crust, 0.7);
    const light = mixColor(c.crust, 0xffffff, 0.38);
    switch (d.kind) {
      case 'pebble': {
        const w = (3.6 + d.seed * 3) * sc;
        g.fillStyle(0x000000, 0.22);
        g.fillEllipse(x + 1.2 * sc, y + 0.8 * sc, w * 1.5, w * 0.6);
        g.fillStyle(mixColor(dark, 0x8f8a82, 0.45), 1);
        g.fillEllipse(x, y - w * 0.3, w * 1.3, w * 0.9);
        g.fillStyle(mixColor(light, 0xffffff, 0.2), 0.9);
        g.fillEllipse(x - w * 0.22, y - w * 0.55, w * 0.5, w * 0.3);
        break;
      }
      case 'gravel': {
        // A little scatter of grit: five specks in dark and light.
        for (let k = 0; k < 5; k++) {
          const gx = x + (hash01(Math.floor(d.seed * 9973), k) - 0.5) * 16 * sc;
          const gy = y + (hash01(Math.floor(d.seed * 9973), k + 9) - 0.5) * 4 * sc;
          const r = (1 + hash01(Math.floor(d.seed * 9973), k + 17) * 1.4) * sc;
          g.fillStyle(k % 2 ? mixColor(dark, 0x8f8a82, 0.4) : mixColor(light, 0xc9c3b8, 0.3), 0.95);
          g.fillEllipse(gx, gy, r * 2, r * 1.4);
        }
        break;
      }
      case 'stone': {
        const w = (8 + d.seed * 6) * sc;
        g.fillStyle(0x000000, 0.26);
        g.fillEllipse(x + 2 * sc, y + 1 * sc, w * 1.6, w * 0.5);
        g.fillStyle(mixColor(dark, 0x7d7a74, 0.55), 1);
        g.fillEllipse(x, y - w * 0.35, w * 1.35, w * 0.95);
        g.fillStyle(mixColor(c.crust, 0xb9b4aa, 0.5), 1);
        g.fillEllipse(x - w * 0.12, y - w * 0.5, w * 1.0, w * 0.6);
        g.fillStyle(0xffffff, 0.4);
        g.fillEllipse(x - w * 0.3, y - w * 0.68, w * 0.4, w * 0.2);
        break;
      }
      case 'clod': {
        const w = (7 + d.seed * 6) * sc;
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(x + 1.5 * sc, y + 1 * sc, w * 1.7, w * 0.5);
        const mud = shade(mixColor(c.crust, c.crustShadow, 0.7), 0.9);
        g.fillStyle(mud, 1);
        g.fillEllipse(x - w * 0.3, y - w * 0.25, w * 0.9, w * 0.62);
        g.fillEllipse(x + w * 0.3, y - w * 0.3, w * 0.8, w * 0.7);
        g.fillEllipse(x, y - w * 0.5, w * 0.7, w * 0.55);
        g.fillStyle(mixColor(mud, 0xffffff, 0.3), 0.8);
        g.fillEllipse(x - w * 0.05, y - w * 0.62, w * 0.34, w * 0.2);
        break;
      }
      case 'crack': {
        // Dried-mud cracks: a short zigzag with two branches.
        g.lineStyle(1.3 * sc, shade(c.crustShadow, 0.8), 0.6);
        g.beginPath();
        const len = (16 + d.seed * 12) * sc;
        g.moveTo(x - len, y);
        g.lineTo(x - len * 0.5, y - 2 * sc);
        g.lineTo(x - len * 0.1, y + 1.5 * sc);
        g.lineTo(x + len * 0.4, y - 1.5 * sc);
        g.lineTo(x + len, y + 1 * sc);
        g.moveTo(x - len * 0.1, y + 1.5 * sc);
        g.lineTo(x + len * 0.05, y + 4.5 * sc);
        g.moveTo(x + len * 0.4, y - 1.5 * sc);
        g.lineTo(x + len * 0.55, y - 4.5 * sc);
        g.strokePath();
        break;
      }
      case 'puddle': {
        const w = (40 + d.seed * 38) * sc;
        const hh = (5 + d.seed * 4) * sc;
        const water = mixColor(biome.sky[1], c.crustShadow, biome.id === 'swamp' ? 0.55 : biome.id === 'snow' ? 0.05 : 0.32);
        g.fillStyle(shade(c.crustShadow, 0.85), 0.55); // wet, dark rim
        g.fillEllipse(x, y, w + 5 * sc, hh + 3 * sc);
        g.fillStyle(water, 0.9);
        g.fillEllipse(x, y - 0.5 * sc, w, hh);
        g.fillStyle(mixColor(biome.sky[0], water, 0.5), 0.6); // sky reflection, darker towards the far side
        g.fillEllipse(x, y - hh * 0.2, w * 0.86, hh * 0.5);
        g.fillStyle(0xffffff, 0.55); // glint
        g.fillEllipse(x - w * 0.18, y - hh * 0.28, w * 0.26, hh * 0.18);
        g.lineStyle(1 * sc, 0xffffff, 0.35); // ripple
        g.strokeEllipse(x + w * 0.2, y, w * 0.2, hh * 0.45);
        break;
      }
      case 'ripple': {
        // Wind ripples in sand (or a reed bed's water lines): two long soft arcs, light over dark.
        const len = (30 + d.seed * 26) * sc;
        for (let k = 0; k < 2; k++) {
          const off = k * 4 * sc;
          g.lineStyle(1.4 * sc, k ? light : dark, k ? 0.45 : 0.35);
          g.beginPath();
          for (let s = 0; s <= 6; s++) {
            const px = x - len / 2 + (len * s) / 6;
            const py = y + off - Math.sin((s / 6) * Math.PI) * 2.2 * sc;
            if (s === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.strokePath();
        }
        break;
      }
      case 'sparkle': {
        // Snow glints and a blue-grey hollow beside them.
        const r = (2 + d.seed * 2.2) * sc;
        g.fillStyle(0x9fb4cf, 0.28);
        g.fillEllipse(x + r, y + r * 0.4, r * 4.5, r * 1.1);
        g.lineStyle(1 * sc, 0xffffff, 0.9);
        g.lineBetween(x - r, y - r, x + r, y - r);
        g.lineBetween(x, y - r * 2, x, y);
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
