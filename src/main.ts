import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';
import { ArtScene } from './scenes/ArtScene';
import { BootScene } from './scenes/BootScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameScene } from './scenes/GameScene';
import { GarageScene } from './scenes/GarageScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { installPadFocus } from './input/Focus';
import { loadFonts } from './ui/Fonts';
import { initRenderScale } from './ui/Resolution';
import { setLocale } from './i18n';
import { loadSettings } from './settings/Settings';
import { defaultStore } from './progress/Storage';

// The fonts load first, so every canvas text is measured with the real glyphs (never rejects).
void loadFonts().then(() => {
  setLocale(loadSettings(defaultStore()).language);
  const R = initRenderScale();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W * R,
    height: VIEW_H * R,
    backgroundColor: '#7fb7e6',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, GameScene, GarageScene, SettingsScene, CreditsScene, ArtScene],
  });
  installPadFocus(game);
});
