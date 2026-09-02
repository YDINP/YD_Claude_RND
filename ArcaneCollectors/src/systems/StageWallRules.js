/**
 * StageWallRules — 1-4 벽 인지 구간 · 패배 후 재도전 규칙 (T-Q3)
 *
 * SSOT
 *  - docs/story/UX_ONBOARDING_FLOW.md §2-5  (1-4 진입 전 경고 / 패배 화면 / 반복 실패 처리)
 *  - docs/story/LEVEL_STORY_PLACEMENT.md §2-3 (벽 인지 구간), §4-3 (보스 패배·재도전 동선, LV-01)
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §B-4 (권장전투력 대비 비율 표시 의무)
 *
 * 이 모듈은 **순수 판정 함수만** 둔다. Phaser 객체·씬·세이브 I/O를 만지지 않는다.
 * 씬(StageSelectScene / BattleResultScene)은 여기서 나온 값을 그리기만 한다.
 *
 * 주의: gameConfig/designSystem을 import 하지 않는다(순환 import TDZ 방지).
 */

/** 난이도 라벨 밴드 — 비율 하한(포함) 내림차순. 시스템 §B-4 표시 의무의 표현부다. */
export const DIFFICULTY_BANDS = Object.freeze([
  Object.freeze({ key: 'easy', label: '쉬움', minRatio: 2.0, color: 0x22C55E }),
  Object.freeze({ key: 'normal', label: '보통', minRatio: 1.2, color: 0x38BDF8 }),
  Object.freeze({ key: 'slightly_hard', label: '약간 어려움', minRatio: 1.0, color: 0xFACC15 }),
  Object.freeze({ key: 'hard', label: '어려움', minRatio: 0.8, color: 0xF97316 }),
  Object.freeze({ key: 'very_hard', label: '매우 어려움', minRatio: 0, color: 0xEF4444 }),
]);

/** 경고를 띄우는 비율 상한 — 권장 전투력에 못 미치면(1.0 미만) 경고한다. */
export const WALL_WARNING_RATIO = 1.0;

/** 반복 실패 단계별 유도 (UX §2-5). 실패 횟수 하한 내림차순. */
export const REPEAT_FAIL_STEPS = Object.freeze([
  Object.freeze({
    minFails: 7,
    action: 'idle',
    headline: '잠시 다른 것을 해볼까요?',
    ctaLabel: '유휴전투 보기',
  }),
  Object.freeze({
    minFails: 5,
    action: 'autoparty',
    headline: '편성을 다시 맞춰 보겠습니다',
    ctaLabel: '자동 편성',
  }),
  Object.freeze({
    minFails: 3,
    action: 'gacha',
    headline: '동료를 데려올 방법이 생겼습니다',
    ctaLabel: '소환하러 가기',
  }),
]);

/** 보스 스테이지 재도전 정책 (LEVEL §4-3 / LV-01). stages.json `retryPolicy`의 기본값이다. */
export const BOSS_RETRY_POLICY = Object.freeze({
  energyRefundOnDefeat: 0.5,
  replayCutsceneOnRetry: false,
  hintAfterFailCount: 3,
});

/** 일반 스테이지 재도전 정책 — 환급 없음, 컷씬은 이미 시청 처리라 재생되지 않는다. */
export const NORMAL_RETRY_POLICY = Object.freeze({
  energyRefundOnDefeat: 0,
  replayCutsceneOnRetry: false,
  hintAfterFailCount: 3,
});

/**
 * 전투력 비율. 권장 전투력이 유효하지 않으면 0을 돌려 "판정 불가"를 뜻한다.
 * @param {number} power 내 파티 전투력
 * @param {number} required 권장 전투력
 * @returns {number} power / required
 */
export function getPowerRatio(power, required) {
  const p = Number(power);
  const r = Number(required);
  if (!Number.isFinite(p) || !Number.isFinite(r) || r <= 0) return 0;
  return p / r;
}

/**
 * 권장 전투력이 판정에 쓸 수 있는 값인지.
 * 파티 전투력이 0인 것(=빈 편성)은 정상적인 입력이고 경고 대상이다.
 * 반면 권장 전투력을 모르는 것은 판정 자체가 불가능하다. 둘을 섞지 않는다.
 * @param {number} required
 * @returns {boolean}
 */
export function hasPowerReference(required) {
  const r = Number(required);
  return Number.isFinite(r) && r > 0;
}

/**
 * 비율 → 난이도 밴드.
 * @param {number} ratio
 * @returns {{key: string, label: string, minRatio: number, color: number}}
 */
export function getDifficultyBand(ratio) {
  const value = Number.isFinite(ratio) ? ratio : 0;
  return (
    DIFFICULTY_BANDS.find((band) => value >= band.minRatio) ||
    DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1]
  );
}

/**
 * 1-4 벽 경고를 띄울지. **진입을 막지 않는다** — 경고만 한다(UX §2-5, Pillar ②).
 * 권장 전투력을 모르면(0/음수/NaN) 경고하지 않는다. 근거 없는 겁주기를 만들지 않기 위해서다.
 * @param {number} power
 * @param {number} required
 * @returns {boolean}
 */
export function shouldShowWallWarning(power, required) {
  if (!hasPowerReference(required)) return false;
  return getPowerRatio(power, required) < WALL_WARNING_RATIO;
}

/**
 * 스테이지 카드/출격 버튼에 붙일 경고 배너 내용.
 *
 * CTA 선택 규칙: 지금 각인할 수 있는 영웅이 있으면 **각인**이 가장 즉효인 강화 수단이므로
 * 그쪽으로 보낸다. 없으면 UX §2-5의 원래 다리인 **동료 늘리기**(소환)로 보낸다.
 * 없는 자원을 요구하는 CTA는 벽을 두 겹으로 만든다.
 *
 * @param {number} power
 * @param {number} required
 * @param {{ascendableCount?: number}} [options]
 * @returns {{visible: boolean, ratio: number, label: string, color: number,
 *            text: string, ctaLabel: string, ctaKey: string}}
 */
export function buildWallWarning(power, required, options = {}) {
  const ratio = getPowerRatio(power, required);
  const band = getDifficultyBand(ratio);
  const visible = shouldShowWallWarning(power, required);
  const ratioText = hasPowerReference(required) ? `${ratio.toFixed(2)}×` : '-';
  const mine = Math.round(Number(power) || 0).toLocaleString();
  const need = Math.round(Number(required) || 0).toLocaleString();
  const canAscend = (Number(options.ascendableCount) || 0) > 0;
  return {
    visible,
    ratio,
    label: band.label,
    color: band.color,
    text: `내 파티 ${mine} / 권장 ${need} · ${band.label} (${ratioText})`,
    ctaLabel: visible ? (canAscend ? '각인하러 가기' : '동료 늘리러 가기') : '',
    ctaKey: visible ? (canAscend ? 'ascension' : 'gacha') : '',
  };
}

/**
 * 보스 스테이지 여부. `stages.json`의 `isBoss`를 먼저 보고, 없으면 `X-5` 규칙으로 판정한다.
 * @param {object|null} stage
 * @returns {boolean}
 */
export function isBossStage(stage) {
  if (!stage) return false;
  if (typeof stage.isBoss === 'boolean') return stage.isBoss;
  const id = stage.id;
  return typeof id === 'string' && /^\d+-5$/.test(id);
}

/**
 * 스테이지의 재도전 정책. `stage.retryPolicy`가 있으면 그것이 우선한다(LEVEL §5-1 스키마).
 * @param {object|null} stage
 * @returns {{energyRefundOnDefeat: number, replayCutsceneOnRetry: boolean, hintAfterFailCount: number}}
 */
export function getRetryPolicy(stage) {
  const base = isBossStage(stage) ? BOSS_RETRY_POLICY : NORMAL_RETRY_POLICY;
  const custom = stage?.retryPolicy;
  if (!custom || typeof custom !== 'object') return base;
  return {
    energyRefundOnDefeat: Number.isFinite(custom.energyRefundOnDefeat)
      ? custom.energyRefundOnDefeat
      : base.energyRefundOnDefeat,
    replayCutsceneOnRetry: typeof custom.replayCutsceneOnRetry === 'boolean'
      ? custom.replayCutsceneOnRetry
      : base.replayCutsceneOnRetry,
    hintAfterFailCount: Number.isFinite(custom.hintAfterFailCount)
      ? custom.hintAfterFailCount
      : base.hintAfterFailCount,
  };
}

/**
 * 패배 시 돌려줄 에너지 (LV-01: 보스 한정 50% 환급, 내림).
 * @param {object|null} stage
 * @param {number} spentEnergy 이번 전투에 실제로 쓴 에너지
 * @returns {number} 환급량 (0 이상 정수)
 */
export function getDefeatEnergyRefund(stage, spentEnergy) {
  const spent = Number(spentEnergy);
  if (!Number.isFinite(spent) || spent <= 0) return 0;
  const rate = getRetryPolicy(stage).energyRefundOnDefeat;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.floor(spent * rate);
}

/**
 * 반복 실패 유도 단계. 실패 횟수가 임계에 못 미치면 null.
 * @param {number} failCount 이 스테이지 연속 패배 횟수
 * @returns {{minFails: number, action: string, headline: string, ctaLabel: string}|null}
 */
export function getRepeatFailStep(failCount) {
  const count = Number(failCount);
  if (!Number.isFinite(count) || count <= 0) return null;
  return REPEAT_FAIL_STEPS.find((step) => count >= step.minFails) || null;
}

/**
 * 패배 화면에 띄울 진단·유도 묶음 (UX §2-5 / LEVEL §4-3).
 * @param {object} params
 * @param {object|null} [params.stage]
 * @param {number} [params.power] 내 파티 전투력
 * @param {number} [params.failCount] 이 스테이지 연속 패배 횟수 (이번 패배 포함)
 * @param {number|null} [params.enemyHpRemainRatio] 남은 적 HP 비율 0~1
 * @param {number} [params.spentEnergy] 이번 전투에 쓴 에너지
 * @returns {{diagnosis: string, progressText: string, hint: string|null, repeatStep: object|null,
 *            energyRefund: number, replayCutsceneOnRetry: boolean, retryWarning: string}}
 */
export function buildDefeatGuidance({
  stage = null,
  power = 0,
  failCount = 1,
  enemyHpRemainRatio = null,
  spentEnergy = 0,
} = {}) {
  const required = stage?.recommendedPower ?? 0;
  const ratio = getPowerRatio(power, required);
  const band = getDifficultyBand(ratio);
  const policy = getRetryPolicy(stage);
  const repeatStep = getRepeatFailStep(failCount);
  const refund = getDefeatEnergyRefund(stage, spentEnergy);

  const diagnosis = hasPowerReference(required)
    ? `권장 전투력 ${Math.round(required).toLocaleString()} / 내 파티 ${Math.round(power).toLocaleString()} (${ratio.toFixed(2)}× · ${band.label})`
    : '전투력 정보를 확인할 수 없습니다';

  const remain = Number(enemyHpRemainRatio);
  const progressText = Number.isFinite(remain) && remain >= 0 && remain <= 1
    ? `적 체력 ${Math.round(remain * 100)}% 남음`
    : '';

  // 첫 패배부터 보완 방법을 말한다. 이 문장이 T-05(첫 무료 10연)로 가는 다리다.
  const hint = repeatStep
    ? repeatStep.headline
    : (shouldShowWallWarning(power, required) ? '동료를 늘리면 넘을 수 있습니다' : null);

  const retryWarning = spentEnergy > 0
    ? (refund > 0
      ? `재도전 시 에너지 ${spentEnergy} 소모 (패배 환급 ${refund})`
      : `재도전 시 에너지 ${spentEnergy} 소모`)
    : '';

  return {
    diagnosis,
    progressText,
    hint,
    repeatStep,
    energyRefund: refund,
    replayCutsceneOnRetry: policy.replayCutsceneOnRetry,
    retryWarning,
  };
}

export default {
  DIFFICULTY_BANDS,
  WALL_WARNING_RATIO,
  REPEAT_FAIL_STEPS,
  BOSS_RETRY_POLICY,
  NORMAL_RETRY_POLICY,
  getPowerRatio,
  hasPowerReference,
  getDifficultyBand,
  shouldShowWallWarning,
  buildWallWarning,
  isBossStage,
  getRetryPolicy,
  getDefeatEnergyRefund,
  getRepeatFailStep,
  buildDefeatGuidance,
};
