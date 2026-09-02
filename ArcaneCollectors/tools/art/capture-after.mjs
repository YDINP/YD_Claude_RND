/**
 * capture-after.mjs — 리디자인 후(after) 실화면 캡처 (capture-before.mjs와 동일 29장 세트)
 * 실행: node tools/art/capture-after.mjs   (사전: vite 서버 기동, 기본 http://localhost:3000)
 *
 * before 스크립트 대비 차이점: 게스트 신규 계정은 로그인 직후 프롤로그(T-01/T-02) 컷씬이
 * 자동 재생되며 MainMenuScene을 일시정지시킨다. tests/e2e/skip-path-parity.mjs의
 * handleCutsceneIfAny/clearPrologue 패턴을 그대로 가져와 Skip All로 처리한 뒤 진행한다.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after-full');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const saved = [];

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  saved.push(name);
  log(`  [shot] ${name}.png`);
}

async function waitFor(page, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

/** CutsceneScene 이 떠 있으면 Skip All 로 즉시 처리하고, 없으면 즉시 반환한다 (skip-path-parity.mjs 패턴 이식) */
async function skipCutsceneIfAny(page) {
  const up = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), 4000);
  if (!up) return false;
  await page.evaluate(() => window.game.scene.getScene('CutsceneScene')?.player?.skipAll()).catch(() => {});
  await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'), 8000);
  await page.waitForTimeout(200);
  return true;
}

/** 게스트 로그인 직후 프롤로그(T-01/T-02) 컷씬을 전부 Skip All 로 밀어내고 MainMenuScene 안착까지 기다린다 */
async function clearPrologue(page) {
  let handled = 0;
  for (let i = 0; i < 8; i += 1) {
    const done = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save');
      const steps = raw ? (JSON.parse(raw).tutorial?.completedSteps || []) : [];
      return steps.includes('T-01') && steps.includes('T-02');
    }).catch(() => false);
    if (done) break;

    const seen = await skipCutsceneIfAny(page);
    if (seen) handled += 1;
    await page.waitForTimeout(500);
  }
  await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  return handled;
}

async function startScene(page, key, data = null) {
  try {
    await page.evaluate(({ key, data }) => {
      if (!window.game) return;
      const g = window.game;
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== key) g.scene.stop(s.scene.key); });
      g.scene.start(key, data || undefined);
    }, { key, data });
    const ok = await waitFor(page, `!!window.game && window.game.scene.isActive('${key}')`, 12000);
    await page.waitForTimeout(1800);
    return ok;
  } catch (e) { log(`  [err] startScene ${key}: ${String(e).slice(0,120)}`); return false; }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', e => log(`  [err] ${e.message.slice(0, 140)}`));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 20000);
  await page.waitForTimeout(1200);
  await shot(page, '01-boot');

  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`, 15000);
  await page.waitForTimeout(800);
  await shot(page, '02-login');

  await page.evaluate(() => {
    const s = window.game.scene.getScene('LoginScene');
    if (s && s._handleGuestLogin) s._handleGuestLogin();
  });
  await waitFor(page, `window.game.scene.isActive('MainMenuScene') || window.game.scene.isActive('CutsceneScene')`, 20000);

  // 신규 게스트 계정은 여기서 T-01/T-02 프롤로그 컷씬이 자동 재생된다 — before 스크립트에는 없던 단계.
  const prologueHandled = await clearPrologue(page);
  if (prologueHandled > 0) log(`  [info] 프롤로그 컷씬 ${prologueHandled}건 Skip All 처리`);

  // MenuGridGate(T-C7 점진 해금)가 도입되어 튜토리얼 미완료 신규 계정은 그리드 메뉴가
  // 전부 잠겨(그려지지 않아) 팝업을 강제로 열어도 내용 없이 코치마크만 보인다.
  // before 캡처와 공정 비교하기 위해 tutorial.completed=true를 세이브에 주입해 전량 해금한다.
  await page.evaluate(() => {
    const raw = localStorage.getItem('arcane_collectors_save');
    if (!raw) return;
    const save = JSON.parse(raw);
    save.tutorial = save.tutorial || {};
    save.tutorial.completed = true;
    localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
  });
  await page.evaluate(() => { if (window.game) window.game.scene.start('MainMenuScene'); });
  await waitFor(page, `window.game.scene.isActive('MainMenuScene')`, 20000);
  await page.waitForTimeout(2500);
  await shot(page, '03-mainmenu');
  await page.waitForTimeout(3000);
  await shot(page, '04-mainmenu-idle-battle');

  const popups = ['herolist', 'pvp', 'guild', 'collection', 'quest', 'tower', 'inventory', 'partyedit', 'raid', 'friends', 'ascension', 'eventdungeon', 'settings'];
  for (const key of popups) {
    let opened = false;
    try {
    opened = await page.evaluate((k) => {
      try {
        if (!window.game) return false;
        const s = window.game.scene.getScene('MainMenuScene');
        if (!s || !s.openPopup) return false;
        if (s && s.activePopup) { if (s.activePopup.close) s.activePopup.close(); else if (s.activePopup.destroy) s.activePopup.destroy(); s.activePopup = null; }
        s.openPopup(k);
        return !!s.activePopup;
      } catch (e) { return false; }
    }, key);
    await page.waitForTimeout(1200);
    if (opened) await shot(page, `10-popup-${key}`);
    else log(`  [skip] popup ${key}`);
    await page.evaluate(() => {
      if (!window.game) return;
      const s = window.game.scene.getScene('MainMenuScene');
      if (s && s.activePopup) { try { if (s.activePopup.close) s.activePopup.close(); else if (s.activePopup.destroy) s.activePopup.destroy(); } catch (e) {} s.activePopup = null; }
    });
    await page.waitForTimeout(400);
    } catch (e) { log(`  [err] popup ${key}: ${String(e).slice(0,120)}`); }
    // 매 팝업마다 메인메뉴 상태를 확실히 복구
    const alive = await page.evaluate(() => !!(window.game && window.game.scene.isActive('MainMenuScene'))).catch(() => false);
    if (!alive) {
      log('  [recover] MainMenuScene 재진입');
      await page.evaluate(() => { if (window.game) window.game.scene.start('MainMenuScene'); }).catch(() => {});
      await waitFor(page, `window.game && window.game.scene.isActive('MainMenuScene')`, 10000);
      await page.waitForTimeout(1200);
    }
  }

  const scenes = [
    ['GachaScene', '20-gacha'],
    ['HeroListScene', '21-herolist-scene'],
    ['StageSelectScene', '22-stageselect'],
    ['InventoryScene', '23-inventory-scene'],
    ['QuestScene', '24-quest-scene'],
    ['TowerScene', '25-tower-scene'],
    ['PartyEditScene', '26-partyedit-scene'],
    ['SettingsScene', '27-settings-scene'],
  ];
  for (const [key, name] of scenes) {
    const ok = await startScene(page, key);
    if (ok) await shot(page, name); else log(`  [skip] ${key}`);
  }

  const heroId = await page.evaluate(() => {
    const hs = window.game.registry.get('ownedHeroes') || [];
    return hs[0] ? hs[0].id : null;
  });
  if (heroId) {
    const ok = await startScene(page, 'HeroDetailScene', { heroId });
    if (ok) await shot(page, '30-herodetail');
  } else log('  [skip] HeroDetailScene (no owned hero)');

  const okBattle = await startScene(page, 'BattleScene', { stage: { id: '1-1', chapter: 1, stage: 1 } });
  if (okBattle) {
    await skipCutsceneIfAny(page);
    await shot(page, '40-battle');
    await page.waitForTimeout(4000);
    await shot(page, '41-battle-midfight');
  } else log('  [skip] BattleScene');

  const okResult = await startScene(page, 'BattleResultScene', {
    victory: true, stage: { id: '1-1', chapter: 1, stage: 1 },
    rewards: { gold: 1200, exp: 340, items: [] }, party: []
  });
  if (okResult) {
    // BattleResultScene.create()는 stage_clear/boss_after 컷씬을 먼저 띄우고 자신은
    // pause() 상태로 대기한다 — 컷씬을 먼저 밀어내지 않으면 결과창 대신 대사창만 찍힌다.
    await skipCutsceneIfAny(page);
    await waitFor(page, `window.game && window.game.scene.isActive('BattleResultScene')`, 8000);
    await page.waitForTimeout(500);
    await shot(page, '42-battleresult');
  }

  log(`\nTOTAL ${saved.length} -> ${OUT}`);
  log(saved.join(', '));
} finally {
  await browser.close();
}
