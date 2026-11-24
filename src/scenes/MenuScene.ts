import Phaser from 'phaser';
import { SCROLL_Y0, TRUCK, VIEW_W } from '../config';
import { PLAYER_TRUCK_KEY, rivalTruckKey } from '../art/trucks';
import { BIOME_LIST } from '../game/Biomes';
import { GroundPainter } from '../game/GroundPainter';
import { laneDepth, laneProject, laneScale } from '../game/Lanes';
import { Parallax } from '../game/Parallax';
import { PLAYER_WHEEL, RIVAL_STYLES } from '../game/Rival';
import { Terrain } from '../game/Terrain';
import { tireRise } from '../game/Tires';
import { bodyOrigin } from '../game/TruckView';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { loadSave } from '../progress/Progress';
import { defaultStore } from '../progress/Storage';
import { MENU_GATE, MENU_ITEMS, type MenuId } from '../ui/MenuModel';
import { INK, wrapIndex } from '../ui/Theme';
import { button, label, logoPlate, type Layer } from '../ui/Ui';
import { applyView } from '../ui/Resolution';

/**
 * The start screen: the game's own scenery (forest backdrop, the real road painter, the truck
 * lineup at the start gate) with the logo plate on top and four buttons along the dirt: Play, Garage,
 * Settings and Credits. Keys: Left/Right (or A/D) pick, Enter/Space go, or press P, G, O or C
 * directly. Mouse, touch and gamepad (D-pad/stick, A) work too.
 */
export class MenuScene extends Phaser.Scene {
  private index = 0;
  private layer!: Layer;
  private parallax!: Parallax;
  private bodies: { img: Phaser.GameObjects.Image; baseY: number; phase: number }[] = [];
  private edges = new PadEdges();
  private t = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    applyView(this);
    this.index = 0;
    this.t = 0;
    this.bodies = [];
    this.edges = new PadEdges();
    this.buildScenery();
    this.layer = this.add.container(0, 0).setDepth(20).setScrollFactor(0);
    this.draw();

    const kb = this.input.keyboard!;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    kb.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', onKey));
  }

  private buildScenery(): void {
    const biome = BIOME_LIST[0];
    const startX = 200;
    const terrain = new Terrain(7);
    terrain.ensure(startX + 2000);
    this.cameras.main.setScroll(150, SCROLL_Y0);
    this.parallax = new Parallax(this, biome.id);
    this.parallax.update(150, SCROLL_Y0, 0);
    const ground = this.add.graphics().setDepth(1);
    new GroundPainter(ground, terrain, startX).paint(150, SCROLL_Y0, biome);
    const gy = terrain.heightAt(400);
    // The start sign stands on the right, wholly in view and clear of the buttons (a far lane lifts it
    // above them); it used to sit at the left edge with only a sliver on screen.
    this.add
      .image(MENU_GATE.screenX + 150, laneProject(gy, gy + 4, MENU_GATE.lane), 'start_gate')
      .setOrigin(0.5, 1)
      .setScale(laneScale(MENU_GATE.lane))
      .setDepth(0.5);

    // The lineup: the player's truck up front, three rivals behind it on the far lanes.
    const lineup = [
      { key: rivalTruckKey(2), tire: RIVAL_STYLES[2].wheel, x: 330, lane: 2 },
      { key: rivalTruckKey(0), tire: RIVAL_STYLES[0].wheel, x: 650, lane: 2 },
      { key: rivalTruckKey(1), tire: RIVAL_STYLES[1].wheel, x: 820, lane: 1 },
      { key: PLAYER_TRUCK_KEY, tire: PLAYER_WHEEL, x: 480, lane: 0 },
    ];
    const [ox, oy] = bodyOrigin();
    lineup.forEach((t, i) => {
      const sc = laneScale(t.lane);
      const cy = gy - 42;
      const baseY = laneProject(gy, cy, t.lane);
      const img = this.add.image(t.x, baseY, t.key).setOrigin(ox, oy).setScale(sc).setDepth(laneDepth(t.lane, 0.1));
      this.bodies.push({ img, baseY, phase: i * 1.7 });
      for (const w of TRUCK.wheels) {
        this.add
          .image(t.x + w.x * sc, laneProject(gy, cy + w.y - tireRise(t.tire), t.lane), 'wheel')
          .setScale(sc * t.tire)
          .setDepth(laneDepth(t.lane, 0.12));
      }
    });
    // Best score, from the save.
    const best = loadSave(defaultStore()).highScores[0];
    const l = this.add.container(0, 0).setDepth(20).setScrollFactor(0);
    label(this, l, VIEW_W - 22, 24, best ? `BEST ${best.score}` : 'NO RUNS YET', 'display', 18, INK.title, 1, 4);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.parallax.update(150, SCROLL_Y0, dt);
    // Idle engines: the bodies rock a pixel on their suspension.
    for (const b of this.bodies) b.img.y = b.baseY + Math.sin(this.t * 7 + b.phase) * 0.8;
    const e = this.edges.update(padButtons(firstPad()));
    if (e.left) this.move(-1);
    if (e.right) this.move(1);
    if (e.confirm) this.go(MENU_ITEMS[this.index].id);
    if (e.garage) this.go('garage');
    if (e.settings) this.go('settings');
  }

  private onKey(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'KeyA':
      case 'KeyW':
        this.move(-1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
      case 'KeyD':
      case 'KeyS':
        this.move(1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.go(MENU_ITEMS[this.index].id);
        break;
      case 'KeyP':
        this.go('play');
        break;
      case 'KeyG':
        this.go('garage');
        break;
      case 'KeyO':
        this.go('settings');
        break;
      case 'KeyC':
        this.go('credits');
        break;
    }
  }

  private move(d: number): void {
    this.index = wrapIndex(this.index, d, MENU_ITEMS.length);
    this.draw();
  }

  private go(id: MenuId): void {
    switch (id) {
      case 'play':
        this.scene.start('Game');
        break;
      case 'garage':
        this.scene.start('Garage');
        break;
      case 'settings':
        this.scene.start('Settings', { from: 'Menu' });
        break;
      case 'credits':
        this.scene.start('Credits');
        break;
    }
  }

  private draw(): void {
    this.layer.removeAll(true);
    logoPlate(this, this.layer, VIEW_W / 2, 92, 460, 92, 'OFF-ROAD RACING');
    const w = 200;
    const gap = 22;
    const x0 = VIEW_W / 2 - (MENU_ITEMS.length * w + (MENU_ITEMS.length - 1) * gap) / 2 + w / 2;
    MENU_ITEMS.forEach((m, i) => {
      button(this, this.layer, {
        x: x0 + i * (w + gap),
        y: 476,
        w,
        h: 54,
        text: m.text,
        hint: m.hint,
        selected: i === this.index,
        accent: m.accent,
        size: 20,
        onHover: () => {
          if (this.index !== i) {
            this.index = i;
            this.draw();
          }
        },
        onClick: () => this.go(m.id),
      });
    });
  }
}
