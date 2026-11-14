/**
 * TransitionManager.ts - Scene transition effects manager
 * Singleton pattern for consistent scene transitions
 */
import { GAME_WIDTH, GAME_HEIGHT } from '../config/scaleConfig.js';
import navigationManager from '../systems/NavigationManager.js';

type SlideDirection = 'left' | 'right' | 'up' | 'down';
type ZoomDirection = 'in' | 'out';

class TransitionManagerClass {
  private isTransitioning: boolean = false;
  private _safetyTimer: any = null;
  /**
   * 락이 걸려 있는 동안 들어온 전환 요청 중 가장 최근 것 (락 해제 시 재시도한다).
   * 오래된 요청을 큐잉하면 이미 낡아버린 데이터/씬을 참조할 수 있으므로 최신 1건만 유지한다.
   */
  private _pending: (() => void) | null = null;

  /**
   * isTransitioning 강제 리셋 (비정상 잠금 복구용).
   * 대기 중인 전환은 재시도하지 않고 버린다 — 명시적 reset()은 "완전히 새로 시작"하려는
   * 의도이므로, 그 시점에 낡아 있을 수 있는 보류 요청을 되살리지 않는다.
   */
  reset(): void {
    this.isTransitioning = false;
    this._pending = null;
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }
  }

  /**
   * 전환 락 획득을 시도한다. 모든 `*Transition()` 메서드의 진입점에서 호출한다.
   *
   * 과거에는 `if (this.isTransitioning) return;` 한 줄로 조용히 무시했다 — 흔적이
   * 전혀 남지 않아, 선행 전환이 중간에 끊겨 락이 새면(씬이 완료 콜백 전에 종료되는 등)
   * 이후의 모든 전환 요청이 영원히 무시되는 소프트락으로 이어졌다(전투 승리 후 결과
   * 화면으로 못 넘어가는 사례가 대표적).
   *
   * 이제는 (1) 경고를 남기고 (2) 요청을 큐에 저장해 락 해제 시 재시도하며,
   * (3) 락 획득에 성공하면 안전 타이머를 걸어 완료 콜백이 끝내 안 불려도 스스로 풀린다.
   *
   * @returns 락을 획득했으면 true. false면 이 전환은 지금 실행하지 말고 반환해야 한다.
   */
  private _acquire(label: string, timeoutMs: number, retry: () => void): boolean {
    if (this.isTransitioning) {
      console.warn(`[TransitionManager] ${label} 무시됨 - 다른 전환이 진행 중입니다. 락 해제 시 재시도합니다.`);
      this._pending = retry;
      return false;
    }
    this.isTransitioning = true;
    this._startSafetyTimer(timeoutMs);
    return true;
  }

  /** 전환 완료 처리: 락 해제 + 안전 타이머 정리 + 보류 중이던 전환을 다음 틱에 재시도 */
  private _release(): void {
    this.isTransitioning = false;
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }
    const pending = this._pending;
    this._pending = null;
    if (pending) {
      // 다음 틱으로 미룬다: 지금 막 scene.scene.start()로 씬을 전환하는 중인데 재시도를
      // 동기로 실행하면, 같은 씬을 참조하는 재시도가 이제 막 시작한 새 애니메이션을
      // (곧이어 실행될 scene.start()의 씬 종료로) 다시 끊어버릴 수 있다.
      setTimeout(pending, 0);
    }
  }

  /**
   * 안전 타이머: timeout 이후에도 isTransitioning이 true면 강제로 풀고,
   * 그사이 들어온 보류 요청이 있으면 재시도한다.
   */
  private _startSafetyTimer(timeout: number): void {
    if (this._safetyTimer) clearTimeout(this._safetyTimer);
    this._safetyTimer = setTimeout(() => {
      this._safetyTimer = null;
      if (this.isTransitioning) {
        console.warn('[TransitionManager] Safety timeout - force reset isTransitioning');
        this._release();
      }
    }, timeout);
  }

  /**
   * Fade out → scene change → fade in
   * @param scene - Current scene
   * @param target - Target scene key
   * @param data - Data to pass to target scene
   * @param duration - Fade duration in ms
   * @param skipPush - true면 navigationManager.pushScene 스킵 (goBackToScene에서 호출 시)
   */
  fadeTransition(scene: Phaser.Scene, target: string, data: any = {}, duration: number = 400, skipPush: boolean = false): void {
    if (!this._acquire('fadeTransition', duration + 2000, () => this.fadeTransition(scene, target, data, duration, skipPush))) return;

    scene.cameras.main.fadeOut(duration / 2, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      this._release();
      if (!skipPush) navigationManager.pushScene(target, data);
      scene.scene.start(target, data);
    });
  }

  /**
   * Slide transition
   * @param scene - Current scene
   * @param target - Target scene key
   * @param data - Data to pass
   * @param direction - 'left', 'right', 'up', 'down'
   * @param duration - Transition duration in ms
   */
  slideTransition(
    scene: Phaser.Scene,
    target: string,
    data: any = {},
    direction: SlideDirection = 'left',
    duration: number = 300
  ): void {
    if (!this._acquire('slideTransition', duration + 2000, () => this.slideTransition(scene, target, data, direction, duration))) return;

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
        this._release();
        overlay.destroy();
        navigationManager.pushScene(target, data);
        scene.scene.start(target, data);
      }
    });
  }

  /**
   * Battle entry transition with dramatic effects
   * Sequence: darken → BATTLE START text → shake → flash → scene start
   * @param scene - Current scene
   * @param data - Battle data to pass
   */
  battleEntryTransition(scene: Phaser.Scene, data: any = {}): void {
    if (!this._acquire('battleEntryTransition', 3200, () => this.battleEntryTransition(scene, data))) return;

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
        this._release();
        overlay.destroy();
        battleText.destroy();
        navigationManager.pushScene('BattleScene', data, { battle: true });
        scene.scene.start('BattleScene', data);
      });
    });
  }

  /**
   * Gacha entry transition with mystical effects
   * Sequence: darken → magic circle expand → rotate + particles → flash → scene start
   * @param scene - Current scene
   * @param data - Data to pass
   */
  gachaEntryTransition(scene: Phaser.Scene, data: any = {}): void {
    if (!this._acquire('gachaEntryTransition', 3100, () => this.gachaEntryTransition(scene, data))) return;

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
        this._release();
        magicCircle.destroy();
        overlay.destroy();
        navigationManager.pushScene('GachaScene', data);
        scene.scene.start('GachaScene', data);
      });
    });
  }

  /**
   * Zoom in/out transition
   * @param scene - Current scene
   * @param target - Target scene key
   * @param data - Data to pass
   * @param originX - Zoom origin X (default center)
   * @param originY - Zoom origin Y (default center)
   * @param zoomDir - 'in' or 'out'
   * @param duration - Transition duration in ms
   */
  zoomTransition(
    scene: Phaser.Scene,
    target: string,
    data: any = {},
    originX: number = GAME_WIDTH / 2,
    originY: number = GAME_HEIGHT / 2,
    zoomDir: ZoomDirection = 'in',
    duration: number = 400
  ): void {
    if (!this._acquire('zoomTransition', duration * 2 + 2000, () => this.zoomTransition(scene, target, data, originX, originY, zoomDir, duration))) return;

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
        this._release();
        overlay.destroy();
        navigationManager.pushScene(target, data);
        scene.scene.start(target, data);
      }
    });
  }

  /**
   * Victory flash transition (BattleScene → BattleResult on win)
   * @param scene
   * @param data
   */
  victoryTransition(scene: Phaser.Scene, data: any = {}): void {
    if (!this._acquire('victoryTransition', 2700, () => this.victoryTransition(scene, data))) return;

    const cam = scene.cameras.main;
    cam.flash(400, 255, 255, 200);

    scene.time.delayedCall(400, () => {
      cam.fadeOut(300, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => {
        this._release();
        navigationManager.pushScene('BattleResultScene', data, { battle: true });
        scene.scene.start('BattleResultScene', data);
      });
    });
  }

  /**
   * Defeat fade transition (BattleScene → BattleResult on loss)
   * @param scene
   * @param data
   */
  defeatTransition(scene: Phaser.Scene, data: any = {}): void {
    if (!this._acquire('defeatTransition', 2600, () => this.defeatTransition(scene, data))) return;

    const cam = scene.cameras.main;
    cam.fadeOut(600, 10, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this._release();
      navigationManager.pushScene('BattleResultScene', data, { battle: true });
      scene.scene.start('BattleResultScene', data);
    });
  }
}

const transitionManager = new TransitionManagerClass();
export default transitionManager;
