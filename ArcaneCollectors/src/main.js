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

// 씬 정리 배선 — Phaser 는 ES6 클래스 씬의 shutdown() 을 자동 호출하지 않는다.
//
// SceneManager.bootScene() 이 직접 부르는 것은 init/preload/create 뿐이고,
// Systems.shutdown() 은 SHUTDOWN 이벤트를 emit 할 뿐이다(phaser/src/scene/Systems.js).
// 그래서 15개 씬이 정의해 둔 shutdown() 이 한 번도 실행되지 않고 있었다 — 실측으로
// 확인했다(메인→영웅목록→메인 왕복 후 호출 0건). 그 결과 각 씬이 create() 에서
// 건 EventBus 구독·타이머·전용 텍스처가 화면을 떠나도 그대로 남아, 씬 순환 1회마다
// EventBus 구독이 13건씩 단조 증가했다.
//
// 씬마다 `this.events.on('shutdown', ...)` 를 심는 대신 여기서 한 번에 배선한다.
// 씬 인스턴스는 게임 수명 동안 유지되므로 'ready' 시점의 1회 등록으로 충분하고,
// 씬 파일 15개를 건드리지 않아도 된다.
//
// 호출 순서: 이 핸들러는 씬 플러그인(InputPlugin/Clock/TweenManager)과 GameObject 의
// SHUTDOWN 구독보다 먼저 등록되므로 먼저 실행된다. 즉 앱 레벨 정리가 끝난 뒤에
// 프레임워크가 표시 객체를 파기한다 — 의도한 순서다.
//
// 한 씬의 정리 실패가 화면 전환 자체를 막으면 안 되므로 개별적으로 감싼다.
game.events.once('ready', () => {
  game.scene.scenes.forEach(scene => {
    if (typeof scene.shutdown !== 'function') return;
    scene.events.on('shutdown', () => {
      try {
        scene.shutdown();
      } catch (e) {
        console.warn(`[main] ${scene.sys.config.key}.shutdown() 실패:`, e);
      }
    });
  });
});
