/**
 * meditationLayout.js — 명상 성소(메인 로비) 배치·연출·라벨 계산
 *
 * 로비는 "파티가 보스를 두들기는 무대"에서 "파티가 명상해 마력을 쌓는 성소"로 바뀌었다.
 * 바뀐 것은 **표현뿐**이다. 진행도·보상·오프라인 누적은 여전히 IdleProgressSystem 이
 * 계산하고, 이 모듈은 그 값을 어디에 어떻게 그릴지만 정한다.
 *
 * 그래서 여기에는 게임 수치가 하나도 없다. 좌표·간격·연출 주기·라벨 문자열뿐이다.
 * Phaser 참조가 없어 씬을 띄우지 않고 단위 테스트로 고정할 수 있다.
 *
 * 좌표계는 **뷰 로컬 base px**. 원점은 관측창 중앙, +y 가 아래다. 씬이 s() 로 렌더
 * 좌표로 올린다. 뷰 크기를 인자로 받는 이유는 관측창이 mainMenuLayout 의 대역에서
 * 파생되기 때문이다 — 여기서 다시 하드코딩하면 두 곳이 어긋난다.
 *
 * 주의: designSystem·gameConfig 를 import 하지 않는다(순환 import TDZ 방지).
 *       이 모듈은 의존성이 0 이다.
 */

/**
 * 성소 배치 비율. 전부 뷰 크기에 대한 비율이라 관측창이 바뀌어도 따라간다.
 *
 * 좌석 각도는 타원 매개변수 t(도)다. sin(t) > 0 이 화면 아래(=앞줄)이고,
 * 앞줄 2인이 제단을 사이에 두고 관객 쪽에, 뒷줄 2인이 제단 너머에 앉는다.
 * 뒷줄을 0.86 배로 줄여 원근을 만든다 — 같은 크기로 두면 원이 납작한 띠로 보인다.
 */
export const SANCTUM = Object.freeze({
  ringCenterRatio: 0.12,   // 룬 원 중심 y (viewH 대비, 중앙 기준 아래)
  ringRadiusRatio: 0.40,   // 룬 원 rx (viewW 대비)
  ringFlatten: 0.285,      // ry = rx * flatten (바닥에 누운 원근)
  seatAngles: Object.freeze([58, 122, -32, 212]), // deg. 앞우·앞좌·뒤우·뒤좌
  backRowScale: 0.86,
  chibiHeight: 100,        // 앞줄 치비 표시 높이 (base px). 뒷줄은 x backRowScale
  altarHeight: 62,         // 바닥 인장에서 결정까지의 높이
  altarBaseRx: 46,         // 바닥 인장 타원 rx
  orbLift: 20,             // 인장 위 높이에서 결정까지 더 띄우는 양
  orbRadius: 18,           // 부유 결정의 반지름(꼭짓점까지)
  padding: 16              // 라벨 가장자리 여백
});

/** 마력 게이지 (수치 병기 — 색상 단독 전달 금지, A11Y) */
export const GAUGE = Object.freeze({
  widthRatio: 0.46,
  widthMax: 300,
  height: 14,
  yRatio: -0.345,   // viewH 대비 (중앙 기준 위)
  labelGap: 9
});

/** 오라 입자 — 각 캐릭터에서 제단으로 흐른다. 집중력이 높을수록 자주 난다 */
export const AURA = Object.freeze({
  minDelay: 140,       // 집중력이 아주 높을 때의 생성 간격 (ms)
  maxDelay: 700,       // 집중력이 0 에 가까울 때
  fullFocus: 5000,     // 이 집중력(초당)에서 minDelay 에 도달한다
  travelMs: 820,
  radius: 8,           // 밝은 성소 배경 위에서도 보이는 최소 크기 (가산 합성이라 작으면 묻힌다)
  maxAlive: 6          // 동시에 살아 있는 입자 상한
});

/** 좌석 발밑 명상 원(방석) — 4인 배치를 정돈하고 교단색을 바닥에 심는다 */
export const SEAT_DISC = Object.freeze({
  rxRatio: 0.62,     // 좌석 높이 대비 가로 반지름
  flatten: 0.30,     // ry = rx * flatten (바닥 원근. 룬 원과 같은 결)
  ticks: 6           // 테두리 눈금 수
});

/** 호흡/부유 — meditate 프레임을 살아 있게 만드는 최소 장치 */
export const BREATH = Object.freeze({ amplitudeY: 4, durationMs: 2400 });

/** meditate <-> channel 교차 주기. 마력이 찰수록 자주 교차한다 */
export const CHANNEL = Object.freeze({ idleDelay: 2600, fullDelay: 900, fadeMs: 420 });

/** 수확 순간 awaken 프레임 유지 시간 */
export const HARVEST = Object.freeze({ awakenMs: 600, punchScale: 1.12, pillarMs: 720 });

/**
 * 동시에 살아 있어도 되는 **일회성** 트윈 상한. 넘으면 새 연출을 건너뛴다.
 * 룬 회전·호흡·구슬 맥박 3개의 상시 루프는 이 카운터 밖이다(생성 시 1회만 만든다).
 */
export const MAX_CONCURRENT_TWEENS = 8;

/** 명상 어휘 — 전투 용어를 화면에서 몰아내는 단일 사전 */
export const LABELS = Object.freeze({
  focus: '집중력',
  mana: '축적 마력',
  need: '필요 마력',
  harvest: '수확',
  harvestReady: '수확 준비 완료',
  emptyParty: '파티를 편성하면 명상을 시작합니다',
  sanctum: '성소'
});

/** 치비 시트 텍스처 키 접두사 (postprocess-assets.py 와 같은 규칙) */
export const CHIBI_KEY_PREFIX = 'chibi_';

// ------------------------------------------------------------------
// 배치
// ------------------------------------------------------------------

/**
 * 바닥 룬 원 (타원). 파티와 제단이 이 원 위에 놓인다.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{cx:number, cy:number, rx:number, ry:number}}
 */
export function computeRuneRing(viewW, viewH) {
  const rx = viewW * SANCTUM.ringRadiusRatio;
  return {
    cx: 0,
    cy: viewH * SANCTUM.ringCenterRatio,
    rx,
    ry: rx * SANCTUM.ringFlatten
  };
}

/**
 * 파티 4인 좌석. 룬 원 위에 앞 2 · 뒤 2 로 앉는다.
 *
 * 순서는 파티 편성 순서(0..3)와 같다. 0·1 이 앞줄이라 편성 1·2번이 가장 크게 보인다.
 *
 * @param {number} viewW
 * @param {number} viewH
 * @returns {Array<{index:number,x:number,y:number,scale:number,row:'front'|'back',height:number,depth:number,angle:number}>}
 */
export function computeMeditationSeats(viewW, viewH) {
  const ring = computeRuneRing(viewW, viewH);
  return SANCTUM.seatAngles.map((angle, index) => {
    const front = index < 2;
    const scale = front ? 1 : SANCTUM.backRowScale;
    const rad = (angle * Math.PI) / 180;
    return {
      index,
      x: ring.cx + ring.rx * Math.cos(rad),
      y: ring.cy + ring.ry * Math.sin(rad),
      scale,
      row: front ? 'front' : 'back',
      height: SANCTUM.chibiHeight * scale,
      // 앞줄이 제단을, 제단이 뒷줄을 가린다
      depth: front ? 20 + index : 10 + index,
      angle
    };
  });
}

/**
 * 중앙 제단. 받침은 룬 원 중심에 놓이고 기둥이 위로 선다.
 * 마력 구슬은 기둥 꼭대기 위에 떠 있다 — 오라 입자가 도착하는 지점이다.
 *
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number,baseRx:number,baseRy:number,topY:number,orbX:number,orbY:number,orbR:number,depth:number}}
 */
export function computeAltar(viewW, viewH) {
  const ring = computeRuneRing(viewW, viewH);
  const topY = ring.cy - SANCTUM.altarHeight;
  return {
    x: ring.cx,
    y: ring.cy,
    baseRx: SANCTUM.altarBaseRx,
    baseRy: SANCTUM.altarBaseRx * SANCTUM.ringFlatten * 1.15,
    topY,
    orbX: ring.cx,
    orbY: topY - SANCTUM.orbLift,
    orbR: SANCTUM.orbRadius,
    depth: 15
  };
}

/**
 * 마력 게이지 — 헤더 아래 가운데. 라벨에 수치를 함께 적는다(A11Y).
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number,w:number,h:number,labelY:number}}
 */
export function computeManaGauge(viewW, viewH) {
  const w = Math.min(GAUGE.widthMax, viewW * GAUGE.widthRatio);
  const y = viewH * GAUGE.yRatio;
  return { x: 0, y, w, h: GAUGE.height, labelY: y + GAUGE.height + GAUGE.labelGap };
}

/**
 * 헤더 라벨 세 자리. 왼쪽은 성소 이름, 오른쪽 위는 진행률, 그 아래는 다음 수확까지.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{title:Object, progress:Object, eta:Object}}
 */
export function computeSanctumLabels(viewW, viewH) {
  const left = -viewW / 2 + SANCTUM.padding;
  const right = viewW / 2 - SANCTUM.padding;
  const top = -viewH / 2 + SANCTUM.padding;
  return {
    title: { x: left, y: top, originX: 0, originY: 0 },
    progress: { x: right, y: top, originX: 1, originY: 0 },
    eta: { x: right, y: top + 22, originX: 1, originY: 0 }
  };
}

/**
 * 수확 준비 배너 자리 — 제단 위, 헤더 아래. 유닛을 가리지 않는다.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number}}
 */
export function computeReadyBanner(viewW, viewH) {
  return { x: 0, y: viewH * -0.16 };
}

/**
 * 100% 에서 제단이 쏘아 올리는 빛기둥. 위쪽은 관측창 마스크가 자른다.
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function computeLightPillar(viewW, viewH) {
  const altar = computeAltar(viewW, viewH);
  const top = -viewH / 2;
  return { x: altar.orbX, y: top, w: Math.max(36, viewW * 0.08), h: altar.orbY - top };
}

/**
 * 좌석 발밑 명상 원. 좌석 높이에서 파생돼 뒷줄은 자동으로 작아진다.
 * @param {{y:number,height:number}} seat computeMeditationSeats() 의 한 항목
 * @returns {{rx:number, ry:number, ticks:number}|null}
 */
export function computeSeatDisc(seat) {
  if (!seat || !Number.isFinite(seat.height) || seat.height <= 0) return null;
  const rx = seat.height * SEAT_DISC.rxRatio;
  return { rx, ry: rx * SEAT_DISC.flatten, ticks: SEAT_DISC.ticks };
}

/**
 * 스프라이트를 목표 높이에 맞춘 표시 크기. 비율은 유지한다.
 * @param {number} texW
 * @param {number} texH
 * @param {number} targetH
 * @returns {{w:number,h:number}|null} 입력이 유효하지 않으면 null
 */
export function computeChibiFit(texW, texH, targetH) {
  if (![texW, texH, targetH].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { w: targetH * (texW / texH), h: targetH };
}

// ------------------------------------------------------------------
// 연출 주기
// ------------------------------------------------------------------

/**
 * 오라 입자 생성 간격. 집중력이 높을수록 자주 난다.
 *
 * 선형이 아니라 로그다. 방치형은 집중력이 수십 배로 뛰기 때문에 선형으로 매핑하면
 * 초반 내내 최소 빈도에 붙어 있다가 어느 순간 최대로 붙는다.
 *
 * @param {number} focusPerSec 초당 집중력 (= 기존 파티 DPS)
 * @returns {number} ms. 항상 [minDelay, maxDelay]
 */
export function auraSpawnDelay(focusPerSec) {
  const f = Number.isFinite(focusPerSec) && focusPerSec > 0 ? focusPerSec : 0;
  if (f <= 0) return AURA.maxDelay;
  const t = Math.min(1, Math.log10(1 + f) / Math.log10(1 + AURA.fullFocus));
  return Math.round(AURA.maxDelay - (AURA.maxDelay - AURA.minDelay) * t);
}

/**
 * meditate <-> channel 교차 주기. 마력이 찰수록 짧아진다(=집중이 깊어진다).
 * @param {number} ratio 0~1
 * @returns {number} ms
 */
export function channelPulseDelay(ratio) {
  const r = clamp01(ratio);
  return Math.round(CHANNEL.idleDelay - (CHANNEL.idleDelay - CHANNEL.fullDelay) * r);
}

/**
 * 마력 비율에 따른 제단 밝기(알파). 0 에서도 완전히 꺼지지 않는다 — 제단은 항상 보인다.
 * @param {number} ratio 0~1
 * @returns {number} 0.35~1
 */
export function altarGlowAlpha(ratio) {
  return 0.35 + 0.65 * clamp01(ratio);
}

/**
 * 룬 원 1회전에 걸리는 시간. 마력이 찰수록 빨라진다.
 * @param {number} ratio 0~1
 * @returns {number} ms
 */
export function runeSpinDuration(ratio) {
  return Math.round(24000 - 12000 * clamp01(ratio));
}

// ------------------------------------------------------------------
// 진행 상태 · 라벨
// ------------------------------------------------------------------

/**
 * 축적 마력을 0~1 로. 기존 hpRatio 와 같은 계산이다 — 이름만 명상 어휘다.
 * @param {number} accumulated 축적 마력 (= 누적 피해)
 * @param {number} required 다음 수확까지 필요한 마력 (= 보스 최대 HP)
 * @returns {number} 0~1
 */
export function manaRatio(accumulated, required) {
  if (!Number.isFinite(required) || required <= 0) return 0;
  const acc = Number.isFinite(accumulated) ? Math.max(0, accumulated) : 0;
  return clamp01(acc / required);
}

/**
 * 수확 가능한가 (= 기존 BOSS READY).
 * @param {number} accumulated
 * @param {number} required
 * @returns {boolean}
 */
export function isHarvestReady(accumulated, required) {
  return manaRatio(accumulated, required) >= 1;
}

/**
 * 게이지 라벨 — "1,240 / 5,000 마력". 수치를 항상 병기한다(A11Y).
 * @param {number} accumulated
 * @param {number} required
 * @returns {string}
 */
export function formatManaLabel(accumulated, required) {
  const need = Number.isFinite(required) && required > 0 ? Math.floor(required) : 0;
  const acc = Math.min(need, Math.max(0, Math.floor(Number.isFinite(accumulated) ? accumulated : 0)));
  return acc.toLocaleString() + ' / ' + need.toLocaleString() + ' 마력';
}

/**
 * 집중력 라벨 — "집중력 128/초". 0 이면 대시로 둔다(숫자를 지어내지 않는다).
 * @param {number} focusPerSec
 * @returns {string}
 */
export function formatFocusRate(focusPerSec) {
  if (!Number.isFinite(focusPerSec) || focusPerSec <= 0) return LABELS.focus + ' —';
  const v = focusPerSec >= 100 ? Math.round(focusPerSec) : Math.round(focusPerSec * 10) / 10;
  return LABELS.focus + ' ' + v.toLocaleString() + '/초';
}

/**
 * 남은 시간(초). 집중력이 0 이하면 무한대를 돌려 호출부가 "—" 로 표시하게 한다.
 * @param {number} remainingMana
 * @param {number} focusPerSec
 * @returns {number} 초. 계산 불가면 Infinity
 */
export function estimateHarvestSeconds(remainingMana, focusPerSec) {
  if (!Number.isFinite(focusPerSec) || focusPerSec <= 0) return Infinity;
  const remain = Number.isFinite(remainingMana) ? Math.max(0, remainingMana) : 0;
  if (remain === 0) return 0;
  return remain / focusPerSec;
}

/**
 * 다음 수확까지 남은 시간을 한국어 한 마디로.
 * @param {number} seconds
 * @returns {string}
 */
export function formatHarvestEta(seconds) {
  if (!Number.isFinite(seconds)) return '다음 수확까지 —';
  if (seconds <= 0) return LABELS.harvestReady;
  if (seconds >= 3600) return '다음 수확까지 1시간 이상';
  const total = Math.ceil(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return '다음 수확까지 ' + sec + '초';
  if (sec === 0) return '다음 수확까지 ' + min + '분';
  return '다음 수확까지 ' + min + '분 ' + sec + '초';
}

/**
 * 헤더 제목 — "챕터 N-M 성소". 정화 대상(기존 보스명)이 있으면 뒤에 붙인다.
 * @param {number} chapter
 * @param {number} stage
 * @param {string} [name] 기존 보스명 (성소가 정화하는 대상)
 * @returns {string}
 */
export function formatSanctumTitle(chapter, stage, name) {
  const c = Number.isFinite(chapter) ? Math.max(1, Math.floor(chapter)) : 1;
  const st = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  const head = '챕터 ' + c + '-' + st + ' ' + LABELS.sanctum;
  return name ? head + ' · ' + name : head;
}

// ------------------------------------------------------------------
// 치비 시트 조회
// ------------------------------------------------------------------

/**
 * 치비 시트 텍스처 키.
 * @param {string} heroId
 * @returns {string|null}
 */
export function chibiSheetKey(heroId) {
  return typeof heroId === 'string' && heroId.length > 0 ? CHIBI_KEY_PREFIX + heroId : null;
}

/**
 * 전직 영웅 id 에서 원본 기본 영웅 id 를 얻는다. `asc_<이름>_<교단>` -> `base_<이름>`.
 *
 * 정적 데이터의 `baseHeroId` 가 있으면 그쪽이 먼저다. 이 파싱은 세이브가 정적 데이터를
 * 덮어써 참조 필드가 사라진 경우의 마지막 방어선이다(id 규칙은 ascended-heroes.json 전체가 지킨다).
 *
 * @param {string} heroId
 * @returns {string|null}
 */
export function baseHeroIdFromAscended(heroId) {
  if (typeof heroId !== 'string' || !heroId.startsWith('asc_')) return null;
  const parts = heroId.split('_');
  return parts.length >= 3 ? `base_${parts[1]}` : null;
}

/**
 * 프레임 이름을 시트 인덱스로. 없는 이름은 0(첫 프레임)으로 떨어진다.
 * @param {Array<string>} frames
 * @param {string} name
 * @returns {number}
 */
export function frameIndex(frames, name) {
  if (!Array.isArray(frames)) return 0;
  const i = frames.indexOf(name);
  return i >= 0 ? i : 0;
}

/**
 * 영웅의 치비 시트를 매니페스트에서 찾는다.
 *
 * **매니페스트에 등록된 키만** 돌려준다. 없는 경로를 요청하면 dev 서버의 404 가드가
 * 콘솔 에러를 남겨 부팅 스모크를 깨뜨리기 때문이다. 시트가 아직 없는 영웅은 null 이고,
 * 호출부는 기존 폴백(포트레이트/실루엣)을 그대로 쓴다. 시트가 추가되면 매니페스트만
 * 바뀌고 코드는 그대로다 — 그것이 C-4 의 "자동 전환"이다.
 *
 * 전직 영웅(asc_*)은 자기 시트가 없으면 원본 영웅(baseHeroId) 시트로 떨어진다.
 * 계획서 C-6 의 "기본 시트 + 교단색 틴트 재사용" 규칙이 이 한 줄에서 시작한다.
 *
 * @param {object|string} hero 영웅 데이터 또는 id
 * @param {object} manifest asset-manifest.json
 * @returns {{key:string,path:string,cell:number,frames:Array<string>,footY:number,heroId:string,inherited:boolean}|null}
 */
export function resolveChibiSheet(hero, manifest) {
  const bucket = manifest && manifest.chibi;
  if (!bucket) return null;

  const id = typeof hero === 'string' ? hero : (hero && hero.id);
  const baseId = typeof hero === 'object' && hero ? (hero.baseHeroId || hero.baseId || null) : null;

  const candidates = [id, baseId, baseHeroIdFromAscended(id)]
    .filter((v, i, arr) => typeof v === 'string' && v.length > 0 && arr.indexOf(v) === i);
  for (let i = 0; i < candidates.length; i += 1) {
    const key = chibiSheetKey(candidates[i]);
    const meta = key && bucket[key];
    if (meta && typeof meta.path === 'string' && meta.path.length > 0) {
      return {
        key,
        path: meta.path,
        cell: Number.isFinite(meta.cell) ? meta.cell : 256,
        frames: Array.isArray(meta.frames) ? meta.frames : ['idle', 'meditate', 'channel', 'awaken'],
        footY: Number.isFinite(meta.footY) ? meta.footY : 240,
        heroId: candidates[i],
        inherited: i > 0
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------

/**
 * 0~1 로 자른다.
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export default {
  SANCTUM,
  GAUGE,
  AURA,
  SEAT_DISC,
  BREATH,
  CHANNEL,
  HARVEST,
  MAX_CONCURRENT_TWEENS,
  LABELS,
  CHIBI_KEY_PREFIX,
  computeRuneRing,
  computeMeditationSeats,
  computeAltar,
  computeManaGauge,
  computeSanctumLabels,
  computeReadyBanner,
  computeLightPillar,
  computeSeatDisc,
  computeChibiFit,
  auraSpawnDelay,
  channelPulseDelay,
  altarGlowAlpha,
  runeSpinDuration,
  manaRatio,
  isHarvestReady,
  formatManaLabel,
  formatFocusRate,
  estimateHarvestSeconds,
  formatHarvestEta,
  formatSanctumTitle,
  chibiSheetKey,
  baseHeroIdFromAscended,
  frameIndex,
  resolveChibiSheet
};
