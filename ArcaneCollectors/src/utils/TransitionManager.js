/**
 * TransitionManager.js - Scene transition effects manager
 * Singleton pattern for consistent scene transitions
 */
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

class TransitionManagerClass {
  constructor() {
    this.isTransitioning = false;
  }

  /**
   * Fade out → scene change → fade in
   * @param {Phaser.Scene} scene - Current scene
   * @param {string} target - Target scene key
   * @param {Object} data - Data to pass to target scene
   * @param {number} duration - Fade duration in ms
   */
  fadeTransition(scene, target, data = {}, duration = 400) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    scene.cameras.main.fadeOut(duration / 2, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      this.isTransitioning = false;
      scene.scene.start(target, data);
    });
  }

  /**
   * Slide transition
   * @param {Phaser.Scene} scene - Current scene
   * @param {string} target - Target scene key
   * @param {Object} data - Data to pass
   * @param {string} direction - 'left', 'right', 'up', 'down'
   * @param {number} duration - Transition duration in ms
   */
  slideTransition(scene, target, data = {}, direction = 'left', duration = 300) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;
    let scrollX = 0;
    let scrollY = 0;

    switch (direction) {
      case 'left':
        scrollX = GAME_WIDTH;
        break;
      case 'right':
        scrollX = -GAME_WIDTH;
        break;
      case 'up':
        scrollY = GAME_HEIGHT;
        break;
      case 'down':
        scrollY = -GAME_HEIGHT;
        break;
    }

    // Create overlay to fade out while sliding
    const overlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0
    ).setDepth(9999).setScrollFactor(0);

    scene.tweens.add({
      targets: overlay,
      alpha: 0.6,
      duration: duration
    });

    scene.tweens.add({
      targets: cam,
      scrollX: cam.scrollX + scrollX,
      scrollY: cam.scrollY + scrollY,
      duration: duration,
      ease: 'Power2',
      onComplete: () => {
        this.isTransitioning = false;
        overlay.destroy();
        scene.scene.start(target, data);
      }
    });
  }

  /**
   * Battle entry transition with dramatic effects
   * Sequence: darken → BATTLE START text → shake → flash → scene start
   * @param {Phaser.Scene} scene - Current scene
   * @param {Object} data - Battle data to pass
   */
  battleEntryTransition(scene, data = {}) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;

    // 1. Dark overlay (0~300ms)
    const overlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0
    ).setDepth(9998).setScrollFactor(0);

    scene.tweens.add({
      targets: overlay,
      alpha: 0.8,
      duration: 300,
      ease: 'Power2'
    });

    // 2. BATTLE START text slide in (300~500ms)
    const battleText = scene.add.text(
      -300, GAME_HEIGHT / 2,
      'BATTLE START',
      {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#FFD700',
        stroke: '#000000',
        strokeThickness: 4
      }
    ).setOrigin(0.5).setDepth(9999).setScrollFactor(0);

    scene.tweens.add({
      targets: battleText,
      x: GAME_WIDTH / 2,
      duration: 200,
      delay: 300,
      ease: 'Power3'
    });

    // 3. Shake (500~800ms)
    scene.time.delayedCall(500, () => {
      cam.shake(300, 0.005);
    });

    // 4. Flash (800~900ms)
    scene.time.delayedCall(800, () => {
      cam.flash(100, 255, 255, 255);
    });

    // 5. Fade out and transition (900~1200ms)
    scene.time.delayedCall(900, () => {
      cam.fadeOut(300, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => {
        this.isTransitioning = false;
        overlay.destroy();
        battleText.destroy();
        scene.scene.start('BattleScene', data);
      });
    });
  }

  /**
   * Gacha entry transition with mystical effects
   * Sequence: darken → magic circle expand → rotate + particles → flash → scene start
   * @param {Phaser.Scene} scene - Current scene
   * @param {Object} data - Data to pass
   */
  gachaEntryTransition(scene, data = {}) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;

    // 1. Dark overlay (0~200ms)
    const overlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0
    ).setDepth(9998).setScrollFactor(0);

    scene.tweens.add({
      targets: overlay,
      alpha: 0.8,
      duration: 200,
      ease: 'Power2'
    });

    // 2. Magic circle (200~500ms) - drawn with graphics
    const magicCircle = scene.add.graphics().setDepth(9999).setScrollFactor(0);
    magicCircle.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    magicCircle.setScale(0);

    // Draw concentric circles
    magicCircle.lineStyle(2, 0xAA44FF, 0.8);
    magicCircle.strokeCircle(0, 0, 80);
    magicCircle.lineStyle(1, 0xCC88FF, 0.6);
    magicCircle.strokeCircle(0, 0, 60);
    magicCircle.lineStyle(1, 0xFF88CC, 0.4);
    magicCircle.strokeCircle(0, 0, 100);

    // Inner cross pattern
    magicCircle.lineStyle(1, 0xAA44FF, 0.5);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      magicCircle.lineBetween(
        Math.cos(angle) * 40, Math.sin(angle) * 40,
        Math.cos(angle) * 90, Math.sin(angle) * 90
      );
    }

    scene.tweens.add({
      targets: magicCircle,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      delay: 200,
      ease: 'Back.easeOut'
    });

    // 3. Rotation + light particles (500~700ms)
    scene.tweens.add({
      targets: magicCircle,
      angle: 360,
      duration: 800,
      delay: 200,
      ease: 'Linear'
    });

    // Light particles
    scene.time.delayedCall(500, () => {
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI * 2) / 12;
        const px = GAME_WIDTH / 2 + Math.cos(angle) * 70;
        const py = GAME_HEIGHT / 2 + Math.sin(angle) * 70;
        const particle = scene.add.circle(px, py, 3, 0xCC88FF, 0.8)
          .setDepth(9999).setScrollFactor(0);

        scene.tweens.add({
          targets: particle,
          x: GAME_WIDTH / 2,
          y: GAME_HEIGHT / 2,
          alpha: 0,
          duration: 300,
          ease: 'Power2',
          onComplete: () => particle.destroy()
        });
      }
    });

    // 4. Flash (700~800ms)
    scene.time.delayedCall(700, () => {
      cam.flash(100, 200, 180, 255);
    });

    // 5. Fade out and transition (800~1100ms)
    scene.time.delayedCall(800, () => {
      cam.fadeOut(300, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => {
        this.isTransitioning = false;
        magicCircle.destroy();
        overlay.destroy();
        scene.scene.start('GachaScene', data);
      });
    });
  }

  /**
   * Zoom in/out transition
   * @param {Phaser.Scene} scene - Current scene
   * @param {string} target - Target scene key
   * @param {Object} data - Data to pass
   * @param {number} originX - Zoom origin X (default center)
   * @param {number} originY - Zoom origin Y (default center)
   * @param {string} zoomDir - 'in' or 'out'
   * @param {number} duration - Transition duration in ms
   */
  zoomTransition(scene, target, data = {}, originX = GAME_WIDTH / 2, originY = GAME_HEIGHT / 2, zoomDir = 'in', duration = 400) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;
    const targetZoom = zoomDir === 'in' ? 2.0 : 0.5;

    // Pan camera to origin point
    cam.pan(originX, originY, duration / 2, 'Power2');

    // Overlay for smooth transition
    const overlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH * 2, GAME_HEIGHT * 2,
      0x000000, 0
    ).setDepth(9999).setScrollFactor(0);

    scene.tweens.add({
      targets: cam,
      zoom: targetZoom,
      duration: duration,
      ease: 'Power2'
    });

    scene.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: duration,
      delay: duration * 0.4,
      ease: 'Power2',
      onComplete: () => {
        // Reset camera before transitioning
        cam.zoom = 1;
        cam.scrollX = 0;
        cam.scrollY = 0;
        this.isTransitioning = false;
        overlay.destroy();
        scene.scene.start(target, data);
      }
    });
  }

  /**
   * Victory flash transition (BattleScene → BattleResult on win)
   * @param {Phaser.Scene} scene
   * @param {Object} data
   */
  victoryTransition(scene, data = {}) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;
    cam.flash(400, 255, 255, 200);

    scene.time.delayedCall(400, () => {
      cam.fadeOut(300, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => {
        this.isTransitioning = false;
        scene.scene.start('BattleResultScene', data);
      });
    });
  }

  /**
   * Defeat fade transition (BattleScene → BattleResult on loss)
   * @param {Phaser.Scene} scene
   * @param {Object} data
   */
  defeatTransition(scene, data = {}) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const cam = scene.cameras.main;
    cam.fadeOut(600, 10, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this.isTransitioning = false;
      scene.scene.start('BattleResultScene', data);
    });
  }
}

const transitionManager = new TransitionManagerClass();
export default transitionManager;
