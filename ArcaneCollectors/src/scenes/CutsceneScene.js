/**
 * CutsceneScene — 컷씬 전용 오버레이 씬 (T-C4)
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-1
 *  - `PopupBase`를 상속하지 않는다. 부모 씬을 `pause()`하고 화면을 점유한다.
 *  - 어느 씬에서든 `scene.launch()`로 오버레이되며 depth 경쟁이 없다.
 *  - `ScenePlugin.launch()`는 씬 순서를 바꾸지 않으므로 호출부에서 `bringToTop`이 필요하다
 *    (docs/story/SPIKE_OVERLAY_INPUT.md §7-5). `StoryManager.trigger()`가 수행한다.
 *
 * 호출 규약
 *   scene.launch('CutsceneScene', { scenes, parentKey, vars, onComplete })
 *   → 종료 시 stop(self) + resume(parentKey) + onComplete()
 *
 * 주의: gameConfig.js에서 값을 import하지 않는다(순환 import TDZ 회귀 방지).
 */
import { s, sf } from '../config/scaleConfig.js';
import { CutscenePlayer } from '../components/cutscene/CutscenePlayer.js';
import { StoryManager } from '../systems/StoryManager.js';

export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CutsceneScene' });
  }

  init(data) {
    this.cutscenes = Array.isArray(data?.scenes) ? data.scenes : [];
    this.parentKey = data?.parentKey || null;
    this.vars = data?.vars || {};
    this.onCompleteCallback = typeof data?.onComplete === 'function' ? data.onComplete : null;
    this.player = null;
    this.closing = false;
  }

  create() {
    try {
      // 부모 화면 차폐는 CutscenePlayer의 배경판이 전담한다
      this.player = new CutscenePlayer(this, {
        scenes: this.cutscenes,
        vars: this.vars,
        resolveText: (text, vars) => StoryManager.resolveText(text, vars),
        // R6: 씬 종료/스킵 시점에 즉시 커밋 — 스킵해도 플래그가 유실되지 않는다
        onSceneEnd: (cutscene, info) => StoryManager.markViewed(cutscene.id, { skipped: info.skipped }),
        onComplete: () => this.close()
      });
      this.player.start();

      // 시스템 백 키 = 건너뛰기
      this.input.keyboard?.on('keydown-ESC', () => this.player?.skipScene());

      this.events.once('shutdown', () => {
        this.player?.destroy();
        this.player = null;
      });
    } catch (error) {
      console.error('[CutsceneScene] create() 실패:', error);
      this.add
        .text(s(360), s(640), '컷씬 로드 실패', {
          fontFamily: '"Noto Sans KR", sans-serif',
          fontSize: sf(20),
          color: '#ff4444',
          align: 'center'
        })
        .setOrigin(0.5);
      this.time.delayedCall(1200, () => this.close());
    }
  }

  /** 컷씬 종료 → 부모 씬 재개 → onComplete */
  close() {
    if (this.closing) return;
    this.closing = true;

    const parentKey = this.parentKey;
    const callback = this.onCompleteCallback;

    this.scene.stop();
    if (parentKey) this.scene.resume(parentKey);
    if (callback) callback();
  }
}

export default CutsceneScene;
