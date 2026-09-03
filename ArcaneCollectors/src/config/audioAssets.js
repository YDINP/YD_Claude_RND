/**
 * audioAssets.js - 오디오 에셋 카탈로그 (SND-01 / SND-02)
 *
 * 파일 경로 규약 한 곳. PreloadScene(선로드) · SoundManager(지연 로드) ·
 * tests/e2e/audio-smoke.mjs(HTTP 200 확인)가 모두 이 목록을 읽는다.
 * 새 트랙/효과음을 추가할 때는 여기와 SoundManager 의 BGM_TRACKS / SFX_LIST 만 고치면 된다.
 *
 * 브라우저에는 ogg 를 먼저 주고 mp3 를 폴백으로 둔다(Phaser 가 지원 포맷 하나만 받는다).
 */

/** public/ 기준 상대 경로. vite base 가 './' 라 앞에 슬래시를 붙이지 않는다 */
export const AUDIO_BASE_PATH = 'assets/audio';

/** 재생 우선 포맷 순서 */
export const AUDIO_FORMATS = Object.freeze(['ogg', 'mp3']);

/** BGM 텍스처 키 (= SoundManager BGM_TRACKS 의 track.key) */
export const BGM_KEYS = Object.freeze([
  'bgm_main',
  'bgm_battle',
  'bgm_boss',
  'bgm_gacha',
  'bgm_victory',
  'bgm_defeat'
]);

/** SFX 키 (= SoundManager SFX_LIST 의 sfx.key) */
export const SFX_KEYS = Object.freeze([
  'sfx_click',
  'sfx_card_flip',
  'sfx_gacha_pull',
  'sfx_gacha_ssr',
  'sfx_hit',
  'sfx_crit',
  'sfx_heal',
  'sfx_levelup',
  'sfx_ascend',
  'sfx_skill',
  'sfx_victory',
  'sfx_defeat',
  'sfx_ui_open',
  'sfx_ui_close',
  'sfx_coin',
  'sfx_energy',
  'sfx_error'
]);

/**
 * 부팅 시 즉시 받는 BGM.
 * BGM 한 트랙이 ~900KB 라 전부 선로드하면 첫 진입이 느려진다. 로비 곡만 받고
 * 나머지는 SoundManager.playBGM() 이 필요한 순간에 지연 로드한다.
 */
export const EAGER_BGM_KEYS = Object.freeze(['bgm_main']);

/**
 * 오디오 키의 후보 URL 목록 (ogg → mp3 순).
 * @param {string} key 'bgm_main' | 'sfx_click' ...
 * @returns {string[]}
 */
export function audioUrlsFor(key) {
  const folder = key.startsWith('bgm_') ? 'bgm' : 'sfx';
  return AUDIO_FORMATS.map((ext) => `${AUDIO_BASE_PATH}/${folder}/${key}.${ext}`);
}

/** 선로드 대상 전체 키 (BGM 일부 + SFX 전부) */
export function eagerAudioKeys() {
  return [...EAGER_BGM_KEYS, ...SFX_KEYS];
}

/** 지연 로드 대상 BGM 키 */
export function lazyBgmKeys() {
  return BGM_KEYS.filter((k) => !EAGER_BGM_KEYS.includes(k));
}

/**
 * 음량 설정 기본값 (SaveManager `settings.audio` 마이그레이션 기본값 = SoundManager 초기값).
 * SaveManager 와 SoundManager 가 서로를 import 하면 순환이 생기므로 SSOT 를 여기 둔다.
 */
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  master: 1.0,
  bgm: 0.6,
  sfx: 0.8,
  bgmMuted: false,
  sfxMuted: false
});
