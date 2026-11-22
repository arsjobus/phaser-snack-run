import Phaser from 'phaser';
import { PROGRESSION, VIEW_H, VIEW_W } from '../config';
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

const TABS = ['UPGRADES', 'PAINT', 'SCORES', 'ACHIEVEMENTS'] as const;
type Tab = (typeof TABS)[number];

/**
 * The garage (Phase 7): spend the snack bank on upgrades and paint, and look at the high scores,
 * lifetime stats and achievements. Reached with G from the game-over screen. Keys: Left/Right
 * switch tab, Up/Down pick a row, Enter buys or equips, Space drives, D starts the daily challenge.
 * Taps and clicks work on tabs and rows too.
 */
export class GarageScene extends Phaser.Scene {
  private store: KeyValueStore = defaultStore();
  private save!: SaveData;
  private tab: Tab = 'UPGRADES';
  private row = 0;
  private layer!: Phaser.GameObjects.Container;
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
    this.cameras.main.setBackgroundColor('#0b1230');
    this.layer = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('SPACE,ENTER,ESC,G,D,A,W,S,O') as Record<string, Phaser.Input.Keyboard.Key>;
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
    if (J(this.keys.SPACE) || J(this.keys.ESC) || J(this.keys.G)) this.scene.start('Game', { daily: false });
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
    this.row = (this.row + d + n) % n;
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

  private text(x: number, y: number, str: string | string[], size: number, color: string, ox = 0): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, str, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color, lineSpacing: 6 })
      .setOrigin(ox, 0.5);
    this.layer.add(t);
    return t;
  }

  private draw(): void {
    this.layer.removeAll(true);
    const cx = VIEW_W / 2;
    this.text(cx, 30, 'GARAGE', 30, '#ffe066', 0.5);
    this.text(VIEW_W - 24, 30, `BANK ${this.save.coins}`, 22, '#7dff8a', 1);

    TABS.forEach((name, i) => {
      const x = 80 + i * 200;
      const on = name === this.tab;
      const box = this.add
        .rectangle(x + 90, 76, 184, 30, on ? 0x2a3f7a : 0x16224a)
        .setStrokeStyle(2, on ? 0x9be0ff : 0x44558a)
        .setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => {
        this.tab = name;
        this.row = 0;
        this.message = '';
        this.draw();
      });
      this.layer.add(box);
      this.text(x + 90, 76, name, 15, on ? '#ffffff' : '#9aa7cf', 0.5);
    });

    if (this.tab === 'UPGRADES') this.drawUpgrades();
    else if (this.tab === 'PAINT') this.drawPaint();
    else if (this.tab === 'SCORES') this.drawScores();
    else this.drawAchievements();

    this.text(cx, VIEW_H - 54, this.message, 16, '#ffd34d', 0.5);
    this.text(
      cx,
      VIEW_H - 24,
      '←/→ tab   ↑/↓ pick   ENTER buy/equip   SPACE drive   D daily challenge   O settings',
      14,
      '#c9d3ee',
      0.5,
    );
  }

  /** Clickable row background; a click selects, a second click on the selected row activates. */
  private rowBox(i: number, y: number): void {
    const box = this.add
      .rectangle(VIEW_W / 2, y, 840, 54, i === this.row ? 0x1f3166 : 0x121c42)
      .setStrokeStyle(2, i === this.row ? 0x9be0ff : 0x2c3a6b)
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      if (this.row === i) this.activate();
      else {
        this.row = i;
        this.draw();
      }
    });
    this.layer.add(box);
  }

  private drawUpgrades(): void {
    UPGRADE_IDS.forEach((id, i) => {
      const u = PROGRESSION.upgrades[id];
      const level = this.save.upgrades[id];
      const y = 150 + i * 66;
      this.rowBox(i, y);
      this.text(60, y - 10, u.name, 20, '#ffffff');
      this.text(60, y + 12, u.blurb, 14, '#9aa7cf');
      const pips = '■'.repeat(level) + '□'.repeat(u.max - level);
      this.text(560, y, pips, 20, '#ffe066', 0.5);
      const cost = upgradeCost(id, level);
      const afford = cost !== null && this.save.coins >= cost;
      this.text(VIEW_W - 60, y, cost === null ? 'MAXED' : `${cost} coins`, 18, cost === null ? '#9be0ff' : afford ? '#7dff8a' : '#ff6a5a', 1);
    });
    this.text(60, 380, 'Upgrades do not apply in the daily challenge: everyone drives the same stock truck.', 13, '#9aa7cf');
    this.text(60, 410, `Earn coins by driving: snacks, distance, checkpoints, takedowns and close calls.`, 13, '#9aa7cf');
  }

  private drawPaint(): void {
    SKINS.forEach((skin, i) => {
      const y = 140 + i * 58;
      this.rowBox(i, y);
      const owned = this.save.ownedSkins.includes(skin.id);
      const worn = this.save.skin === skin.id;
      const img = this.add.image(120, y + 4, playerTruckKey(skin.id)).setScale(0.55);
      this.layer.add(img);
      this.text(220, y, skin.name, 20, '#ffffff');
      this.text(VIEW_W - 60, y, worn ? 'EQUIPPED' : owned ? 'OWNED' : `${skin.cost} coins`, 18, worn ? '#9be0ff' : owned ? '#c9d3ee' : this.save.coins >= skin.cost ? '#7dff8a' : '#ff6a5a', 1);
    });
  }

  private drawScores(): void {
    const st = this.save.stats;
    this.text(60, 120, 'HIGH SCORES', 18, '#9be0ff');
    if (this.save.highScores.length === 0) this.text(60, 160, 'No runs yet. Go drive!', 16, '#c9d3ee');
    this.save.highScores.forEach((h, i) => {
      this.text(
        60,
        150 + i * 24,
        `${String(i + 1).padStart(2)}. ${String(h.score).padStart(8)}   ${String(h.meters).padStart(5)} m   ${String(h.snacks).padStart(3)} snacks   ${h.date}${h.daily ? '  DAILY' : ''}`,
        15,
        i === 0 ? '#ffe066' : '#c9d3ee',
      );
    });
    this.text(
      640,
      120,
      ['LIFETIME', '', `runs ${st.runs}`, `distance ${(st.meters / 1000).toFixed(1)} km`, `snacks ${st.snacks}`, `takedowns ${st.takedowns}`, `close calls ${st.nearMisses}`, `lane changes ${st.laneChanges}`, `best air ${st.bestAir.toFixed(2)}s`, `best chain ${st.bestChain}`, `coins earned ${st.coinsEarned}`],
      15,
      '#c9d3ee',
    );
    const days = Object.entries(this.save.dailyBest).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3);
    if (days.length) this.text(640, 400, ['DAILY BESTS', ...days.map(([d, v]) => `${d}  ${v}`)], 14, '#9be0ff');
  }

  private drawAchievements(): void {
    const got = ACHIEVEMENTS.filter((a) => this.save.achievements[a.id]).length;
    this.text(60, 112, `ACHIEVEMENTS  ${got}/${ACHIEVEMENTS.length}`, 16, '#9be0ff');
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = 40 + col * 450;
      const y = 148 + rowI * 40;
      const done = !!this.save.achievements[a.id];
      this.text(x, y - 8, `${done ? '★' : '☆'} ${a.name}  (+${a.reward})`, 14, done ? '#ffe066' : '#7f8bb0');
      this.text(x + 18, y + 10, a.description, 12, done ? '#c9d3ee' : '#5d6a96');
    });
  }
}
