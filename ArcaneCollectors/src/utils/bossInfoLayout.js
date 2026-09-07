/**
 * bossInfoLayout.js — 보스 정보 팝업의 배치·수치 해석
 *
 * 팝업의 4슬롯(헤더/요약/콘텐츠/액션)은 `popupLayout.js` 가 잡는다. 이 모듈은 그중
 * **콘텐츠 슬롯 안쪽**을 나누고, 보스 수치를 "내 파티로 이길 만한가"라는 한 문장으로
 * 바꾼다. Phaser 참조가 없어 씬을 띄우지 않고 규칙을 단위 테스트로 고정할 수 있다.
 *
 * 단위는 무차원이다. 입력이 렌더 px 면 출력도 렌더 px 다(호출부가 s() 로 올린 값을 넣는다).
 *
 * 주의: 프로젝트 모듈을 import 하지 않는다(부팅 TDZ 위험 0).
 */

/** 콘텐츠 슬롯 내부 비율·간격 (기획 px 기준 상수. 호출부가 s() 로 올린다) */
export const BOSS_INFO = Object.freeze({
  artHeight: 260,      // 보스 아트 영역 높이
  artPadTop: 8,
  rowGap: 14,
  statRowH: 34,
  barH: 16,
  sectionGap: 22,
  padX: 24
});

/**
 * 보스 전투력(추정).
 *
 * 영웅 전투력과 **같은 식**을 쓴다(ProgressionSystem.calculatePower:
 * HP/10 + ATK + DEF + SPD). 다른 식을 쓰면 두 수를 나란히 놓는 순간 비교가 거짓말이 된다.
 * 스킬 보너스는 적 데이터에 대응물이 없어 빼고, 그래서 이름이 "추정"이다.
 *
 * @param {{hp:number, atk:number, def:number, spd:number}} stats
 * @returns {number}
 */
export function estimateBossPower(stats) {
  if (!stats) return 0;
  const hp = Number.isFinite(stats.hp) ? stats.hp : 0;
  const atk = Number.isFinite(stats.atk) ? stats.atk : 0;
  const def = Number.isFinite(stats.def) ? stats.def : 0;
  const spd = Number.isFinite(stats.spd) ? stats.spd : 0;
  return Math.max(0, Math.floor(hp / 10 + atk + def + spd));
}

/**
 * 내 파티 전투력 대 보스 전투력.
 *
 * 비율만 돌려주고 판정 문구는 `verdictForRatio()` 가 맡는다 — 숫자와 말을 한 함수에
 * 섞으면 문구를 바꿀 때 계산까지 건드리게 된다.
 *
 * @param {number} partyPower
 * @param {number} bossPower
 * @returns {{ratio:number, fill:number}} ratio 는 무제한, fill 은 막대용 0~1
 */
export function comparePower(partyPower, bossPower) {
  const mine = Number.isFinite(partyPower) && partyPower > 0 ? partyPower : 0;
  const theirs = Number.isFinite(bossPower) && bossPower > 0 ? bossPower : 0;
  if (theirs === 0) return { ratio: mine > 0 ? Infinity : 0, fill: mine > 0 ? 1 : 0 };
  const ratio = mine / theirs;
  // 막대는 "동등 = 절반"으로 읽히게 한다. 2배 이상이면 가득 찬다.
  return { ratio, fill: Math.max(0, Math.min(1, ratio / 2)) };
}

/**
 * 전투력 비율을 한 문장으로. 색은 호출부가 `tone` 으로 고른다.
 *
 * 수치를 색으로만 전하지 않기 위해 **문구가 항상 함께 나온다**(A11Y).
 *
 * @param {number} ratio comparePower().ratio
 * @returns {{text:string, tone:'danger'|'warn'|'ok'|'strong'}}
 */
export function verdictForRatio(ratio) {
  if (!Number.isFinite(ratio)) return { text: '전투력을 비교할 수 없습니다', tone: 'warn' };
  if (ratio <= 0) return { text: '파티를 편성해야 비교할 수 있습니다', tone: 'warn' };
  if (ratio < 0.7) return { text: '전투력이 많이 모자랍니다', tone: 'danger' };
  if (ratio < 1) return { text: '아슬아슬합니다', tone: 'warn' };
  if (ratio < 1.5) return { text: '해볼 만합니다', tone: 'ok' };
  return { text: '충분히 앞섭니다', tone: 'strong' };
}

/**
 * 콘텐츠 슬롯 안쪽 배치. 위에서 아래로 아트 → 스탯 4줄 → 전투력 비교 → 진행도.
 *
 * @param {{left:number,top:number,right:number,width:number,centerX:number}} bounds
 *        PopupBase.getContentBounds()
 * @param {number} scale s() 배율 (기획 px -> 렌더 px)
 * @returns {{art:Object, stats:Object, power:Object, progress:Object}}
 */
export function computeBossInfoRows(bounds, scale = 1) {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const padX = BOSS_INFO.padX * k;
  const left = bounds.left + padX;
  const right = bounds.right - padX;
  const width = Math.max(0, right - left);

  const artTop = bounds.top + BOSS_INFO.artPadTop * k;
  const artH = BOSS_INFO.artHeight * k;

  const statsTop = artTop + artH + BOSS_INFO.sectionGap * k;
  const rowH = BOSS_INFO.statRowH * k;

  const powerTop = statsTop + rowH * 4 + BOSS_INFO.sectionGap * k;
  const barY = powerTop + rowH * 0.7;
  const verdictY = barY + (BOSS_INFO.barH + BOSS_INFO.rowGap) * k;
  // 진행도는 판정 문장 **아래**다. 판정 y 에 막대 높이만 더하면 글자 위에 겹친다.
  const progressTop = verdictY + (BOSS_INFO.statRowH + BOSS_INFO.rowGap) * k;

  return {
    art: { x: bounds.centerX, y: artTop, w: width, h: artH, centerY: artTop + artH / 2 },
    stats: { left, right, top: statsTop, rowH, width },
    power: {
      left,
      right,
      top: powerTop,
      labelY: powerTop,
      bar: { x: left, y: barY, w: width, h: BOSS_INFO.barH * k },
      verdictY
    },
    progress: { left, right, top: progressTop, width }
  };
}

/**
 * 요약 슬롯(4슬롯 중 2번)에 올릴 셀 3개. 수치는 항상 문자열로 병기한다.
 * @param {{hp:number, atk:number, def:number}} stats
 * @returns {Array<{label:string, value:string}>}
 */
export function bossSummaryCells(stats) {
  const n = (v) => (Number.isFinite(v) ? Math.floor(v).toLocaleString() : '-');
  return [
    { label: '체력', value: n(stats?.hp) },
    { label: '공격', value: n(stats?.atk) },
    { label: '방어', value: n(stats?.def) }
  ];
}

/**
 * 분위기(mood) 한국어 이름. 없으면 null 이라 호출부가 그 줄을 건너뛴다.
 * 색은 designSystem 의 mood 팔레트를 호출부가 고른다(이 모듈은 색을 모른다).
 *
 * @param {string} mood
 * @returns {string|null}
 */
export function moodLabel(mood) {
  const table = {
    brave: '열혈', fierce: '격렬', wild: '광폭', calm: '고요', stoic: '의연',
    devoted: '헌신', cunning: '냉철', noble: '고결', mystic: '신비'
  };
  const key = typeof mood === 'string' ? mood.toLowerCase() : '';
  return table[key] || null;
}

/**
 * 분위기 상성 힌트. 전투 로직의 상성표를 그대로 옮기지 않고, "무엇을 데려가면 좋은가"만
 * 한 줄로 말한다 — 이 팝업은 참고용이지 계산기가 아니다.
 *
 * @param {string} mood
 * @returns {string}
 */
export function moodHint(mood) {
  const label = moodLabel(mood);
  if (!label) return '분위기 정보가 없습니다';
  return `${label} 성향 · 반대 성향 동료가 유리합니다`;
}

export default {
  BOSS_INFO,
  estimateBossPower,
  comparePower,
  verdictForRatio,
  computeBossInfoRows,
  bossSummaryCells,
  moodLabel,
  moodHint
};
