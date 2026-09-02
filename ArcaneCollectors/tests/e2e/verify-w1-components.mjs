/**
 * W1 렌더 경로 검증 — createSceneBg / GlassPanel.create / NineSliceFrame.create 를
 * 실제 Phaser 씬에서 호출한다. 순수 함수는 vitest 가 맡고, 여기서는 Phaser 를 태우는
 * 경로만 본다.
 *
 * 에셋 경로는 tools/art/asset-manifest.json 에서 읽는다. 확장자를 하드코딩하면
 * 아트 파이프라인이 재인코딩할 때(png -> webp) 조용히 404 로 무너진다.
 *
 * 텍스처는 임시 키로 받아 renameTexture 로 승격시킨다. TextureGenerator 가 같은 키로
 * 캔버스 플레이스홀더를 만들어 두면 TextureManager 가 키 충돌로 실이미지를 버리기
 * 때문이다. 프로덕션의 BackgroundFactory._loadLazyBg() 와 같은 방식이다.
 *
 * 사전 조건: 개발 서버 실행 중 (http://localhost:3000)
 * 실행: node tests/e2e/verify-w1-components.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BOOT_TIMEOUT_MS = 20000;

const MANIFEST = JSON.parse(
  readFileSync(resolve(__dirname, '../../tools/art/asset-manifest.json'), 'utf-8')
);

/** 매니페스트에서 텍스처 경로를 찾는다. eager(textures)와 lazyTextures 양쪽을 본다. */
function manifestEntry(key) {
  const eager = MANIFEST.textures || {};
  const lazy = MANIFEST.lazyTextures || {};
  return eager[key] || lazy[key] || null;
}

function requirePath(key) {
  const entry = manifestEntry(key);
  if (!entry || !entry.path) {
    throw new Error(`asset-manifest.json 에 ${key} 항목이 없습니다. 아트 파이프라인 확인 필요`);
  }
  return entry.path;
}

const ASSET_PATHS = {
  bg_main: requirePath('bg_main'),
  bg_main_blur: requirePath('bg_main_blur'),
  frame_panel: requirePath('frame_panel')
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => !!(window.game && window.game.scene && window.game.scene.scenes.length),
  { timeout: BOOT_TIMEOUT_MS }
);
// 부팅 직후 씬 전환(BootScene -> LoginScene)이 끝날 때까지 기다린다
await page.waitForFunction(
  () => window.game.scene.scenes.some((sc) => window.game.scene.isActive(sc.scene.key) && sc.sys.isVisible()),
  { timeout: BOOT_TIMEOUT_MS }
);

const result = await page.evaluate(async (paths) => {
  const game = window.game;
  const active = game.scene.scenes.filter((sc) => game.scene.isActive(sc.scene.key));
  const scene = active[active.length - 1];
  const TEMP_PREFIX = '__verify__';

  const isCanvasTexture = (key) => {
    const tex = game.textures.get(key);
    const src = tex && tex.source && tex.source[0];
    return !!(src && src.image && src.image.tagName === 'CANVAS');
  };

  /**
   * 임시 키로 로드한 뒤 실제 키로 승격시킨다. 캔버스 플레이스홀더가 이미 있어도
   * 실이미지가 이기도록 보장한다.
   */
  const ensureRealTexture = (key, path) => new Promise((resolveLoad) => {
    if (game.textures.exists(key) && !isCanvasTexture(key)) return resolveLoad(true);

    const tempKey = TEMP_PREFIX + key;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (!game.textures.exists(tempKey)) return resolveLoad(false);
      if (game.textures.exists(key)) game.textures.remove(key);
      game.textures.renameTexture(tempKey, key);
      resolveLoad(game.textures.exists(key) && !isCanvasTexture(key));
    };

    scene.load.image(tempKey, path);
    scene.load.once('complete', finish);
    scene.load.once('loaderror', () => setTimeout(finish, 0));
    scene.load.start();
    setTimeout(finish, 8000);
  });

  const loadedBg = await ensureRealTexture('bg_main', paths.bg_main);
  const loadedBlur = await ensureRealTexture('bg_main_blur', paths.bg_main_blur);
  const loadedFrame = await ensureRealTexture('frame_panel', paths.frame_panel);

  const { BackgroundFactory } = await import('/src/utils/BackgroundFactory.js');
  const { GlassPanel } = await import('/src/components/GlassPanel.js');
  const { NineSliceFrame } = await import('/src/components/NineSliceFrame.js');

  const withImage = BackgroundFactory.createSceneBg(scene, 'main');
  // 매니페스트에 없는 키 — 지연 로드 대상이 아니므로 프로시저럴 폴백에 머문다
  const fallback = BackgroundFactory.createSceneBg(scene, 'chapter_9');

  const glass = GlassPanel.create(scene, {
    x: 540, y: 960, w: 600, h: 300, variant: 'panel', bgKey: 'bg_main', tint: 0x4A90D9
  });
  const glassNoBg = GlassPanel.create(scene, {
    x: 540, y: 400, w: 600, h: 300, variant: 'popup', bgKey: 'bg_missing_xyz'
  });

  const frameReal = NineSliceFrame.create(scene, {
    x: 540, y: 1500, w: 400, h: 300, key: 'frame_panel'
  });
  const frameMissing = NineSliceFrame.create(scene, {
    x: 540, y: 1500, w: 400, h: 300, key: 'frame_unknown_xyz'
  });

  return {
    sceneKey: scene.scene.key,
    loadedBg,
    loadedBlur,
    loadedFrame,
    bgHasImage: withImage.hasImage,
    bgBlurKey: withImage.blurKey,
    bgDisplayHeight: withImage.image ? Math.round(withImage.image.displayHeight) : null,
    bgDisplayWidth: withImage.image ? Math.round(withImage.image.displayWidth) : null,
    bgHasDim: !!withImage.dim,
    fallbackHasImage: fallback.hasImage,
    fallbackDrew: !!fallback.fallback,
    glassUseBackdrop: glass.glassSpec.useBackdrop,
    glassTintAlpha: glass.glassSpec.tintAlpha,
    glassOutlineColor: glass.glassSpec.outline.color,
    glassChildren: glass.list.length,
    glassNoBgUseBackdrop: glassNoBg.glassSpec.useBackdrop,
    glassNoBgTintAlpha: glassNoBg.glassSpec.tintAlpha,
    glassNoBgChildren: glassNoBg.list.length,
    frameRealIsFallback: frameReal.isFallback,
    frameRealWidth: Math.round(frameReal.width),
    frameMissingIsFallback: frameMissing.isFallback
  };
}, ASSET_PATHS);

await page.waitForTimeout(1000);
await browser.close();

// 내장 코너 테이블이 아트 파이프라인 산출물과 어긋나지 않는지 대조한다
const manifestNineSlice = manifestEntry('frame_panel').nineSlice;
const tableMatchesManifest = !!manifestNineSlice
  && manifestNineSlice.left === 96 && manifestNineSlice.right === 96
  && manifestNineSlice.top === 96 && manifestNineSlice.bottom === 96;

const checks = [
  ['bg_main 텍스처 로드', result.loadedBg === true],
  ['bg_main_blur 페어 로드', result.loadedBlur === true],
  ['createSceneBg 이미지 경로', result.bgHasImage === true],
  ['블러 페어 등록', result.bgBlurKey === 'bg_main_blur'],
  ['cover-fit 세로 충족 (1920)', result.bgDisplayHeight === 1920],
  ['cover-fit 가로 초과 (>1080)', result.bgDisplayWidth > 1080],
  ['딤 레이어 생성', result.bgHasDim === true],
  ['매니페스트에 없는 키는 프로시저럴 폴백', result.fallbackHasImage === false && result.fallbackDrew === true],
  ['GlassPanel 블러 백드롭 사용', result.glassUseBackdrop === true],
  ['글래스 틴트 알파 0.55', result.glassTintAlpha === 0.55],
  ['교단색 아웃라인 적용', result.glassOutlineColor === 0x4A90D9],
  ['5겹 중 4겹 생성 (백드롭+틴트+림+아웃라인)', result.glassChildren === 4],
  ['블러본 없으면 백드롭 생략', result.glassNoBgUseBackdrop === false],
  ['폴백 시 틴트 알파 상승 (popup 0.92)', result.glassNoBgTintAlpha === 0.92],
  ['폴백은 3겹 (틴트+림+아웃라인)', result.glassNoBgChildren === 3],
  ['frame_panel 텍스처로 9-slice 렌더', result.loadedFrame === true && result.frameRealIsFallback === false],
  ['9-slice 요청 폭 유지 (400)', result.frameRealWidth === 400],
  ['알 수 없는 키는 폴백 프레임', result.frameMissingIsFallback === true],
  ['내장 코너 테이블과 매니페스트 일치', tableMatchesManifest],
  ['처리되지 않은 예외 0건', pageErrors.length === 0]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (pageErrors.length) console.log(pageErrors.join('\n'));
console.log(JSON.stringify(result, null, 1));
console.log(`\n결과: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
