import Phaser from 'phaser';
import { SCROLL_Y0, TRUCK, VIEW_W } from '../config';
import { playerTruckKey, rivalTruckKey } from '../art/trucks';
import { BIOME_LIST } from '../game/Biomes';
import { GroundPainter } from '../game/GroundPainter';
import { laneDepth, laneLift, laneProject, laneScale } from '../game/Lanes';
import { Parallax } from '../game/Parallax';
import { PLAYER_WHEEL, RIVAL_STYLES } from '../game/Rival';
import { Terrain } from '../game/Terrain';
import { tireRise } from '../game/Tires';
import { bodyOrigin } from '../game/TruckView';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { CheatMatcher, applyCheat, type CheatId, type CheatKey } from '../progress/Cheats';
import { isGodMode } from '../progress/Session';
import { loadSave, writeSave } from '../progress/Progress';
import { SFX, sfxCacheKey } from '../audio/sfx';
import { loadSettings } from '../settings/Settings';
import { defaultStore } from '../progress/Storage';
import { MENU_GATE, MENU_ITEMS, type MenuId } from '../ui/MenuModel';
import { INK, wrapIndex } from '../ui/Theme';
import { button, label, logoPlate, type Layer } from '../ui/Ui';
import { applyView } from '../ui/Resolution';
import { ACHIEVEMENTS, allAchievementsUnlocked } from '../progress/Achievements';
import { MASTER, starField, sunRays } from '../ui/MasterMenu';
import { t } from '../i18n';

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
  private cheats = new CheatMatcher();
  /** Key events already handled: a slow frame can hand the same event to the scene twice. */
  private seen = new WeakSet<KeyboardEvent>();
  private toast: Phaser.GameObjects.Container | null = null;
  private godBadge: Phaser.GameObjects.Container | null = null;
  /** Every achievement is unlocked: the special start screen is shown instead of the usual one. */
  private master = false;
  private rays: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    applyView(this);
    this.index = 0;
    this.t = 0;
    this.bodies = [];
    this.edges = new PadEdges();
    this.cheats.reset();
    this.toast = null;
    this.godBadge = null;
    this.rays = null;
    this.master = allAchievementsUnlocked(loadSave(defaultStore()));
    this.buildScenery();
    this.layer = this.add.container(0, 0).setDepth(20).setScrollFactor(0);
    this.draw();
    this.drawGodBadge();

    const kb = this.input.keyboard!;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    kb.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', onKey));
  }

  private buildScenery(): void {
    const biome = (this.master && BIOME_LIST.find((b) => b.id === MASTER.biome)) || BIOME_LIST[0];
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

    // The lineup: the player's truck up front (in the paint job chosen in the garage), three rivals behind it.
    const playerKey = playerTruckKey(loadSave(defaultStore()).skin);
    const lineup = [
      { key: rivalTruckKey(2), tire: RIVAL_STYLES[2].wheel, x: 330, lane: 2 },
      { key: rivalTruckKey(0), tire: RIVAL_STYLES[0].wheel, x: 650, lane: 2 },
      { key: rivalTruckKey(1), tire: RIVAL_STYLES[1].wheel, x: 820, lane: 1 },
      { key: playerKey, tire: PLAYER_WHEEL, x: 480, lane: 0 },
    ];
    const [ox, oy] = bodyOrigin();
    lineup.forEach((t, i) => {
      const sc = laneScale(t.lane);
      const cy = gy - 42;
      const baseY = laneProject(gy, cy, t.lane);
      // Match the soft ground blobs used for vehicles during a race.
      const shadow = this.add.graphics().setDepth(laneDepth(t.lane, 0.05));
      shadow.fillStyle(0x000000, 0.3);
      shadow.fillEllipse(t.x, gy - laneLift(t.lane) + 2 * sc, 116 * sc, 13 * sc);
      const img = this.add.image(t.x, baseY, t.key).setOrigin(ox, oy).setScale(sc).setDepth(laneDepth(t.lane, 0.1));
      if (this.master && t.key === playerKey) img.setTint(MASTER.goldLight); // the champion's truck shines
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
    label(this, l, VIEW_W - 22, 24, best ? t('menu.best', { score: best.score }) : t('menu.noRuns'), 'display', 18, INK.title, 1, 4, 330);
    if (this.master) this.buildMasterScenery(gy);
  }

  /** The golden-hour dressing of the special screen: sun, turning sunburst, warm sky bands, stars and a glow under the truck. */
  private buildMasterScenery(groundY: number): void {
    const cx = VIEW_W / 2;
    this.add.circle(cx, MASTER.sunY, MASTER.sunRadius, MASTER.gold, 0.35).setScrollFactor(0).setDepth(-9.5);
    this.add.circle(cx, MASTER.sunY, MASTER.sunRadius * 0.7, MASTER.goldLight, 0.5).setScrollFactor(0).setDepth(-9.49);
    this.rays = this.add.graphics().setScrollFactor(0).setDepth(-9.4);
    const bands = this.add.graphics().setScrollFactor(0).setDepth(-5.5);
    for (const [y, h, color, alpha] of MASTER.bands) {
      bands.fillStyle(color, alpha);
      bands.fillRect(0, y, VIEW_W, h);
    }
    for (const s of starField(MASTER.stars, VIEW_W, 14, 210)) {
      const star = this.add.star(s.x, s.y, 4, s.size * 0.3, s.size, MASTER.goldLight).setScrollFactor(0).setDepth(-5).setAlpha(0.2);
      this.tweens.add({ targets: star, alpha: 1, scale: 1.3, duration: 900, yoyo: true, repeat: -1, delay: s.delay, ease: 'Sine.easeInOut' });
    }
    // A warm pool of light on the road under the player's truck.
    this.add.ellipse(480, groundY + 6, 230, 34, MASTER.gold, 0.28).setDepth(0.6);
    this.add.ellipse(480, groundY + 6, 140, 20, MASTER.goldLight, 0.3).setDepth(0.61);
  }

  private drawRays(): void {
    if (!this.rays) return;
    this.rays.clear();
    this.rays.fillStyle(MASTER.goldLight, 0.13);
    for (const r of sunRays(VIEW_W / 2, MASTER.sunY, MASTER.rays, MASTER.rayReach, this.t * MASTER.raySpeed)) this.rays.fillTriangle(r.x1, r.y1, r.x2, r.y2, r.x3, r.y3);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.parallax.update(150, SCROLL_Y0, dt);
    this.drawRays();
    // Idle engines: the bodies rock a pixel on their suspension.
    for (const b of this.bodies) b.img.y = b.baseY + Math.sin(this.t * 7 + b.phase) * 0.8;
    const e = this.edges.update(padButtons(firstPad()));
    if (e.left) this.move(-1);
    if (e.right) this.move(1);
    // Secret codes: D-pad or stick directions (the arrow keys are fed in `onKey`).
    if (e.up) this.cheatKey('U');
    if (e.down) this.cheatKey('D');
    if (e.left) this.cheatKey('L');
    if (e.right) this.cheatKey('R');
    if (e.confirm) this.go(MENU_ITEMS[this.index].id);
    if (e.garage) this.go('garage');
    if (e.settings) this.go('settings');
  }

  private onKey(e: KeyboardEvent): void {
    if (this.seen.has(e)) return;
    this.seen.add(e);
    // Secret codes use the arrow keys only (W, A, S and D still just move the selection).
    const arrow: Record<string, CheatKey> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' };
    if (arrow[e.code]) this.cheatKey(arrow[e.code]);
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

  /** Feeds an arrow press to the code matcher; a finished code applies, saves and plays its jingle. */
  private cheatKey(k: CheatKey): void {
    const id: CheatId | null = this.cheats.push(k);
    if (!id) return;
    const store = defaultStore();
    const save = loadSave(store);
    const result = applyCheat(save, id);
    writeSave(store, save);
    const settings = loadSettings(store);
    this.sound.volume = settings.master;
    // Switching god mode off plays the jingle a fourth lower.
    this.sound.play(sfxCacheKey('cheat'), { volume: Math.min(1, SFX.cheat.volume * settings.sfx * 2), rate: id === 'god' && !result.on ? 0.75 : 1 });
    this.showToast(t(result.messageKey));
    this.drawGodBadge();
  }

  private showToast(text: string): void {
    this.toast?.destroy();
    const l = this.add.container(0, 0).setDepth(25).setScrollFactor(0);
    label(this, l, VIEW_W / 2, 176, text, 'display', 30, INK.title, 0.5, 5);
    this.toast = l;
    this.tweens.add({ targets: l, alpha: 0, delay: 1600, duration: 500, onComplete: () => l.destroy() });
  }

  /** A small badge under the best score while god mode is on, so a player who forgot knows why. */
  private drawGodBadge(): void {
    this.godBadge?.destroy();
    this.godBadge = null;
    if (!isGodMode()) return;
    const l = this.add.container(0, 0).setDepth(20).setScrollFactor(0);
    label(this, l, VIEW_W - 22, 50, t('menu.godMode'), 'display', 14, '#7dff8a', 1, 3);
    this.godBadge = l;
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

  /** The title of the special screen: the usual logo plate, untouched, with the achievement tally under it. */
  private drawMasterHeader(): void {
    const cx = VIEW_W / 2;
    logoPlate(this, this.layer, cx, 92, 460, 92, t('menu.subtitle'));
    label(this, this.layer, cx, 172, t('master.subtitle'), 'display', 18, MASTER.goldInk, 0.5, 4);
    const total = ACHIEVEMENTS.filter((a) => !a.hidden).length;
    label(this, this.layer, cx, 198, t('master.stats', { done: total, total }), 'body', 16, INK.soft, 0.5, 3);
  }

  private draw(): void {
    this.layer.removeAll(true);
    if (this.master) this.drawMasterHeader();
    else logoPlate(this, this.layer, VIEW_W / 2, 92, 460, 92, t('menu.subtitle'));
    const w = 200;
    const gap = 22;
    const x0 = VIEW_W / 2 - (MENU_ITEMS.length * w + (MENU_ITEMS.length - 1) * gap) / 2 + w / 2;
    MENU_ITEMS.forEach((m, i) => {
      button(this, this.layer, {
        x: x0 + i * (w + gap),
        y: 476,
        w,
        h: 54,
        text: t(m.key),
        hint: m.hint,
        selected: i === this.index,
        accent: this.master ? MASTER.gold : m.accent,
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
