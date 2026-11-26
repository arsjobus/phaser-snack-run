import { RIVAL_STYLES } from '../game/Rival';
import { SKINS } from '../progress/Skins';
import { PLAYER_TRUCK_KEY, playerTruckKey, rivalTruckKey } from './trucks';
import { showCarKey } from './show';
import { obstacleKey } from './props';

/** SVG files are the art inventory. Vite discovers every asset here directly from its SVG file. */
const svgFiles = import.meta.glob('./assets/**/*.svg', {
  eager: true,
  // Phaser's SVG loader treats data: URLs as base64. Vite's default SVG data URL is percent encoded,
  // so keep these as emitted files instead of inlining them.
  query: '?url&no-inline',
  import: 'default',
}) as Record<string, string>;

export interface ArtAsset { key: string; url: string }

function keyFor(file: string): string | undefined {
  const name = file.split('/').pop()!.replace(/\.svg$/, '');
  if (name.startsWith('player-')) {
    const skin = name.slice('player-'.length);
    return SKINS.some((s) => s.id === skin) ? playerTruckKey(skin) : undefined;
  }
  if (name.startsWith('rival-')) {
    const index = RIVAL_STYLES.findIndex((s) => name === `rival-${s.number}-${s.kind}`);
    return index < 0 ? undefined : rivalTruckKey(index);
  }
  if (name === 'tire') return 'wheel';
  if (name.startsWith('show-car-')) return showCarKey(Number(name.slice('show-car-'.length)));
  if (name === 'fuel-can') return 'fuel_can';
  if (name === 'checkpoint-gate') return 'cp_gate';
  if (name === 'biome-gate') return 'cp_gate_zone';
  const obstacle = /^(rock|boulder|log|tires)-(\d+)$/.exec(name);
  if (obstacle) return obstacleKey(obstacle[1] as 'rock' | 'boulder' | 'log' | 'tires', Number(obstacle[2]));
  return name.replaceAll('-', '_');
}

export function artAssets(): ArtAsset[] {
  return Object.entries(svgFiles).flatMap(([file, url]) => {
    const key = keyFor(file);
    return key ? [{ key, url }] : [];
  });
}

export { PLAYER_TRUCK_KEY };
