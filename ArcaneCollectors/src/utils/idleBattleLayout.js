/**
 * idleBattleLayout.js — 메인 화면 방치 전투 무대 배치·연출 계산
 *
 * `IdleBattleView` 는 Phaser 오브젝트와 트윈을 다루느라 커진다. 그중 "어디에 세우고
 * 언제 때리는가" 만 이 모듈로 떼어 냈다. Phaser 참조가 없어 씬을 띄우지 않고
 * 무대 규칙을 단위 테스트로 고정할 수 있다.
 *
 * 좌표계는 **뷰 로컬 base px** 이다. 원점은 관측창 중앙이고, +y 가 아래다.
 * 씬이 s() 로 렌더 좌표로 올린다. 뷰 크기(viewW/viewH)를 인자로 받는 이유는
 * 관측창 크기가 mainMenuLayout 의 대역에서 파생되기 때문이다 — 여기서 다시
 * 하드코딩하면 두 곳이 어긋난다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/** 무대 비율 상수. 전부 뷰 크기에 대한 비율이라 관측창이 바뀌어도 따라간다 */
export const STAGE = Object.freeze({
  groundRatio: 0.30,      // 중앙에서 바닥선까지 (viewH 대비)
  backRowLift: 0.16,      // 뒷줄이 위로 올라가는 정도 (viewH 대비)
  heroHeight: 150,        // 앞줄 영웅 스탠딩 높이 (base px)
  backRowScale: 0.86,     // 뒷줄 축소율 (원근)
  bossHeight: 180,        // 보스 높이 (base px)
  bossX: 0.30,            // 보스 x (viewW 대비, 중앙 기준 오른쪽)
  frontX: [-0.20, -0.32], // 앞줄 x (viewW 대비)
  backX: [-0.28, -0.39],  // 뒷줄 x (viewW 대비)
  padding: 16             // 라벨 가장자리 여백
});

/** 공격 사이클 파라미터 (ms, base px) */
export const ATTACK = Object.freeze({
  minDelay: 1200,
  maxDelay: 2000,
  delayStep: 200,
  lungeDx: 80,
  lungeIn: 170,
  lungeOut: 230,
  bossLungeDx: -60,
  bossLungeIn: 200,
  bossLungeOut: 260,
  shakePx: 8,
  flashMs: 90,
  damageRiseY: -46,
  damageMs: 700
});

/** 동시에 살아 있어도 되는 트윈 상한. 넘으면 새 연출을 건너뛴다 */
export const MAX_CONCURRENT_TWEENS = 6;

/** 적 아트 디렉터리·확장자 (아트 트랙이 생성 중) */
export const ENEMY_DIR = 'assets/characters/enemies/';
export const ENEMY_EXT = '.webp';

/** 전신 시트 (heroDetailLayout 과 동일 규약) */
export const FULLBODY_DIR = 'assets/characters/fullbody/';
export const FULLBODY_EXT = '.webp';
export const FULLBODY_PREFIX = 'fb_';

// ------------------------------------------------------------------
// 무대 배치
// ------------------------------------------------------------------

/**
 * 바닥선 y (뷰 로컬).
 * @param {number} viewH
 * @returns {number}
 */
export function groundY(viewH) {
  return viewH * STAGE.groundRatio;
}

/**
 * 파티 4인 스탠딩 위치. 앞줄 2 · 뒷줄 2 이고, 뒷줄은 위로 올라가며 작아진다.
 *
 * 순서는 "보스에 가장 가까운 앞줄"부터다. 공격 순번도 이 순서를 따르므로
 * 화면에서 앞에 선 영웅이 먼저 때린다 — 순번이 눈에 보인다.
 *
 * @param {number} viewW
 * @param {number} viewH
 * @returns {Array<{index:number,x:number,y:number,scale:number,row:'front'|'back',height:number,depth:number}>}
 */
export function computePartyStands(viewW, viewH) {
  const gy = groundY(viewH);
  const lift = viewH * STAGE.backRowLift;

  return [0, 1, 2, 3].map((index) => {
    const front = index < 2;
    const ratio = front ? STAGE.frontX[index] : STAGE.backX[index - 2];
    const scale = front ? 1 : STAGE.backRowScale;
    return {
      index,
      x: viewW * ratio,
      y: front ? gy : gy - lift,
      scale,
      row: front ? 'front' : 'back',
      height: STAGE.heroHeight * scale,
      // 앞줄이 뒷줄을 가린다. 같은 줄에서는 오른쪽(보스에 가까운 쪽)이 위다
      depth: (front ? 20 : 10) + (2 - (index % 2))
    };
  });
}

/**
 * 보스 스탠딩 위치.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number,height:number,depth:number}}
 */
export function computeBossStand(viewW, viewH) {
  return {
    x: viewW * STAGE.bossX,
    y: groundY(viewH),
    height: STAGE.bossHeight,
    depth: 22
  };
}

/**
 * 보스 HP 바 — 보스 머리 위. 수치를 함께 적어 색상 단독 전달을 피한다(A11Y).
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number,w:number,h:number,textY:number}}
 */
export function computeBossHpBar(viewW, viewH) {
  const boss = computeBossStand(viewW, viewH);
  const w = Math.min(240, viewW * 0.34);
  const y = boss.y - boss.height - 26;
  return { x: boss.x, y, w, h: 16, textY: y + 8 };
}

/**
 * 상단 라벨 두 자리. 왼쪽은 "챕터 N-M · 보스명", 오른쪽은 진행률과 예상 격파 시간.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{title:Object, progress:Object, eta:Object}}
 */
export function computeStageLabels(viewW, viewH) {
  const left = -viewW / 2 + STAGE.padding;
  const right = viewW / 2 - STAGE.padding;
  const top = -viewH / 2 + STAGE.padding;
  return {
    title: { x: left, y: top, originX: 0, originY: 0 },
    progress: { x: right, y: top, originX: 1, originY: 0 },
    eta: { x: right, y: top + 22, originX: 1, originY: 0 }
  };
}

/**
 * 바닥 띠 — 유닛의 발을 같은 평면에 놓아 "무대"로 읽히게 하는 최소 장치.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{y:number,w:number,h:number}}
 */
export function computeFloorBand(viewW, viewH) {
  return { y: groundY(viewH), w: viewW, h: Math.max(24, viewH * 0.10) };
}

/**
 * 스프라이트를 목표 높이에 맞춘 표시 크기. 비율은 유지한다.
 * @param {number} texW
 * @param {number} texH
 * @param {number} targetH
 * @returns {{w:number,h:number}|null} 입력이 유효하지 않으면 null
 */
export function computeSpriteFit(texW, texH, targetH) {
  if (![texW, texH, targetH].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { w: targetH * (texW / texH), h: targetH };
}

// ------------------------------------------------------------------
// 공격 사이클
// ------------------------------------------------------------------

/**
 * 다음 공격까지의 간격. 순번마다 조금씩 달라 기계적인 박자를 피한다.
 * 항상 [minDelay, maxDelay] 안에 있다.
 *
 * @param {number} index 공격 순번 (0부터, 파티 인덱스와 같다)
 * @returns {number} ms
 */
export function attackDelay(index) {
  const i = Number.isFinite(index) ? Math.abs(Math.floor(index)) : 0;
  const delay = ATTACK.minDelay + (i % 4) * ATTACK.delayStep;
  return Math.min(ATTACK.maxDelay, delay);
}

/**
 * 공격 순번을 파티 인덱스로 돌린다. 살아 있는(=편성된) 인원만 돈다.
 * @param {number} turn 누적 공격 횟수
 * @param {number} memberCount 편성 인원 (1~4)
 * @returns {number} 파티 인덱스. 인원이 0이면 -1
 */
export function attackerIndex(turn, memberCount) {
  if (!Number.isFinite(memberCount) || memberCount <= 0) return -1;
  const t = Number.isFinite(turn) ? Math.abs(Math.floor(turn)) : 0;
  return t % Math.floor(memberCount);
}

/**
 * 이번 순번이 한 바퀴의 마지막인가 — 그 다음에 보스가 한 번 반격한다.
 * @param {number} turn
 * @param {number} memberCount
 * @returns {boolean}
 */
export function isRoundEnd(turn, memberCount) {
  if (!Number.isFinite(memberCount) || memberCount <= 0) return false;
  return attackerIndex(turn, memberCount) === Math.floor(memberCount) - 1;
}

/**
 * 시뮬레이션이 넘겨준 실제 누적 피해를 이번 타격 몫으로 나눈다.
 * 숫자를 지어내지 않기 위해서다 — 화면의 숫자는 항상 실제 DPS 에서 나온다.
 *
 * @param {number} total 이번 틱의 실제 피해
 * @param {number} hits 그 사이에 보여줄 타격 수
 * @returns {number} 한 타격에 띄울 값 (1 이상 정수)
 */
export function splitDamage(total, hits) {
  const t = Number.isFinite(total) && total > 0 ? total : 0;
  const h = Number.isFinite(hits) && hits > 0 ? Math.floor(hits) : 1;
  return Math.max(1, Math.round(t / h));
}

// ------------------------------------------------------------------
// 진행 상태
// ------------------------------------------------------------------

/**
 * 누적 피해를 0~1 진행률로. 방치 전투는 "보스 HP 를 깎는" 것이 아니라
 * "격파에 필요한 피해를 쌓는" 모델이라 누적치가 곧 진행률이다.
 *
 * @param {number} accumulated
 * @param {number} maxHp
 * @returns {number} 0~1
 */
export function hpRatio(accumulated, maxHp) {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  const acc = Number.isFinite(accumulated) ? Math.max(0, accumulated) : 0;
  return Math.max(0, Math.min(1, acc / maxHp));
}

/**
 * 남은 시간(초). DPS 가 0 이하면 무한대를 돌려 호출부가 "—" 로 표시하게 한다.
 * @param {number} remainingHp
 * @param {number} dps
 * @returns {number} 초. 계산 불가면 Infinity
 */
export function estimateEtaSeconds(remainingHp, dps) {
  if (!Number.isFinite(dps) || dps <= 0) return Infinity;
  const remain = Number.isFinite(remainingHp) ? Math.max(0, remainingHp) : 0;
  if (remain === 0) return 0;
  return remain / dps;
}

/**
 * 예상 시간을 한국어 한 마디로. 방치 게임의 핵심 정보라 항상 읽히게 짧게 쓴다.
 * @param {number} seconds
 * @returns {string}
 */
export function formatEta(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds <= 0) return '격파 가능';
  if (seconds >= 3600) return '1시간 이상';
  const total = Math.ceil(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `약 ${sec}초`;
  if (sec === 0) return `약 ${min}분`;
  return `약 ${min}분 ${sec}초`;
}

/**
 * HP 바 라벨. 수치를 함께 적는다 (A11Y — 색상 단독 전달 금지).
 * @param {number} accumulated
 * @param {number} maxHp
 * @returns {string}
 */
export function formatHpLabel(accumulated, maxHp) {
  const max = Number.isFinite(maxHp) && maxHp > 0 ? Math.floor(maxHp) : 0;
  const acc = Math.min(max, Math.max(0, Math.floor(Number.isFinite(accumulated) ? accumulated : 0)));
  return `${acc.toLocaleString()} / ${max.toLocaleString()}`;
}

// ------------------------------------------------------------------
// 에셋 조회
// ------------------------------------------------------------------

/**
 * 영웅 전신 시트 텍스처 키.
 * @param {string} heroId
 * @param {Object} portraitMap portrait-mapping.json
 * @returns {string|null}
 */
export function heroSpriteKey(heroId, portraitMap) {
  if (!heroId || !portraitMap) return null;
  const file = portraitMap[heroId];
  return typeof file === 'string' && file.length > 0 ? FULLBODY_PREFIX + file : null;
}

/**
 * 영웅 전신 시트 경로.
 * @param {string} key fb_hero_XXX
 * @returns {string|null}
 */
export function heroSpritePath(key) {
  if (typeof key !== 'string' || !key.startsWith(FULLBODY_PREFIX)) return null;
  return FULLBODY_DIR + key.slice(FULLBODY_PREFIX.length) + FULLBODY_EXT;
}

/**
 * 적 아트를 매니페스트에서 찾는다.
 *
 * 적 아트는 아직 생성 중이라 없을 수 있다(`asset-manifest.json` 의 `missing` 목록).
 * **매니페스트에 등록된 키만** 돌려준다. 없는 경로를 요청하면 dev 서버의 404 가드가
 * 콘솔 에러를 남겨 부팅 스모크를 깨뜨리기 때문이다. 아트가 들어오면 이 함수가
 * 자동으로 경로를 찾아 실루엣이 실제 그림으로 바뀐다.
 *
 * @param {string} bossId 예: enemy_goblin_king
 * @param {Object} manifest asset-manifest.json
 * @returns {{key:string, path:string, eager:boolean}|null}
 */
export function resolveEnemyArt(bossId, manifest) {
  if (!bossId || !manifest) return null;

  const buckets = [
    { source: manifest.enemies, eager: false },
    { source: manifest.textures, eager: true },
    { source: manifest.lazyTextures, eager: false }
  ];

  for (const { source, eager } of buckets) {
    const meta = source && source[bossId];
    if (meta && typeof meta.path === 'string' && meta.path.length > 0) {
      return { key: bossId, path: meta.path, eager };
    }
    if (typeof meta === 'string' && meta.length > 0) {
      return { key: bossId, path: meta, eager };
    }
  }
  return null;
}

/**
 * 챕터 배경 텍스처 키.
 * @param {number} chapter
 * @returns {string}
 */
export function chapterBgKey(chapter) {
  const n = Number.isFinite(chapter) ? Math.max(1, Math.min(5, Math.floor(chapter))) : 1;
  return `bg_chapter_${n}`;
}

export default {
  STAGE,
  ATTACK,
  MAX_CONCURRENT_TWEENS,
  groundY,
  computePartyStands,
  computeBossStand,
  computeBossHpBar,
  computeStageLabels,
  computeFloorBand,
  computeSpriteFit,
  attackDelay,
  attackerIndex,
  isRoundEnd,
  splitDamage,
  hpRatio,
  estimateEtaSeconds,
  formatEta,
  formatHpLabel,
  heroSpriteKey,
  heroSpritePath,
  resolveEnemyArt,
  chapterBgKey
};
