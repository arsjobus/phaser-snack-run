import Phaser from 'phaser';
import { SCROLL_Y0, TRUCK, VIEW_W } from '../config';
import { obstacleKey } from '../art/props';
import { PLAYER_TRUCK_KEY, rivalTruckKey } from '../art/trucks';
import { BIOME_LIST, type Biome } from '../game/Biomes';
import { GroundPainter } from '../game/GroundPainter';
import { laneDepth, laneProject, laneScale } from '../game/Lanes';
import { Parallax } from '../game/Parallax';
import { PLAYER_WHEEL, RIVAL_STYLES } from '../game/Rival';
import { tireRise } from '../game/Tires';
import { Terrain } from '../game/Terrain';
import { bodyOrigin } from '../game/TruckView';
import { FONT_BODY } from '../ui/Fonts';
import { applyView } from '../ui/Resolution';

/**
 * Developer art preview (open `/?art`, or `/?art=desert` for a biome): the whole truck set standing
 * on flat ground in one biome, with the pickups and obstacles, painted by the same code as the game.
 * Nothing here is gameplay; it exists so art changes can be reviewed (and screenshotted) at a glance.
 */
export class ArtScene extends Phaser.Scene {
  constructor() {
    super('Art');
  }

  create(): void {
    applyView(this);
    const param = new URLSearchParams(window.location.search).get('art') ?? '';
    const biome: Biome = BIOME_LIST.find((b) => b.id === param) ?? BIOME_LIST[0];
    const startX = 200;
    const terrain = new Terrain(1);
    terrain.ensure(startX + 2000);
    const cam = this.cameras.main;
    cam.setScroll(150, SCROLL_Y0);
    new Parallax(this, biome.id).update(150, SCROLL_Y0, 0);
    const ground = this.add.graphics().setDepth(1);
    new GroundPainter(ground, terrain, startX).paint(150, SCROLL_Y0, biome);

    // One truck per style (the player's first), all in lane 0, resting on the flat opening.
    const keys = [PLAYER_TRUCK_KEY, ...RIVAL_STYLES.map((_, i) => rivalTruckKey(i))];
    const tires = [PLAYER_WHEEL, ...RIVAL_STYLES.map((s) => s.wheel)];
    const gy = terrain.heightAt(400);
    keys.forEach((key, i) => {
      const x = 215 + i * 128;
      const lane = i % 2 ? 1 : 0;
      const sc = laneScale(lane);
      const [ox, oy] = bodyOrigin();
      const cy = gy - 42; // chassis centre at rest
      this.add
        .image(x, laneProject(gy, cy, lane), key)
        .setOrigin(ox, oy)
        .setScale(sc)
        .setDepth(laneDepth(lane, 0.1));
      for (const w of TRUCK.wheels) {
        this.add
          .image(x + w.x * sc, laneProject(gy, cy + w.y - tireRise(tires[i]), lane), 'wheel')
          .setScale(sc * tires[i])
          .setDepth(laneDepth(lane, 0.12));
      }
    });
    // Pickups and obstacles on the far lanes.
    const items = ['snack', 'fuel_can', 'wrench', obstacleKey('rock', 0), obstacleKey('tires', 0), obstacleKey('log', 0), obstacleKey('boulder', 0)];
    items.forEach((key, i) => {
      const lane = 2.5;
      this.add
        .image(180 + i * 130, laneProject(gy, gy - 18, lane), key)
        .setScale(laneScale(lane))
        .setDepth(laneDepth(lane, 0.1));
    });
    this.add
      .text(VIEW_W / 2, 12, `ART PREVIEW: ${biome.name}`, { fontFamily: FONT_BODY, fontStyle: 'bold', fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);
  }
}
