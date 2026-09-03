/**
 * capture-hero-info-popup.mjs — 영웅 정보 팝업(T-15b) 재작성 후 실화면 캡처 + 겹침 검사
 * 실행: CAP_BASE_URL=http://localhost:3000 node tools/art/capture-hero-info-popup.mjs
 * 사전: vite 개발 서버 기동
 *
 * 기본 영웅과 전직 영웅을 각각 열어 캡처하고, 콘텐츠 슬롯 안의 Text 오브젝트
 * 실제 bounds 가 하나도 교차하지 않는지 확인한다.
 * (단위 테스트는 계산된 사각형을, 여기서는 렌더된 글자 상자를 본다)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const BASE_HERO = 'base_iris';
const ASCENDED_HERO = 'asc_iris_olympus';

const log = (...a) => console.log(...a);
const pageErrors = [];
let pass = 0;
let fail = 0;
const assert = (cond, name, detail = '') => {
  if (cond) { pass += 1; log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function waitFor(page, fn, timeout = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* reload 중 */ }
    await page.waitForTimeout(150);
  }
  return false;
}

/** 팝업을 열고 콘텐츠 Text bounds 를 모아 온다 */
async function openPopup(page, heroId) {
  // MainMenuScene.create() 가 끝나야 heroPopup 인스턴스가 생긴다.
  // isActive 와 create 완료 사이에 틈이 있어 존재를 따로 기다린다.
  const ready = await waitFor(
    page,
    `!!window.game.scene.getScene('MainMenuScene')?.heroPopup`,
    20000
  );
  if (!ready) return false;

  await page.evaluate((id) => {
    const scene = window.game.scene.getScene('MainMenuScene');
    if (scene.heroPopup && scene.heroPopup.isVisible()) scene.heroPopup.destroy();
    scene.heroPopup.show(id);
  }, heroId);

  const ok = await waitFor(
    page,
    `!!(window.game.scene.getScene('MainMenuScene').heroPopup || {}).isOpen`,
    15000
  );
  await page.waitForTimeout(1800);
  return ok;
}

/** 콘텐츠 컨테이너 안의 Text 실제 bounds */
async function readTextBounds(page) {
  return page.evaluate(() => {
    const popup = window.game.scene.getScene('MainMenuScene').heroPopup;
    if (!popup || !popup.contentContainer) return [];
    return popup.contentContainer.list
      .filter((obj) => obj.type === 'Text' && obj.text && obj.text.length > 0)
      .map((obj) => {
        const b = obj.getBounds();
        return { text: obj.text.slice(0, 14), x: b.x, y: b.y, w: b.width, h: b.height };
      });
  });
}

/** 교차하는 텍스트 쌍을 찾는다. 맞닿기는 교차가 아니다 */
function findTextOverlap(boxes) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        return { a, b };
      }
    }
  }
  return null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  if (!await waitFor(page, `!!(window.game && window.game.scene.isActive('LoginScene'))`)) {
    throw new Error('LoginScene 도달 실패');
  }
  await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());

  if (!await waitFor(page, `!!(window.game && window.game.scene.isActive('MainMenuScene'))`, 60000)) {
    throw new Error('MainMenuScene 도달 실패');
  }

  // 신규 세이브는 프롤로그 컷신과 튜토리얼이 화면을 덮는다. 완료 처리 후 다시 들어간다
  // (popup-title-check.tmp.mjs 와 같은 방식).
  await page.evaluate(() => {
    const key = 'arcane_collectors_save';
    const save = JSON.parse(localStorage.getItem(key));
    save.tutorial = { ...(save.tutorial || {}), completed: true, currentStep: null };
    save.progress = {
      ...(save.progress || {}),
      clearedStages: { '1-1': 3, '1-2': 2, '1-3': 2, '1-4': 1 },
      totalBattles: 20
    };
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, `!!(window.game && window.game.scene.isActive('LoginScene'))`);
  await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  if (!await waitFor(page, `!!(window.game && window.game.scene.isActive('MainMenuScene'))`, 60000)) {
    throw new Error('MainMenuScene 재진입 실패');
  }
  await page.waitForTimeout(2500);

  for (const [heroId, file, label] of [
    [BASE_HERO, 'hero-info-popup', '기본 영웅'],
    [ASCENDED_HERO, 'hero-info-popup-ascended', '전직 영웅']
  ]) {
    const opened = await openPopup(page, heroId);
    assert(opened, `${label} 팝업 열림`, heroId);
    if (!opened) continue;

    await page.screenshot({ path: path.join(OUT, `${file}.png`) });
    log(`  [shot] ${file}.png`);

    const boxes = await readTextBounds(page);
    assert(boxes.length >= 10, `${label} 콘텐츠 텍스트 수집`, `${boxes.length}개`);

    const hit = findTextOverlap(boxes);
    assert(!hit, `${label} 텍스트 bounds 교차 0건`,
      hit ? `"${hit.a.text}" × "${hit.b.text}"` : `${boxes.length}개 검사`);

    // 콘텐츠가 액션 바를 침범하지 않는가
    const slotCheck = await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').heroPopup;
      const content = popup.getContentBounds();
      const actions = popup.slots.actions;
      const over = popup.contentContainer.list
        .filter((o) => o.type === 'Text')
        .map((o) => o.getBounds())
        .filter((b) => b.y + b.height > content.bottom + 1);
      return { overflow: over.length, contentBottom: content.bottom, actionTop: actions ? actions.top : null };
    });
    assert(slotCheck.overflow === 0, `${label} 콘텐츠가 액션 바를 침범하지 않음`,
      `넘침 ${slotCheck.overflow}건`);
  }

  const fbKeys = await page.evaluate(() =>
    window.game.textures.getTextureKeys().filter((k) => k.startsWith('fb_')));
  log(`  전신 텍스처: ${fbKeys.join(', ') || '없음'}`);

  assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
