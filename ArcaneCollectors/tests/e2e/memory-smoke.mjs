/**
 * memory-smoke.mjs — 씬 순환 메모리 스모크
 *
 * 목적
 *   게스트 로그인 후 메인→영웅목록→상세→소환→스테이지→전투→결과→메인 순환을
 *   N회 반복하면서 매 회(메인메뉴 복귀 시점) 다음을 기록한다:
 *     - JS 힙 사용량 (CDP Performance.getMetrics 의 JSHeapUsedSize)
 *     - Phaser 텍스처 키 수 + 추정 GPU 바이트(폭×높이×4 합) + 버킷별 분해
 *     - 활성 트윈 / 타이머 / 표시객체(깊이 우선 전수) / Graphics / 파티클 이미터 수
 *     - 리스너 수 — 씬 EventEmitter, game.events, registry, 전역 EventBus, DOM(JSEventListeners)
 *
 * 왜 CDP 인가
 *   `performance.memory` 는 브라우저가 정밀도를 크게 깎아 돌려준다(실측에서 5회
 *   내내 109000000 으로 동일하게 나왔다 — 사실상 측정 불가). CDP 의
 *   `Performance.getMetrics` 는 바이트 단위 실값을 주고, `HeapProfiler.collectGarbage`
 *   는 `--expose-gc` 플래그(이 앱에서는 부팅을 멈추게 한다) 없이 실제 GC 를 돌린다.
 *
 * 예산(SSOT: tools/art/asset-manifest.json 의 memoryBudget)
 *   baselineCycle 회차 대비 마지막 회차의 증가분으로 판정한다. 1회차는 온보딩
 *   컷씬·지연 싱글턴 초기화가 섞여 있어 기준선으로 쓰지 않는다(워밍업).
 *
 * 결과는 docs/qa/memory-smoke-result.json 에 저장한다(매 실행 덮어씀).
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/memory-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1 (예산 초과 포함)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { blockHmr } from './hmr-guard.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SCENE_TIMEOUT_MS = 45000;
const RESULT_PATH = join(ROOT, 'docs', 'qa', 'memory-smoke-result.json');

const manifest = JSON.parse(readFileSync(join(ROOT, 'tools', 'art', 'asset-manifest.json'), 'utf-8'));
const BUDGET = manifest.memoryBudget || {};
// 순환 횟수는 환경변수로 덮을 수 있다. "증가가 수렴하는가"를 볼 때 길게 돌린다:
//   MEMORY_SMOKE_CYCLES=20 node tests/e2e/memory-smoke.mjs
const CYCLES = Number(process.env.MEMORY_SMOKE_CYCLES) || BUDGET.cycles || 8;
const BASELINE_CYCLE = BUDGET.baselineCycle || 2;

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = '') => {
  if (condition) {
    passed++;
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const mb = (bytes) => (bytes == null ? 'N/A' : `${(bytes / 1024 / 1024).toFixed(2)}MB`);
const signed = (n) => (n == null ? 'N/A' : `${n >= 0 ? '+' : ''}${n}`);

/** 활성 씬을 하나 골라 대기(활성화될 때까지) */
async function waitForActiveScene(page, key, timeout = SCENE_TIMEOUT_MS) {
  try {
    await page.waitForFunction(
      (k) => !!(window.game && window.game.scene.isActive(k)),
      key,
      { timeout }
    );
  } catch (err) {
    const active = await page
      .evaluate(() => (window.game ? window.game.scene.getScenes(true).map((s) => s.scene.key) : ['(game 없음)']))
      .catch(() => ['(평가 실패)']);
    throw new Error(`씬 '${key}' 활성화 대기 실패 (${timeout}ms). 현재 활성: ${active.join(', ')}`);
  }
}

/**
 * 컷씬이 떠 있으면 끝까지 넘긴다.
 *
 * 이 스모크는 오래 "컷씬을 전혀 처리하지 않은 채" 돌았고 그 대가가 컸다.
 *   - 온보딩 프롤로그가 세션 내내 CutsceneScene 으로 떠 있었다(스냅샷의 activeSceneKeys
 *     에 CutsceneScene 이 항상 끼어 있던 이유).
 *   - 1-1 을 이기면 cs_1_1_clear(stage_clear, oncePerAccount) 가 BattleResultScene 을
 *     덮어써서 결과 화면 대기가 60초 타임아웃으로 죽는다.
 * skip-path-parity.mjs / onboarding-full.mjs 와 같은 방식(skipAll → 탭 폴백)을 쓴다.
 *
 * @returns {Promise<boolean>} 하나라도 넘겼으면 true
 */
async function skipCutscenesIfAny(page, { rounds = 4, timeout = 2500 } = {}) {
  let skippedAny = false;
  for (let i = 0; i < rounds; i++) {
    const up = await page
      .waitForFunction(() => !!window.game?.scene.isActive('CutsceneScene'), null, {
        timeout: i === 0 ? timeout : 1200,
      })
      .then(() => true)
      .catch(() => false);
    if (!up) break;

    await page.evaluate(() => {
      const sc = window.game.scene.getScene('CutsceneScene');
      if (sc?.player?.skipAll) sc.player.skipAll();
    });
    // skipAll 이 없거나 먹지 않는 연출은 탭으로 밀어낸다
    for (let t = 0; t < 12; t++) {
      const still = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene'));
      if (!still) break;
      await page.evaluate(() => {
        const sc = window.game.scene.getScene('CutsceneScene');
        if (sc?.player?.handleTap) sc.player.handleTap();
      });
      await page.waitForTimeout(180);
    }

    const gone = await page
      .waitForFunction(() => !window.game?.scene.isActive('CutsceneScene'), null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (gone) skippedAny = true;
    else break;
  }
  return skippedAny;
}

/**
 * CDP 로 실제 GC 를 돌리고 정밀 힙/노드/DOM리스너 수치를 읽는다.
 */
async function readCdpMetrics(cdp) {
  try {
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {
    /* GC 실패는 치명적이지 않다 — 측정 노이즈가 늘 뿐이다 */
  }
  const { metrics } = await cdp.send('Performance.getMetrics');
  const pick = (name) => {
    const m = metrics.find((x) => x.name === name);
    return m ? m.value : null;
  };
  return {
    heapUsedBytes: pick('JSHeapUsedSize'),
    heapTotalBytes: pick('JSHeapTotalSize'),
    domNodes: pick('Nodes'),
    domListeners: pick('JSEventListeners'),
    documents: pick('Documents'),
  };
}

/**
 * 텍스처 키 → 버킷 분류 규칙. 상주(공용) 자산과 대형 전용 자산을 나눠 본다.
 * 객체 순서가 우선순위다(먼저 맞는 버킷으로 확정).
 */
const TEXTURE_BUCKETS = {
  heroHires: ['@2x$'],
  fullbody: ['^fb_'],
  chibi: ['^chibi_'],
  enemyArt: ['^enemy_art_'],
  background: ['^bg_', '^battle_bg$', '_blur$'],
  menuIcon: ['^menu_', '^icon_'],
  vectorIcon: ['^vicon_'],
  // Phaser 가 Text 객체마다 UUID 키로 굽는 캔버스. 씬을 다시 그릴 때마다 통째로
  // 생성·파기되므로 매 실행 ±30개가 churn 한다. 누적이 아니라 회전이다.
  textCanvas: ['^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'],
  frame: ['^frame_'],
  heroPortrait: ['^hero_', '^char_'],
};

/** window.game 전역에서 지금 이 순간의 씬/텍스처 스냅샷을 만든다 */
async function collectPageSnapshot(page, buckets) {
  return page.evaluate((bucketDefs) => {
    const game = window.game;

    // --- eventemitter3 리스너 총수 ---
    const listenerCount = (ee) => {
      if (!ee || !ee._events) return 0;
      let n = 0;
      for (const k of Object.keys(ee._events)) {
        const v = ee._events[k];
        n += Array.isArray(v) ? v.length : 1;
      }
      return n;
    };

    // --- 표시객체 깊이 우선 전수 (컨테이너 내부까지) ---
    const walk = (list, acc) => {
      for (const obj of list) {
        if (!obj) continue;
        acc.total += 1;
        const t = obj.type;
        if (t === 'Graphics') acc.graphics += 1;
        else if (t === 'ParticleEmitter' || t === 'ParticleEmitterManager') acc.emitters += 1;
        else if (t === 'Text') acc.texts += 1;
        else if (t === 'Sprite' || t === 'Image') acc.sprites += 1;
        if (obj.list && Array.isArray(obj.list)) walk(obj.list, acc);
      }
      return acc;
    };

    // --- 텍스처: 키 수 + 추정 바이트 + 버킷 분해 ---
    const textureKeys = Object.keys(game.textures.list);
    let textureBytes = 0;
    const bucketStats = {};
    for (const name of Object.keys(bucketDefs)) bucketStats[name] = { count: 0, bytes: 0 };
    bucketStats.other = { count: 0, bytes: 0 };

    for (const key of textureKeys) {
      const tex = game.textures.list[key];
      let bytes = 0;
      const sources = (tex && tex.source) || [];
      for (const src of sources) {
        if (src && src.width && src.height) bytes += src.width * src.height * 4;
      }
      textureBytes += bytes;

      let matched = 'other';
      for (const name of Object.keys(bucketDefs)) {
        if (bucketDefs[name].some((p) => new RegExp(p).test(key))) { matched = name; break; }
      }
      bucketStats[matched].count += 1;
      bucketStats[matched].bytes += bytes;
    }

    // --- 씬별 집계 ---
    let tweenCount = 0;
    let timerCount = 0;
    let sceneListeners = 0;
    const nodes = { total: 0, graphics: 0, emitters: 0, texts: 0, sprites: 0 };
    const activeSceneKeys = [];
    const perScene = {};

    game.scene.scenes.forEach((sc) => {
      const key = sc.scene.key;
      // 리스너는 비활성 씬도 센다 — 씬이 내려가도 구독이 남는 것이 정확히 누수다
      sceneListeners += listenerCount(sc.events);
      if (!game.scene.isActive(key)) return;
      activeSceneKeys.push(key);

      const t = sc.tweens && typeof sc.tweens.getTweens === 'function' ? sc.tweens.getTweens().length : 0;
      const ti = sc.time && Array.isArray(sc.time._active) ? sc.time._active.length : 0;
      tweenCount += t;
      timerCount += ti;
      const before = nodes.total;
      if (sc.children && Array.isArray(sc.children.list)) walk(sc.children.list, nodes);
      perScene[key] = { tweens: t, timers: ti, displayObjects: nodes.total - before };
    });

    const busStats =
      window.__TEST_API__ && typeof window.__TEST_API__.eventBusStats === 'function'
        ? window.__TEST_API__.eventBusStats()
        : null;

    return {
      textureCount: textureKeys.length,
      textureKeys,
      textureBytes,
      textureBuckets: bucketStats,
      tweenCount,
      timerCount,
      displayObjectCount: nodes.total,
      graphicsCount: nodes.graphics,
      emitterCount: nodes.emitters,
      textCount: nodes.texts,
      spriteCount: nodes.sprites,
      sceneListeners,
      gameListeners:
        listenerCount(game.events) + listenerCount(game.registry && game.registry.events),
      eventBusListeners: busStats ? busStats.total : null,
      eventBusTopEvents: busStats ? busStats.top : null,
      activeSceneKeys,
      perScene,
    };
  }, buckets);
}

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 720, height: 1280 } });
  const page = await context.newPage();
  // 공유 dev 서버 격리 — 남이 소스를 저장해도 이 페이지는 리로드되지 않는다.
  // 실증: node tests/e2e/hmr-guard-verify.mjs
  await blockHmr(page, BASE_URL);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  // 이 스모크는 공용 dev 서버에서 수 분간 돈다. 그 사이 다른 작업자가 소스를 저장하면
  // Vite HMR 이 페이지를 통째로 리로드해 window.game 이 갈아치워지고, 진행 중이던
  // 씬 대기가 영원히 걸린다(45초 타임아웃으로 실측). HMR 클라이언트를 빈 모듈로
  // 갈아끼워 측정 구간을 소스 변경으로부터 격리한다.
  await page.route('**/@vite/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'export {};' })
  );

  // 그래도 리로드가 일어나면(수동 새로고침 등) 조용히 매달리지 말고 즉시 알린다.
  let loadCount = 0;
  page.on('load', () => { loadCount += 1; });

  const pageErrors = [];
  page.on('pageerror', (err) => { pageErrors.push(`${err.name}: ${err.message}`); console.log('[pageerror]', err.message); });
  if (process.env.DEBUG_MEMORY_SMOKE) {
    page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
  }

  // 게스트 자동 로그인 — LoginScene 스킵, BootScene → PreloadScene → MainMenuScene
  await page.addInitScript(() => {
    localStorage.setItem('arcane_auth', JSON.stringify({
      userId: 'guest_memory_smoke', authType: 'guest', autoLogin: true, lastLogin: Date.now(),
    }));
    localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify({
      id: 'guest_memory_smoke', createdAt: Date.now(),
    }));
  });

  const snapshots = [];

  try {
    console.log(`\n=== 메모리 스모크 (${BASE_URL}) — ${CYCLES}회 순환, 기준선 ${BASELINE_CYCLE}회차 ===\n`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForActiveScene(page, 'MainMenuScene');
    await page.waitForTimeout(500);

    // 온보딩 프롤로그를 먼저 걷어낸다. 남겨 두면 CutsceneScene 이 세션 내내 활성으로
    // 남아 모든 스냅샷의 씬 집계에 섞인다.
    await skipCutscenesIfAny(page, { rounds: 6, timeout: 4000 });
    await page.waitForTimeout(400);

    // 스테이지 데이터(1-1)와 파티는 BattleScene 이 SaveManager 기본 파티(base_iris)로
    // 자동 채우도록 빈 배열로 넘긴다. HeroDetailScene 은 신규 게스트 확정 지급 영웅인
    // base_iris 를 조회한다(BootScene._initRegistry() 가 registry.ownedHeroes 에 심어 둠).
    // Node 쪽에서 직접 읽는다 — 브라우저 안에서 동적 import('*.json') 은 Vite dev 서버가
    // MIME 타입을 application/json 으로 내려줘서 모듈로 취급하지 않는다(스펙상 허용 안 됨).
    const stagesJson = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'stages.json'), 'utf-8'));
    const stage = stagesJson.chapters[0].stages[0];

    const loadsAtStart = loadCount;
    const defeatCycles = [];

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      process.stdout.write(`--- 사이클 ${cycle}/${CYCLES} `);
      if (loadCount !== loadsAtStart) {
        throw new Error('측정 도중 페이지가 리로드됐다 — 누적 수치를 신뢰할 수 없다. 다시 실행하라.');
      }

      // 1. 영웅 목록
      await page.evaluate(() => window.game.scene.getScene('MainMenuScene').scene.start('HeroListScene'));
      await waitForActiveScene(page, 'HeroListScene');
      await page.waitForTimeout(400);

      // 2. 영웅 상세 — 사이클마다 다른 영웅을 연다.
      // 매번 같은 영웅을 열면 전신 시트(fb_*)·@2x·치비 시트가 "이미 존재"로 재사용돼
      // 텍스처 누적이 측정에 잡히지 않는다. 소환으로 보유 영웅이 매 사이클 늘어나므로
      // 사이클 번호로 순회해 서로 다른 대형 전용 텍스처를 실제로 태운다.
      const heroId = await page.evaluate((i) => {
        const owned = window.game.registry.get('ownedHeroes') || [];
        const ids = owned.map((h) => (typeof h === 'string' ? h : h && h.id)).filter(Boolean);
        return ids.length > 0 ? ids[i % ids.length] : 'base_iris';
      }, cycle - 1);
      await page.evaluate((id) => {
        window.game.scene.getScene('HeroListScene').scene.start('HeroDetailScene', { heroId: id });
      }, heroId);
      await waitForActiveScene(page, 'HeroDetailScene');
      await page.waitForTimeout(900); // 전신 시트 + @2x + 치비 시트 로드 대기

      // 3. 소환 (GachaScene) — 실제 1회 소환을 트리거해 결과 연출까지 태운 뒤 강제 종료
      await page.evaluate(() => {
        window.game.scene.getScene('HeroDetailScene').scene.start('GachaScene');
      });
      await waitForActiveScene(page, 'GachaScene');
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('GachaScene');
        if (scene && typeof scene.onGemButton === 'function') scene.onGemButton(1);
      });
      await page.waitForTimeout(2500); // 소환 연출 진행
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('GachaScene');
        if (scene && scene.resultOverlay) scene.resultOverlay.destroy();
      });
      await page.waitForTimeout(300);

      // 소환으로 처음 얻은 영웅은 first_hero 컷씬(10종, oncePerAccount)을 띄울 수 있다.
      // 지금 로스터에서는 뜨지 않지만, 뜨면 다음 씬 대기가 통째로 타임아웃된다 —
      // cs_1_1_clear 로 이미 한 번 당한 함정이라 같은 자리를 미리 막는다.
      await skipCutscenesIfAny(page, { rounds: 2, timeout: 800 });

      // 4. 스테이지 선택
      await page.evaluate(() => {
        window.game.scene.getScene('GachaScene').scene.start('StageSelectScene');
      });
      await waitForActiveScene(page, 'StageSelectScene');
      await page.waitForTimeout(400);

      // 5. 전투. BootScene._initRegistry() 가 registry.autoBattle 을 기본 false 로
      // 심어 둔다(사용자 설정값) — 그대로 두면 BattleScene 이 수동 턴 입력을 기다리며
      // 영원히 끝나지 않는다. 이 스모크는 전투 로직이 아니라 씬 메모리 수명이
      // 관심사이므로 자동전투로 강제해 결과 화면까지 자연 진행시킨다.
      // 결과 화면 전환 자체는 BattleScene 의 승패 판정 로직이 스스로 건다 — 여기서
      // 수동으로 scene.start('BattleResultScene', ...)를 또 부르면 진행 중이던 자동
      // 전환과 경합해 씬 매니저가 불안정해진다(실측 확인). 그래서 자연 발생을 기다린다.
      await page.evaluate(() => window.game.registry.set('autoBattle', true));
      await page.evaluate((stageData) => {
        window.game.scene.getScene('StageSelectScene').scene.start('BattleScene', {
          stage: stageData,
          party: [],
          mode: 'normal',
        });
      }, stage);
      await waitForActiveScene(page, 'BattleScene');

      // 6. 결과 화면 — 자동전투가 실제로 끝날 때까지 자연 대기.
      // 승리하면 BattleResultScene 이 뜬 직후 cs_1_1_clear 컷씬이 그 위를 덮는다.
      // 그래서 "결과 화면"이 아니라 "결과 화면 또는 컷씬"을 기다린 뒤 컷씬을 넘긴다.
      await page.waitForFunction(
        () => !!(window.game?.scene.isActive('BattleResultScene') || window.game?.scene.isActive('CutsceneScene')),
        null,
        { timeout: 90000 }
      );
      await skipCutscenesIfAny(page, { rounds: 4, timeout: 3000 });
      await waitForActiveScene(page, 'BattleResultScene', 30000);
      await page.waitForTimeout(500);

      // 이번 사이클이 실제로 이겼는지 기록한다. 스모크가 패배 경로만 돌면 승리 전환·보상
      // 지급·결과 배경을 한 번도 지나지 않는다 — 예전에 실제로 그 상태였다(§측정 커버리지).
      const battleOutcome = await page.evaluate(() => {
        const sc = window.game.scene.getScene('BattleResultScene');
        return sc && sc.victory ? 'victory' : 'defeat';
      });
      if (battleOutcome !== 'victory') defeatCycles.push(cycle);

      // 7. 메인으로 복귀 — 이 시점에 스냅샷을 찍는다(사이클의 안정된 공통 지점)
      await page.evaluate(() => {
        window.game.scene.getScene('BattleResultScene').scene.start('MainMenuScene');
      });
      await waitForActiveScene(page, 'MainMenuScene');
      await page.waitForTimeout(800);

      const cdpMetrics = await readCdpMetrics(cdp);
      await page.waitForTimeout(150);
      const pageSnap = await collectPageSnapshot(page, TEXTURE_BUCKETS);
      const snap = { label: `cycle_${cycle}`, heroId, battleOutcome, ...cdpMetrics, ...pageSnap };
      snapshots.push(snap);
      console.log(
        `heap=${mb(snap.heapUsedBytes)} tex=${snap.textureCount}키/${mb(snap.textureBytes)} ` +
        `tween=${snap.tweenCount} timer=${snap.timerCount} obj=${snap.displayObjectCount} ` +
        `gfx=${snap.graphicsCount} emit=${snap.emitterCount} ` +
        `lsn(scene/game/bus/dom)=${snap.sceneListeners}/${snap.gameListeners}/${snap.eventBusListeners}/${snap.domListeners}`
      );
    }

    const baseIdx = Math.min(BASELINE_CYCLE, snapshots.length) - 1;
    const base = snapshots[baseIdx];
    const last = snapshots[snapshots.length - 1];
    const delta = (field) =>
      base[field] == null || last[field] == null ? null : last[field] - base[field];

    const heapGrowthPercent =
      base.heapUsedBytes && last.heapUsedBytes
        ? ((last.heapUsedBytes - base.heapUsedBytes) / base.heapUsedBytes) * 100
        : null;

    const baseKeys = new Set(base.textureKeys || []);
    const lastKeys = new Set(last.textureKeys || []);
    const addedKeys = [...lastKeys].filter((k) => !baseKeys.has(k)).sort();
    const removedKeys = [...baseKeys].filter((k) => !lastKeys.has(k)).sort();

    // 텍스처 키는 두 종류의 "포화하는 캐시"를 포함한다. 이들은 누수가 아니라 캐시라
    // 증가분이 아니라 절대 상한으로 감시해야 한다:
    //   vectorIcon  — 키가 (아이콘×크기×팔레트색) 이라 조합 수에서 상한이 걸린다.
    //                 20회 순환 실측에서 18→25 로 오르다 10회차부터 11회 연속 25 고정.
    //   textCanvas  — Phaser Text 의 UUID 캔버스. 생성·파기가 짝을 이루는 회전이다.
    // 그래서 "실제 누적"은 이 둘을 뺀 core 로 재고, 캐시는 따로 절대 상한을 건다.
    const bucketCount = (snap, name) =>
      snap.textureBuckets && snap.textureBuckets[name] ? snap.textureBuckets[name].count : 0;
    const coreCount = (snap) =>
      snap.textureCount - bucketCount(snap, 'vectorIcon') - bucketCount(snap, 'textCanvas');
    const coreTextureGrowth = coreCount(last) - coreCount(base);
    const vectorIconKeys = bucketCount(last, 'vectorIcon');

    const summary = {
      baselineLabel: base.label,
      coreTextureGrowth,
      coreTextureBaseline: coreCount(base),
      coreTextureFinal: coreCount(last),
      vectorIconKeys,
      addedTextureKeys: addedKeys,
      removedTextureKeys: removedKeys,
      finalLabel: last.label,
      heapBaselineBytes: base.heapUsedBytes,
      heapFinalBytes: last.heapUsedBytes,
      heapGrowthPercent,
      textureGrowth: delta('textureCount'),
      textureBytesGrowth: delta('textureBytes'),
      tweenGrowth: delta('tweenCount'),
      timerGrowth: delta('timerCount'),
      displayObjGrowth: delta('displayObjectCount'),
      graphicsGrowth: delta('graphicsCount'),
      emitterGrowth: delta('emitterCount'),
      sceneListenerGrowth: delta('sceneListeners'),
      gameListenerGrowth: delta('gameListeners'),
      eventBusListenerGrowth: delta('eventBusListeners'),
      domListenerGrowth: delta('domListeners'),
      domNodeGrowth: delta('domNodes'),
      finalTweenCount: last.tweenCount,
      finalTimerCount: last.timerCount,
      finalTextureBytes: last.textureBytes,
    };

    console.log(`\n=== 결과 (기준선 ${base.label} → ${last.label}) ===`);
    console.log(`힙: ${mb(base.heapUsedBytes)} → ${mb(last.heapUsedBytes)} (${heapGrowthPercent === null ? 'N/A' : heapGrowthPercent.toFixed(1) + '%'})`);
    console.log(`텍스처: ${base.textureCount}키 → ${last.textureCount}키 (${signed(summary.textureGrowth)}), ${mb(base.textureBytes)} → ${mb(last.textureBytes)}`);
    console.log(`  └ 캐시 제외 순증 ${signed(coreTextureGrowth)} (${coreCount(base)}→${coreCount(last)}) / 아이콘 캐시 ${vectorIconKeys}키`);
    console.log(`트윈 ${signed(summary.tweenGrowth)} / 타이머 ${signed(summary.timerGrowth)} / 표시객체 ${signed(summary.displayObjGrowth)} / Graphics ${signed(summary.graphicsGrowth)} / 이미터 ${signed(summary.emitterGrowth)}`);
    console.log(`리스너 — 씬 ${signed(summary.sceneListenerGrowth)} / game ${signed(summary.gameListenerGrowth)} / EventBus ${signed(summary.eventBusListenerGrowth)} / DOM ${signed(summary.domListenerGrowth)}`);
    if (addedKeys.length > 0) console.log(`신규 상주 텍스처 키: ${addedKeys.join(', ')}`);
    if (removedKeys.length > 0) console.log(`해제된 텍스처 키: ${removedKeys.join(', ')}`);
    console.log('\n최종 텍스처 버킷:');
    for (const name of Object.keys(last.textureBuckets)) {
      const st = last.textureBuckets[name];
      if (st.count > 0) console.log(`   ${name.padEnd(14)} ${String(st.count).padStart(4)}키  ${mb(st.bytes)}`);
    }

    console.log('\n=== 예산 판정 ===');
    // 커버리지 게이트: 측정 경로가 실제 승리 경로를 지났는가.
    // 스모크가 패배만 반복하면 승리 전환·보상 지급·결과 배경 텍스처를 한 번도 재지 않는다.
    assert(
      defeatCycles.length === 0,
      '모든 사이클이 승리 경로를 통과',
      defeatCycles.length ? `패배 사이클: ${defeatCycles.join(', ')}` : ''
    );
    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));

    if (heapGrowthPercent !== null && BUDGET.heapGrowthMaxPercent != null) {
      assert(
        heapGrowthPercent <= BUDGET.heapGrowthMaxPercent,
        `힙 증가율 ≤ ${BUDGET.heapGrowthMaxPercent}%`,
        `${heapGrowthPercent.toFixed(1)}%`
      );
    }
    if (BUDGET.coreTextureGrowthMax != null) {
      assert(
        coreTextureGrowth <= BUDGET.coreTextureGrowthMax,
        `텍스처 키 순증(아이콘·텍스트 캐시 제외) ≤ ${BUDGET.coreTextureGrowthMax}개`,
        `${signed(coreTextureGrowth)} (전체 ${signed(summary.textureGrowth)})`
      );
    }
    if (BUDGET.vectorIconMaxKeys != null) {
      assert(
        vectorIconKeys <= BUDGET.vectorIconMaxKeys,
        `벡터 아이콘 캐시 ≤ ${BUDGET.vectorIconMaxKeys}키`,
        `${vectorIconKeys}키`
      );
    }
    if (BUDGET.textureResidentMaxMB != null) {
      assert(last.textureBytes / 1024 / 1024 <= BUDGET.textureResidentMaxMB, `상주 텍스처 총량 ≤ ${BUDGET.textureResidentMaxMB}MB`, mb(last.textureBytes));
    }
    if (BUDGET.sceneListenerGrowthMax != null) {
      assert(summary.sceneListenerGrowth <= BUDGET.sceneListenerGrowthMax, `씬 리스너 증가 ≤ ${BUDGET.sceneListenerGrowthMax}`, signed(summary.sceneListenerGrowth));
    }
    if (BUDGET.eventBusListenerGrowthMax != null && summary.eventBusListenerGrowth !== null) {
      assert(summary.eventBusListenerGrowth <= BUDGET.eventBusListenerGrowthMax, `EventBus 구독 증가 ≤ ${BUDGET.eventBusListenerGrowthMax}`, signed(summary.eventBusListenerGrowth));
    }
    if (BUDGET.activeTweenMax != null) {
      assert(last.tweenCount <= BUDGET.activeTweenMax, `메인 복귀 시 활성 트윈 ≤ ${BUDGET.activeTweenMax}`, `${last.tweenCount}`);
    }
    if (BUDGET.activeTimerMax != null) {
      assert(last.timerCount <= BUDGET.activeTimerMax, `메인 복귀 시 활성 타이머 ≤ ${BUDGET.activeTimerMax}`, `${last.timerCount}`);
    }
    if (BUDGET.displayObjectGrowthMax != null) {
      assert(summary.displayObjGrowth <= BUDGET.displayObjectGrowthMax, `표시객체 증가 ≤ ${BUDGET.displayObjectGrowthMax}`, signed(summary.displayObjGrowth));
    }

    summary.pass = failed === 0;

    const resultDoc = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      budget: BUDGET,
      textureBuckets: TEXTURE_BUCKETS,
      snapshots: snapshots.map((sn) => (sn === last ? sn : { ...sn, textureKeys: undefined })),
      battleOutcomes: snapshots.map((sn) => sn.battleOutcome),
      summary,
      pageErrors,
    };
    mkdirSync(dirname(RESULT_PATH), { recursive: true });
    writeFileSync(RESULT_PATH, JSON.stringify(resultDoc, null, 2) + '\n', 'utf-8');
    console.log(`\n결과 저장: ${RESULT_PATH}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('메모리 스모크 실행 실패:', err);
  process.exit(1);
});
