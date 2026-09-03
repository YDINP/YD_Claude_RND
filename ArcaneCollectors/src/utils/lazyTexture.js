/**
 * lazyTexture.js — 씬 로더를 거치지 않는 결정적 텍스처 지연 로드
 *
 * Phaser 의 `scene.load.image()` 는 **로더가 이미 돌고 있을 때 추가된 파일이
 * 네트워크로는 받아지지만 TextureManager 에 등록되지 않는** 상태가 있다.
 * 소환 화면에서 실측했다. `banner_pickup_iris.png` 와 `hero_015.webp` 가 둘 다
 * HTTP 200 으로 내려왔는데 `textures.exists()` 는 계속 false 였다.
 * GachaScene.create() 안에서 BackgroundFactory 가 먼저 `load.start()` 를 부르고,
 * 그 뒤에 배너가 파일을 얹기 때문이다.
 *
 * 그래서 여기서는 브라우저 `Image` 로 직접 받아 `textures.addImage()` 로 넣는다.
 * 로더 상태와 무관하므로 순서에 기대지 않는다. 실패는 조용히 흡수하고
 * 호출부가 폴백을 유지하게 둔다 — 아트가 없어도 화면은 성립해야 한다.
 *
 * 주의: designSystem/gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/**
 * asset-manifest 의 lazyTextures 버킷에서 경로를 찾는다 (순수 함수).
 * @param {Object} manifest - asset-manifest.json
 * @param {string} key - 텍스처 키
 * @returns {string|null} public 기준 상대 경로. 없으면 null
 */
export function lazyTexturePath(manifest, key) {
  const bucket = (manifest && manifest.lazyTextures) || {};
  const entry = bucket[key];
  return entry && entry.path ? entry.path : null;
}

/**
 * 텍스처를 보장한다. 이미 있으면 즉시 성공으로 끝난다.
 *
 * @param {Phaser.Scene} scene
 * @param {string} key - 텍스처 키
 * @param {string} path - public 기준 상대 경로
 * @param {Function} [onDone] - 성공 시 호출 (key, added). added 는 이 호출이 실제로 텍스처를 등록했는지다.
 * @param {Function} [onFail] - 실패 시 호출 (key)
 * @returns {boolean} 이미 존재해 즉시 끝났으면 true
 */
export function ensureTextureFromPath(scene, key, path, onDone, onFail) {
  if (!scene || !key || !path) {
    if (onFail) onFail(key);
    return false;
  }
  if (scene.textures && scene.textures.exists(key)) {
    if (onDone) onDone(key, false);
    return true;
  }
  if (typeof Image === 'undefined') {
    if (onFail) onFail(key);
    return false;
  }

  const img = new Image();
  img.onload = () => {
    // 로드 도중 씬이 내려갔으면 텍스처만 남기고 콜백은 부르지 않는다
    const alive = scene.sys && typeof scene.sys.isActive === 'function' ? scene.sys.isActive() : true;
    if (!scene.textures) return;

    // 같은 키를 다른 쪽이 먼저 올렸을 수 있다. 그 경우 added=false 로 알려
    // 호출부가 "내가 올린 것만 해제한다" 규칙을 지킬 수 있게 한다.
    let added = false;
    if (!scene.textures.exists(key)) {
      try {
        scene.textures.addImage(key, img);
        added = true;
      } catch (e) {
        console.warn(`[lazyTexture] 텍스처 등록 실패: ${key}`, e);
        if (onFail) onFail(key);
        return;
      }
    }
    if (alive && onDone) onDone(key, added);
  };
  img.onerror = () => {
    console.warn(`[lazyTexture] 로드 실패, 폴백 유지: ${key} (${path})`);
    if (onFail) onFail(key);
  };
  img.src = path;
  return false;
}

export default { lazyTexturePath, ensureTextureFromPath };
