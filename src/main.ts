import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';
import { ArtScene } from './scenes/ArtScene';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GarageScene } from './scenes/GarageScene';
import { SettingsScene } from './scenes/SettingsScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#7fb7e6',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene, GarageScene, SettingsScene, ArtScene],
});
