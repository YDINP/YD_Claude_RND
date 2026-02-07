/**
 * LoadingSpinner.js - 씬 전환 로딩 스피너
 * H-9.4: Scene 전환 로딩 스피너
 *
 * 사용법:
 *   import { LoadingSpinner } from '../components/LoadingSpinner.js';
 *   const spinner = new LoadingSpinner(this); // this = Phaser.Scene
 *   spinner.show();
 *   // ... 로딩 완료 후
 *   spinner.hide();
 */

import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

export class LoadingSpinner {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.x = options.x ?? GAME_WIDTH - 60;
    this.y = options.y ?? GAME_HEIGHT - 60;
    this.size = options.size ?? 20;
    this.color = options.color ?? 0x6366f1;
    this.visible = false;

    this.container = null;
    this.dots = [];
    this.tween = null;
  }

  /**
   * 스피너 표시
   */
  show() {
    if (this.visible) return;
    this.visible = true;

    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(999);

    // 3개 도트 회전 스피너
    const dotCount = 3;
    for (let i = 0; i < dotCount; i++) {
      const angle = (Math.PI * 2 * i) / dotCount;
      const dx = Math.cos(angle) * this.size;
      const dy = Math.sin(angle) * this.size;
      const dot = this.scene.add.circle(dx, dy, 4, this.color, 0.8 - i * 0.2);
      this.dots.push(dot);
      this.container.add(dot);
    }

    // 회전 애니메이션
    this.tween = this.scene.tweens.add({
      targets: this.container,
      angle: 360,
      duration: 800,
      repeat: -1,
      ease: 'Linear'
    });
  }

  /**
   * 스피너 숨기기
   */
  hide() {
    if (!this.visible) return;
    this.visible = false;

    if (this.tween) {
      this.tween.stop();
      this.tween = null;
    }

    if (this.container) {
      this.container.destroy();
      this.container = null;
    }

    this.dots = [];
  }

  /**
   * 정리
   */
  destroy() {
    this.hide();
  }
}

export default LoadingSpinner;
