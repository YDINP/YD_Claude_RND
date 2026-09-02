/**
 * boot-smoke.mjs — 앱 부팅 스모크 테스트
 *
 * 목적: 모듈 초기화 시점 평가(TDZ)나 순환 의존으로 부팅이 깨지는 회귀를 즉시 잡는다.
 * 실제 사례: gameConfig.js가 최상단에서 씬들을 import하므로, 씬 그래프에 속한 모듈이
 *           모듈 스코프에서 COLORS를 평가하면 "Cannot access 'COLORS' before initialization"으로
 *           앱 전체가 부팅 실패한다. 유닛 테스트와 빌드로는 잡히지 않는다.
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/boot-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BOOT_TIMEOUT_MS = 20000;

/** 부팅과 무관한 잡음은 실패로 세지 않는다 */
const IGNORED_PATTERNS = [
  /favicon/i,
  /\[vite\]/i,
  /Download the React DevTools/i,
  /supabase/i,          // 오프라인 환경에서 네트워크 경고 발생 가능
  /net::ERR_/i,
];

function isIgnored(text) {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnored(text)) consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (!isIgnored(text)) pageErrors.push(text);
  });

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

  try {
    console.log(`\n=== 부팅 스모크 (${BASE_URL}) ===\n`);

    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    assert(!!response && response.ok(), 'HTTP 응답 정상', response ? `status ${response.status()}` : 'no response');

    // Phaser 게임 인스턴스 생성 대기 (main.js가 window.game에 노출)
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

    const canvasExists = await page.evaluate(() => !!document.querySelector('canvas'));
    assert(canvasExists, '캔버스 렌더링 확인');

    // 부팅 후 첫 씬이 실제로 활성화되는지 확인
    const activeScenes = gameReady
      ? await page.evaluate(() =>
          window.game.scene.scenes
            .filter((sc) => window.game.scene.isActive(sc.scene.key))
            .map((sc) => sc.scene.key)
        )
      : [];
    assert(activeScenes.length > 0, '부팅 후 활성 씬 존재', `active=[${activeScenes.join(', ')}]`);
    if (activeScenes.length > 0) console.log(`   활성 씬: ${activeScenes.join(', ')}`);

    // 초기 렌더 이후 지연 발생 에러까지 수집
    await page.waitForTimeout(3000);

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
    assert(consoleErrors.length === 0, '콘솔 에러 0건', consoleErrors.join(' | '));

    if (pageErrors.length > 0) {
      console.log('\n--- pageerror ---');
      pageErrors.forEach((e) => console.log(`  ${e}`));
    }
    if (consoleErrors.length > 0) {
      console.log('\n--- console.error ---');
      consoleErrors.forEach((e) => console.log(`  ${e}`));
    }
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('스모크 테스트 실행 실패:', err);
  process.exit(1);
});
