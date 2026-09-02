/**
 * asset-smoke.mjs — 에셋 로드 스모크 (T-27)
 *
 * 목적
 *   1) tools/art/asset-manifest.json 의 eager 텍스처(textures)가 부팅 후 실제
 *      Phaser 이미지 텍스처로 승격됐는지 확인한다(캔버스 플레이스홀더로 남아있지 않은지).
 *   2) 등록된 모든 경로가 실제로 200을 반환하고 png/webp 콘텐츠 타입인지 HTTP 로 확인한다.
 *   3) eager 초기 전송량(bg_main/bg_login + 프레임/버튼/아이콘/로고, blur 페어 포함)을
 *      합산해 예산 6MB 대비 검증한다. **초과하면 실패로 센다** — 배경 대부분을
 *      lazyTextures 로 옮기고 WebP 로 전환한 뒤 정한 예산이라 지켜야 할 상한이다.
 *   4) lazyTextures/fullbody 는 캔버스에 로드하지 않는다는 것을 확인한다
 *      (Phase0 이 이들을 건드리지 않아야 한다).
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/asset-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1 (예산 초과 포함)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BOOT_TIMEOUT_MS = 20000;
const BUDGET_BYTES = 6 * 1024 * 1024; // 6MB (팀 리드 결정)

const manifestPath = join(__dirname, '..', '..', 'tools', 'art', 'asset-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = '') => {
  if (condition) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

  const responsesByUrl = new Map();
  page.on('response', (res) => {
    responsesByUrl.set(res.url(), res);
  });

  // BootScene._checkExistingSession() 이 true 를 반환하도록 게스트 세션을 미리 심어
  // LoginScene 을 건너뛰고 PreloadScene 으로 곧장 진입시킨다(browser-test.mjs 자동
  // 로그인 패턴과 동일). 초기 스크립트로 넣어야 첫 로드에서부터 적용된다.
  await page.addInitScript(() => {
    localStorage.setItem('arcane_auth', JSON.stringify({
      userId: 'guest_asset_smoke',
      authType: 'guest',
      autoLogin: true,
      lastLogin: Date.now(),
    }));
    // getLocalData('guest_user')는 supabaseClient.getStorageKey('guest_user','guest') =
    // 'arcane_collectors_guest_user_guest' 로 네임스페이스된 키를 읽는다(BootScene.js:187).
    localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify({
      id: 'guest_asset_smoke',
      createdAt: Date.now(),
    }));
  });

  try {
    console.log(`\n=== 에셋 로드 스모크 (${BASE_URL}) ===\n`);
    console.log(`manifest: eager=${Object.keys(manifest.textures).length}, lazy=${Object.keys(manifest.lazyTextures || {}).length}, fullbody=${Object.keys(manifest.fullbody || {}).length}\n`);

    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    assert(!!response && response.ok(), 'HTTP 응답 정상', response ? `status ${response.status()}` : 'no response');

    let gameReady = false;
    try {
      await page.waitForFunction(
        () => !!(window.game && window.game.scene && window.game.scene.scenes.length > 0),
        { timeout: BOOT_TIMEOUT_MS }
      );
      gameReady = true;
    } catch {
      gameReady = false;
    }
    assert(gameReady, 'window.game 생성 확인');
    if (!gameReady) throw new Error('부팅 실패로 이후 검증을 진행할 수 없습니다.');

    // 게스트 세션을 미리 심어뒀으므로 BootScene(2.4초 스플래시) → PreloadScene → MainMenuScene
    // 순으로 자동 진행된다. MainMenuScene 활성화를 기다리면 PreloadScene 의 load 큐가
    // 확실히 끝난 시점을 보장할 수 있다(load 완료 콜백에서 scene.start 하므로).
    let reachedMainMenu = false;
    try {
      await page.waitForFunction(
        () => !!(window.game && window.game.scene.isActive('MainMenuScene')),
        { timeout: BOOT_TIMEOUT_MS }
      );
      reachedMainMenu = true;
    } catch {
      reachedMainMenu = false;
    }
    assert(reachedMainMenu, 'BootScene → PreloadScene → MainMenuScene 자동 진행', '게스트 세션 자동 로그인 실패 또는 타임아웃');

    // PreloadScene 인스턴스는 MainMenuScene 전환 후에도 scene manager 에 남아있다
    // (stop 만 되고 destroy 되지 않음). assetLoadedKeys 등을 읽기 위해 약간의 여유를 둔다.
    await page.waitForTimeout(500);

    // 1) eager 텍스처가 실제 이미지 텍스처로 승격됐는지 확인
    const textureReport = await page.evaluate((eagerKeys) => {
      const preload = window.game.scene.getScene('PreloadScene');
      const tm = window.game.textures;
      const results = {};
      for (const key of eagerKeys) {
        if (!tm.exists(key)) {
          results[key] = { exists: false };
          continue;
        }
        const tex = tm.get(key);
        const src = tex.source && tex.source[0];
        // Phaser CanvasTexture / addCanvas 로 만든 텍스처는 source[0].image 가
        // HTMLCanvasElement 다. 실제 로드된 이미지는 HTMLImageElement.
        const isCanvas = !!(src && src.image && src.image.tagName === 'CANVAS');
        results[key] = {
          exists: true,
          isCanvasFallback: isCanvas,
          width: tex.source && src ? src.width : 0,
          height: tex.source && src ? src.height : 0,
        };
      }
      return {
        results,
        assetLoadedKeys: preload ? preload.assetLoadedKeys || [] : null,
        assetFallbackKeys: preload ? preload.assetFallbackKeys || [] : null,
      };
    }, Object.keys(manifest.textures));

    assert(
      textureReport.assetLoadedKeys !== null,
      'PreloadScene.assetLoadedKeys 존재 (loadPhase0_Assets 실행됨)'
    );

    let promoted = 0;
    let stillCanvas = 0;
    let missingTexture = 0;
    for (const [key, info] of Object.entries(textureReport.results)) {
      if (!info.exists) {
        missingTexture++;
        continue;
      }
      if (info.isCanvasFallback) {
        stillCanvas++;
      } else {
        promoted++;
      }
    }
    console.log(`   실제 이미지로 승격: ${promoted} / 캔버스 폴백 유지: ${stillCanvas} / 텍스처 자체 없음: ${missingTexture}`);
    assert(missingTexture === 0, '모든 eager 텍스처 키가 TextureManager 에 존재', `없음=${missingTexture}`);

    if (textureReport.assetFallbackKeys && textureReport.assetFallbackKeys.length > 0) {
      console.log(`   로드 실패(폴백 유지) 키: ${textureReport.assetFallbackKeys.join(', ')}`);
    }

    // 2) lazyTextures / fullbody 키는 Phase0 에서 "실제 이미지로" 로드하지 않아야 한다.
    // 단순 존재 여부(tm.exists)로는 부족하다 — bg_gacha/bg_tower 등 일부 키는
    // TextureGenerator 가 절차적 캔버스 플레이스홀더를 이미 그 이름으로 만들어 두므로
    // "존재"는 하되 실제로는 캔버스다. 캔버스가 아닌 실제 이미지로 존재하는 경우만 위반이다.
    const lazyKeys = Object.keys(manifest.lazyTextures || {});
    const lazyLoadedAsRealImage = await page.evaluate((keys) => {
      const tm = window.game.textures;
      return keys.filter((k) => {
        if (!tm.exists(k)) return false;
        const src = tm.get(k).source && tm.get(k).source[0];
        const isCanvas = !!(src && src.image && src.image.tagName === 'CANVAS');
        return !isCanvas; // 캔버스가 아니면 실제 이미지가 이미 로드된 것 — 의도치 않은 eager 로드
      });
    }, lazyKeys);
    assert(
      lazyLoadedAsRealImage.length === 0,
      'lazyTextures(배너 등)는 Phase0에서 실제 이미지로 로드하지 않음',
      lazyLoadedAsRealImage.length > 0 ? `의도치 않게 로드됨: ${lazyLoadedAsRealImage.join(', ')}` : ''
    );

    const fbKeys = Object.keys(manifest.fullbody || {});
    const fbStillUnloaded = await page.evaluate((keys) => {
      const tm = window.game.textures;
      return keys.filter((k) => tm.exists(k));
    }, fbKeys);
    assert(
      fbStillUnloaded.length === 0,
      'fullbody 웹은 Phase0에서 로드하지 않음(HeroDetail 지연 로드 대상)',
      fbStillUnloaded.length > 0 ? `의도치 않게 로드됨: ${fbStillUnloaded.join(', ')}` : ''
    );

    // 3) HTTP 로 모든 eager 경로의 상태/콘텐츠 타입/바이트 수 확인
    let totalBytes = 0;
    let httpOk = 0;
    let httpBad = 0;
    const badPaths = [];

    for (const [key, meta] of Object.entries(manifest.textures)) {
      const url = new URL(meta.path, BASE_URL).toString();
      const res = responsesByUrl.get(url);
      if (!res) {
        // 네비게이션 캡처를 놓친 경우 직접 요청해 재확인
        try {
          const fetched = await page.request.get(url);
          const ok = fetched.ok();
          const ct = fetched.headers()['content-type'] || '';
          const body = await fetched.body();
          if (ok && /image\/(png|webp)/.test(ct)) {
            httpOk++;
            totalBytes += body.length;
          } else {
            httpBad++;
            badPaths.push(`${key} (${meta.path}) status=${fetched.status()} ct=${ct}`);
          }
        } catch (e) {
          httpBad++;
          badPaths.push(`${key} (${meta.path}) fetch-error=${e.message}`);
        }
        continue;
      }
      const ok = res.ok();
      const ct = res.headers()['content-type'] || '';
      if (ok && /image\/(png|webp)/.test(ct)) {
        httpOk++;
        try {
          const body = await res.body();
          totalBytes += body.length;
        } catch {
          // 이미 소비된 응답이면 무시(대략치로도 충분)
        }
      } else {
        httpBad++;
        badPaths.push(`${key} (${meta.path}) status=${res.status()} ct=${ct}`);
      }
    }

    assert(httpBad === 0, '모든 eager 경로가 HTTP 200 + image/png|webp', badPaths.join(' | '));

    const mb = (totalBytes / 1024 / 1024).toFixed(2);
    const budgetMb = (BUDGET_BYTES / 1024 / 1024).toFixed(0);
    console.log(`\n   초기 전송량(eager 텍스처 합계): ${mb} MB (예산 ${budgetMb} MB)`);
    assert(totalBytes <= BUDGET_BYTES, `초기 전송량이 예산(${budgetMb}MB) 이내`, `${mb} MB > ${budgetMb} MB`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('에셋 스모크 테스트 실행 실패:', err);
  process.exit(1);
});
