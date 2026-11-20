import Phaser from 'phaser';
import { BIOMES, SCROLL_Y0, VIEW_H, VIEW_W } from '../config';
import { BIOME_LIST, backdropKey, type BackdropLayer, type BiomeId } from './Biomes';

interface LayerSpec {
  layer: BackdropLayer;
  h: number;
  /** Horizontal and vertical camera-follow factors (0 = fixed to screen, 1 = moves with world). */
  fx: number;
  fy: number;
  /** Screen y of the layer's bottom edge when the camera is at its reference position. */
  bottom: number;
  /** Constant horizontal drift in px/s (clouds). */
  drift: number;
  depth: number;
}

const SPECS: readonly LayerSpec[] = [
  { layer: 'sky', h: VIEW_H, fx: 0, fy: 0, bottom: VIEW_H, drift: 0, depth: -10 },
  { layer: 'clouds', h: 170, fx: 0.04, fy: 0.03, bottom: 170, drift: 6, depth: -9 },
  { layer: 'hills', h: 240, fx: 0.1, fy: 0.1, bottom: 400, drift: 0, depth: -8 },
  { layer: 'trees', h: 200, fx: 0.28, fy: 0.25, bottom: 400, drift: 0, depth: -7 },
  { layer: 'bushes', h: 150, fx: 0.55, fy: 0.45, bottom: 420, drift: 0, depth: -6 },
];

/**
 * Five tiling layers behind the terrain, one set per biome. The current biome's set is opaque;
 * when the biome changes the new set fades in on top of it, then the old one is hidden.
 */
export class Parallax {
  private sprites = new Map<BiomeId, Phaser.GameObjects.TileSprite[]>();
  private current: BiomeId;
  private previous: BiomeId | null = null;
  private fade = 1;
  private t = 0;

  constructor(scene: Phaser.Scene, start: BiomeId = 'forest') {
    this.current = start;
    for (const b of BIOME_LIST) {
      this.sprites.set(
        b.id,
        SPECS.map((s) => {
          const top = s.layer === 'sky';
          const sp = scene.add
            .tileSprite(0, top ? 0 : s.bottom, VIEW_W, s.h, backdropKey(s.layer, b.id))
            .setOrigin(0, top ? 0 : 1)
            .setScrollFactor(0)
            .setDepth(s.depth)
            .setAlpha(b.id === start ? 1 : 0);
          return sp;
        }),
      );
    }
  }

  get biome(): BiomeId {
    return this.current;
  }

  /** Cross-fade to another biome's backdrop (no-op if it is already the target). */
  setBiome(id: BiomeId): void {
    if (id === this.current) return;
    if (this.previous) this.each(this.previous, (sp) => sp.setAlpha(0)); // finish a fade in progress
    this.previous = this.current;
    this.current = id;
    this.fade = 0;
    this.each(this.previous, (sp, i) => sp.setAlpha(1).setDepth(SPECS[i].depth));
    this.each(id, (sp, i) => sp.setAlpha(0).setDepth(SPECS[i].depth + 0.5));
  }

  private each(id: BiomeId, fn: (sp: Phaser.GameObjects.TileSprite, i: number) => void): void {
    this.sprites.get(id)!.forEach(fn);
  }

  update(scrollX: number, scrollY: number, dt: number): void {
    this.t += dt;
    if (this.previous) {
      this.fade = Math.min(1, this.fade + dt / BIOMES.fadeSeconds);
      this.each(this.current, (sp) => sp.setAlpha(this.fade));
      if (this.fade >= 1) {
        this.each(this.previous, (sp) => sp.setAlpha(0));
        this.each(this.current, (sp, i) => sp.setDepth(SPECS[i].depth));
        this.previous = null;
      }
    }
    const place = (id: BiomeId) =>
      this.each(id, (sp, i) => {
        const s = SPECS[i];
        if (s.layer === 'sky') return;
        sp.tilePositionX = scrollX * s.fx + this.t * s.drift;
        sp.y = Math.round(s.bottom + (SCROLL_Y0 - scrollY) * s.fy);
      });
    place(this.current);
    if (this.previous) place(this.previous);
  }
}
