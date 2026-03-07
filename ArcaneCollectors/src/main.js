import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';
import { DebugManager } from './systems/DebugManager.js';

// 폰트 로드 완료 후 Phaser 초기화 (Google Fonts CDN 비동기 대응)
document.fonts.ready.then(() => {
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
});
