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
  resetProgress,
  upgradeCost,
  writeSave,
  type SaveData,
} from '../progress/Progress';
import { SKINS } from '../progress/Skins';
import { dayKey } from '../progress/Day';
import { defaultStore, type KeyValueStore } from '../progress/Storage';
import { PadEdges, firstPad, padButtons } from '../input/Gamepad';
import { INK, LIST, UI, listRows, paginate, plateInner, rowY, wrapIndex } from '../ui/Theme';
import { bottomBar, button, coinIcon, flatBackdrop, label, panel, pips, rowPlate, topBar, trophy, type Layer } from '../ui/Ui';
import { applyView } from '../ui/Resolution';

const TABS = ['UPGRADES', 'PAINT', 'SCORES', 'ACHIEVEMENTS'] as const;
type Tab = (typeof TABS)[number];

/** The content column every tab lines up on: tabs, row plates, panels and buttons all share these edges. */
const COL_W = 860;
const COL_L = (VIEW_W - COL_W) / 2;
const COL_R = COL_L + COL_W;
/** Achievements: three rows of two plates per page. */
const ACH_PER_PAGE = 6;

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
  private achPage = 0;
  /** The "erase everything?" box is open; `confirmFocus` is the button the keyboard is on (0 cancel, 1 erase). */
  private confirming = false;
  private confirmFocus = 0;
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
    this.achPage = 0;
    this.confirming = false;
    this.confirmFocus = 0;
    this.edges = new PadEdges();
    flatBackdrop(this);
    this.layer = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('SPACE,ENTER,ESC,G,A,W,S,O,R,Y,N') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.draw();
  }

  update(): void {
    const J = Phaser.Input.Keyboard.JustDown;
    const c = this.cursors;
    if (this.confirming) {
      const e = this.edges.update(padButtons(firstPad()));
      if (J(this.keys.Y)) this.eraseProgress();
      else if (J(this.keys.N) || J(this.keys.ESC) || e.back) this.closeConfirm();
      else if (J(c.left) || J(c.right) || J(this.keys.A) || e.left || e.right) {
        this.confirmFocus = 1 - this.confirmFocus;
        this.draw();
      } else if (J(this.keys.ENTER) || e.confirm) {
        if (this.confirmFocus === 1) this.eraseProgress();
        else this.closeConfirm();
      }
      return;
    }
    if (J(this.keys.R)) this.openConfirm();
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

  private openConfirm(): void {
    this.confirming = true;
    this.confirmFocus = 0; // Cancel is the safe default
    this.draw();
  }

  private closeConfirm(): void {
    this.confirming = false;
    this.draw();
  }

  /** Wipe the save (coins, upgrades, paint, scores, stats, achievements). Settings and key bindings stay. */
  private eraseProgress(): void {
    this.save = resetProgress(this.store);
    this.confirming = false;
    this.tab = 'UPGRADES';
    this.row = 0;
    this.achPage = 0;
    this.message = 'Progress reset. Back to the start.';
    this.draw();
  }

  private rows(): number {
    if (this.tab === 'UPGRADES') return UPGRADE_IDS.length;
    if (this.tab === 'PAINT') return SKINS.length;
    return 0;
  }

  private move(d: number): void {
    if (this.tab === 'ACHIEVEMENTS') {
      this.setAchPage(this.achPage + d);
      return;
    }
    const n = this.rows();
    if (n === 0) return;
    this.row = wrapIndex(this.row, d, n);
    this.draw();
  }

  private setAchPage(page: number): void {
    const pages = paginate(ACHIEVEMENTS.length, ACH_PER_PAGE, 0).pages;
    this.achPage = wrapIndex(this.achPage, page - this.achPage, pages);
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
    // The coin icon says "bank" on its own: just the amount, with the same 24 px margin as the lists.
    this.text(VIEW_W - 24 - 40, 30, String(this.save.coins), 22, INK.good, 1, true);
    coinIcon(this, this.layer, VIEW_W - 24 - 14, 30, 12);

    // Tabs share the plates' left and right edges, 12 px apart.
    const tabGap = 12;
    const tabW = (COL_W - tabGap * (TABS.length - 1)) / TABS.length;
    TABS.forEach((name, i) => {
      button(this, this.layer, {
        x: COL_L + tabW / 2 + i * (tabW + tabGap),
        y: 102,
        w: tabW,
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
    // Three buttons on the column's grid: Drive, Back, and the (red) reset.
    const bw = 250;
    const gap = (COL_W - bw * 3) / 2;
    const bx = (i: number) => COL_L + bw / 2 + i * (bw + gap);
    button(this, this.layer, { x: bx(0), y: 482, w: bw, h: 38, text: 'DRIVE', hint: 'SPACE', size: 16, selected: true, onClick: () => this.scene.start('Game') });
    button(this, this.layer, { x: bx(1), y: 482, w: bw, h: 38, text: 'BACK TO MENU', hint: 'ESC', size: 16, onClick: () => this.scene.start('Menu') });
    button(this, this.layer, { x: bx(2), y: 482, w: bw, h: 38, text: 'RESET PROGRESS', hint: 'R', size: 15, accent: UI.red, onClick: () => this.openConfirm() });
    bottomBar(
      this,
      this.layer,
      this.confirming ? 'LEFT/RIGHT pick   ENTER choose   Y erase   N or ESC cancel' : `LEFT/RIGHT tab   UP/DOWN ${this.tab === 'ACHIEVEMENTS' ? 'page' : 'pick'}   ENTER buy / equip   R reset progress   O settings`,
    );
    if (this.confirming) this.drawConfirm();
  }

  /** The "erase everything?" box: dims the garage, swallows clicks, and defaults to Cancel. */
  private drawConfirm(): void {
    const dim = this.add.rectangle(VIEW_W / 2, 270, VIEW_W, 540, 0x000000, 0.74).setInteractive();
    this.layer.add(dim);
    const w = 540;
    const h = 214;
    const cx = VIEW_W / 2;
    const cy = 270;
    panel(this, this.layer, cx - w / 2, cy - h / 2, w, h, 'RESET PROGRESS');
    const inner = plateInner(cx, w);
    this.text(cx, cy - 46, 'Erase everything?', 26, INK.title, 0.5, true);
    const body = this.text(cx, cy - 4, 'Your coins, upgrades, paint, high scores, stats and achievements are deleted. Settings and key bindings stay. This cannot be undone.', 16, INK.soft, 0.5);
    body.setAlign('center').setWordWrapWidth(inner.right - inner.left);
    const bw = 220;
    button(this, this.layer, { x: cx - bw / 2 - 10, y: cy + 64, w: bw, h: 40, text: 'KEEP IT', hint: 'N', size: 16, selected: this.confirmFocus === 0, onClick: () => this.closeConfirm() });
    button(this, this.layer, { x: cx + bw / 2 + 10, y: cy + 64, w: bw, h: 40, text: 'ERASE ALL', hint: 'Y', size: 16, selected: this.confirmFocus === 1, accent: UI.red, onClick: () => this.eraseProgress() });
  }

  /** A price: the number with the snack-coin icon after it, right-aligned at `x`. */
  private price(x: number, y: number, cost: number, color: string): void {
    coinIcon(this, this.layer, x - 11, y, 11);
    this.text(x - 30, y, String(cost), 18, color, 1, true);
  }

  /** Clickable row background (`h` tall); a click selects, a second click on the selected row activates. */
  private rowBox(i: number, y: number, h: number): void {
    rowPlate(this, this.layer, VIEW_W / 2, y, COL_W, h, i === this.row);
    const zone = this.add.zone(VIEW_W / 2, y, COL_W, h).setInteractive({ useHandCursor: true });
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
    const { left, right } = plateInner(VIEW_W / 2, COL_W);
    const rows = listRows(142, 352, UPGRADE_IDS.length, 62);
    // Columns inside the plate: name and blurb on the left, the level pips, then the price/status block
    // at the right edge (120 px, so a 4-digit price fits), each 28 px apart.
    const priceW = 120;
    const pipsRight = right - priceW - 28;
    const pipsX = pipsRight - 104; // five pips are 106 px wide, drawn from x - 2
    UPGRADE_IDS.forEach((id, i) => {
      const u = PROGRESSION.upgrades[id];
      const level = this.save.upgrades[id];
      const y = rows.y(i);
      this.rowBox(i, y, rows.h);
      this.text(left, y - 11, u.name, 20, INK.text, 0, true);
      this.text(left, y + 14, u.blurb, 15, INK.soft);
      pips(this, this.layer, pipsX, y, level, u.max);
      const cost = upgradeCost(id, level);
      const afford = cost !== null && this.save.coins >= cost;
      if (cost === null) this.text(right, y, 'MAXED', 18, INK.cyan, 1, true);
      else this.price(right, y, cost, afford ? INK.good : INK.bad);
    });
    this.text(left, 376, 'Earn coins by driving: snacks, distance, checkpoints, takedowns and close calls.', 15, INK.dim);
    this.text(left, 400, 'Each level costs more than the last, and the best paint jobs cost the most.', 15, INK.dim);
  }

  private drawPaint(): void {
    const { left, right } = plateInner(VIEW_W / 2, COL_W);
    const rows = listRows(142, 424, SKINS.length, 58);
    SKINS.forEach((skin, i) => {
      const y = rows.y(i);
      this.rowBox(i, y, rows.h);
      const owned = this.save.ownedSkins.includes(skin.id);
      const worn = this.save.skin === skin.id;
      this.layer.add(this.add.image(left + 56, y + 4, playerTruckKey(skin.id)).setScale(0.5));
      this.text(left + 140, y, skin.name, 20, INK.text, 0, true);
      if (worn) this.text(right, y, 'EQUIPPED', 18, INK.cyan, 1, true);
      else if (owned) this.text(right, y, 'OWNED', 18, INK.soft, 1, true);
      else this.price(right, y, skin.cost, this.save.coins >= skin.cost ? INK.good : INK.bad);
    });
  }

  private drawScores(): void {
    const st = this.save.stats;
    // Two panels on the column's grid, 24 px apart, starting clear of the tab row (their yellow label
    // tab sticks 17 px above the panel).
    const top = 160;
    const h = 268;
    const scoreW = 590;
    const lifeX = COL_L + scoreW + 24;
    const lifeW = COL_R - lifeX;
    panel(this, this.layer, COL_L, top, scoreW, h, 'HIGH SCORES');
    const inL = COL_L + LIST.padX;
    if (this.save.highScores.length === 0) this.text(inL, top + 52, 'No runs yet. Go drive!', 18, INK.soft);
    // Column heads, then one row per run: medal, score, distance, snacks, date.
    const cols = { score: inL + 190, meters: inL + 290, snacks: inL + 370, date: inL + 400 } as const;
    this.text(cols.score, top + 28, 'SCORE', 13, INK.cyan, 1);
    this.text(cols.meters, top + 28, 'DIST', 13, INK.cyan, 1);
    this.text(cols.snacks, top + 28, 'SNACKS', 13, INK.cyan, 1);
    this.text(cols.date, top + 28, 'DATE', 13, INK.cyan, 0);
    this.save.highScores.forEach((h2, i) => {
      const y = rowY(top + 52, 21.5, i);
      const color = i === 0 ? INK.title : INK.soft;
      trophy(this, this.layer, inL + 12, y + 1, i + 1, 19);
      this.text(cols.score, y, String(h2.score), 18, color, 1, true);
      this.text(cols.meters, y, `${h2.meters} m`, 16, color, 1);
      this.text(cols.snacks, y, String(h2.snacks), 16, color, 1);
      this.text(cols.date, y, h2.date, 15, color, 0);
    });
    panel(this, this.layer, lifeX, top, lifeW, h, 'LIFETIME');
    this.text(
      lifeX + LIST.padX,
      top + h / 2 + 4,
      [`runs  ${st.runs}`, `distance  ${(st.meters / 1000).toFixed(1)} km`, `snacks  ${st.snacks}`, `takedowns  ${st.takedowns}`, `close calls  ${st.nearMisses}`, `lane changes  ${st.laneChanges}`, `best air  ${st.bestAir.toFixed(2)} s`, `best chain  ${st.bestChain}`, `coins earned  ${st.coinsEarned}`],
      17,
      INK.soft,
    );
  }

  private drawAchievements(): void {
    const got = ACHIEVEMENTS.filter((a) => this.save.achievements[a.id]).length;
    const pg = paginate(ACHIEVEMENTS.length, ACH_PER_PAGE, this.achPage);
    this.achPage = pg.page;
    const headL = COL_L + LIST.padX;
    this.text(headL, 148, `ACHIEVEMENTS  ${got} / ${ACHIEVEMENTS.length}`, 16, INK.cyan, 0, true);
    // Pager: PREV / NEXT with the page number between them, on the right edge of the column.
    const pw = 84;
    button(this, this.layer, { x: COL_R - LIST.padX - pw / 2, y: 148, w: pw, h: 26, text: 'NEXT', size: 13, onClick: () => this.setAchPage(this.achPage + 1) });
    this.text(COL_R - LIST.padX - pw - 52, 148, `PAGE ${pg.page + 1} / ${pg.pages}`, 14, INK.soft, 0.5, true);
    button(this, this.layer, { x: COL_R - LIST.padX - pw - 104 - pw / 2, y: 148, w: pw, h: 26, text: 'PREV', size: 13, onClick: () => this.setAchPage(this.achPage - 1) });

    // Three rows of two plates, 78 px tall so a name and a two-line description sit with a real gutter
    // above and below, `LIST.rowGap` apart both ways.
    const rows = listRows(172, 430, ACH_PER_PAGE / 2, 78);
    const w = (COL_W - LIST.rowGap * 2) / 2;
    ACHIEVEMENTS.slice(pg.from, pg.to).forEach((a, i) => {
      const col = i % 2;
      const cx = VIEW_W / 2 + (col === 0 ? -1 : 1) * (w / 2 + LIST.rowGap);
      const y = rows.y(Math.floor(i / 2));
      const done = !!this.save.achievements[a.id];
      rowPlate(this, this.layer, cx, y, w, rows.h, false);
      const inner = plateInner(cx, w);
      const g = this.add.graphics();
      g.fillStyle(UI.outline, 1);
      g.fillCircle(inner.left + 9, y, 10);
      g.fillStyle(done ? UI.yellow : UI.panelLight, 1);
      g.fillCircle(inner.left + 9, y, 8);
      this.layer.add(g);
      const tx = inner.left + 34;
      const rewardRight = inner.right - 22;
      this.text(tx, y - rows.h * 0.27, a.name, 17, done ? INK.title : INK.dim, 0, true);
      coinIcon(this, this.layer, inner.right - 8, y - rows.h * 0.27, 8);
      this.text(rewardRight, y - rows.h * 0.27, `+${a.reward}`, 15, done ? INK.good : INK.dim, 1, true);
      const desc = this.text(tx, y + rows.h * 0.14, a.description, 14, done ? INK.soft : '#7684ad');
      desc.setWordWrapWidth(inner.right - tx);
    });
  }
}
