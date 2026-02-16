/**
 * NavigationManager.js
 * 글로벌 네비게이션 스택 관리 (씬 + 팝업)
 * 모바일 뒤로가기 / 브라우저 백 버튼 지원
 */
import transitionManager from '../utils/TransitionManager.ts';

const SKIP_SCENES = ['BootScene', 'PreloadScene', 'LoginScene'];
const BATTLE_SCENES = ['BattleScene', 'BattleResultScene'];

class NavigationManagerClass {
  constructor() {
    this.stack = [];
    this._currentScene = null;
    this._initBrowserBack();
  }

  /** 브라우저 뒤로가기 연동 */
  _initBrowserBack() {
    window.addEventListener('popstate', (e) => {
      if (this.canGoBack() && this._currentScene) {
        this.goBack(this._currentScene);
      }
    });
  }

  /** history.pushState로 브라우저 히스토리에 등록 */
  _pushBrowserHistory(name) {
    try {
      window.history.pushState({ nav: name }, '');
    } catch (e) { /* 무시 */ }
  }

  /** 스택 초기화 (메인 메뉴 진입 시) */
  reset() {
    this.stack = [];
  }

  /** 씬 전환 시 스택에 push */
  pushScene(sceneName, data = {}, meta = {}) {
    if (SKIP_SCENES.includes(sceneName)) return;
    this.stack.push({ type: 'scene', name: sceneName, data, meta });
    this._pushBrowserHistory(sceneName);
  }

  /** 팝업 열 때 스택에 push */
  pushPopup(popupName, popupRef) {
    this.stack.push({ type: 'popup', name: popupName, popup: popupRef });
    this._pushBrowserHistory(popupName);
  }

  /** 팝업 닫힐 때 스택에서 pop (팝업만) */
  popPopup() {
    if (this.stack.length === 0) return;
    const top = this.stack[this.stack.length - 1];
    if (top.type === 'popup') {
      this.stack.pop();
    }
  }

  /** 뒤로갈 수 있는지 확인 */
  canGoBack() {
    // 스택에 2개 이상 있어야 뒤로갈 수 있음 (바닥 = MainMenuScene)
    return this.stack.length > 1;
  }

  /** 스택 top 확인 */
  peek() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** 현재 씬 참조 업데이트 */
  setCurrentScene(scene) {
    this._currentScene = scene;
  }

  /**
   * 뒤로가기 실행
   * - 팝업이 열려있으면 팝업 닫기
   * - 씬이면 이전 씬으로 전환
   */
  goBack(currentScene) {
    if (!this.canGoBack()) return false;

    const current = this.stack[this.stack.length - 1];

    if (current.type === 'popup') {
      // 팝업 닫기 — hide()가 내부적으로 popPopup()을 호출
      if (current.popup && typeof current.popup.hide === 'function') {
        current.popup.hide();
      } else if (current.popup && typeof current.popup.destroy === 'function') {
        current.popup.destroy();
      }
      return true;
    }

    if (current.type === 'scene') {
      // 현재 씬 pop
      this.stack.pop();

      // 이전 항목 찾기 (팝업은 스킵, 씬을 찾을 때까지)
      let target = null;
      for (let i = this.stack.length - 1; i >= 0; i--) {
        if (this.stack[i].type === 'scene') {
          target = this.stack[i];
          break;
        }
      }

      if (target) {
        // skipPush=true: 스택에 이미 target이 있으므로 중복 push 방지
        transitionManager.fadeTransition(currentScene, target.name, target.data || {}, 300, true);
      }
      return true;
    }

    return false;
  }

  /**
   * 특정 씬까지 스택 되감기 (전투 종료 등)
   * targetScene까지 모든 항목 pop, 해당 씬으로 전환
   */
  goBackToScene(currentScene, targetSceneName) {
    // 타겟 씬까지 스택 정리
    while (this.stack.length > 1) {
      const top = this.stack[this.stack.length - 1];
      if (top.type === 'scene' && top.name === targetSceneName) break;
      this.stack.pop();
    }

    // 타겟이 스택에 없으면 리셋 후 push
    const hasTarget = this.stack.some(e => e.type === 'scene' && e.name === targetSceneName);
    if (!hasTarget) {
      this.reset();
      this.pushScene(targetSceneName, {});
    }

    // skipPush=true: 이미 스택에 target이 있으므로 중복 push 방지
    transitionManager.fadeTransition(currentScene, targetSceneName, {}, 300, true);
  }

  /** 디버그용: 현재 스택 출력 */
  debugPrint() {
    console.log('[NavStack]', this.stack.map(e => `${e.type}:${e.name}`).join(' → '));
  }
}

const navigationManager = new NavigationManagerClass();
export default navigationManager;
