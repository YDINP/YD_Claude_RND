/**
 * battleLayout.js — 전투 화면 / 전투 결과 화면 배치 계산 (REDESIGN_PLAN §3-5, §3-9 / T-17, T-18)
 *
 * BattleScene 은 전투 로직·이벤트·컷씬 트리거를 함께 들고 있어서 파일이 크다.
 * 그중 "어디에 무엇을 놓는가" 만 이 모듈로 떼어 냈다. 여기에는 Phaser 참조가 없고
 * scaleConfig(의존 없음)와 designSystem 의 색상 조회 함수만 쓴다. 덕분에 배치 규칙을
 * 씬을 띄우지 않고 단위 테스트로 고정할 수 있다.
 *
 * 좌표계는 전부 base 720x1280 이다. 씬이 s() 로 렌더 좌표(1080x1920)로 올린다.
 * 이 모듈이 s() 를 부르지 않는 이유는 두 가지다. 값이 정수 반올림되기 전이라 테스트가
 * 읽기 쉽고, 기획 문서(REDESIGN_PLAN §3-5)의 숫자와 1:1로 대조되기 때문이다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 *       getCultColor 는 반드시 함수 본문 안에서 호출한다.
 */
import { getCultColor, DESIGN } from '../config/designSystem.js';

/** base 화면 크기 (720x1280). s() 적용 전 좌표계 */
export const BASE_W = 720;
export const BASE_H = 1280;

/**
 * 화면 세로 대역 (REDESIGN_PLAN §3-5 아스키 명세와 동일)
 * 전장(field)은 HUD 아래부터 로그 대역 위까지다.
 */
export const BATTLE_LAYOUT = Object.freeze({
  hud:     { y: 0,    h: 132 },
  turnRow: { y: 84,   h: 44 },
  field:   { y: 140,  h: 820 },
  enemyBand: { top: 300, bottom: 520 },
  allyBand:  { top: 700, bottom: 920 },
  log:     { x: 20,   y: 964,  w: 680, h: 88 },
  action:  { y: 1060, h: 156 },
  control: { y: 1216, h: 56 }
});

/** 스킬 액션바 4칸 고정 그리드 (§3-5: 128x140, x=48/188/328/468, y=1064) */
export const SKILL_SLOT = Object.freeze({
  count: 4,
  w: 128,
  h: 140,
  gap: 12,
  startX: 48,
  y: 1064
});

/** 유닛 진영 배치 파라미터. arcDepth 부호가 아크의 방향을 정한다 */
export const UNIT_BAND = Object.freeze({
  ally:  { centerX: 360, baseY: 850, spread: 456, arcDepth: 30,  maxPerRow: 4, rowGap: 74 },
  enemy: { centerX: 360, baseY: 430, spread: 480, arcDepth: -24, maxPerRow: 5, rowGap: 82 }
});

/** 유닛에 부착되는 정보의 발밑 기준 오프셋 (§3-5: HP바를 유닛에 부착) */
export const UNIT_ATTACH = Object.freeze({
  hpBarDy: 12,     // 발밑 아래 12 → HP바 중심
  hpBarW: 96,
  hpBarH: 10,
  nameDy: 34,      // HP바 아래. 이름이 HP바를 덮던 결함(§1-1)의 해소점이다
  // 배지는 몸통 옆에서 위로 쌓는다. 발밑 근처에 두면 옆 유닛의 HP바를 덮는다
  badgeDy: -60,
  badgeDx: 50,
  badgeGap: -24,   // 음수 = 위로 쌓임
  bossScale: 1.3
});

/** 전투 로그 대역이 유지하는 줄 수 */
export const LOG_LINES = 2;

/** 챕터 배경이 존재하는 범위 (tools/art/asset-manifest.json lazyTextures) */
export const CHAPTER_BG_RANGE = Object.freeze({ min: 1, max: 5 });

/** 배경 폴백 키. 실제 아트가 없으면 BackgroundFactory 가 createBattleBg 로 내려간다 */
export const DEFAULT_BATTLE_BG = 'bg_battle';

// ============================================================
// 1. 배경 선택
// ============================================================

/**
 * 스테이지에서 챕터 번호를 뽑는다.
 * stage.chapter 가 있으면 그 값을, 없으면 '1-3' 형태의 id 앞부분을 쓴다.
 *
 * @param {{chapter?:number|string, id?:string}|null} stage
 * @returns {number|null} 챕터 번호. 판별 불가면 null
 */
export function getChapterNumber(stage) {
  if (!stage || typeof stage !== 'object') return null;

  const direct = Number(stage.chapter);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const id = stage.id;
  if (typeof id !== 'string') return null;
  const match = id.match(/^(\d+)-\d+/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 전투 모드와 스테이지로 배경 텍스처 키를 정한다.
 * 탑·레이드는 전용 배경을 쓰고, 스토리 스테이지는 챕터 배경을 쓴다.
 * 챕터 배경이 없는 범위(6장 이상)나 판별 불가는 공용 전투 배경으로 내린다.
 *
 * @param {{mode?:string, stage?:object}} params
 * @returns {string} 텍스처 키 (bg_ 접두사 포함)
 */
export function resolveBattleBgKey({ mode, stage } = {}) {
  if (mode === 'tower') return 'bg_tower';
  if (mode === 'raid') return 'bg_raid';

  const chapter = getChapterNumber(stage);
  if (chapter !== null && chapter >= CHAPTER_BG_RANGE.min && chapter <= CHAPTER_BG_RANGE.max) {
    return `bg_chapter_${chapter}`;
  }
  return DEFAULT_BATTLE_BG;
}

// ============================================================
// 2. 유닛 배치
// ============================================================

/**
 * 진영 한쪽의 유닛 좌표를 계산한다.
 *
 * 한 행에 maxPerRow 까지 고르게 펼치고, 넘치면 행을 나눠 rowGap 만큼 뒤로 민다.
 * 각 행 안에서는 중심을 0으로 하는 정규화 좌표 t(-1..1)로 x 를 잡고,
 * y 에 arcDepth * t^2 을 더해 아크를 만든다. arcDepth 가 양수면 바깥쪽이 앞으로
 * (아군), 음수면 바깥쪽이 뒤로(적) 간다.
 *
 * @param {Object} params
 * @param {number} params.count - 유닛 수
 * @param {number} params.centerX
 * @param {number} params.baseY - 행 기준선 (유닛 발밑)
 * @param {number} params.spread - 행 전체 가로 폭
 * @param {number} params.arcDepth
 * @param {number} [params.maxPerRow]
 * @param {number} [params.rowGap]
 * @returns {Array<{x:number,y:number,row:number,col:number,t:number}>} base px 좌표
 */
export function computeUnitSlots({ count, centerX, baseY, spread, arcDepth, maxPerRow = 4, rowGap = 74 } = {}) {
  const n = Math.max(0, Math.floor(count || 0));
  if (n === 0) return [];

  const perRow = Math.max(1, Math.floor(maxPerRow));
  const rows = Math.ceil(n / perRow);
  const slots = [];

  for (let row = 0; row < rows; row++) {
    const first = row * perRow;
    const inRow = Math.min(perRow, n - first);
    for (let col = 0; col < inRow; col++) {
      // 한 명이면 t=0(중앙). 여러 명이면 -1..1 균등 분할
      const t = inRow === 1 ? 0 : (col / (inRow - 1)) * 2 - 1;
      slots.push({
        x: centerX + t * (spread / 2),
        y: baseY + arcDepth * t * t - row * rowGap,
        row,
        col,
        t
      });
    }
  }
  return slots;
}

/**
 * 아군 하단 아크 배치.
 * @param {number} count
 * @returns {Array<{x:number,y:number,row:number,col:number,t:number}>}
 */
export function getAllySlots(count) {
  return computeUnitSlots({ count, ...UNIT_BAND.ally });
}

/**
 * 적 상단 배치.
 * @param {number} count
 * @returns {Array<{x:number,y:number,row:number,col:number,t:number}>}
 */
export function getEnemySlots(count) {
  return computeUnitSlots({ count, ...UNIT_BAND.enemy });
}

/**
 * 유닛에 붙는 HP바·이름·배지의 발밑 기준 상대 좌표.
 * 보스는 스프라이트가 커지므로 부착물도 같은 비율로 밀어 준다.
 *
 * @param {{isBoss?:boolean}} [options]
 * @returns {{hpBarY:number,hpBarW:number,hpBarH:number,nameY:number,
 *            badgeY:number,badgeX:number,badgeGap:number}}
 */
export function getUnitAttachments({ isBoss = false } = {}) {
  const k = isBoss ? UNIT_ATTACH.bossScale : 1;
  return {
    hpBarY: UNIT_ATTACH.hpBarDy * k,
    hpBarW: UNIT_ATTACH.hpBarW * k,
    hpBarH: UNIT_ATTACH.hpBarH,
    nameY: UNIT_ATTACH.nameDy * k,
    badgeY: UNIT_ATTACH.badgeDy * k,
    badgeX: UNIT_ATTACH.badgeDx * k,
    badgeGap: UNIT_ATTACH.badgeGap
  };
}

// ============================================================
// 3. 스킬 액션바 (4칸 고정)
// ============================================================

/**
 * 스킬 카드 슬롯 하나의 중심 좌표와 크기.
 * 슬롯은 아군 수와 무관하게 4칸이 고정으로 자리를 잡는다. 빈 칸도 자리를 남긴다.
 *
 * @param {number} index - 0..3
 * @returns {{x:number,y:number,w:number,h:number,index:number}|null} 범위 밖이면 null
 */
export function getSkillSlot(index) {
  const i = Math.floor(index);
  if (!Number.isInteger(i) || i < 0 || i >= SKILL_SLOT.count) return null;
  const left = SKILL_SLOT.startX + i * (SKILL_SLOT.w + SKILL_SLOT.gap);
  return {
    x: left + SKILL_SLOT.w / 2,
    y: SKILL_SLOT.y + SKILL_SLOT.h / 2,
    w: SKILL_SLOT.w,
    h: SKILL_SLOT.h,
    index: i
  };
}

/**
 * 4칸 전체 슬롯.
 * @returns {Array<{x:number,y:number,w:number,h:number,index:number}>}
 */
export function getSkillSlots() {
  const out = [];
  for (let i = 0; i < SKILL_SLOT.count; i++) out.push(getSkillSlot(i));
  return out;
}

/**
 * 쿨다운 링의 호(arc) 파라미터. 12시 방향에서 시작해 시계 방향으로 채운다.
 * 게이지가 가득 차면 ready=true 이고 한 바퀴(2PI)를 돈다.
 *
 * @param {number} gauge - 현재 스킬 게이지
 * @param {number} max - 최대 게이지
 * @returns {{ratio:number, startAngle:number, endAngle:number, ready:boolean}} 라디안
 */
export function computeCooldownArc(gauge, max) {
  const maxValue = Number(max) > 0 ? Number(max) : 100;
  const current = Number.isFinite(Number(gauge)) ? Number(gauge) : 0;
  const ratio = Math.min(1, Math.max(0, current / maxValue));
  const startAngle = -Math.PI / 2;
  return {
    ratio,
    startAngle,
    endAngle: startAngle + ratio * Math.PI * 2,
    ready: ratio >= 1
  };
}

// ============================================================
// 4. 턴 순서 표시
// ============================================================

/**
 * 턴 순서 배지의 좌표를 계산한다. SPD 내림차순으로 정렬하며 원본 배열은 건드리지 않는다.
 * 전투 로직의 정렬(BattleScene.processTurn)과 같은 기준을 쓰므로 표시와 실제가 어긋나지 않는다.
 *
 * @param {Array<{name?:string, isAlly?:boolean, isAlive?:boolean, stats?:{spd?:number}}>} battlers
 * @param {{max?:number, startX?:number, spacing?:number, y?:number}} [options]
 * @returns {Array<{x:number,y:number,initial:string,spd:number,isAlly:boolean,isCurrent:boolean,index:number}>}
 */
export function computeTurnOrderSlots(battlers, options = {}) {
  const {
    max = 8,
    startX = 120,
    spacing = 52,
    y = BATTLE_LAYOUT.turnRow.y + BATTLE_LAYOUT.turnRow.h / 2
  } = options;
  const list = Array.isArray(battlers) ? battlers.filter(b => b && b.isAlive !== false) : [];

  const sorted = [...list].sort((a, b) => (b?.stats?.spd || 0) - (a?.stats?.spd || 0));

  return sorted.slice(0, Math.max(0, max)).map((battler, index) => ({
    x: startX + index * spacing,
    y,
    initial: String(battler.name || '?').charAt(0),
    spd: battler?.stats?.spd || 0,
    isAlly: !!battler.isAlly,
    isCurrent: index === 0,
    index
  }));
}

// ============================================================
// 5. 전투 로그 대역
// ============================================================

/**
 * 로그 줄을 밀어 넣고 최근 max 줄만 남긴다 (원본 불변).
 * 빈 메시지는 무시한다 — 전투 이벤트가 빈 문자열을 흘려도 대역이 흔들리지 않게 하기 위해서다.
 *
 * @param {string[]} lines - 기존 줄 (오래된 것이 앞)
 * @param {string} message
 * @param {number} [max]
 * @returns {string[]} 새 배열
 */
export function pushLogLine(lines, message, max = LOG_LINES) {
  const base = Array.isArray(lines) ? lines : [];
  if (typeof message !== 'string' || message.trim().length === 0) return [...base];
  const limit = Math.max(1, Math.floor(max));
  return [...base, message].slice(-limit);
}

/**
 * 로그 대역 안에서 index 번째 줄의 y 좌표(중심).
 * 줄 수가 적으면 대역 중앙에 모아 위쪽이 비어 보이지 않게 한다.
 *
 * @param {number} index
 * @param {number} total
 * @returns {number} base px
 */
export function getLogLineY(index, total) {
  const band = BATTLE_LAYOUT.log;
  const n = Math.max(1, Math.floor(total || 1));
  const lineH = band.h / (LOG_LINES + 0.4);
  const blockH = lineH * n;
  const top = band.y + (band.h - blockH) / 2;
  return top + lineH * (index + 0.5);
}

// ============================================================
// 6. 교단 메커니즘 배지
// ============================================================

/** 배지 정의. order 가 작을수록 먼저 보여 준다 */
const CULT_BADGE_DEFS = Object.freeze([
  { key: 'divinity',   label: 'DIV',   cult: 'olympus', order: 0, valued: true },
  { key: 'doom',       label: 'DOOM',  cult: 'yomi',    order: 1, valued: true },
  { key: 'barrier',    label: 'WARD',  cult: 'avalon',  order: 2, valued: true },
  { key: 'runes',      label: 'RUNE',  cult: 'asgard',  order: 3, valued: true },
  { key: 'runeShield', label: 'SHLD',  cult: 'asgard',  order: 4, valued: true },
  { key: 'runeburst',  label: 'BURST', cult: 'asgard',  order: 5, valued: false }
]);

/**
 * cultState 를 HP바 옆 배지 목록으로 바꾼다 (MECH-02 표기).
 * 0 이거나 없는 값은 배지를 만들지 않는다 — 평소에는 유닛 주변이 비어 있어야
 * 상태가 붙은 순간이 눈에 띈다.
 *
 * @param {Object|null} cultState - CultMechanicsSystem.createCultState() 결과
 * @param {{max?:number}} [options]
 * @returns {Array<{key:string,label:string,value:number|null,color:number}>}
 */
export function buildCultBadges(cultState, options = {}) {
  const { max = 3 } = options;
  if (!cultState || typeof cultState !== 'object') return [];

  const badges = [];
  for (const def of CULT_BADGE_DEFS) {
    const raw = cultState[def.key];
    const amount = Array.isArray(raw) ? raw.length : Number(raw) || 0;
    const active = def.valued ? amount > 0 : !!raw;
    if (!active) continue;
    badges.push({
      key: def.key,
      label: def.label,
      value: def.valued ? amount : null,
      color: getCultColor(def.cult),
      order: def.order
    });
  }

  const statuses = Array.isArray(cultState.statuses) ? cultState.statuses : [];
  for (const status of statuses) {
    if (!status || typeof status.type !== 'string') continue;
    badges.push({
      key: `status:${status.type}`,
      label: status.type.slice(0, 4).toUpperCase(),
      value: Number(status.duration) > 0 ? Number(status.duration) : null,
      color: DESIGN.colors.status.warning,
      order: 10
    });
  }

  badges.sort((a, b) => a.order - b.order);
  return badges
    .slice(0, Math.max(0, Math.floor(max)))
    .map(({ key, label, value, color }) => ({ key, label, value, color }));
}

// ============================================================
// 7. 전투 결과 화면 (§3-9 / T-18)
// ============================================================

/** 결과 화면 세로 대역 (base px) */
export const RESULT_LAYOUT = Object.freeze({
  title:     { y: 150 },
  stars:     { y: 250, size: 56, gap: 68 },
  stageName: { y: 318 },
  reward:      { x: 40, y: 356, w: 640, h: 244 },
  party:       { x: 40, y: 636, w: 640, h: 284 },   // 보상 패널(356+244=600) 아래로 라벨 자리를 띄운다
  detail:      { x: 40, y: 356, w: 640, h: 288 },   // 패배 진단 패널
  defeatParty: { x: 40, y: 690, w: 640, h: 232 },   // 패배 화면 편성 진단 (진단 패널 아래)
  actions:     { y: 964, w: 640, h: 76, gap: 16 }
});

/**
 * 별 3개의 x 좌표. 중앙 정렬.
 * @param {number} [count]
 * @returns {number[]} base px
 */
export function computeStarSlots(count = 3) {
  const n = Math.max(0, Math.floor(count));
  const { gap } = RESULT_LAYOUT.stars;
  const start = BASE_W / 2 - ((n - 1) * gap) / 2;
  const out = [];
  for (let i = 0; i < n; i++) out.push(start + i * gap);
  return out;
}

/**
 * 결과 화면 액션 버튼 배치.
 * 첫 버튼은 폭 100% 의 주 행동이고, 나머지는 2열로 나눈다(§3-9).
 * 홀수로 남는 마지막 버튼은 다시 전폭을 쓴다 — 반쪽짜리 버튼이 홀로 남으면
 * 눌러야 할 것과 아닌 것의 구분이 흐려진다.
 *
 * @param {number} count - 버튼 개수
 * @returns {Array<{x:number,y:number,w:number,h:number,index:number,primary:boolean}>}
 */
export function computeResultButtonLayout(count) {
  const n = Math.max(0, Math.floor(count || 0));
  if (n === 0) return [];

  const { y, w, h, gap } = RESULT_LAYOUT.actions;
  const left = BASE_W / 2 - w / 2;
  const halfW = (w - gap) / 2;
  const out = [];

  let row = 0;
  let i = 0;
  while (i < n) {
    const rowY = y + row * (h + gap);
    const isFirst = i === 0;
    const isLastAlone = i === n - 1;

    if (isFirst || isLastAlone) {
      out.push({ x: BASE_W / 2, y: rowY + h / 2, w, h, index: i, primary: isFirst });
      i += 1;
    } else {
      out.push({ x: left + halfW / 2, y: rowY + h / 2, w: halfW, h, index: i, primary: false });
      out.push({ x: left + w - halfW / 2, y: rowY + h / 2, w: halfW, h, index: i + 1, primary: false });
      i += 2;
    }
    row += 1;
  }
  return out;
}

/**
 * 파티 카드 슬롯 (§3-9: 공백 구간을 4인 EXP 바로 채운다).
 * 승리는 RESULT_LAYOUT.party, 패배는 진단 패널 아래의 defeatParty 대역을 쓴다.
 *
 * @param {number} count - 파티 인원
 * @param {{x:number,y:number,w:number,h:number}} [band] - 배치 대역. 생략 시 승리 대역
 * @returns {Array<{x:number,y:number,w:number,h:number,index:number}>}
 */
export function computePartyExpSlots(count, band = RESULT_LAYOUT.party) {
  const n = Math.max(0, Math.floor(count || 0));
  if (n === 0) return [];
  const rowGap = 8;
  const rowH = Math.min(64, (band.h - rowGap * (n - 1)) / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: band.x + band.w / 2,
      y: band.y + i * (rowH + rowGap) + rowH / 2,
      w: band.w,
      h: rowH,
      index: i
    });
  }
  return out;
}
