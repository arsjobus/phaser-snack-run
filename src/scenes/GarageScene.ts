import Phaser from 'phaser';
import { PROGRESSION, VIEW_W } from '../config';
import { playerTruckKey } from '../art/trucks';
import { ACHIEVEMENTS, unlockAchievements } from '../progress/Achievements';
import {
  UPGRADE_IDS,
  buySkin,
  buyUpgrade,
  equipSkin,
  loadSave,
  upgradeCost,
  writeSave,
  type SaveData,
} from '../progress/Progress';
import { SKINS } from '../progress/Skins';
import { dayKey } from '../progress/Day';
import { defaultStore, type KeyValueStore } from '../progress/Storage';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK, LIST, UI, listRows, rowY, wrapIndex } from '../ui/Theme';
import { bottomBar, button, coinIcon, flatBackdrop, label, panel, pips, rankBadge, rowPlate, topBar, type Layer } from '../ui/Ui';
import { applyView } from '../ui/Resolution';

const TABS = ['UPGRADES', 'PAINT', 'SCORES', 'ACHIEVEMENTS'] as const;
type Tab = (typeof TABS)[number];

/**
 * The garage (Phase 7): spend the snack bank on upgrades and paint, and look at the high scores,
 * lifetime stats and achievements. Reached with G from the game-over screen. Keys: Left/Right
 * switch tab, Up/Down pick a row, Enter buys or equips, Space drives,
 * Esc goes back to the start screen. Taps and clicks work on tabs, rows and buttons too. Drawn with
 * the shared UI kit (`src/ui/`), so it matches the start screen and the settings.
 */
export class GarageScene extends Phaser.Scene {
  private store: KeyValueStore = defaultStore();
  private save!: SaveData;
  private tab: Tab = 'UPGRADES';
  private row = 0;
  private layer!: Layer;
  private edges = new PadEdges();
  private message = '';
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('Garage');
  }

  create(): void {
    applyView(this);
    this.save = loadSave(this.store);
    this.tab = 'UPGRADES';
    this.row = 0;
    this.message = '';
    this.edges = new PadEdges();
    flatBackdrop(this);
    this.layer = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('SPACE,ENTER,ESC,G,A,W,S,O') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.draw();
  }

  update(): void {
    const J = Phaser.Input.Keyboard.JustDown;
    const c = this.cursors;
    if (J(c.right)) this.setTab(1);
    if (J(c.left)) this.setTab(-1);
    if (J(c.down) || J(this.keys.S)) this.move(1);
    if (J(c.up) || J(this.keys.W)) this.move(-1);
    if (J(this.keys.ENTER)) this.activate();
    if (J(this.keys.O)) this.scene.start('Settings', { from: 'Garage' });
    if (J(this.keys.SPACE) || J(this.keys.G)) this.scene.start('Game');
    if (J(this.keys.ESC)) this.scene.start('Menu');
    const e = this.edges.update(padButtons(firstPad()));
    if (e.left) this.setTab(-1);
    if (e.right) this.setTab(1);
    if (e.down) this.move(1);
    if (e.up) this.move(-1);
    if (e.confirm) this.activate();
    if (e.back) this.scene.start('Menu');
    if (e.settings) this.scene.start('Settings', { from: 'Garage' });
  }

  private setTab(d: number): void {
    this.tab = TABS[(TABS.indexOf(this.tab) + d + TABS.length) % TABS.length];
    this.row = 0;
    this.message = '';
    this.draw();
  }

  private rows(): number {
    if (this.tab === 'UPGRADES') return UPGRADE_IDS.length;
    if (this.tab === 'PAINT') return SKINS.length;
    return 0;
  }

  private move(d: number): void {
    const n = this.rows();
    if (n === 0) return;
    this.row = wrapIndex(this.row, d, n);
    this.draw();
  }

  /** Buy (or equip) the highlighted row. */
  private activate(): void {
    const day = dayKey();
    if (this.tab === 'UPGRADES') {
      const id = UPGRADE_IDS[this.row];
      const ok = buyUpgrade(this.save, id);
      this.message = ok ? `${PROGRESSION.upgrades[id].name} upgraded!` : upgradeCost(id, this.save.upgrades[id]) === null ? 'Already maxed.' : 'Not enough coins.';
    } else if (this.tab === 'PAINT') {
      const skin = SKINS[this.row];
      if (this.save.ownedSkins.includes(skin.id)) {
        equipSkin(this.save, skin.id);
        this.message = `${skin.name} equipped.`;
      } else {
        this.message = buySkin(this.save, skin.id) ? `${skin.name} bought and equipped!` : 'Not enough coins.';
      }
    } else {
      return;
    }
    const fresh = unlockAchievements(this.save, null, day);
    if (fresh.length) this.message += '  ' + fresh.map((a) => `ACHIEVEMENT: ${a.name} +${a.reward}`).join('  ');
    writeSave(this.store, this.save);
    this.draw();
  }

  private text(x: number, y: number, str: string | string[], size: number, color: string, ox = 0, display = false): Phaser.GameObjects.Text {
    return label(this, this.layer, x, y, str, display ? 'display' : 'body', size, color, ox);
  }

  private draw(): void {
    this.layer.removeAll(true);
    topBar(this, this.layer, 'GARAGE');
    this.text(VIEW_W - 62, 30, `BANK ${this.save.coins}`, 22, INK.good, 1, true);
    coinIcon(this, this.layer, VIEW_W - 38, 30, 12);

    TABS.forEach((name, i) => {
      button(this, this.layer, {
        x: 130 + i * 234,
        y: 102,
        w: 214,
        h: 34,
        text: name,
        size: 15,
        selected: name === this.tab,
        onClick: () => {
          this.tab = name;
          this.row = 0;
          this.message = '';
          this.draw();
        },
      });
    });

    if (this.tab === 'UPGRADES') this.drawUpgrades();
    else if (this.tab === 'PAINT') this.drawPaint();
    else if (this.tab === 'SCORES') this.drawScores();
    else this.drawAchievements();

    this.text(VIEW_W / 2, 441, this.message, 17, INK.title, 0.5);
    button(this, this.layer, { x: 330, y: 482, w: 250, h: 38, text: 'DRIVE', hint: 'SPACE', size: 16, selected: true, onClick: () => this.scene.start('Game') });
    button(this, this.layer, { x: 630, y: 482, w: 250, h: 38, text: 'BACK TO MENU', hint: 'ESC', size: 16, onClick: () => this.scene.start('Menu') });
    bottomBar(this, this.layer, 'LEFT/RIGHT tab   UP/DOWN pick   ENTER buy / equip   O settings');
  }

  /** A price: the number with the snack-coin icon after it, right-aligned at `x`. */
  private price(x: number, y: number, cost: number, color: string): void {
    coinIcon(this, this.layer, x - 11, y, 11);
    this.text(x - 30, y, String(cost), 18, color, 1, true);
  }

  /** Clickable row background (`h` tall); a click selects, a second click on the selected row activates. */
  private rowBox(i: number, y: number, h: number): void {
    rowPlate(this, this.layer, VIEW_W / 2, y, 860, h, i === this.row);
    const zone = this.add.zone(VIEW_W / 2, y, 860, h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.row === i) this.activate();
      else {
        this.row = i;
        this.draw();
      }
    });
    this.layer.add(zone);
  }

  private drawUpgrades(): void {
    const rows = listRows(142, 352, UPGRADE_IDS.length, 58);
    UPGRADE_IDS.forEach((id, i) => {
      const u = PROGRESSION.upgrades[id];
      const level = this.save.upgrades[id];
      const y = rows.y(i);
      this.rowBox(i, y, rows.h);
      this.text(30 + LIST.padX, y - 10, u.name, 20, INK.text, 0, true);
      this.text(30 + LIST.padX, y + 14, u.blurb, 15, INK.soft);
      pips(this, this.layer, 560, y, level, u.max);
      const cost = upgradeCost(id, level);
      const afford = cost !== null && this.save.coins >= cost;
      const right = VIEW_W - 30 - LIST.padX;
      if (cost === null) this.text(right, y, 'MAXED', 18, INK.cyan, 1, true);
      else this.price(right, y, cost, afford ? INK.good : INK.bad);
    });
    this.text(60, 372, 'Earn coins by driving: snacks, distance, checkpoints, takedowns and close calls.', 15, INK.dim);
    this.text(60, 396, 'Each level costs more than the last, and the best paint jobs cost the most.', 15, INK.dim);
  }

  private drawPaint(): void {
    const rows = listRows(142, 424, SKINS.length, 58);
    SKINS.forEach((skin, i) => {
      const y = rows.y(i);
      this.rowBox(i, y, rows.h);
      const owned = this.save.ownedSkins.includes(skin.id);
      const worn = this.save.skin === skin.id;
      this.layer.add(this.add.image(120, y + 4, playerTruckKey(skin.id)).setScale(0.5));
      this.text(220, y, skin.name, 20, INK.text, 0, true);
      const right = VIEW_W - 30 - LIST.padX;
      if (worn) this.text(right, y, 'EQUIPPED', 18, INK.cyan, 1, true);
      else if (owned) this.text(right, y, 'OWNED', 18, INK.soft, 1, true);
      else this.price(right, y, skin.cost, this.save.coins >= skin.cost ? INK.good : INK.bad);
    });
  }

  private drawScores(): void {
    const st = this.save.stats;
    panel(this, this.layer, 40, 140, 600, 282, 'HIGH SCORES');
    if (this.save.highScores.length === 0) this.text(70, 190, 'No runs yet. Go drive!', 18, INK.soft);
    // Column heads, then one row per run: medal, score, distance, snacks, date.
    const cols = { score: 250, meters: 345, snacks: 420, date: 450 } as const;
    this.text(cols.score, 164, 'SCORE', 13, INK.cyan, 1);
    this.text(cols.meters, 164, 'DIST', 13, INK.cyan, 1);
    this.text(cols.snacks, 164, 'SNACKS', 13, INK.cyan, 1);
    this.text(cols.date, 164, 'DATE', 13, INK.cyan, 0);
    this.save.highScores.forEach((h, i) => {
      const y = rowY(186, 23, i);
      const color = i === 0 ? INK.title : INK.soft;
      rankBadge(this, this.layer, 66, y, i + 1, 10);
      this.text(cols.score, y, String(h.score), 18, color, 1, true);
      this.text(cols.meters, y, `${h.meters} m`, 16, color, 1);
      this.text(cols.snacks, y, String(h.snacks), 16, color, 1);
      this.text(cols.date, y, h.date, 15, color, 0);
    });
    panel(this, this.layer, 664, 140, 256, 282, 'LIFETIME');
    this.text(
      690,
      282,
      [`runs  ${st.runs}`, `distance  ${(st.meters / 1000).toFixed(1)} km`, `snacks  ${st.snacks}`, `takedowns  ${st.takedowns}`, `close calls  ${st.nearMisses}`, `lane changes  ${st.laneChanges}`, `best air  ${st.bestAir.toFixed(2)} s`, `best chain  ${st.bestChain}`, `coins earned  ${st.coinsEarned}`],
      17,
      INK.soft,
    );
  }

  private drawAchievements(): void {
    const got = ACHIEVEMENTS.filter((a) => this.save.achievements[a.id]).length;
    this.text(60, 130, `ACHIEVEMENTS  ${got} / ${ACHIEVEMENTS.length}`, 16, INK.cyan, 0, true);
    // Two columns of plates, `LIST.rowGap` apart both ways, like every other list in the menus.
    const rows = listRows(148, 428, Math.ceil(ACHIEVEMENTS.length / 2), 40);
    const w = 430;
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const cx = VIEW_W / 2 + (col === 0 ? -1 : 1) * (w / 2 + LIST.rowGap / 2);
      const y = rows.y(Math.floor(i / 2));
      const done = !!this.save.achievements[a.id];
      rowPlate(this, this.layer, cx, y, w, rows.h, false);
      const x = cx - w / 2 + LIST.padX;
      const g = this.add.graphics();
      g.fillStyle(UI.outline, 1);
      g.fillCircle(x + 8, y, 9);
      g.fillStyle(done ? UI.yellow : UI.panelLight, 1);
      g.fillCircle(x + 8, y, 7);
      this.layer.add(g);
      this.text(x + 28, y - 8, `${a.name}  (+${a.reward})`, 15, done ? INK.title : INK.dim, 0, true);
      this.text(x + 28, y + 9, a.description, 13, done ? INK.soft : '#5d6a96');
    });
  }
}
