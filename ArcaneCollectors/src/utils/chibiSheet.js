/**
 * chibiSheet.js — 치비 시트 조회 · 크기 계산 공용 유틸 (의존성 0)
 *
 * MeditationView(메인 성소)와 HeroDetailScene(영웅 상세) 양쪽이 같은 치비 스프라이트
 * 시트를 쓴다. 매니페스트 조회·전직 영웅 폴백(원본 시트 + 교단색 틴트)·프레임 인덱스
 * 규칙이 원래 meditationLayout.js 안에 있었는데, 두 번째 호출부(영웅 상세)가 생기며
 * 여기로 옮겼다. meditationLayout.js 는 이 모듈을 그대로 재수출해 기존 호출부
 * (MeditationView.js)는 바뀌지 않는다.
 *
 * Phaser 도, 다른 프로젝트 모듈도 import 하지 않는다 — 순수 함수라 Phaser 없이
 * 단위 테스트가 돌고, 어느 씬/컴포넌트에서 가져다 써도 TDZ 위험이 없다.
 */

/** 치비 시트 텍스처 키 접두사 (postprocess-assets.py 와 같은 규칙) */
export const CHIBI_KEY_PREFIX = 'chibi_';

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
 * 스프라이트를 목표 높이에 맞춘 표시 크기. 비율은 유지한다(치비 셀은 정사각이라
 * 보통 texW === texH 지만, 함수 자체는 임의 비율을 받는다).
 * @param {number} texW
 * @param {number} texH
 * @param {number} targetH
 * @returns {{w:number,h:number}|null} 입력이 유효하지 않으면 null
 */
export function computeChibiFit(texW, texH, targetH) {
  if (![texW, texH, targetH].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { w: targetH * (texW / texH), h: targetH };
}

/**
 * 영웅의 치비 시트를 매니페스트에서 찾는다.
 *
 * **매니페스트에 등록된 키만** 돌려준다. 없는 경로를 요청하면 dev 서버의 404 가드가
 * 콘솔 에러를 남겨 부팅 스모크를 깨뜨리기 때문이다. 시트가 아직 없는 영웅은 null 이고,
 * 호출부는 기존 폴백(포트레이트/실루엣, 또는 아예 그리지 않음)을 그대로 쓴다. 시트가
 * 추가되면 매니페스트만 바뀌고 코드는 그대로다 — C-4 의 "자동 전환".
 *
 * 전직 영웅(asc_*)은 자기 시트가 없으면 원본 영웅(baseHeroId) 시트로 떨어진다.
 * 계획서 C-6 의 "기본 시트 + 교단색 틴트 재사용" 규칙이 이 한 줄에서 시작한다.
 * `inherited: true` 면 호출부가 교단색으로 틴트해 원본과 구분해야 한다.
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

export default {
  CHIBI_KEY_PREFIX,
  chibiSheetKey,
  baseHeroIdFromAscended,
  frameIndex,
  computeChibiFit,
  resolveChibiSheet
};
