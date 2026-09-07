/**
 * capture-hero-detail-chibi.mjs — 영웅 상세 치비 배지 캡처 (스테이지 좌하단)
 * 실행: CAP_BASE_URL=http://localhost:3000 node tools/art/capture-hero-detail-chibi.mjs
 * 사전: vite 개발 서버 기동
 *
 * 기본 영웅(base_iris, 자기 치비 시트 있음)과 전직 영웅(asc_iris_olympus, 치비 시트가
 * 없어 base_iris 시트를 교단색으로 물들여 빌려 쓴다) 각각 캡처한다.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const errors = [];

/** 캡처 전용 전직 영웅 (ascended-heroes.json 의 실제 id, 자기 치비 시트 없음) */
const ASCENDED = {
  id: 'asc_iris_olympus',
  name: '번개의 아이리스',
  rarity: 'SSR',
  level: 42,
  stars: 4,
  exp: 1200,
  skillLevels: [4, 3],
  stats: { hp: 2280, atk: 205, def: 158, spd: 104 },
  equipment: {}
};

async function waitFor(page, fn, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log(`  [shot] ${name}.png`);
}

async function openDetail(page, heroId, tab) {
  await page.evaluate((data) => {
    const g = window.game;
    g.scene.getScenes(true).forEach((s) => {
      if (s.scene.key !== 'HeroDetailScene') g.scene.stop(s.scene.key);
    });
    g.scene.stop('HeroDetailScene');
    g.scene.start('HeroDetailScene', data);
  }, { heroId, tab });
  const ok = await waitFor(page, `!!(window.game && window.game.scene.isActive('HeroDetailScene'))`, 20000);
  await page.waitForTimeout(2400);
  return ok;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  if (!await waitFor(page, `!!(window.game && window.game.scene.isActive('LoginScene'))`)) {
    throw new Error('LoginScene 도달 실패');
  }

  await page.evaluate(() => {
    const s = window.game.scene.getScene('LoginScene');
    if (s && s._handleGuestLogin) s._handleGuestLogin();
  });

  if (!await waitFor(page, `!!(window.game && window.game.scene.isActive('MainMenuScene'))`, 60000)) {
    throw new Error('MainMenuScene 도달 실패');
  }
  await page.waitForTimeout(2000);

  // ---- 기본 영웅 (base_iris — 자기 치비 시트) ----
  const baseId = await page.evaluate(() => {
    const owned = window.game.registry.get('ownedHeroes') || [];
    const iris = owned.find((h) => h.id === 'base_iris');
    return (iris || owned[0] || {}).id || null;
  });
  log(`  기본 영웅: ${baseId}`);

  if (baseId && await openDetail(page, baseId, 'stats')) {
    await shot(page, 'hero-detail-chibi-base');
  } else {
    log('  [skip] 기본 영웅 상세 진입 실패');
  }

  // ---- 전직 영웅 (캡처 전용으로 registry 에만 주입, 세이브는 건드리지 않는다) ----
  await page.evaluate((hero) => {
    const owned = window.game.registry.get('ownedHeroes') || [];
    if (!owned.some((h) => h.id === hero.id)) {
      window.game.registry.set('ownedHeroes', owned.concat([hero]));
    }
  }, ASCENDED);

  if (await openDetail(page, ASCENDED.id, 'stats')) {
    await shot(page, 'hero-detail-chibi-ascended');
  } else {
    log('  [skip] 전직 영웅 상세 진입 실패');
  }

  // ---- 치비 텍스처가 실제로 붙었는지 ----
  const chibiInfo = await page.evaluate(() => {
    const keys = window.game.textures.getTextureKeys().filter((k) => k.startsWith('chibi_'));
    return keys.map((k) => {
      const src = window.game.textures.get(k).getSourceImage();
      return `${k} ${src.width}x${src.height}`;
    });
  });
  log(`  치비 텍스처: ${chibiInfo.join(', ') || '없음'}`);

  const errorDetail = errors.length ? ` — ${errors.slice(0, 2).join(' | ')}` : '';
  log(`  pageerror: ${errors.length}건${errorDetail}`);
} finally {
  await browser.close();
}

process.exit(errors.length > 0 ? 1 : 0);
