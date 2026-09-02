/**
 * capture-before.mjs — 리디자인 전(before) 실화면 캡처
 * 실행: node tools/art/capture-before.mjs   (사전: vite 서버 기동)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3311';
const OUT = path.resolve('docs/redesign/screenshots/before');
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
    await shot(page, '40-battle');
    await page.waitForTimeout(4000);
    await shot(page, '41-battle-midfight');
  } else log('  [skip] BattleScene');

  const okResult = await startScene(page, 'BattleResultScene', {
    victory: true, stage: { id: '1-1', chapter: 1, stage: 1 },
    rewards: { gold: 1200, exp: 340, items: [] }, party: []
  });
  if (okResult) await shot(page, '42-battleresult');

  log(`\nTOTAL ${saved.length} -> ${OUT}`);
  log(saved.join(', '));
} finally {
  await browser.close();
}
