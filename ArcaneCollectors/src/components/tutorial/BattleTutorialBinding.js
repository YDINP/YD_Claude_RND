/**
 * BattleTutorialBinding - 전투 화면 튜토리얼 배선 (B-1~B-5)
 *
 * BattleScene 이 렌더 로직을 건드리지 않고 튜토리얼을 붙일 수 있도록,
 * 타깃 등록 · 스킬 탭 통지 · TutorialFlow 마운트를 이 모듈이 전담한다.
 * BattleScene 쪽 변경은 마운트 1줄과 정리 1줄뿐이다.
 *
 * 등록 타깃
 *   battle.turn.badge       턴 순서 배지 대역
 *   battle.skill.slot1~4    스킬 카드 히트 영역
 *   battle.button.auto      자동전투 토글
 *   battle.button.speed     배속 버튼(1x)
 *   battle.enemy.moodBadge  첫 번째 적 유닛(분위기 상성 설명 대상)
 *   battle.unit.hp          첫 번째 아군 유닛의 체력 표기
 *
 * 스킬 카드는 게이지가 찰 때 다시 만들어지므로 주기적으로 재등록한다.
 * 재등록 시 같은 오브젝트에 통지 리스너를 두 번 붙이지 않도록 WeakSet 으로 막는다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { TutorialManager, TUTORIAL_TRACK } from '../../systems/TutorialManager.js';
import { TutorialTargetRegistry } from '../../systems/TutorialTargetRegistry.js';
import { TutorialFlow } from './TutorialFlow.js';

/** 스킬 카드 재등록 주기 (ms) */
const REBIND_INTERVAL_MS = 600;

/** 스킬 탭 통지 리스너를 이미 붙인 오브젝트 */
const notifiedObjects = new WeakSet();

/** 스코프 키 — 씬 종료 시 이 스코프만 지운다 */
export const BATTLE_TUTORIAL_SCOPE = 'battle';

function registerIfAlive(tid, obj, sceneKey) {
  if (!obj || obj.scene === undefined || obj.scene === null) return false;
  return TutorialTargetRegistry.register(tid, obj, sceneKey);
}

/** 유닛 컨테이너에서 체력 표기 오브젝트를 고른다 (없으면 컨테이너 자체) */
function hpTargetOf(unitContainer) {
  if (!unitContainer) return null;
  return unitContainer.getData?.('hpBar') || unitContainer.getData?.('hpValue') || unitContainer;
}

/**
 * BattleScene 의 현재 UI 오브젝트를 타깃으로 등록한다.
 * 매 호출마다 최신 오브젝트로 덮어쓴다(스킬 카드 재생성 대응).
 * @param {Phaser.Scene} scene
 * @returns {string[]} 이번 호출에서 등록된 TID 목록
 */
export function registerBattleTargets(scene) {
  if (!scene) return [];
  const sceneKey = scene.scene?.key || 'BattleScene';
  const registered = [];

  const push = (tid, obj) => {
    if (registerIfAlive(tid, obj, sceneKey)) registered.push(tid);
  };

  push('battle.turn.badge', scene.turnOrderContainer);

  // 스킬 카드 — 히트 영역을 우선 등록하고, 탭이 B-2 완료를 통지하게 한다
  (scene.skillCards || []).forEach((card, index) => {
    if (!card) return;
    const hit = (card.list || []).find((child) => child?.input) || card;
    push(`battle.skill.slot${index + 1}`, hit);

    if (hit?.on && !notifiedObjects.has(hit)) {
      notifiedObjects.add(hit);
      hit.on('pointerdown', () => {
        try {
          TutorialManager.notify('skill_used', {}, TUTORIAL_TRACK.BATTLE);
        } catch (error) {
          console.error('[BattleTutorial] skill_used 통지 실패', error);
        }
      });
    }
  });

  push('battle.button.auto', scene.autoBtn?.getData?.('bg') || scene.autoBtn);
  const speedBtn = (scene.speedButtons || [])[0];
  push('battle.button.speed', speedBtn?.getData?.('bg') || speedBtn);

  const enemy = (scene.enemySprites || [])[0];
  push('battle.enemy.moodBadge', enemy);

  const ally = (scene.allySprites || [])[0];
  push('battle.unit.hp', hpTargetOf(ally));

  return registered;
}

/**
 * 전투 튜토리얼을 마운트한다. 재생할 스텝이 없으면 아무것도 만들지 않는다.
 * @param {Phaser.Scene} scene
 * @returns {{flow: TutorialFlow, timer: Phaser.Time.TimerEvent}|null}
 */
export function mountBattleTutorial(scene) {
  if (!scene) return null;

  // 첫 전투 안내를 이미 마친 계정에는 붙이지 않는다 (1회성)
  let pending = null;
  try {
    pending = TutorialManager.getCurrentBattleStep();
  } catch (error) {
    console.error('[BattleTutorial] 스텝 조회 실패', error);
    return null;
  }
  if (!pending) return null;

  const stageId = pending.trigger?.stageId;
  if (stageId && scene.stage?.id && scene.stage.id !== stageId) return null;

  TutorialTargetRegistry.clearScope(BATTLE_TUTORIAL_SCOPE);
  registerBattleTargets(scene);

  const flow = new TutorialFlow(scene, { track: TUTORIAL_TRACK.BATTLE }).start();

  // 스킬 카드는 게이지 상태에 따라 다시 만들어지므로 주기적으로 재등록한다
  const timer = scene.time?.addEvent?.({
    delay: REBIND_INTERVAL_MS,
    loop: true,
    callback: () => registerBattleTargets(scene),
  }) || null;

  return { flow, timer };
}

/** 씬 종료 시 정리 */
export function unmountBattleTutorial(binding) {
  if (!binding) return;
  binding.timer?.remove(false);
  binding.flow?.destroy();
  TutorialTargetRegistry.clearScope(BATTLE_TUTORIAL_SCOPE);
}

export default mountBattleTutorial;
