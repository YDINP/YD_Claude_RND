/**
 * verify-t03.mjs — 포트레이트 로드(T-03) + 런타임 페이로드 최적화(T-29) 검증
 * 실행: node tools/art/verify-t03.mjs   (사전: vite 서버 기동)
 *
 * 검사 항목
 *   T-03  로스터 38명 전원이 로더 큐에 오르고 hero_005~038 요청 34건이 실제로 나간다
 *   T-29  런타임 포트레이트는 전부 .webp 이고, 총 전송량이 4MB 미만이다
 *   T-29  영웅 상세 진입 시에만 portraits@2x/ 원본 PNG 를 지연 로드한다
 *   T-29  상세에서 나온 뒤에도 공용 512 텍스처가 살아남는다 (플레이스홀더 회귀 없음)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3311';
const OUT = path.resolve('docs/redesign/screenshots/after-t03');
const BUDGET_MB = 4;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const assert = (c, name, detail = '') => {
  if (c) { pass++; log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function waitFor(page, fn, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });

/** @type {{file:string,dir:string,status:number,type:string,bytes:number}[]} */
const reqs = [];
page.on('response', async (r) => {
  const u = r.url();
  if (!u.includes('/portraits')) return;
  const len = r.headers()['content-length'];
  reqs.push({
    file: u.split('/').pop(),
    dir: u.includes('portraits@2x/') ? '@2x' : 'runtime',
    status: r.status(),
    type: r.headers()['content-type'] || '',
    bytes: len ? parseInt(len, 10) : 0
  });
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

const mb = (b) => (b / 1024 / 1024).toFixed(2);
const sum = (list) => list.reduce((s, r) => s + r.bytes, 0);

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());

  const t0 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert(await waitFor(page, `!!(window.game && window.game.scene.isActive('LoginScene'))`), 'LoginScene 도달');
  const tLogin = Date.now() - t0;

  await page.evaluate(() => {
    const s = window.game.scene.getScene('LoginScene');
    if (s && s._handleGuestLogin) s._handleGuestLogin();
  });
  assert(await waitFor(page, `!!(window.game && window.game.scene.isActive('MainMenuScene'))`, 60000), 'MainMenuScene 도달');
  const tMenu = Date.now() - t0;
  await page.waitForTimeout(2500);

  // ---- T-03: 로스터 요청 ----
  const runtime = reqs.filter((r) => r.dir === 'runtime');
  const got = new Set(runtime.map((r) => r.file));
  const wanted = [];
  for (let i = 5; i <= 38; i++) wanted.push(`hero_${String(i).padStart(3, '0')}.webp`);
  const missing = wanted.filter((f) => !got.has(f));
  assert(missing.length === 0, 'hero_005~038 요청 34건',
    `누락 ${missing.length}건${missing.length ? ': ' + missing.slice(0, 5).join(',') : ''}`);

  // ---- T-29: 포맷과 전송량 ----
  const notWebp = runtime.filter((r) => !r.file.endsWith('.webp'));
  assert(notWebp.length === 0, '런타임 포트레이트가 전부 .webp',
    notWebp.length ? `이탈 ${notWebp.length}건: ${notWebp.slice(0, 3).map((r) => r.file).join(',')}` : '');

  const badType = runtime.filter((r) => r.type && !r.type.includes('image/webp'));
  assert(badType.length === 0, '응답 Content-Type 이 image/webp',
    badType.length ? `이탈 ${badType.length}건` : '');

  const runtimeBytes = sum(runtime);
  assert(runtimeBytes < BUDGET_MB * 1024 * 1024,
    `초기 포트레이트 전송량 < ${BUDGET_MB} MB`, `${mb(runtimeBytes)} MB / ${runtime.length}건`);

  const hires = reqs.filter((r) => r.dir === '@2x');
  assert(hires.length === 0, '메인 메뉴까지 @2x 요청 0건', `실제 ${hires.length}건`);

  // ---- 텍스처 실체 확인 ----
  const tex = await page.evaluate(() => {
    const t = window.game.textures;
    const out = {};
    for (const k of t.getTextureKeys()) {
      if (!k.startsWith('hero_')) continue;
      const src = t.get(k).getSourceImage();
      out[k] = `${src.width}x${src.height}`;
    }
    return out;
  });
  const real512 = Object.entries(tex).filter(([, v]) => v === '512x512');
  assert(real512.length >= 34, '512x512 실포트레이트 텍스처 34개 이상', `실제 ${real512.length}개`);
  assert(tex['hero_base_iris'] === '512x512', 'hero_base_iris 가 실이미지', `현재 ${tex['hero_base_iris']}`);

  const stats = await page.evaluate(() => {
    const s = window.game.scene.getScene('PreloadScene');
    return s ? s._portraitLoadStats || null : null;
  });
  log(`     PreloadScene 통계: ${JSON.stringify(stats)}`);

  // ---- 씬 이동 ----
  const startScene = async (key, data) => {
    await page.evaluate(({ key, data }) => {
      const g = window.game;
      g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== key) g.scene.stop(s.scene.key); });
      g.scene.start(key, data || undefined);
    }, { key, data });
    const ok = await waitFor(page, `!!(window.game && window.game.scene.isActive('${key}'))`, 20000);
    await page.waitForTimeout(2200);
    return ok;
  };

  if (await startScene('HeroListScene')) {
    await page.screenshot({ path: path.join(OUT, '01-herolist.png') });
    log('  [shot] 01-herolist.png');
  } else assert(false, 'HeroListScene 진입');

  const heroId = await page.evaluate(() => {
    const hs = window.game.registry.get('ownedHeroes') || [];
    return hs[0] ? hs[0].id : null;
  });

  const hiresBefore = reqs.filter((r) => r.dir === '@2x').length;
  if (heroId && (await startScene('HeroDetailScene', { heroId }))) {
    await page.screenshot({ path: path.join(OUT, '02-herodetail.png') });
    log(`  [shot] 02-herodetail.png (${heroId})`);

    const hiresNow = reqs.filter((r) => r.dir === '@2x');
    assert(hiresNow.length > hiresBefore, '영웅 상세 진입 시 @2x 지연 로드 발생',
      `${hiresNow.length}건, ${mb(sum(hiresNow))} MB`);
    assert(hiresNow.every((r) => r.file.endsWith('.png')), '@2x 는 원본 PNG');

    const detailTex = await page.evaluate(() => {
      const t = window.game.textures;
      const k = Object.keys(t.list).find((x) => x.endsWith('@2x'));
      if (!k) return null;
      const src = t.get(k).getSourceImage();
      return { key: k, size: `${src.width}x${src.height}` };
    });
    // 2026-09-03: 포트레이트 소스를 전신 시트 크롭(512×512, 정체성 100% 일치)으로 교체.
    // @2x 원본이 더는 1024가 아니라 512다 — 해상도보다 정체성 일치를 우선한 트레이드오프.
    assert(detailTex && detailTex.size === '512x512', '@2x 텍스처가 512x512(전신 크롭 소스)',
      detailTex ? `${detailTex.key} ${detailTex.size}` : 'none');
  } else assert(false, 'HeroDetailScene 진입', `heroId=${heroId}`);

  // ---- 회귀 가드: 상세에서 나온 뒤 공용 텍스처가 살아있는가 ----
  if (await startScene('HeroListScene')) {
    const after = await page.evaluate(() => {
      const t = window.game.textures;
      const src = t.exists('hero_base_iris') ? t.get('hero_base_iris').getSourceImage() : null;
      return src ? `${src.width}x${src.height}` : 'missing';
    });
    assert(after === '512x512', '상세 이탈 후에도 공용 512 텍스처 유지', `현재 ${after}`);
  }

  assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.slice(0, 2).join(' | '));

  log('');
  log(`  전송량  초기 포트레이트 ${mb(runtimeBytes)} MB (${runtime.length}건)`);
  log(`          상세 @2x 추가   ${mb(sum(reqs.filter((r) => r.dir === '@2x')))} MB`);
  log(`  소요    reload -> LoginScene    ${tLogin} ms`);
  log(`          reload -> MainMenuScene ${tMenu} ms  (localhost 기준)`);
  log(`\n결과: ${pass} passed, ${fail} failed`);
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 1 : 0);
