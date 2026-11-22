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
import { dayKey } from '../progress/Daily';
import { defaultStore, type KeyValueStore } from '../progress/Storage';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK, UI, rowY, wrapIndex } from '../ui/Theme';
import { bottomBar, button, flatBackdrop, label, panel, pips, rankBadge, rowPlate, topBar, type Layer } from '../ui/Ui';

const TABS = ['UPGRADES', 'PAINT', 'SCORES', 'ACHIEVEMENTS'] as const;
type Tab = (typeof TABS)[number];

/**
 * The garage (Phase 7): spend the snack bank on upgrades and paint, and look at the high scores,
 * lifetime stats and achievements. Reached with G from the game-over screen. Keys: Left/Right
 * switch tab, Up/Down pick a row, Enter buys or equips, Space drives, D starts the daily challenge,
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
    this.save = loadSave(this.store);
    this.tab = 'UPGRADES';
    this.row = 0;
    this.message = '';
    this.edges = new PadEdges();
    flatBackdrop(this);
    this.layer = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('SPACE,ENTER,ESC,G,D,A,W,S,O') as Record<string, Phaser.Input.Keyboard.Key>;
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
    if (J(this.keys.D)) this.scene.start('Game', { daily: true });
    if (J(this.keys.SPACE) || J(this.keys.G)) this.scene.start('Game', { daily: false });
    if (J(this.keys.ESC)) this.scene.start('Menu');
    const e = this.edges.update(padButtons(firstPad()));
    if (e.left) this.setTab(-1);
    if (e.right) this.setTab(1);
    if (e.down) this.move(1);
    if (e.up) this.move(-1);
    if (e.confirm) this.activate();
    if (e.back) this.scene.start('Menu');
    if (e.daily) this.scene.start('Game', { daily: true });
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
    this.text(VIEW_W - 28, 30, `BANK ${this.save.coins}`, 22, INK.good, 1, true);

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

    this.text(VIEW_W / 2, 436, this.message, 17, INK.title, 0.5);
    button(this, this.layer, { x: 330, y: 478, w: 250, h: 38, text: 'DRIVE', hint: 'SPACE', size: 16, selected: true, onClick: () => this.scene.start('Game', { daily: false }) });
    button(this, this.layer, { x: 630, y: 478, w: 250, h: 38, text: 'BACK TO MENU', hint: 'ESC', size: 16, onClick: () => this.scene.start('Menu') });
    bottomBar(this, this.layer, 'LEFT/RIGHT tab   UP/DOWN pick   ENTER buy / equip   D daily challenge   O settings');
  }

  /** Clickable row background; a click selects, a second click on the selected row activates. */
  private rowBox(i: number, y: number): void {
    rowPlate(this, this.layer, VIEW_W / 2, y, 860, 54, i === this.row);
    const zone = this.add.zone(VIEW_W / 2, y, 860, 54).setInteractive({ useHandCursor: true });
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
    UPGRADE_IDS.forEach((id, i) => {
      const u = PROGRESSION.upgrades[id];
      const level = this.save.upgrades[id];
      const y = rowY(150, 66, i) + 10;
      this.rowBox(i, y);
      this.text(60, y - 10, u.name, 20, INK.text, 0, true);
      this.text(60, y + 14, u.blurb, 15, INK.soft);
      pips(this, this.layer, 560, y, level, u.max);
      const cost = upgradeCost(id, level);
      const afford = cost !== null && this.save.coins >= cost;
      this.text(VIEW_W - 60, y, cost === null ? 'MAXED' : `${cost} coins`, 18, cost === null ? INK.cyan : afford ? INK.good : INK.bad, 1, true);
    });
    this.text(60, 372, 'Upgrades do not apply in the daily challenge: everyone drives the same stock truck.', 15, INK.dim);
    this.text(60, 396, 'Earn coins by driving: snacks, distance, checkpoints, takedowns and close calls.', 15, INK.dim);
  }

  private drawPaint(): void {
    SKINS.forEach((skin, i) => {
      const y = rowY(146, 58, i) + 10;
      this.rowBox(i, y);
      const owned = this.save.ownedSkins.includes(skin.id);
      const worn = this.save.skin === skin.id;
      this.layer.add(this.add.image(120, y + 4, playerTruckKey(skin.id)).setScale(0.55));
      this.text(220, y, skin.name, 20, INK.text, 0, true);
      this.text(VIEW_W - 60, y, worn ? 'EQUIPPED' : owned ? 'OWNED' : `${skin.cost} coins`, 18, worn ? INK.cyan : owned ? INK.soft : this.save.coins >= skin.cost ? INK.good : INK.bad, 1, true);
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
      if (h.daily) this.text(600, y, 'DAILY', 13, INK.good, 1, true);
    });
    panel(this, this.layer, 664, 140, 256, 282, 'LIFETIME');
    this.text(
      690,
      282,
      [`runs  ${st.runs}`, `distance  ${(st.meters / 1000).toFixed(1)} km`, `snacks  ${st.snacks}`, `takedowns  ${st.takedowns}`, `close calls  ${st.nearMisses}`, `lane changes  ${st.laneChanges}`, `best air  ${st.bestAir.toFixed(2)} s`, `best chain  ${st.bestChain}`, `coins earned  ${st.coinsEarned}`],
      17,
      INK.soft,
    );
    const days = Object.entries(this.save.dailyBest).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 2);
    if (days.length) this.text(690, 392, days.map(([d, v]) => `daily ${d.slice(5)}  ${v}`), 14, INK.cyan);
  }

  private drawAchievements(): void {
    const got = ACHIEVEMENTS.filter((a) => this.save.achievements[a.id]).length;
    this.text(60, 138, `ACHIEVEMENTS  ${got} / ${ACHIEVEMENTS.length}`, 16, INK.cyan, 0, true);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = 50 + col * 440;
      const y = rowY(166, 33, rowI);
      const done = !!this.save.achievements[a.id];
      const g = this.add.graphics();
      g.fillStyle(UI.outline, 1);
      g.fillCircle(x + 10, y + 4, 9);
      g.fillStyle(done ? UI.yellow : UI.panelLight, 1);
      g.fillCircle(x + 10, y + 4, 7);
      this.layer.add(g);
      this.text(x + 28, y - 3, `${a.name}  (+${a.reward})`, 16, done ? INK.title : INK.dim, 0, true);
      this.text(x + 28, y + 14, a.description, 13, done ? INK.soft : '#5d6a96');
    });
  }
}
