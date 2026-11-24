import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { BIOME_LIST, backdropKey, type Biome, type BiomeId } from '../game/Biomes';
import { Rng, hashSeed } from '../game/Rng';

type G = Phaser.GameObjects.Graphics;

const OFFS = [-VIEW_W, 0, VIEW_W]; // every shape is drawn three times so the texture wraps seamlessly
export const CLOUD_H = 170;
export const HILLS_H = 240;
export const TREES_H = 200;
export const BUSHES_H = 150;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Vertical sky gradient (a 2D canvas gradient, so it works on any renderer). */
function makeSky(scene: Phaser.Scene, b: Biome): void {
  const tex = scene.textures.createCanvas(backdropKey('sky', b.id), 8, VIEW_H);
  if (!tex) return;
  const ctx = tex.getContext();
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, hex(b.sky[0]));
  grad.addColorStop(1, hex(b.sky[1]));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, VIEW_H);
  tex.refresh();
}

/**
 * Transparent rows added under every layer. The layers tile vertically, so a sample that falls
 * just above a sprite's top edge wraps to the texture's bottom row; that row is solid colour
 * (trees, bushes, hills), which drew a thin line across the whole sky at 2x. The padding is
 * transparent, so the wrap lands on nothing. The sprites still draw only their original height.
 */
export const WRAP_PAD = 2;

function bake(scene: Phaser.Scene, g: G, key: string, w: number, h: number): void {
  g.generateTexture(key, w, h + WRAP_PAD);
  g.destroy();
  // Nearest filtering stops the opaque bottom row bleeding into the top edge when tiles wrap.
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ---------------------------------------------------------------- clouds

interface CloudStyle {
  color: number;
  underside: number;
  alpha: number;
  /** Puffy cumulus, or long flat streaks. */
  flat: boolean;
  count: number;
  scale: number;
}
const CLOUDS: Record<BiomeId, CloudStyle> = {
  forest: { color: 0xffffff, underside: 0xdbe9f5, alpha: 0.92, flat: false, count: 4, scale: 1 },
  desert: { color: 0xffffff, underside: 0xfbe8c8, alpha: 0.6, flat: true, count: 4, scale: 1 },
  snow: { color: 0xf4f8fc, underside: 0xb9c8da, alpha: 0.85, flat: false, count: 4, scale: 1.05 },
  swamp: { color: 0xb7c0a8, underside: 0x8f9a82, alpha: 0.85, flat: true, count: 5, scale: 1.4 },
};

function makeClouds(scene: Phaser.Scene, b: Biome): void {
  const st = CLOUDS[b.id];
  const rng = new Rng(hashSeed(b.id) + 1);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let i = 0; i < st.count; i++) {
    const x = ((i + rng.range(0.1, 0.9)) / st.count) * VIEW_W;
    const y = rng.range(40, 120);
    const s = rng.range(0.7, 1.2) * st.scale;
    for (const off of OFFS) {
      const cx = x + off;
      if (st.flat) {
        g.fillStyle(st.underside, st.alpha);
        g.fillEllipse(cx, y + 6 * s, 150 * s, 18 * s);
        g.fillStyle(st.color, st.alpha);
        g.fillEllipse(cx, y, 130 * s, 16 * s);
        g.fillEllipse(cx + 30 * s, y - 8 * s, 70 * s, 12 * s);
      } else {
        for (const [dx, dy, r] of [
          [0, 0, 26],
          [28, 6, 20],
          [-28, 8, 18],
          [10, -12, 20],
        ]) {
          g.fillStyle(st.underside, st.alpha);
          g.fillCircle(cx + dx * s, y + dy * s + 4 * s, r * s);
          g.fillStyle(st.color, st.alpha);
          g.fillCircle(cx + dx * s, y + dy * s - 1 * s, r * s);
        }
      }
    }
  }
  bake(scene, g, backdropKey('clouds', b.id), VIEW_W, CLOUD_H);
}

// ---------------------------------------------------------------- hills / far layer

function sineHills(g: G, color: number, base: number, amp1: number, amp2: number): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(0, HILLS_H);
  for (let x = 0; x <= VIEW_W; x += 8) {
    const y =
      base +
      amp1 * Math.sin((2 * Math.PI * 2 * x) / VIEW_W) +
      amp2 * Math.sin((2 * Math.PI * 5 * x) / VIEW_W + 1);
    g.lineTo(x, y);
  }
  g.lineTo(VIEW_W, HILLS_H);
  g.closePath();
  g.fillPath();
}

function makeHills(scene: Phaser.Scene, b: Biome): void {
  const rng = new Rng(hashSeed(b.id) + 2);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  switch (b.id) {
    case 'forest':
      sineHills(g, 0x7ea88a, 110, 28, 14);
      break;
    case 'desert': {
      sineHills(g, 0xd7a36a, 168, 8, 5);
      // flat-topped mesas, banded like rock strata
      for (let i = 0; i < 4; i++) {
        const w = rng.range(110, 190);
        const top = rng.range(60, 110);
        const x = ((i + 0.5) / 4) * VIEW_W + rng.range(-30, 30);
        for (const off of OFFS) {
          const l = x + off - w / 2;
          const r = x + off + w / 2;
          const pts = [
            { x: l, y: 190 },
            { x: l + 8, y: top + 14 },
            { x: l + 18, y: top },
            { x: r - 18, y: top },
            { x: r - 8, y: top + 14 },
            { x: r, y: 190 },
          ];
          g.fillStyle(0xc98a68, 1);
          g.fillPoints(pts, true);
          g.fillStyle(0xb5744f, 1);
          g.fillRect(l + 6, top + 26, w - 12, 8);
          g.fillRect(l + 3, top + 52, w - 6, 10);
          g.fillStyle(0xdba781, 1);
          g.fillRect(l + 18, top, w - 36, 5);
        }
      }
      sineHills(g, 0xd7a36a, 190, 6, 3);
      break;
    }
    case 'snow': {
      g.fillStyle(0xaec0d6, 1);
      g.fillRect(0, 170, VIEW_W, 70);
      for (let i = 0; i < 4; i++) {
        const w = rng.range(200, 320);
        const peak = rng.range(30, 90);
        const x = ((i + 0.5) / 4) * VIEW_W + rng.range(-40, 40);
        for (const off of OFFS) {
          const cx = x + off;
          g.fillStyle(0x8da4c0, 1);
          g.fillTriangle(cx - w / 2, 190, cx, peak, cx + w / 2, 190);
          g.fillStyle(0x6f87a6, 1); // shaded face
          g.fillTriangle(cx, peak, cx + w / 2, 190, cx + w * 0.08, 190);
          const capH = (190 - peak) * 0.36;
          const capW = (w / 2) * (capH / (190 - peak));
          g.fillStyle(0xffffff, 1);
          g.fillTriangle(cx - capW, peak + capH, cx, peak, cx + capW, peak + capH);
        }
      }
      break;
    }
    case 'swamp': {
      g.fillStyle(0x56694f, 1);
      g.fillRect(0, 170, VIEW_W, 70);
      // far drowned trees, hazy
      for (let x = 0; x < VIEW_W; x += rng.range(26, 52)) {
        const h = rng.range(50, 110);
        for (const off of OFFS) {
          g.fillStyle(0x4b5e47, 1);
          g.fillRect(x + off - 2, 175 - h, 4, h);
          g.fillEllipse(x + off, 175 - h, rng.range(34, 56), 24);
        }
      }
      break;
    }
  }
  bake(scene, g, backdropKey('hills', b.id), VIEW_W, HILLS_H);
}

// ---------------------------------------------------------------- mid layer (trees etc.)

function makeTrees(scene: Phaser.Scene, b: Biome): void {
  const rng = new Rng(hashSeed(b.id) + 3);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const base = TREES_H - 30;
  switch (b.id) {
    case 'forest': {
      g.fillStyle(0x2c5a2a, 1);
      g.fillRect(0, base - 6, VIEW_W, 36);
      const greens = [0x3f7d36, 0x377030, 0x4a8a3c, 0x2f6a2c];
      let x = 0;
      while (x < VIEW_W + 60) {
        const r = rng.range(22, 38);
        const top = base - rng.range(26, 62);
        const color = greens[rng.int(0, greens.length - 1)];
        for (const off of OFFS) {
          const cx = x + off;
          g.fillStyle(0x4a3220, 1);
          g.fillRect(cx - 3, top + r * 0.6, 6, base - top);
          g.fillStyle(0x1f4a20, 1);
          g.fillCircle(cx + 4, top + 5, r);
          g.fillStyle(color, 1);
          g.fillCircle(cx, top, r);
          g.fillCircle(cx - r * 0.6, top + r * 0.45, r * 0.7);
          g.fillCircle(cx + r * 0.6, top + r * 0.4, r * 0.72);
          g.fillStyle(0xffffff, 0.08);
          g.fillCircle(cx - r * 0.3, top - r * 0.35, r * 0.45);
        }
        x += r * rng.range(0.9, 1.4);
      }
      break;
    }
    case 'desert': {
      g.fillStyle(0xcf9d62, 1);
      g.fillRect(0, base - 6, VIEW_W, 36);
      let x = 20;
      while (x < VIEW_W + 40) {
        const kind = rng.next();
        for (const off of OFFS) {
          const cx = x + off;
          if (kind < 0.6) {
            // saguaro with two arms
            const h = rng.range(60, 110);
            const arm = rng.range(14, 26);
            g.fillStyle(0x2f5f2c, 1);
            g.fillRoundedRect(cx - 7, base - h, 14, h + 6, 6);
            g.fillRoundedRect(cx - 24, base - h * 0.6, 8, arm + 12, 4);
            g.fillRect(cx - 24, base - h * 0.6 + arm + 6, 18, 8);
            g.fillRoundedRect(cx + 16, base - h * 0.75, 8, arm + 14, 4);
            g.fillRect(cx + 7, base - h * 0.75 + arm + 8, 14, 8);
            g.fillStyle(0x3f7a3a, 1);
            g.fillRect(cx - 4, base - h + 2, 4, h);
            g.fillRect(cx - 22, base - h * 0.6 + 2, 3, arm + 6);
            g.fillRect(cx + 18, base - h * 0.75 + 2, 3, arm + 8);
          } else {
            // boulders
            g.fillStyle(0x8c6b52, 1);
            g.fillEllipse(cx, base - 4, rng.range(44, 70), 34);
            g.fillStyle(0xa98265, 1);
            g.fillEllipse(cx - 6, base - 10, 30, 16);
          }
        }
        x += rng.range(70, 130);
      }
      break;
    }
    case 'snow': {
      g.fillStyle(0xdbe6f1, 1);
      g.fillRect(0, base - 6, VIEW_W, 36);
      let x = 0;
      while (x < VIEW_W + 40) {
        const h = rng.range(70, 130);
        const w = h * 0.5;
        for (const off of OFFS) {
          const cx = x + off;
          g.fillStyle(0x4a3220, 1);
          g.fillRect(cx - 3, base - 12, 6, 16);
          for (let t = 0; t < 4; t++) {
            const ty = base - 10 - (t * h) / 4.4;
            const tw = w * (1 - t * 0.2);
            g.fillStyle(0x1f4a3a, 1);
            g.fillTriangle(cx - tw / 2, ty, cx, ty - h / 3, cx + tw / 2, ty);
            g.fillStyle(0xffffff, 1); // snow on the boughs
            g.fillTriangle(cx - tw * 0.3, ty - h * 0.1, cx, ty - h / 3, cx + tw * 0.3, ty - h * 0.1);
          }
        }
        x += rng.range(34, 70);
      }
      break;
    }
    case 'swamp': {
      g.fillStyle(0x2f3d2a, 1);
      g.fillRect(0, base - 2, VIEW_W, 32);
      g.fillStyle(0x4d5f3d, 0.5); // reflections on the water
      for (let i = 0; i < 18; i++) g.fillRect(rng.range(0, VIEW_W - 40), base + rng.range(2, 26), rng.range(14, 40), 2);
      let x = 10;
      while (x < VIEW_W + 40) {
        const h = rng.range(90, 150);
        const w = rng.range(46, 72);
        for (const off of OFFS) {
          const cx = x + off;
          g.fillStyle(0x3a3320, 1); // flared cypress trunk
          g.fillTriangle(cx - 12, base + 4, cx, base - h, cx + 12, base + 4);
          g.fillStyle(0x3f5a2f, 1);
          g.fillEllipse(cx, base - h, w, 34);
          g.fillEllipse(cx - w * 0.3, base - h + 14, w * 0.6, 24);
          g.fillStyle(0x536e3b, 1);
          g.fillEllipse(cx - 6, base - h - 6, w * 0.6, 18);
          g.lineStyle(2, 0x8a9a6a, 0.8); // hanging moss
          for (let m = -2; m <= 2; m++) {
            const mx = cx + m * (w / 5);
            g.lineBetween(mx, base - h + 8, mx + rng.range(-3, 3), base - h + rng.range(34, 60));
          }
        }
        x += rng.range(80, 140);
      }
      break;
    }
  }
  bake(scene, g, backdropKey('trees', b.id), VIEW_W, TREES_H);
}

// ---------------------------------------------------------------- near layer

function makeBushes(scene: Phaser.Scene, b: Biome): void {
  const rng = new Rng(hashSeed(b.id) + 4);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const h = BUSHES_H;
  const row = (colorBase: number, colorLit: number, rMin: number, rMax: number): void => {
    g.fillStyle(colorBase, 1);
    g.fillRect(0, h - 50, VIEW_W, 50);
    let x = 0;
    while (x < VIEW_W + 80) {
      const r = rng.range(rMin, rMax);
      for (const off of OFFS) {
        g.fillStyle(colorLit, 1);
        g.fillCircle(x + off, h - 50, r);
        g.fillStyle(colorBase, 1);
        g.fillCircle(x + off + r * 0.4, h - 44, r * 0.7);
      }
      x += r * rng.range(0.9, 1.6);
    }
  };
  switch (b.id) {
    case 'forest':
      row(0x1d4023, 0x28552e, 26, 52);
      break;
    case 'desert': {
      row(0x9c6f3d, 0xb08a4a, 18, 38); // sage scrub
      for (let i = 0; i < 9; i++) {
        const x = rng.range(0, VIEW_W);
        for (const off of OFFS) {
          g.fillStyle(0x6f5440, 1);
          g.fillEllipse(x + off, h - 52, rng.range(24, 40), 16);
          g.fillStyle(0x8c6b52, 1);
          g.fillEllipse(x + off - 4, h - 56, 18, 8);
        }
      }
      break;
    }
    case 'snow':
      row(0xbfd0e2, 0xf4f8fc, 30, 56); // drifts
      for (let i = 0; i < 6; i++) {
        const x = rng.range(0, VIEW_W);
        for (const off of OFFS) {
          g.fillStyle(0x1f4a3a, 1);
          g.fillTriangle(x + off - 10, h - 52, x + off, h - 82, x + off + 10, h - 52);
          g.fillStyle(0xffffff, 1);
          g.fillTriangle(x + off - 6, h - 62, x + off, h - 82, x + off + 6, h - 62);
        }
      }
      break;
    case 'swamp': {
      g.fillStyle(0x25301f, 1);
      g.fillRect(0, h - 50, VIEW_W, 50);
      for (let i = 0; i < 16; i++) {
        const x = rng.range(0, VIEW_W);
        for (const off of OFFS) {
          g.fillStyle(0x5f7a3a, 0.9); // lily pads
          g.fillEllipse(x + off, h - 20 + (i % 3) * 8, rng.range(18, 30), 6);
        }
      }
      for (let x = 0; x < VIEW_W + 20; x += rng.range(5, 11)) {
        const bh = rng.range(24, 62);
        const lean = rng.range(-6, 6);
        for (const off of OFFS) {
          g.lineStyle(2, rng.next() < 0.5 ? 0x5d7a3a : 0x7da24a, 1);
          g.lineBetween(x + off, h - 48, x + off + lean, h - 48 - bh);
          if (bh > 48 && rng.next() < 0.5) {
            g.fillStyle(0x5b3a1e, 1); // cattail
            g.fillRoundedRect(x + off + lean - 2, h - 48 - bh - 8, 4, 12, 2);
          }
        }
      }
      break;
    }
  }
  bake(scene, g, backdropKey('bushes', b.id), VIEW_W, h);
}

/** Builds every backdrop texture of every biome (sky, clouds, hills, trees, bushes). */
export function makeBackdrops(scene: Phaser.Scene): void {
  for (const b of BIOME_LIST) {
    makeSky(scene, b);
    makeClouds(scene, b);
    makeHills(scene, b);
    makeTrees(scene, b);
    makeBushes(scene, b);
  }
}
