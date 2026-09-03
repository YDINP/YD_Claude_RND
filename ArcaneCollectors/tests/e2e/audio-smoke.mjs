/**
 * audio-smoke.mjs — 오디오 에셋 스모크 테스트 (SND-01 / SND-02)
 *
 * 검증 항목:
 *   1. BGM/SFX 파일이 모두 HTTP 200 으로 서빙되는가
 *   2. 브라우저가 실제로 디코드할 수 있는가 (WebAudio decodeAudioData)
 *   3. PreloadScene 이 선로드 대상을 캐시에 올렸는가
 *   4. 음량 설정이 SaveManager settings.audio 로 저장·복원되는가
 *   5. 오디오 때문에 콘솔 에러가 나지 않는가 (무음 폴백이 조용한지)
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/audio-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1
 */
import { chromium } from 'playwright';
import { BGM_KEYS, SFX_KEYS, audioUrlsFor, eagerAudioKeys } from '../../src/config/audioAssets.js';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BOOT_TIMEOUT_MS = 30000;
/** 디코드 검증에 쓰는 표본 (전량 디코드하면 느리다) */
const DECODE_SAMPLE_KEYS = ['bgm_main', 'bgm_victory', 'sfx_click', 'sfx_gacha_ssr'];

/** 오디오와 무관한 잡음은 실패로 세지 않는다 */
const IGNORED_PATTERNS = [
  /favicon/i,
  /\[vite\]/i,
  /supabase/i,
  /net::ERR_/i
];

function isIgnored(text) {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnored(text)) consoleErrors.push(text);
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

  // BootScene._checkExistingSession() 이 true 를 반환하도록 게스트 세션을 미리 심어
  // LoginScene 을 건너뛰고 PreloadScene 으로 곧장 진입시킨다 (asset-smoke.mjs 와 동일 패턴).
  await page.addInitScript(() => {
    localStorage.setItem('arcane_auth', JSON.stringify({
      userId: 'guest_audio_smoke',
      authType: 'guest',
      autoLogin: true,
      lastLogin: Date.now()
    }));
    localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify({
      id: 'guest_audio_smoke',
      createdAt: Date.now()
    }));
  });

  try {
    console.log(`\n=== 오디오 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // ---------- 1. 모든 오디오 파일 HTTP 200 ----------
    const allKeys = [...BGM_KEYS, ...SFX_KEYS];
    const urls = allKeys.flatMap((key) => audioUrlsFor(key));
    const statuses = await page.evaluate(async (list) => {
      const out = [];
      for (const url of list) {
        try {
          const res = await fetch(url, { method: 'GET' });
          const buf = await res.arrayBuffer();
          out.push({ url, status: res.status, bytes: buf.byteLength });
        } catch (e) {
          out.push({ url, status: 0, bytes: 0, error: String(e) });
        }
      }
      return out;
    }, urls);

    const bad = statuses.filter((s) => s.status !== 200 || s.bytes < 1024);
    assert(bad.length === 0, `오디오 파일 ${urls.length}건 모두 200 응답`,
      bad.map((b) => `${b.url}(${b.status})`).join(', '));

    const totalKB = statuses.reduce((sum, s) => sum + s.bytes, 0) / 1024;
    console.log(`   총 용량 ${(totalKB / 1024).toFixed(2)}MB (ogg+mp3 합계, 실제 다운로드는 한 포맷)`);

    // ---------- 2. 디코드 가능 여부 ----------
    const decodeResults = await page.evaluate(async (keys) => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const out = [];
      for (const { key, url } of keys) {
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          out.push({ key, ok: true, duration: decoded.duration, channels: decoded.numberOfChannels });
        } catch (e) {
          out.push({ key, ok: false, error: String(e) });
        }
      }
      await ctx.close();
      return out;
    }, DECODE_SAMPLE_KEYS.map((key) => ({ key, url: audioUrlsFor(key)[0] })));

    const decodeFailed = decodeResults.filter((r) => !r.ok || !(r.duration > 0));
    assert(decodeFailed.length === 0, `표본 ${DECODE_SAMPLE_KEYS.length}종 디코드 성공`,
      decodeFailed.map((r) => `${r.key}: ${r.error || 'duration 0'}`).join(', '));
    decodeResults.filter((r) => r.ok).forEach((r) => {
      console.log(`   ${r.key} — ${r.duration.toFixed(1)}s / ${r.channels}ch`);
    });

    // ---------- 3. PreloadScene 선로드 결과 ----------
    // 게스트 세션을 심어뒀으므로 BootScene → PreloadScene 으로 자동 진행된다.
    // 도착 씬(MainMenuScene / 온보딩 CutsceneScene)은 계정 상태에 따라 갈리므로
    // 씬이 아니라 오디오 캐시 자체가 채워졌는지를 기다린다.
    let cacheReady = false;
    try {
      // 선로드 큐 전체가 끝나야 한다. bgm_main 은 ~900KB 라 SFX 보다 늦게 도착하므로
      // 키 하나만 보고 판정하면 레이스가 난다.
      await page.waitForFunction(
        (keys) => !!window.game?.cache?.audio && keys.every((k) => window.game.cache.audio.exists(k)),
        eagerAudioKeys(),
        { timeout: BOOT_TIMEOUT_MS }
      );
      cacheReady = true;
    } catch (e) {
      cacheReady = false;
      console.log(`   [debug] ${e.message?.slice(0, 160)}`);
      const scenes = await page.evaluate(() => window.game
        ? window.game.scene.scenes.filter((s) => window.game.scene.isActive(s.scene.key)).map((s) => s.scene.key)
        : []).catch(() => []);
      console.log(`   [debug] active=[${scenes.join(', ')}]`);
    }
    assert(cacheReady, 'PreloadScene 이 오디오를 캐시에 올림');

    const missing = cacheReady
      ? await page.evaluate((keys) => keys.filter((k) => !window.game.cache.audio.exists(k)), eagerAudioKeys())
      : eagerAudioKeys();
    assert(missing.length === 0, `선로드 대상 ${eagerAudioKeys().length}종 캐시 확인`, missing.join(', '));

    // ---------- 4. 음량 설정 저장 왕복 ----------
    // 게임이 스스로 기록한 세이브에 settings.audio 가 있어야 한다(마이그레이션 기본값 포함).
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save');
      return raw ? (JSON.parse(raw).settings?.audio ?? null) : null;
    });
    const AUDIO_FIELDS = ['master', 'bgm', 'sfx', 'bgmMuted', 'sfxMuted'];
    assert(
      !!persisted && AUDIO_FIELDS.every((f) => f in persisted),
      'settings.audio 필드가 게임 세이브에 존재',
      JSON.stringify(persisted)
    );

    // 페이지를 새로 열어도 값이 그대로 복원되는지 (localStorage 왕복)
    const roundTrip = await page.evaluate(() => {
      const KEY = 'arcane_collectors_save';
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      data.settings = { ...(data.settings || {}), audio: { master: 1, bgm: 0.31, sfx: 0.77, bgmMuted: true, sfxMuted: false } };
      localStorage.setItem(KEY, JSON.stringify(data));
      return JSON.parse(localStorage.getItem(KEY)).settings.audio;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save');
      return raw ? JSON.parse(raw).settings?.audio ?? null : null;
    });
    assert(
      !!restored && Math.abs(restored.bgm - roundTrip.bgm) < 1e-6 && restored.bgmMuted === true,
      '음량/음소거 값이 재로드 후에도 유지',
      JSON.stringify(restored)
    );

    // ---------- 5. 콘솔 에러 ----------
    await page.waitForTimeout(2500);
    const audioErrors = consoleErrors.filter((e) => /audio|sound|decode|\.ogg|\.mp3/i.test(e));
    assert(audioErrors.length === 0, '오디오 관련 콘솔 에러 0건', audioErrors.join(' | '));
    assert(consoleErrors.length === 0, '콘솔 에러 0건', consoleErrors.join(' | '));
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('오디오 스모크 실행 실패:', err);
  process.exit(1);
});
