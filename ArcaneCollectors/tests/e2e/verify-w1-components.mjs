/**
 * W1 렌더 경로 검증 — createSceneBg / GlassPanel.create 를 실제 Phaser 씬에서 호출한다.
 * 순수 함수는 vitest 가 맡고, 여기서는 Phaser 를 실제로 태우는 경로만 본다.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.game && window.game.scene && window.game.scene.scenes.length), { timeout: 20000 });

const result = await page.evaluate(async () => {
  const game = window.game;
  const scene = game.scene.scenes.find((sc) => game.scene.isActive(sc.scene.key));

  const loadImage = (key, url) => new Promise((resolve) => {
    if (scene.textures.exists(key)) return resolve(true);
    scene.load.image(key, url);
    scene.load.once('complete', () => resolve(scene.textures.exists(key)));
    scene.load.once('loaderror', () => resolve(false));
    scene.load.start();
  });

  const loadedBg = await loadImage('bg_main', 'assets/backgrounds/scenes/bg_main.png');
  const loadedBlur = await loadImage('bg_main_blur', 'assets/backgrounds/scenes/bg_main_blur.png');

  const { BackgroundFactory } = await import('/src/utils/BackgroundFactory.js');
  const { GlassPanel } = await import('/src/components/GlassPanel.js');
  const { NineSliceFrame } = await import('/src/components/NineSliceFrame.js');

  const withImage = BackgroundFactory.createSceneBg(scene, 'main');
  const fallback = BackgroundFactory.createSceneBg(scene, 'chapter_9');

  const glass = GlassPanel.create(scene, {
    x: 540, y: 960, w: 600, h: 300, variant: 'panel', bgKey: 'bg_main', tint: 0x4A90D9
  });
  const glassNoBg = GlassPanel.create(scene, {
    x: 540, y: 400, w: 600, h: 300, variant: 'popup', bgKey: 'bg_missing_xyz'
  });

  const frameFallback = NineSliceFrame.create(scene, { x: 540, y: 1500, w: 400, h: 200, key: 'frame_panel' });

  return {
    loadedBg,
    loadedBlur,
    bgHasImage: withImage.hasImage,
    bgBlurKey: withImage.blurKey,
    bgDisplayHeight: Math.round(withImage.image.displayHeight),
    bgDisplayWidth: Math.round(withImage.image.displayWidth),
    bgDimAlpha: withImage.dim ? withImage.dim.alpha : null,
    fallbackHasImage: fallback.hasImage,
    fallbackDrew: !!fallback.fallback,
    glassUseBackdrop: glass.glassSpec.useBackdrop,
    glassTintAlpha: glass.glassSpec.tintAlpha,
    glassOutlineColor: glass.glassSpec.outline.color,
    glassChildren: glass.list.length,
    glassNoBgUseBackdrop: glassNoBg.glassSpec.useBackdrop,
    glassNoBgTintAlpha: glassNoBg.glassSpec.tintAlpha,
    glassNoBgChildren: glassNoBg.list.length,
    frameIsFallback: frameFallback.isFallback
  };
});

await page.waitForTimeout(1000);
await browser.close();

const checks = [
  ['bg_main 텍스처 로드', result.loadedBg === true],
  ['bg_main_blur 페어 로드', result.loadedBlur === true],
  ['createSceneBg 이미지 경로', result.bgHasImage === true],
  ['블러 페어 등록', result.bgBlurKey === 'bg_main_blur'],
  ['cover-fit 세로 충족 (1920)', result.bgDisplayHeight === 1920],
  ['cover-fit 가로 초과 (>1080)', result.bgDisplayWidth > 1080],
  ['딤 레이어 생성', result.bgDimAlpha !== null],
  ['텍스처 없는 키는 프로시저럴 폴백', result.fallbackHasImage === false && result.fallbackDrew === true],
  ['GlassPanel 블러 백드롭 사용', result.glassUseBackdrop === true],
  ['글래스 틴트 알파 0.55', result.glassTintAlpha === 0.55],
  ['교단색 아웃라인 적용', result.glassOutlineColor === 0x4A90D9],
  ['5겹 중 4겹 생성 (백드롭+틴트+림+아웃라인)', result.glassChildren === 4],
  ['블러본 없으면 백드롭 생략', result.glassNoBgUseBackdrop === false],
  ['폴백 시 틴트 알파 상승 (popup 0.92)', result.glassNoBgTintAlpha === 0.92],
  ['폴백은 3겹 (틴트+림+아웃라인)', result.glassNoBgChildren === 3],
  ['텍스처 없는 9-slice 는 폴백 프레임', result.frameIsFallback === true],
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
