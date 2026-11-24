import type Phaser from 'phaser';
import { ART, TRUCK } from '../config';
import { PLAYER_WHEEL, RIVAL_STYLES } from '../game/Rival';
import { SKINS } from '../progress/Skins';
import {
  OBSTACLE_ART,
  OBSTACLE_VARIANTS,
  drawCheckpointGate,
  drawFuelCan,
  drawSnack,
  drawStartGate,
  drawWheel,
  drawWrench,
  obstacleKey,
} from './props';
import { SHOW_CAR_H, SHOW_CAR_VARIANTS, SHOW_CAR_W, drawBoostArch, drawPyroStand, drawShowCar, showCarKey } from './show';
import { PLAYER_TRUCK_KEY, RIVAL_PAINT, drawTruck, playerTruckKey, rivalTruckKey } from './trucks';

type G = Phaser.GameObjects.Graphics;

/** Where the SVG files live, relative to the game's base URL (`public/art/`). */
export const ART_DIR = 'art';

export type ArtGroup = 'vehicles' | 'pickups' | 'hazards' | 'props';

/** One drawable sprite: the texture key the game uses, its SVG file, its size and how to draw it. */
export interface ArtAsset {
  key: string;
  group: ArtGroup;
  /** File name inside `public/art/<group>/`. */
  file: string;
  w: number;
  h: number;
  draw: (g: G) => void;
}

/** Path of the asset's SVG relative to the game's base URL, e.g. `art/vehicles/rival-3-suv.svg`. */
export const artPath = (a: Pick<ArtAsset, 'group' | 'file'>): string => `${ART_DIR}/${a.group}/${a.file}`;

/**
 * Every sprite that is drawn by code and exported to SVG: the vehicle parts (every truck body in
 * each paint, the tire, the show-jump cars), the pickups, the road hazards and the set props. This
 * list is the single source of truth: the exporter (`scripts/export-art.ts`) writes it to
 * `public/art/`, and the boot scene loads those files under the same keys. If a file is missing the
 * boot scene falls back to drawing the sprite with the same code.
 */
export function artAssets(): ArtAsset[] {
  const out: ArtAsset[] = [];
  const truck = { w: ART.truckW, h: ART.truckH };
  for (const skin of SKINS) {
    out.push({
      key: playerTruckKey(skin.id),
      group: 'vehicles',
      file: `player-${skin.id}.svg`,
      ...truck,
      draw: (g) => drawTruck(g, 'suv', skin.paint, null, PLAYER_WHEEL, 1),
    });
  }
  RIVAL_STYLES.forEach((st, i) => {
    out.push({
      key: rivalTruckKey(i),
      group: 'vehicles',
      file: `rival-${st.number}-${st.kind}.svg`,
      ...truck,
      draw: (g) => drawTruck(g, st.kind, RIVAL_PAINT[i], st.number, st.wheel, 10 + i),
    });
  });
  out.push({ key: 'wheel', group: 'vehicles', file: 'tire.svg', w: TRUCK.tireRadius * 2, h: TRUCK.tireRadius * 2, draw: (g) => drawWheel(g, TRUCK.tireRadius) });
  for (let v = 0; v < SHOW_CAR_VARIANTS; v++) {
    out.push({ key: showCarKey(v), group: 'vehicles', file: `show-car-${v}.svg`, w: SHOW_CAR_W, h: SHOW_CAR_H, draw: (g) => drawShowCar(g, v) });
  }
  out.push({ key: 'snack', group: 'pickups', file: 'snack.svg', w: 36, h: 46, draw: drawSnack });
  out.push({ key: 'fuel_can', group: 'pickups', file: 'fuel-can.svg', w: 38, h: 46, draw: drawFuelCan });
  out.push({ key: 'wrench', group: 'pickups', file: 'wrench.svg', w: 52, h: 44, draw: drawWrench });
  for (const kind of Object.keys(OBSTACLE_ART) as (keyof typeof OBSTACLE_ART)[]) {
    const art = OBSTACLE_ART[kind];
    for (let v = 0; v < OBSTACLE_VARIANTS; v++) {
      out.push({ key: obstacleKey(kind, v), group: 'hazards', file: `${kind}-${v}.svg`, w: art.w, h: art.h, draw: (g) => art.draw(g, v) });
    }
  }
  out.push({ key: 'start_gate', group: 'props', file: 'start-gate.svg', w: 132, h: 220, draw: drawStartGate });
  out.push({ key: 'cp_gate', group: 'props', file: 'checkpoint-gate.svg', w: 260, h: 212, draw: (g) => drawCheckpointGate(g, 0x2f6fd6, 0xffe066) });
  out.push({ key: 'cp_gate_zone', group: 'props', file: 'biome-gate.svg', w: 260, h: 212, draw: (g) => drawCheckpointGate(g, 0xe8742a, 0x9be0ff) });
  out.push({ key: 'pyro_stand', group: 'props', file: 'pyro-stand.svg', w: 30, h: 76, draw: drawPyroStand });
  out.push({ key: 'boost_arch', group: 'props', file: 'boost-arch.svg', w: 300, h: 214, draw: drawBoostArch });
  return out;
}

export { PLAYER_TRUCK_KEY };
