import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    // Load saved data or create new
    const saveData = SaveManager.load();

    // Initialize game registry from saved data
    this.registry.set('saveData', saveData);
    this.registry.set('gems', saveData.resources.gems);
    this.registry.set('gold', saveData.resources.gold);
    this.registry.set('pityCounter', saveData.gacha.pityCounter);
    this.registry.set('ownedHeroes', saveData.characters);
    this.registry.set('clearedStages', saveData.progress.clearedStages);
    this.registry.set('battleSpeed', saveData.settings.battleSpeed);
    this.registry.set('autoBattle', false);

    // Check for offline rewards
    const offlineRewards = SaveManager.calculateOfflineRewards();
    if (offlineRewards.gold > 0) {
      this.registry.set('pendingOfflineRewards', offlineRewards);
    }

    // Show brief splash
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Arcane Collectors', {
      fontSize: '32px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.primary.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Fade in then transition
    this.tweens.add({
      targets: title,
      alpha: { from: 0, to: 1 },
      duration: 300,
      onComplete: () => {
        this.time.delayedCall(200, () => {
          this.scene.start('PreloadScene');
        });
      }
    });
  }
}
