/**
 * capture-gacha-after.mjs — 소환 화면 리디자인(T-12/T-14) 실화면 캡처
 *
 * 실행: node tools/art/capture-gacha-after.mjs   (사전: vite 서버 기동, 기본 3000)
 * 산출: docs/redesign/screenshots/after/gacha-*.png
 *
 * SSR 컷인은 확률에 기대지 않는다. GachaResultOverlay 를 SSR 결과로 직접 구동해
 * 컷인 단계가 그려지는 순간을 잡는다(연출 코드 경로는 실제 소환과 동일하다).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const saved = [];
const checks = [];

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  saved.push(name);
  log(`  [shot] ${name}.png`);
}

/**
 * 튜토리얼 프롤로그 컷씬이 떠 있으면 전부 건너뛴다.
 * MainMenuScene 을 새로 시작하면 T-01 컷씬이 자동 재생돼 팝업 위를 덮는다.
 */
async function dismissCutscene(page) {
  for (let i = 0; i < 12; i++) {
    const up = await page.evaluate(() => !!window.game && window.game.scene.isActive('CutsceneScene'));
    if (!up) return true;
    await page.evaluate(() => {
      const cs = window.game.scene.getScene('CutsceneScene');
      if (cs?.player?.skipAll) cs.player.skipAll();
      else cs?.close?.();
    });
    await page.waitForTimeout(500);
  }
  return !(await page.evaluate(() => !!window.game && window.game.scene.isActive('CutsceneScene')));
}

async function waitFor(page, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); log(`  [err] ${e.message.slice(0, 160)}`); });
page.on('console', (m) => { if (m.type() === 'error') log(`  [console] ${m.text().slice(0, 160)}`); });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 20000);

  // 게스트 로그인으로 세이브를 만든다
  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`, 20000);
  await page.evaluate(() => {
    const s = window.game.scene.getScene('LoginScene');
    if (s && s._handleGuestLogin) s._handleGuestLogin();
  });
  await page.waitForTimeout(2500);

  // 재화를 넉넉히 채운다 (소환 버튼이 활성 상태로 보여야 한다)
  await page.evaluate(() => {
    const KEY = 'arcane_collectors_save';
    const save = JSON.parse(localStorage.getItem(KEY) || '{}');
    save.resources = save.resources || {};
    save.resources.gems = 30000;
    save.resources.summonTickets = 25;
    save.resources.energy = 999;
    localStorage.setItem(KEY, JSON.stringify(save));
  });

  // --- 1. 소환 화면 ---
  await page.evaluate(() => {
    const g = window.game;
    g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key));
    g.scene.start('GachaScene');
  });
  await waitFor(page, `window.game.scene.isActive('GachaScene')`, 20000);
  await page.waitForTimeout(3200); // 배너 일러스트/전신 지연 로드 대기
  await shot(page, 'gacha-summon');

  // --- 2. SSR 컷인 ---
  await page.evaluate(async () => {
    const mod = await import('/src/components/GachaResultOverlay.js');
    const scene = window.game.scene.getScene('GachaScene');
    const results = [
      { id: 'asc_iris_olympus', name: '올림푸스의 아이리스', rarity: 'SSR', stars: 5, isNew: true, cult: 'olympus' }
    ];
    // 컷인 순간을 확실히 잡기 위해 그 단계만 길게 잡는다 (연출 코드 경로는 동일)
    window.__capOverlay = new mod.GachaResultOverlay(scene, { durations: { cutin: 4000 } });
    window.__capOverlay.show(results);
  });
  // Phaser 시간은 프레임 델타 누적이라 헤드리스에서 실제 시간보다 느리게 흐른다.
  // 벽시계로 기다리지 말고 단계 상태를 직접 본다.
  const reachedCutin = await waitFor(page, () => window.__capOverlay?.state?.stageId === 'cutin', 20000);
  if (!reachedCutin) log('  [warn] 컷인 단계에 도달하지 못했다');
  await page.waitForTimeout(700); // 컷인 등장 트윈이 자리를 잡을 때까지
  await shot(page, 'gacha-ssr-cutin');
  await page.evaluate(() => { if (window.__capOverlay) window.__capOverlay.destroy(); });
  await page.waitForTimeout(600);

  // --- 3. 10연 결과 그리드 (실제 소환) ---
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('GachaScene');
    scene.performGachaPull(10);
  });
  const settled = await waitFor(page, () => !!window.game.scene.getScene('GachaScene').resultOverlay?.isSettled, 30000);
  if (!settled) log('  [warn] 10연 결과 그리드에 도달하지 못했다');
  await page.waitForTimeout(700);
  await shot(page, 'gacha-ten-result');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('GachaScene');
    if (scene.resultOverlay) scene.resultOverlay.destroy();
  });
  await page.waitForTimeout(500);

  // --- 4. 소환 팝업 (메인 메뉴 경로) ---
  await page.evaluate(async () => {
    const g = window.game;
    g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key));
    g.scene.start('MainMenuScene');
  });
  await waitFor(page, `window.game.scene.isActive('MainMenuScene')`, 20000);
  await page.waitForTimeout(2000);
  checks.push(['프롤로그 컷씬 정리', await dismissCutscene(page)]);
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const mod = await import('/src/components/popups/GachaPopup.js');
    const scene = window.game.scene.getScene('MainMenuScene');
    window.__capPopup = new mod.GachaPopup(scene);
    window.__capPopup.open({ onboarding: false });
  });
  await page.waitForTimeout(3000);
  await shot(page, 'gacha-popup');
  await page.evaluate(() => { if (window.__capPopup) window.__capPopup.destroy(); });
  await page.waitForTimeout(500);

  // --- 5. 온보딩 모드 팝업 (T-05 보존 확인) ---
  // 앞의 10연이 무료 10연 플래그를 소모했다. SaveManager 는 세이브를 메모리에 들고 있어
  // localStorage 만 고쳐서는 되돌아가지 않으므로 SaveManager API 로 되돌린다.
  // (페이지를 새로 띄우면 튜토리얼 T-01 프롤로그 컷씬이 올라와 팝업을 덮는다)
  await page.evaluate(async () => {
    const m = await import('/src/systems/SaveManager.js');
    m.SaveManager.saveGachaInfo({ freeTenPullUsed: false });
  });
  await page.waitForTimeout(300);

  await page.evaluate(async () => {
    const mod = await import('/src/components/popups/GachaPopup.js');
    const scene = window.game.scene.getScene('MainMenuScene');
    window.__capPopup2 = new mod.GachaPopup(scene);
    window.__capPopup2.open({ onboarding: true });
  });
  await page.waitForTimeout(2600);
  await shot(page, 'gacha-popup-onboarding');

  const state = await page.evaluate(() => {
    const reg = window.__capTargetRegistry;
    return {
      onboarding: !!window.__capPopup2?.onboarding,
      closeEnabled: window.__capPopup2?.closeBtn?.input?.enabled === true,
      overlayLocked: window.__capPopup2?.overlay?.input?.enabled === true,
      hasRegistryTarget: !!reg
    };
  });
  log(`  [check] 온보딩 모드=${state.onboarding} · 닫기잠금=${state.closeEnabled === false} · 오버레이잠금=${state.overlayLocked === false}`);
  checks.push(['온보딩 모드 유지', state.onboarding === true]);
  checks.push(['닫기(✕) 잠금', state.closeEnabled === false]);
  checks.push(['오버레이 클릭 잠금', state.overlayLocked === false]);

  // --- 6. T-05 회귀 확인 ---
  // 온보딩 e2e(tests/e2e/onboarding-full.mjs)는 무료 10연 실행 후 6초 안에
  // '확인' 라벨을 찾아 탭한다. 그 예산을 실제로 지키는지 여기서 직접 잰다.
  const targetBox = await page.evaluate(async () => {
    const mod = await import('/src/systems/TutorialTargetRegistry.js');
    const res = mod.TutorialTargetRegistry.resolve('gacha.button.multi_ticket');
    if (res && res.bounds) return { ...res.bounds, tier: res.tier };
    // 폴백: 버튼 텍스트로 찾는다
    const scene = window.game.scene.getScene('MainMenuScene');
    const all = [];
    const walk = (list) => list.forEach((o) => { all.push(o); if (o.type === 'Container' && o.list) walk(o.list); });
    walk(scene.children.list);
    const hit = all.find((o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes('무료 10연'));
    if (!hit) return null;
    const b = hit.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  checks.push([
    `튜토리얼 타깃 gacha.button.multi_ticket 등록 (tier ${targetBox?.tier ?? '-'})`,
    !!targetBox
  ]);

  {
    // 실제 탭 대신 팝업 메서드를 직접 부른다.
    // 이 하네스는 튜토리얼 T-03 상태에서 팝업만 띄운 것이라 마스킹 홀이 다른 곳에 뚫려 있고,
    // 좌표 탭은 그 마스크에 먹힌다. 재고 싶은 것은 "무료 10연 실행 → '확인' 노출까지의 시간" 이다.
    const t0 = Date.now();
    await page.evaluate(() => window.__capPopup2.performFreeTenPull());

    const foundConfirm = await waitFor(page, () => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const all = [];
      const walk = (list) => list.forEach((o) => { if (!o) return; all.push(o); if (o.type === 'Container' && o.list) walk(o.list); });
      walk(scene.children.list);
      return all.some((o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes('확인') && o.visible !== false);
    }, 6000);
    const elapsed = Date.now() - t0;
    log(`  [check] 무료 10연 후 '확인' 노출까지 ${elapsed}ms (e2e 예산 6000ms)`);
    checks.push([`무료 10연 결과 '확인' 6초 내 노출 (${elapsed}ms)`, foundConfirm]);

    const pulled = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
      return save.gacha?.freeTenPullUsed === true;
    });
    checks.push(['무료 10연 실행 기록 (freeTenPullUsed)', pulled]);
    await shot(page, 'gacha-onboarding-result');
  }

  log('');
  checks.forEach(([name, ok]) => log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`));
  const failed = checks.filter(([, ok]) => !ok).length;
  log(`\n캡처 ${saved.length}장: ${saved.join(', ')}`);
  log(`검증 ${checks.length - failed} passed, ${failed} failed · 페이지 예외 ${errors.length}건`);
  process.exitCode = errors.length === 0 && failed === 0 && saved.length >= 5 ? 0 : 1;
} catch (e) {
  log(`실패: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
