/**
 * TutorialFlow - 튜토리얼 런타임 배선 컨트롤러 (T-C6 배선)
 *
 * 역할: 씬 하나(현재는 MainMenuScene)에 붙어 현재 스텝을 화면으로 옮긴다.
 *   - 컷씬 스텝(T-01/T-02)  → StoryManager.trigger 로 자동 재생 후 커밋
 *   - 강제 스텝(F-1/F-2)    → TutorialOverlay(딤 + 홀). 홀 안 입력만 통과
 *   - 안내 스텝(S-1~S-4)    → CoachMark(딤 없음). 무시해도 게임이 진행된다
 *   - 팝업 스텝             → 강제면 자동 오픈, 안내면 해당 메뉴 아이콘으로 유도
 *
 * 불변 규칙 (UX_ONBOARDING_FLOW §4-1)
 *   대상 해석에 실패하면 **마스킹을 걸지 않고 코치마크로 강등**한다.
 *   홀 없는 검은 화면은 유저를 가두기 때문에 절대 만들지 않는다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { TutorialManager, TutorialEvents, COMPLETION_MODE } from '../../systems/TutorialManager.js';
import { TutorialTargetRegistry, RESOLUTION_TIER } from '../../systems/TutorialTargetRegistry.js';
import { StoryManager } from '../../systems/StoryManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { EventBus } from '../../systems/EventBus.js';
import { grantStepEntryReward } from '../../systems/TutorialRewards.js';
import { TutorialOverlay } from './TutorialOverlay.js';
import { CoachMark } from './CoachMark.js';

/** 타깃 해석 재시도 (12프레임 ≈ 200ms, UX 문서 §4-1 타이밍 규약) */
const RESOLVE_MAX_ATTEMPTS = 12;
const RESOLVE_INTERVAL_MS = 16;

/** 씬 진입 직후 레이아웃이 확정될 때까지의 지연 */
const INITIAL_DELAY_MS = 350;

/** popupKey → 메뉴 아이콘 TID */
function menuTid(popupKey) {
  return `mainmenu.menu.${popupKey}`;
}

export class TutorialFlow {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.overlay = null;
    this.coach = null;
    this.currentStepId = null;
    /** 마지막 타깃 해석 티어 (1=레지스트리, 2=씬 이름, 3=폴백 앵커). 디버그/E2E 관찰용 */
    this.lastTier = null;
    this._cutsceneBusy = false;
    this._openingPopup = false;
    this._refreshTimer = null;
    this._watchTimer = null;
    this._unsubscribe = null;
    this._destroyed = false;
  }

  // ==================== 수명주기 ====================

  /** 씬 create() 마지막에 호출한다. */
  start() {
    if (this._destroyed) return this;

    TutorialManager.attachEvents();

    // 스텝이 커밋되면 화면을 다시 맞춘다 (조건 자동 커밋 포함)
    this._unsubscribe = EventBus.on(TutorialEvents.STEP_COMMITTED, () => this.scheduleRefresh(0));

    try {
      TutorialManager.evaluate();
    } catch (error) {
      console.error('[TutorialFlow] 초기 조건 평가 실패', error);
    }

    this.scheduleRefresh(INITIAL_DELAY_MS);
    return this;
  }

  /** 씬 shutdown() 에서 호출한다. */
  destroy() {
    this._destroyed = true;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._refreshTimer) {
      this._refreshTimer.remove?.(false);
      this._refreshTimer = null;
    }
    this._stopTargetWatch();
    this.clearVisuals();
    this.scene = null;
  }

  /**
   * 팝업이 스스로 단계를 바꾸면(AscensionPopup 1→2→3) 하이라이트 대상도 바뀐다.
   * 팝업은 튜토리얼에 알리지 않으므로, 강조 중에는 주기적으로 대상을 재해석한다.
   */
  _startTargetWatch(step) {
    this._stopTargetWatch();
    if (!this.scene?.time) return;

    this._watchTimer = this.scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (this._destroyed || !this.overlay?.isVisible) return;
        const tid = this._activeTargetTid(step);
        if (!tid) return;
        const resolved = TutorialTargetRegistry.resolve(tid, { scene: this.scene });
        const changed = resolved?.object && resolved.object !== this.overlay.holeTarget;
        if (changed) this.refresh();
      },
    });
  }

  _stopTargetWatch() {
    if (this._watchTimer) {
      this._watchTimer.remove(false);
      this._watchTimer = null;
    }
  }

  /** 오버레이/코치마크 제거 */
  clearVisuals() {
    this._stopTargetWatch();
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    if (this.coach) {
      this.coach.destroy();
      this.coach = null;
    }
  }

  /** 표시 중인 튜토리얼 UI가 있는가 (E2E/디버그용) */
  get isShowing() {
    return !!(this.overlay?.isVisible || this.coach?.isVisible);
  }

  // ==================== 외부 통지 ====================

  /** MainMenuScene.openPopup() 이 호출한다. */
  notifyPopupOpened(popupKey) {
    try {
      TutorialManager.notify('popup_open', { popupKey });
    } catch (error) {
      console.error('[TutorialFlow] popup_open 통지 실패', error);
    }
    this.scheduleRefresh(120);
  }

  /** 팝업이 닫힐 때 호출한다. */
  notifyPopupClosed() {
    try {
      TutorialManager.evaluate();
    } catch (error) {
      console.error('[TutorialFlow] 팝업 종료 후 평가 실패', error);
    }
    this.scheduleRefresh(120);
  }

  /** 지연 갱신 (중복 호출은 마지막 것만 살아남는다) */
  scheduleRefresh(delayMs = 0) {
    if (this._destroyed || !this.scene?.time) return;
    if (this._refreshTimer) this._refreshTimer.remove(false);
    this._refreshTimer = this.scene.time.delayedCall(Math.max(delayMs, 1), () => {
      this._refreshTimer = null;
      this.refresh();
    });
  }

  // ==================== 상태 머신 ====================

  refresh() {
    if (this._destroyed || !this.scene) return;
    if (this._cutsceneBusy) return;

    this.clearVisuals();

    if (TutorialManager.isCompleted()) {
      this.currentStepId = null;
      return;
    }

    const step = TutorialManager.getCurrentStep();
    if (!step) return;

    // 스텝을 끝내기 위해 필요한 재료(T-09 첫 각인 보증)는 진입 시점에 지급한다.
    // 갱신마다 호출해도 안전하다(부족분만 채우는 멱등 연산).
    try {
      grantStepEntryReward(step.id);
    } catch (error) {
      console.error('[TutorialFlow] 스텝 진입 보상 지급 실패', step.id, error);
    }
    this.currentStepId = step.id;

    // 1) 컷씬 전용 스텝 — 자동 재생 후 커밋
    if (step.highlightType === 'cutscene_only') {
      this._playCutsceneStep(step);
      return;
    }

    // 2) 이 씬이 담당하는 스텝이 아니면 아무것도 하지 않는다 (전투 중 스텝 등)
    const sceneKey = this.scene.scene?.key;
    if (step.targetScene && step.targetScene !== sceneKey) return;

    // 3) 강제 팝업 스텝이 끝났는데 잠긴 팝업이 남아 있으면 닫기를 풀어준다(갇힘 방지)
    this._releaseLockedPopup(step);

    // 4) 팝업 스텝
    if (step.targetPopup) {
      const popupOpen = !!this.scene.activePopup;
      if (!popupOpen) this.scene.destroyOrphanPopups?.();
      if (!popupOpen) {
        if (step.forced) {
          this._openStepPopup(step);
        } else {
          // 안내 스텝은 강제로 열지 않는다. 해당 메뉴 아이콘을 가리킨다.
          this._mountForTid(step, menuTid(step.targetPopup), step.fallbackAnchor, true);
        }
        return;
      }
    }

    // 5) 타깃 하이라이트 — 남아 있는 고아 팝업이 있으면 먼저 치운다
    if (!this.scene.activePopup) this.scene.destroyOrphanPopups?.();
    this._mountForTid(step, this._activeTargetTid(step), step.fallbackAnchor, false);
  }

  // ==================== 내부 ====================

  /**
   * 튜토리얼이 강제로 연 팝업을 스텝이 끝나면 정리한다.
   * 잠금만 풀고 열어 두면 다음 스텝의 안내 대상(메뉴 아이콘 등)이 팝업 뒤에 가려져
   * 유저가 진행할 수 없다. 잠금 해제 후 닫아 메인 메뉴로 돌려보낸다.
   */
  _releaseLockedPopup(step) {
    const popup = this.scene.activePopup;
    if (!popup?.onboarding) return;
    if (step.targetPopup && step.forced) return;   // 아직 강제 구간이면 유지

    popup.unlockClose?.();
    popup.hide?.();
  }

  /** highlightSequence 가 있으면 지금 화면에 실제로 존재하는 첫 타깃을 쓴다 */
  _activeTargetTid(step) {
    const sequence = Array.isArray(step.highlightSequence) ? step.highlightSequence : [];
    for (const tid of sequence) {
      if (TutorialTargetRegistry.has(tid)) return tid;
    }
    return step.targetElement || null;
  }

  /**
   * 타깃을 해석해 오버레이(강제) 또는 코치마크(안내)를 붙인다.
   * 해석 실패 시 강제 스텝도 코치마크로 강등한다.
   */
  _mountForTid(step, tid, fallbackAnchor, forceGuided = false) {
    if (!tid) {
      this._mountCoach(step, null);
      return;
    }

    this._resolveWithRetry(tid, fallbackAnchor, (resolved) => {
      if (this._destroyed) return;
      const bounds = resolved?.bounds || null;
      const degraded = !resolved || resolved.tier === RESOLUTION_TIER.FALLBACK_ANCHOR;
      this.lastTier = resolved?.tier ?? null;

      if (step.forced && !forceGuided && !degraded) {
        this._mountOverlay(step, bounds, resolved?.object || null);
      } else {
        this._mountCoach(step, bounds);
      }
    });
  }

  /** 12프레임까지 재시도하며 타깃을 해석한다 */
  _resolveWithRetry(tid, fallbackAnchor, done, attempt = 0) {
    if (this._destroyed || !this.scene) return;

    const resolved = TutorialTargetRegistry.resolve(tid, {
      scene: this.scene,
      fallbackAnchor,
    });

    const acceptable = resolved && resolved.tier !== RESOLUTION_TIER.FALLBACK_ANCHOR;
    if (acceptable || attempt >= RESOLVE_MAX_ATTEMPTS) {
      done(resolved);
      return;
    }

    this.scene.time.delayedCall(RESOLVE_INTERVAL_MS, () =>
      this._resolveWithRetry(tid, fallbackAnchor, done, attempt + 1)
    );
  }

  _mountOverlay(step, bounds, targetObject = null) {
    this.overlay = new TutorialOverlay(this.scene).show({
      hole: bounds,
      holeTarget: targetObject,
      instructionText: step.instructionText || null,
      blockInput: true,
    });
    this._startTargetWatch(step);
  }

  _mountCoach(step, bounds) {
    const cond = step.completionCondition || {};
    const dismissCompletes = cond.type === 'overlay_dismissed';

    // 팝업 진입이 완료 조건인 스텝은 강조 영역을 누르면 바로 그 팝업이 열리게 한다.
    const onTargetTap = cond.type === 'popup_open' && cond.popupKey
      ? () => {
          this.scene.openPopup?.(cond.popupKey);
          this.scheduleRefresh(200);
        }
      : null;

    this.coach = new CoachMark(this.scene).show({
      text: step.instructionText || '',
      target: bounds,
      onTargetTap,
      onDismiss: () => {
        if (dismissCompletes) {
          TutorialManager.notify('overlay_dismissed', {});
        }
        this.scheduleRefresh(80);
      },
    });
  }

  /** 강제 팝업 스텝 — 팝업을 열고 다시 갱신한다 (중복 생성 방지 가드 포함) */
  _openStepPopup(step) {
    if (this._openingPopup) return;
    this._openingPopup = true;

    Promise.resolve(TutorialManager.openStepPopup(this.scene, step.id))
      .then(() => {
        this._openingPopup = false;
        this.scheduleRefresh(200);
      })
      .catch((error) => {
        this._openingPopup = false;
        console.error('[TutorialFlow] 스텝 팝업 오픈 실패', step.id, error);
        this.scheduleRefresh(400);
      });
  }

  // ---- 컷씬 ----

  _pendingCutsceneIds(step) {
    const ids = step.cutsceneIds || [];
    if (ids.length === 0) return [];
    const viewed = SaveManager.load()?.story?.viewedCutscenes || [];
    return ids.filter((id) => !viewed.includes(id));
  }

  _playCutsceneStep(step) {
    // 이미 컷씬이 떠 있으면 두 번 launch 하지 않는다(같은 프레임 stop/launch 충돌 방지)
    if (this.scene.scene?.isActive?.('CutsceneScene')) {
      this.scheduleRefresh(400);
      return;
    }

    const pending = this._pendingCutsceneIds(step);
    if (pending.length === 0) {
      this._commit(step);
      return;
    }

    const def = StoryManager.getScene(pending[0]);
    if (!def) {
      console.warn('[TutorialFlow] story.json 에 없는 컷씬', pending[0]);
      this._commit(step);
      return;
    }

    this._cutsceneBusy = true;
    StoryManager.trigger(def.trigger, {
      scene: this.scene,
      stageId: def.stageId ?? undefined,
      chapterId: def.chapterId ?? undefined,
      heroId: def.heroId ?? undefined,
      cultId: def.cultId ?? undefined,
      onComplete: () => {
        this._cutsceneBusy = false;
        if (this._destroyed) return;
        // 남은 컷씬이 있으면 이어서, 없으면 커밋
        if (this._pendingCutsceneIds(step).length > 0) {
          this.scheduleRefresh(120);
        } else {
          this._commit(step);
        }
      },
    });
  }

  /** 스텝 커밋. 컷씬을 건너뛴 스텝은 skipped 로 기록한다. */
  _commit(step) {
    const skippedList = SaveManager.load()?.story?.skippedCutscenes || [];
    const skipped = (step.cutsceneIds || []).some((id) => skippedList.includes(id));
    const mode = skipped ? COMPLETION_MODE.SKIPPED : COMPLETION_MODE.PLAYED;

    TutorialManager.commitStep(step.id, mode);
    this.scheduleRefresh(120);
  }
}

export default TutorialFlow;
