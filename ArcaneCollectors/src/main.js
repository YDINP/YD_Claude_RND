import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';
import { DebugManager } from './systems/DebugManager.js';

// Initialize the game
const game = new Phaser.Game(gameConfig);

// Global game reference
window.game = game;

// 모든 씬에 디버그 FAB 자동 부착
const SKIP_SCENES = ['BootScene', 'PreloadScene'];
game.events.once('ready', () => {
  game.scene.scenes.forEach(scene => {
    if (SKIP_SCENES.includes(scene.sys.config.key)) return;
    scene.events.on('create', () => {
      DebugManager.attachToScene(scene);
    });
  });
});
