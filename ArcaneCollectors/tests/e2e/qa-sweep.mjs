/**
 * qa-sweep.mjs — 화면/기능 전수 QA 스윕 (Playwright)
 *
 * 목적
 *   게임의 전 화면을 순회하며 아래 5가지를 기계적으로 수집한다.
 *     1) 콘솔 에러 / 페이지 예외
 *     2) 옛 캐릭터 이미지 사용 지점 (256px 레거시 아트 hero_001~004·hero_039~091,
 *        캔버스 플레이스홀더, '?' 폴백)
 *     3) 레이아웃 겹침 (같은 층 텍스트 교차 / 화면 밖 이탈)
 *     4) 터치 타깃 48px(base) 미만
 *     5) 기능 동작 실패 (씬 전환·팝업 열기·전투 종료 실패)
 *
 * 계정 시나리오
 *   A. 레거시 기존 유저 — version 1 세이브(char_1~4 파티) → 마이그레이션 결과 확인
 *   B. 풍부한 유저      — 기본 10 + 전직 24 전원 보유, 튜토리얼 완료, 챕터 3
 *   C. 신규 게스트      — 세이브 없음. 로그인 → 프롤로그 → 튜토리얼 T-01~T-03
 *
 * 사전 조건: 개발 서버 실행 중 (기본 http://localhost:3000)
 * 실행: node tests/e2e/qa-sweep.mjs [--headed] [--only=A,B,C]
 * 산출물:
 *   docs/qa/screens/<번호>-<시나리오>-<화면>.png
 *   docs/qa/qa-sweep-result.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = path.join(ROOT, 'docs', 'qa', 'screens');
const RESULT_PATH = path.join(ROOT, 'docs', 'qa', 'qa-sweep-result.json');
const VIEWPORT = { width: 720, height: 1280 };
const HEADLESS = !process.argv.includes('--headed');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '');

mkdirSync(SHOT_DIR, { recursive: true });

/** 게임과 무관한 잡음 */
const IGNORED = [
  /favicon/i,
  /\[vite\]/i,
  /Download the React DevTools/i,
  /supabase/i,
  /net::ERR_/i,
  /Failed to load resource/i,
];
const isIgnored = (t) => IGNORED.some((re) => re.test(t));

// ============================================================
// 세이브 생성기
// ============================================================

const BASE_IDS = [
  'base_iris', 'base_sera', 'base_luca', 'base_kai', 'base_lin',
  'base_omar', 'base_sol', 'base_hana', 'base_leon', 'base_paolo',
];
const ASC_IDS = [
  'asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos',
  'asc_sera_avalon', 'asc_sera_kunlun', 'asc_sera_nature',
  'asc_luca_asgard', 'asc_luca_tartarus',
  'asc_kai_yomi', 'asc_kai_helheim',
  'asc_lin_takamagahara', 'asc_lin_balance',
  'asc_omar_valhalla', 'asc_omar_avalon',
  'asc_sol_nature', 'asc_sol_kunlun',
  'asc_hana_yomi', 'asc_hana_helheim', 'asc_hana_chaos',
  'asc_leon_asgard', 'asc_leon_olympus',
  'asc_paolo_tartarus', 'asc_paolo_chaos', 'asc_paolo_balance',
];

const heroRecord = (id, level, stars, extra = {}) => ({
  id,
  instanceId: `${id}_qa`,
  characterId: id,
  level,
  exp: 0,
  stars,
  skillLevels: [1, 1, 1],
  equipped: null,
  equipment: { weapon: null, armor: null, accessory: null },
  constellation: 0,
  acquiredAt: 1700000000000,
  ...extra,
});

/** A. 레거시(version 1) 세이브 — tutorial/onboarding/story 섹션 자체가 없다 */
function legacySave() {
  return {
    version: 1,
    player: { name: '레거시모험가', level: 18, exp: 400 },
    resources: { gold: 850000, gems: 4200, summonTickets: 7, skillBooks: 12 },
    characters: [
      heroRecord('char_1', 30, 4),
      heroRecord('char_2', 28, 4),
      heroRecord('char_3', 25, 3),
      heroRecord('char_4', 22, 3),
    ],
    parties: [['char_1', 'char_2', 'char_3', 'char_4']],
    inventory: [],
    progress: {
      currentChapter: 'chapter_2',
      clearedStages: { '1-1': 3, '1-2': 3, '1-3': 2, '1-4': 2, '1-5': 1, '2-1': 2, '2-2': 1 },
      towerFloor: 7,
      totalBattles: 143,
    },
    gacha: { pityCounter: 27, totalPulls: 84 },
    quests: { daily: {}, dailyProgress: {}, lastReset: null },
    settings: { bgmVolume: 0.7, sfxVolume: 0.8, autoSkip: false, battleSpeed: 1 },
    statistics: { totalGoldEarned: 900000, totalGemsSpent: 12000, charactersCollected: 4, highestDamage: 8800 },
    lastOnline: Date.now() - 3 * 3600 * 1000,
    lastLogoutTime: Date.now() - 3 * 3600 * 1000,
    createdAt: Date.now() - 90 * 86400 * 1000,
  };
}

/** B. 풍부한 유저 — v2, 전 영웅 보유, 튜토리얼 완주, 챕터 3 */
function richSave() {
  const characters = [
    ...BASE_IDS.map((id) => heroRecord(id, 30, 3, { isBaseHero: true })),
    ...ASC_IDS.map((id) => heroRecord(id, 50, 5, { isAscended: true })),
  ];
  const cleared = {};
  for (let c = 1; c <= 3; c += 1) {
    for (let st = 1; st <= 10; st += 1) {
      if (c === 3 && st > 4) break;
      cleared[`${c}-${st}`] = 3;
    }
  }
  return {
    version: 2,
    player: { name: '풍부한모험가', level: 42, exp: 1200 },
    resources: {
      gold: 5000000,
      gems: 30000,
      summonTickets: 40,
      skillBooks: 60,
      spiritStones: 40,
      characterShards: Object.fromEntries(BASE_IDS.map((id) => [id, 120])),
      worldTreeSeeds: 12,
      cultEssence: { olympus: 300, valhalla: 300, yomi: 300, avalon: 300 },
      institutionSeal: 15,
      awakeningFlame: 20,
    },
    characters,
    parties: [['asc_iris_olympus', 'asc_sera_avalon', 'asc_luca_asgard', 'asc_kai_yomi']],
    inventory: [],
    progress: { currentChapter: 'chapter_3', clearedStages: cleared, towerFloor: 24, totalBattles: 980 },
    gacha: { pityCounter: 55, totalPulls: 420, freeTenPullUsed: true },
    pity: {},
    quests: { daily: {}, dailyProgress: {}, lastReset: null },
    settings: { bgmVolume: 0.6, sfxVolume: 0.6, autoSkip: true, battleSpeed: 2 },
    statistics: { totalGoldEarned: 9000000, totalGemsSpent: 240000, charactersCollected: 34, highestDamage: 145000 },
    tutorial: {
      currentStep: 'T-12',
      completedSteps: ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12'],
      skippedSteps: [],
      skipped: false,
      completed: true,
      startedAt: Date.now() - 40 * 86400 * 1000,
      completedAt: Date.now() - 39 * 86400 * 1000,
    },
    story: {
      viewedCutscenes: ['prologue', 'chapter_1_intro', 'chapter_2_intro'],
      skippedCutscenes: [],
      currentChapterStory: 'chapter_3',
      lastViewedAt: Date.now() - 86400 * 1000,
    },
    onboarding: {
      grantVersion: 2,
      starterHeroGranted: true,
      starterHeroId: 'base_iris',
      freeMultiPullUsed: true,
      freeMultiPullAt: Date.now() - 38 * 86400 * 1000,
      firstAscensionGrantUsed: true,
      firstAscensionCultId: 'olympus',
      unlockedMenus: [
        'herolist', 'partyedit', 'ascension', 'quest', 'inventory', 'gacha',
        'collection', 'tower', 'eventdungeon', 'pvp', 'guild', 'friends', 'raid',
      ],
      idleIntroShown: true,
      returningPlayerTier: null,
      lastReturnRewardAt: null,
    },
    baseHeroes: BASE_IDS.map((id) => ({ baseHeroId: id, fragmentCount: 90, openedRoutes: [] })),
    ascendedHeroes: ASC_IDS.map((id) => {
      const parts = id.split('_');
      return {
        ascendedHeroId: id,
        baseHeroId: `base_${parts[1]}`,
        cultId: parts[2],
        rarity: 'SSR',
        obtainedAt: Date.now() - 20 * 86400 * 1000,
      };
    }),
    collections: {},
    lastOnline: Date.now() - 30 * 60 * 1000,
    lastLogoutTime: Date.now() - 30 * 60 * 1000,
    createdAt: Date.now() - 120 * 86400 * 1000,
  };
}

/** localStorage 주입 스크립트 (page.addInitScript 로 문서 로드 전에 실행) */
function seedScript({ saveData, guest }) {
  try { localStorage.clear(); } catch (e) { /* noop */ }
  if (guest) {
    const user = { id: 'guest_qa_sweep', nickname: 'QA', isGuest: true, createdAt: new Date().toISOString() };
    localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify(user));
    localStorage.setItem(
      'arcane_collectors_session_guest',
      JSON.stringify({ user, isGuest: true, loginAt: new Date().toISOString() })
    );
    localStorage.setItem(
      'arcane_auth',
      JSON.stringify({ userId: user.id, authType: 'guest', autoLogin: true, lastLogin: Date.now() })
    );
  }
  if (saveData) localStorage.setItem('arcane_collectors_save', JSON.stringify(saveData));
}

// ============================================================
// 페이지 내부 감사 함수 (self-contained — 외부 스코프 참조 금지)
// ============================================================

function auditImpl() {
  const G = window.game;
  if (!G || !G.scene) return { error: 'window.game 없음' };
  const gw = G.scale.gameSize.width;
  const gh = G.scale.gameSize.height;
  const SF = gw / 720; // base px → world px

  const activeScenes = G.scene.scenes.filter((sc) => G.scene.isActive(sc.scene.key));
  const nodes = [];

  const grab = (obj, sceneKey, layerDepth, pathStr) => {
    if (!obj) return;
    let bounds = null;
    try {
      if (typeof obj.getBounds === 'function') {
        const b = obj.getBounds();
        if (b && isFinite(b.x) && isFinite(b.width)) {
          bounds = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        }
      }
    } catch (e) { bounds = null; }

    let visible = obj.visible !== false;
    let a = obj.alpha === undefined ? 1 : obj.alpha;
    let masked = !!obj.mask;
    let p = obj.parentContainer;
    let guard = 0;
    while (p && guard < 40) {
      if (p.visible === false) visible = false;
      if (p.alpha !== undefined) a *= p.alpha;
      if (p.mask) masked = true;
      p = p.parentContainer;
      guard += 1;
    }

    // 터치 타깃은 시각 bounds 가 아니라 input.hitArea 로 판정해야 한다.
    // PopupBase 의 ✕ 처럼 글리프는 작아도 히트 영역을 48px 로 넓혀둔 경우가 많다.
    let hit = null;
    if (obj.input && obj.input.enabled) {
      const ha = obj.input.hitArea;
      let sx = 1;
      let sy = 1;
      try {
        if (typeof obj.getWorldTransformMatrix === 'function') {
          const m = obj.getWorldTransformMatrix();
          sx = Math.abs(m.scaleX) || 1;
          sy = Math.abs(m.scaleY) || 1;
        }
      } catch (e) { sx = 1; sy = 1; }
      if (ha && isFinite(ha.width) && ha.width > 0 && isFinite(ha.height) && ha.height > 0) {
        hit = { w: Math.round(ha.width * sx), h: Math.round(ha.height * sy), from: 'hitArea' };
      } else if (ha && isFinite(ha.radius) && ha.radius > 0) {
        hit = { w: Math.round(ha.radius * 2 * sx), h: Math.round(ha.radius * 2 * sy), from: 'circle' };
      }
    }

    const texKey = obj.texture && obj.texture.key ? obj.texture.key : null;
    let isCanvas = false;
    let srcFile = null;
    let texW = null;
    let texH = null;
    if (obj.texture && obj.texture.source && obj.texture.source[0]) {
      const src = obj.texture.source[0];
      isCanvas = !!src.isCanvas;
      texW = src.width;
      texH = src.height;
      const raw = src.source && typeof src.source.src === 'string' ? src.source.src : null;
      if (raw) srcFile = raw.split('/').pop().split('?')[0];
    }

    nodes.push({
      scene: sceneKey,
      layerDepth,
      path: pathStr,
      type: obj.type,
      cls: obj.constructor && obj.constructor.name ? obj.constructor.name : '',
      name: obj.name || '',
      depth: obj.depth === undefined ? 0 : obj.depth,
      text: obj.type === 'Text' && typeof obj.text === 'string' ? obj.text : null,
      texKey,
      isCanvas,
      srcFile,
      texW,
      texH,
      visible,
      masked,
      alpha: Math.round(a * 100) / 100,
      interactive: !!(obj.input && obj.input.enabled),
      hit,
      bounds,
    });
  };

  const walk = (list, sceneKey, layerDepth, prefix, level) => {
    if (!Array.isArray(list) || level > 12) return;
    for (let i = 0; i < list.length; i += 1) {
      const obj = list[i];
      if (!obj) continue;
      const label = obj.name || (obj.constructor && obj.constructor.name) || obj.type;
      const pathStr = `${prefix}/${label}[${i}]`;
      grab(obj, sceneKey, layerDepth, pathStr);
      if (Array.isArray(obj.list) && obj.list.length) walk(obj.list, sceneKey, layerDepth, pathStr, level + 1);
    }
  };

  activeScenes.forEach((sc) => {
    const key = sc.scene.key;
    const top = sc.children && sc.children.list ? sc.children.list : [];
    for (let i = 0; i < top.length; i += 1) {
      const obj = top[i];
      if (!obj) continue;
      const layerDepth = obj.depth === undefined ? 0 : obj.depth;
      const label = obj.name || (obj.constructor && obj.constructor.name) || obj.type;
      const pathStr = `${key}/${label}[${i}]`;
      grab(obj, key, layerDepth, pathStr);
      if (Array.isArray(obj.list) && obj.list.length) walk(obj.list, key, layerDepth, pathStr, 1);
    }
  });

  const onScreen = (b) => !!b && b.x + b.w > 0 && b.x < gw && b.y + b.h > 0 && b.y < gh;
  const vis = nodes.filter((n) => n.visible && n.alpha > 0.05);
  const shown = vis.filter((n) => !n.bounds || onScreen(n.bounds));

  // ---- 1) 옛 이미지 / 플레이스홀더 ----
  const oldImages = [];
  shown.forEach((n) => {
    if (!n.texKey) return;
    if (n.bounds && (n.bounds.w < 4 || n.bounds.h < 4)) return;
    let reason = null;
    if (n.srcFile) {
      const m = n.srcFile.match(/^hero_(\d{3})\./);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num <= 4 || num >= 39) reason = `레거시 256px 카툰 아트 (${n.srcFile})`;
      }
    }
    if (!reason && n.isCanvas) {
      if (/^hero_/.test(n.texKey)) reason = '캔버스 플레이스홀더 (포트레이트 미로드)';
      else if (/^char_(card|full)_/.test(n.texKey)) reason = '레거시 캔버스 카드/일러스트';
      else if (/placeholder/i.test(n.texKey)) reason = '캔버스 플레이스홀더';
    }
    if (!reason && /placeholder|__MISSING|__DEFAULT/i.test(n.texKey)) reason = `누락 텍스처 (${n.texKey})`;
    if (reason) {
      oldImages.push({
        scene: n.scene,
        path: n.path,
        texKey: n.texKey,
        srcFile: n.srcFile,
        texSize: n.texW ? `${n.texW}x${n.texH}` : null,
        bounds: n.bounds,
        reason,
      });
    }
  });

  shown.filter((n) => n.type === 'Text' && n.text && n.text.trim() === '?').forEach((n) => {
    oldImages.push({
      scene: n.scene, path: n.path, texKey: null, srcFile: null, texSize: null,
      bounds: n.bounds, reason: "'?' 폴백 텍스트",
    });
  });

  // ---- 2) 화면 밖 이탈 (텍스트 / 인터랙티브만) ----
  const offscreen = [];
  let clippedInScroll = 0;
  vis.forEach((n) => {
    if (!n.bounds) return;
    if (n.type !== 'Text' && !n.interactive) return;
    if (n.masked) { clippedInScroll += 1; return; } // 스크롤 마스크 내부는 정상
    const b = n.bounds;
    if (b.w <= 0 || b.h <= 0) return;
    if (b.w > gw * 1.4 || b.h > gh * 1.4) return; // 전면 스크림/배경 제외
    const fully = b.x + b.w <= 0 || b.x >= gw || b.y + b.h <= 0 || b.y >= gh;
    const worst = Math.max(-b.x, b.x + b.w - gw, -b.y, b.y + b.h - gh);
    if (fully || worst > 2) {
      offscreen.push({
        scene: n.scene, path: n.path, type: n.type, cls: n.cls,
        text: n.text ? n.text.slice(0, 30) : null,
        bounds: b, fully, overflowPx: Math.round(worst),
      });
    }
  });

  // ---- 3) 같은 층 텍스트 교차 ----
  const overlaps = [];
  const texts = shown.filter(
    (n) => n.type === 'Text' && n.text && n.text.trim().length > 0 && n.bounds && n.bounds.w > 2 && n.bounds.h > 2
  );
  outer:
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const A = texts[i];
      const B = texts[j];
      if (A.scene !== B.scene) continue;
      if (A.layerDepth !== B.layerDepth) continue;
      if (A.path.startsWith(B.path) || B.path.startsWith(A.path)) continue;
      const a = A.bounds;
      const b = B.bounds;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix <= 1 || iy <= 1) continue;
      const ratio = (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
      if (ratio < 0.3) continue;
      overlaps.push({
        scene: A.scene,
        layerDepth: A.layerDepth,
        a: { path: A.path, text: A.text.slice(0, 24), bounds: a },
        b: { path: B.path, text: B.text.slice(0, 24), bounds: b },
        overlapRatio: Math.round(ratio * 100) / 100,
      });
      if (overlaps.length > 60) break outer;
    }
  }

  // ---- 4) 터치 타깃 48px(base) 미만 ----
  const smallTargets = [];
  const seen = {};
  shown.filter((n) => n.interactive && (n.hit || n.bounds)).forEach((n) => {
    const src = n.hit || { w: n.bounds.w, h: n.bounds.h, from: 'bounds' };
    if (src.w <= 0 || src.h <= 0) return;
    const bw = src.w / SF;
    const bh = src.h / SF;
    if (Math.min(bw, bh) >= 48) return;
    const sig = `${n.scene}|${n.cls}|${Math.round(bw)}x${Math.round(bh)}|${(n.text || '').slice(0, 12)}`;
    if (seen[sig]) { seen[sig].count += 1; return; }
    const entry = {
      scene: n.scene, path: n.path, cls: n.cls, name: n.name,
      text: n.text ? n.text.slice(0, 20) : null,
      basePx: `${Math.round(bw)}x${Math.round(bh)}`,
      measuredFrom: src.from,
      bounds: n.bounds, count: 1,
    };
    seen[sig] = entry;
    smallTargets.push(entry);
  });

  return {
    scenes: activeScenes.map((sc) => sc.scene.key),
    objectCount: nodes.length,
    visibleCount: vis.length,
    onScreenCount: shown.length,
    clippedInScroll,
    oldImages,
    offscreen,
    overlaps,
    smallTargets,
  };
}

/** 텍스처 매니저 전수 조사 — 시나리오당 1회 */
function textureReportImpl() {
  const tm = window.game.textures;
  const keys = tm.getTextureKeys().filter((k) => /^(hero_|fb_|char_card_|char_full_)/.test(k));
  return keys.map((k) => {
    const t = tm.get(k);
    const s = t.source[0];
    const raw = s && s.source && typeof s.source.src === 'string' ? s.source.src.split('/').pop().split('?')[0] : null;
    return { key: k, isCanvas: !!(s && s.isCanvas), w: s ? s.width : 0, h: s ? s.height : 0, file: raw };
  });
}

// ============================================================
// 조작 유틸
// ============================================================

async function safeEval(page, fn, arg) {
  try {
    return await page.evaluate(fn, arg);
  } catch (e) {
    if (!/Execution context was destroyed|context was destroyed|Target closed|Target page/.test(e.message || '')) throw e;
    await page.waitForTimeout(600);
    return page.evaluate(fn, arg);
  }
}

async function waitFor(page, fn, timeout = 10000, arg) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await page.evaluate(fn, arg)) return true;
    } catch (e) { /* HMR 중 컨텍스트 파괴 */ }
    await page.waitForTimeout(150);
  }
  return false;
}

/** HMR 리로드 직후 window.game 이 사라진 상태를 넘긴다 */
async function ensureGame(page, timeout = 30000) {
  const ok = await waitFor(
    page,
    () => !!(window.game && window.game.scene && window.game.scene.scenes && window.game.scene.scenes.length),
    timeout
  );
  if (!ok) throw new Error('window.game 미준비 (HMR 리로드 대기 실패)');
  return true;
}

async function canvasMap(page) {
  return safeEval(page, () => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return {
      x: r.x, y: r.y, w: r.width, h: r.height,
      gw: window.game.scale.gameSize.width,
      gh: window.game.scale.gameSize.height,
    };
  });
}

async function tapWorld(page, wx, wy) {
  const m = await canvasMap(page);
  await page.mouse.click(m.x + (wx * m.w) / m.gw, m.y + (wy * m.h) / m.gh);
  await page.waitForTimeout(200);
}

async function findLabel(page, sceneKeys, label) {
  return safeEval(page, ({ keys, text }) => {
    const collect = (list, out) => {
      list.forEach((o) => {
        if (!o) return;
        out.push(o);
        if (Array.isArray(o.list) && o.list.length) collect(o.list, out);
      });
      return out;
    };
    for (const key of keys) {
      const sc = window.game.scene.getScene(key);
      if (!sc || !window.game.scene.isActive(key)) continue;
      const all = collect(sc.children.list, []);
      const hit = all.find(
        (o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes(text) && o.visible !== false
      );
      if (!hit) continue;
      const b = hit.getBounds();
      return { sceneKey: key, x: b.centerX, y: b.centerY };
    }
    return null;
  }, { keys: Array.isArray(sceneKeys) ? sceneKeys : [sceneKeys], text: label });
}

async function tapLabel(page, sceneKeys, label) {
  const f = await findLabel(page, sceneKeys, label);
  if (!f) return false;
  await tapWorld(page, f.x, f.y);
  return true;
}

async function closePopup(page) {
  await ensureGame(page);
  await safeEval(page, () => {
    if (!window.game || !window.game.scene) return;
    const mm = window.game.scene.getScene('MainMenuScene');
    if (mm && mm.activePopup) {
      try { mm.activePopup.close(); } catch (e) {
        try { mm.activePopup.destroy(); } catch (e2) { /* noop */ }
      }
      mm.activePopup = null;
    }
  });
  await page.waitForTimeout(400);
}

async function gotoMain(page) {
  await closePopup(page);
  await safeEval(page, () => {
    const g = window.game;
    if (!g || !g.scene) return;
    if (g.scene.isActive('MainMenuScene')) return;
    const active = g.scene.scenes.filter((s) => g.scene.isActive(s.scene.key));
    const src = active[0];
    if (src) src.scene.start('MainMenuScene');
    else g.scene.start('MainMenuScene');
  });
  await waitFor(page, () => window.game.scene.isActive('MainMenuScene'), 12000);
  await page.waitForTimeout(900);
}

// ============================================================
// 스윕 실행기
// ============================================================

function makeCtx(page, scenarioId, counter) {
  return { page, scenarioId, counter, steps: [], consoleErrors: [], pageErrors: [], viteReconnected: false };
}

async function runStep(ctx, name, fn) {
  const num = String(ctx.counter.n).padStart(2, '0');
  ctx.counter.n += 1;
  const slug = `${num}-${ctx.scenarioId}-${name}`;
  const shotRel = `docs/qa/screens/${slug}.png`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    ctx.consoleErrors.length = 0;
    ctx.pageErrors.length = 0;
    ctx.viteReconnected = false;
    const rec = { n: num, scenario: ctx.scenarioId, name, shot: shotRel, ok: true, notes: [] };
    try {
      await ensureGame(ctx.page);
      if (fn) await fn(ctx.page, rec);
      await ctx.page.waitForTimeout(350);
      const audit = await safeEval(ctx.page, auditImpl);
      Object.assign(rec, audit || {});
      try {
        await ctx.page.screenshot({ path: path.join(SHOT_DIR, `${slug}.png`) });
      } catch (e) {
        rec.notes.push(`스크린샷 실패: ${e.message}`);
      }
      if (ctx.viteReconnected && attempt === 0) {
        console.log(`   ↻ HMR 리로드 감지 — ${name} 재시도`);
        await ctx.page.waitForTimeout(1500);
        continue;
      }
      rec.consoleErrors = [...ctx.consoleErrors];
      rec.pageErrors = [...ctx.pageErrors];
      ctx.steps.push(rec);
      const flags = [];
      if (rec.oldImages && rec.oldImages.length) flags.push(`옛이미지 ${rec.oldImages.length}`);
      if (rec.overlaps && rec.overlaps.length) flags.push(`겹침 ${rec.overlaps.length}`);
      if (rec.offscreen && rec.offscreen.length) flags.push(`화면밖 ${rec.offscreen.length}`);
      if (rec.smallTargets && rec.smallTargets.length) flags.push(`작은타깃 ${rec.smallTargets.length}`);
      if (rec.consoleErrors.length) flags.push(`콘솔에러 ${rec.consoleErrors.length}`);
      if (rec.pageErrors.length) flags.push(`예외 ${rec.pageErrors.length}`);
      console.log(`   [${num}] ${name} — ${flags.length ? flags.join(', ') : 'clean'}`);
      if (rec.notes.length) rec.notes.forEach((nt) => console.log(`        · ${nt}`));
      return rec;
    } catch (e) {
      if (attempt === 0) {
        console.log(`   ↻ ${name} 실패(${e.message}) — 재시도`);
        await ctx.page.waitForTimeout(1200);
        continue;
      }
      rec.ok = false;
      rec.error = e.message || String(e);
      rec.consoleErrors = [...ctx.consoleErrors];
      rec.pageErrors = [...ctx.pageErrors];
      ctx.steps.push(rec);
      console.log(`   [${num}] ${name} — FAIL ${rec.error}`);
      return rec;
    }
  }
  return null;
}

/** 컷씬이 떠 있으면 [건너뛰기]로 넘긴다. 연속 컷씬도 처리한다 */
async function skipCutscenes(page, rounds = 4) {
  let n = 0;
  for (let i = 0; i < rounds; i += 1) {
    const up = await waitFor(page, () => !!(window.game && window.game.scene.isActive('CutsceneScene')), i === 0 ? 4000 : 1500);
    if (!up) break;
    await page.waitForTimeout(500);
    const tapped = await tapLabel(page, ['CutsceneScene'], '건너뛰기');
    if (!tapped) {
      for (let k = 0; k < 25; k += 1) {
        if (!(await safeEval(page, () => window.game.scene.isActive('CutsceneScene')))) break;
        await tapWorld(page, 540, 700);
      }
    }
    await waitFor(page, () => !window.game.scene.isActive('CutsceneScene'), 12000);
    n += 1;
  }
  if (n) await page.waitForTimeout(500);
  return n;
}

/** StageSelectScene 이 활성인지 보장한다 (HMR 리로드로 메인으로 튕긴 경우 재진입) */
async function ensureStageSelect(page) {
  await ensureGame(page);
  if (await safeEval(page, () => !!(window.game && window.game.scene.isActive('StageSelectScene')))) return true;
  await gotoMain(page);
  await safeEval(page, () => {
    const g = window.game;
    const active = g.scene.scenes.filter((s) => g.scene.isActive(s.scene.key))[0];
    if (active) active.scene.start('StageSelectScene');
  });
  const ok = await waitFor(page, () => window.game.scene.isActive('StageSelectScene'), 15000);
  if (ok) await page.waitForTimeout(1000);
  return ok;
}

const POPUP_KEYS = [
  ['gacha', '소환'],
  ['herolist', '영웅목록'],
  ['partyedit', '파티편성'],
  ['quest', '퀘스트'],
  ['tower', '무한탑'],
  ['ascension', '각인'],
  ['eventdungeon', '이벤트던전'],
  ['inventory', '가방'],
  ['settings', '설정'],
  ['pvp', 'PvP'],
  ['guild', '길드'],
  ['raid', '레이드'],
  ['friends', '친구'],
  ['collection', '도감'],
  ['storylog', '스토리로그'],
];

async function openPopupStep(ctx, key, label) {
  return runStep(ctx, `popup-${key}`, async (page, rec) => {
    await gotoMain(page);
    const opened = await safeEval(page, (k) => {
      const mm = window.game.scene.getScene('MainMenuScene');
      if (!mm) return 'no-scene';
      try { mm.openPopup(k); } catch (e) { return `throw: ${e.message}`; }
      return !!mm.activePopup;
    }, key);
    if (opened !== true) rec.notes.push(`팝업 열기 실패(${label}) → ${opened}`);
    await page.waitForTimeout(1100);
    const stillOpen = await safeEval(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return !!(mm && mm.activePopup);
    });
    if (!stillOpen) rec.notes.push('열린 직후 팝업이 사라짐');
  });
}

// ============================================================
// 공통 화면 스윕
// ============================================================

async function sweepCommonScreens(ctx) {
  const { page } = ctx;

  await runStep(ctx, 'mainmenu-idle-1', async (p) => {
    await gotoMain(p);
    await p.waitForTimeout(1200);
  });
  await runStep(ctx, 'mainmenu-idle-2', async (p) => {
    await p.waitForTimeout(6000);
  });

  for (const [key, label] of POPUP_KEYS) {
    await openPopupStep(ctx, key, label);
  }

  // ---- 소환 상세 ----
  await runStep(ctx, 'gacha-tab-switch', async (p, rec) => {
    await gotoMain(p);
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('gacha'));
    await p.waitForTimeout(1000);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop || typeof pop.switchTab !== 'function') return 'no-switchTab';
      const before = pop.currentTab || pop.activeTab || null;
      const tabs = pop.tabs || pop.bannerTabs || null;
      let next = 'pickup';
      if (Array.isArray(tabs) && tabs.length > 1) next = tabs[1].id || tabs[1].key || tabs[1];
      try { pop.switchTab(next); } catch (e) { return `throw: ${e.message}`; }
      return { before, requested: next, after: pop.currentTab || pop.activeTab || null };
    });
    if (typeof r === 'string') rec.notes.push(`배너 탭 전환 불가: ${r}`);
    else if (r.before === r.after) rec.notes.push(`배너 탭이 바뀌지 않음 (${JSON.stringify(r)})`);
    else rec.notes.push(`배너 탭 ${r.before} → ${r.after}`);
    await p.waitForTimeout(800);
  });

  await runStep(ctx, 'gacha-rate-disclosure', async (p, rec) => {
    const ok = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop || typeof pop.openRateDisclosure !== 'function') return false;
      try { pop.openRateDisclosure(); return true; } catch (e) { return false; }
    });
    if (!ok) rec.notes.push('확률 고지 패널을 열 수 없음');
    await p.waitForTimeout(1000);
  });

  await runStep(ctx, 'gacha-single-result', async (p, rec) => {
    await gotoMain(p);
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('gacha'));
    await p.waitForTimeout(900);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop || typeof pop.performSummon !== 'function') return 'no-performSummon';
      try { pop.performSummon(1, false); return 'ok'; } catch (e) { return `throw: ${e.message}`; }
    });
    if (r !== 'ok') rec.notes.push(`단발 소환 실패: ${r}`);
    await p.waitForTimeout(2500);
  });

  await runStep(ctx, 'gacha-ten-result', async (p, rec) => {
    await gotoMain(p);
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('gacha'));
    await p.waitForTimeout(900);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop || typeof pop.performSummon !== 'function') return 'no-performSummon';
      try { pop.performSummon(10, false); return 'ok'; } catch (e) { return `throw: ${e.message}`; }
    });
    if (r !== 'ok') rec.notes.push(`10연 소환 실패: ${r}`);
    await p.waitForTimeout(3200);
  });
  await gotoMain(page);

  // ---- 영웅 목록 팝업 ----
  await runStep(ctx, 'herolist-filter-sort', async (p, rec) => {
    await gotoMain(p);
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('herolist'));
    await p.waitForTimeout(1000);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop) return 'no-popup';
      const out = {};
      if (pop.filters) { pop.filters.rarity = 'SSR'; out.filter = 'SSR'; }
      if (pop.sortBy !== undefined) { pop.sortBy = 'power'; out.sort = 'power'; }
      try {
        if (typeof pop.refreshGrid === 'function') pop.refreshGrid();
        if (typeof pop.updateSortButtons === 'function') pop.updateSortButtons();
        if (typeof pop.updateRarityButtons === 'function') pop.updateRarityButtons();
      } catch (e) { out.error = e.message; }
      out.shown = pop.filteredHeroes ? pop.filteredHeroes.length : null;
      out.total = pop.heroes ? pop.heroes.length : null;
      return out;
    });
    if (typeof r === 'string') rec.notes.push(`필터/정렬 조작 실패: ${r}`);
    else rec.notes.push(`필터/정렬 결과: ${JSON.stringify(r)}`);
    await p.waitForTimeout(900);
  });

  await runStep(ctx, 'heroinfo-popup', async (p, rec) => {
    const r = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const pop = mm.activePopup;
      if (!pop || typeof pop.openHeroInfo !== 'function') return 'no-openHeroInfo';
      const heroes = pop.filteredHeroes && pop.filteredHeroes.length ? pop.filteredHeroes : (pop.heroes || []);
      const target = heroes[0];
      if (!target) return 'no-hero';
      try { pop.openHeroInfo(target.id); } catch (e) { return `throw: ${e.message}`; }
      return {
        heroId: target.id,
        visible: !!(pop.heroPopup && pop.heroPopup.isVisible && pop.heroPopup.isVisible()),
      };
    });
    if (typeof r === 'string') rec.notes.push(`HeroInfoPopup 열기 실패: ${r}`);
    else if (!r.visible) rec.notes.push(`HeroInfoPopup 이 표시되지 않음 (${r.heroId})`);
    else rec.notes.push(`HeroInfoPopup 표시: ${r.heroId}`);
    await p.waitForTimeout(1200);
  });
  await gotoMain(page);

  // ---- 영웅 목록 씬 + 상세 4탭 ----
  await runStep(ctx, 'scene-herolist', async (p, rec) => {
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').scene.start('HeroListScene'));
    const ok = await waitFor(p, () => window.game.scene.isActive('HeroListScene'), 12000);
    if (!ok) rec.notes.push('HeroListScene 진입 실패');
    await p.waitForTimeout(1300);
  });

  const heroForDetail = await safeEval(page, () => {
    const owned = window.game.registry.get('ownedHeroes') || [];
    if (owned.length) return owned[owned.length - 1].id;
    try {
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      return save && save.characters && save.characters.length ? save.characters[0].id : null;
    } catch (e) { return null; }
  });

  for (const tab of ['stats', 'skills', 'equip', 'story']) {
    // eslint-disable-next-line no-await-in-loop
    await runStep(ctx, `herodetail-${tab}`, async (p, rec) => {
      const r = await safeEval(p, ({ heroId, tabId }) => {
        if (!heroId) return 'no-hero';
        const g = window.game;
        const active = g.scene.scenes.filter((s) => g.scene.isActive(s.scene.key))[0];
        if (!active) return 'no-active-scene';
        active.scene.start('HeroDetailScene', { heroId, tab: tabId });
        return 'started';
      }, { heroId: heroForDetail, tabId: tab });
      if (r !== 'started') { rec.notes.push(`영웅 상세 진입 실패: ${r}`); return; }
      const ok = await waitFor(p, () => window.game.scene.isActive('HeroDetailScene'), 12000);
      if (!ok) { rec.notes.push('HeroDetailScene 활성화 실패'); return; }
      await p.waitForTimeout(1500);
      const actual = await safeEval(p, () => {
        const sc = window.game.scene.getScene('HeroDetailScene');
        return sc ? sc.activeTab : null;
      });
      if (actual !== tab) rec.notes.push(`탭 불일치: 요청=${tab} 실제=${actual}`);
    });
  }

  // ---- 파티 편성 씬 ----
  await runStep(ctx, 'scene-partyedit', async (p, rec) => {
    await safeEval(p, () => {
      const g = window.game;
      const active = g.scene.scenes.filter((s) => g.scene.isActive(s.scene.key))[0];
      active.scene.start('PartyEditScene');
    });
    const ok = await waitFor(p, () => window.game.scene.isActive('PartyEditScene'), 12000);
    if (!ok) { rec.notes.push('PartyEditScene 진입 실패'); return; }
    await p.waitForTimeout(1300);
    const auto = await safeEval(p, () => {
      const sc = window.game.scene.getScene('PartyEditScene');
      if (!sc) return 'no-scene';
      const names = ['autoFormParty', 'autoFillParty', 'autoParty', 'autoArrange'];
      for (const n of names) {
        if (typeof sc[n] === 'function') {
          try { sc[n](); return `${n}()`; } catch (e) { return `${n} throw: ${e.message}`; }
        }
      }
      return 'no-auto-api';
    });
    rec.notes.push(`자동 편성: ${auto}`);
    await p.waitForTimeout(800);
  });

  // ---- 스테이지 선택 챕터 1~5 ----
  for (let ch = 1; ch <= 5; ch += 1) {
    // eslint-disable-next-line no-await-in-loop
    await runStep(ctx, `stageselect-ch${ch}`, async (p, rec) => {
      if (!(await ensureStageSelect(p))) { rec.notes.push('StageSelectScene 진입 실패'); return; }
      const now = await safeEval(p, (chapter) => {
        const sc = window.game.scene.getScene('StageSelectScene');
        const delta = chapter - sc.currentChapter;
        const step = delta === 0 ? 0 : delta / Math.abs(delta);
        for (let i = 0; i < Math.abs(delta); i += 1) sc.changeChapter(step);
        return { chapter: sc.currentChapter, chapterCount: sc.chapterCount };
      }, ch);
      if (now.chapter !== ch) rec.notes.push(`챕터 이동 실패: 목표=${ch} 실제=${now.chapter} (총 ${now.chapterCount})`);
      await p.waitForTimeout(1100);
    });
  }

  await runStep(ctx, 'stageselect-wall-warning', async (p, rec) => {
    if (!(await ensureStageSelect(p))) { rec.notes.push('StageSelectScene 재진입 실패'); return; }
    const r = await safeEval(p, () => {
      const sc = window.game.scene.getScene('StageSelectScene');
      if (!sc || !window.game.scene.isActive('StageSelectScene')) return 'not-active';
      const stages = typeof sc.generateStages === 'function' ? sc.generateStages(sc.currentChapter) : [];
      const target = stages[stages.length - 1] || stages[0];
      if (!target) return 'no-stage';
      sc.selectedStage = target;
      try { sc.showPartySelect(); } catch (e) { return `throw: ${e.message}`; }
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
      const rawParty = (save.parties || [])[0];
      const savedParty = rawParty && rawParty.heroIds ? rawParty.heroIds : (Array.isArray(rawParty) ? rawParty : []);
      return {
        stage: target.id || target.stageId || null,
        wall: sc.wallWarningText ? sc.wallWarningText.text : null,
        wallVisible: sc.wallWarningText ? sc.wallWarningText.visible : null,
        power: sc.totalPowerText ? sc.totalPowerText.text : null,
        slots: (sc.partySlots || []).map((sl) => (sl.hero ? (sl.hero.id || sl.hero.characterId) : null)),
        savedParty: savedParty.filter(Boolean),
        ownedHeroes: (window.game.registry.get('ownedHeroes') || []).length,
      };
    });
    if (typeof r === 'string') { rec.notes.push(`파티 선택 모달 실패: ${r}`); return; }
    rec.partyRestore = r;
    rec.notes.push(`스테이지=${r.stage} 벽경고=${r.wallVisible} "${(r.wall || '').slice(0, 46)}" ${r.power}`);
    const filled = r.slots.filter(Boolean).length;
    if (r.savedParty.length > 0 && filled === 0) {
      rec.notes.push(`[결함] 저장된 파티 ${r.savedParty.length}인이 모달에 복원되지 않음 (슬롯 전부 비어 있음, 보유영웅 ${r.ownedHeroes}명)`);
    }
    await p.waitForTimeout(1100);
  });

  // ---- 전투 ----
  await runStep(ctx, 'battle-auto', async (p, rec) => {
    if (!(await ensureStageSelect(p))) { rec.notes.push('StageSelectScene 재진입 실패'); return; }
    const started = await safeEval(p, () => {
      const sc = window.game.scene.getScene('StageSelectScene');
      if (!sc || !window.game.scene.isActive('StageSelectScene')) return 'not-active';
      const stages = typeof sc.generateStages === 'function' ? sc.generateStages(sc.currentChapter) : [];
      const target = stages[0];
      if (!target) return 'no-stage';
      sc.selectedStage = target;
      try {
        sc.showPartySelect();
        const beforeAuto = (sc.partySlots || []).filter((sl) => sl.hero).length;
        if (typeof sc.autoFillParty === 'function') sc.autoFillParty();
        const afterAuto = (sc.partySlots || []).filter((sl) => sl.hero).length;
        sc.startBattle();
        return { r: 'ok', beforeAuto, afterAuto };
      } catch (e) { return `throw: ${e.message}`; }
    });
    if (!started || started.r !== 'ok') { rec.notes.push(`전투 진입 실패: ${JSON.stringify(started)}`); return; }
    rec.notes.push(`파티 슬롯: 모달 직후 ${started.beforeAuto}인 → 자동편성 후 ${started.afterAuto}인`);
    const cuts = await skipCutscenes(p);
    if (cuts) rec.notes.push(`전투 진입 전 컷씬 ${cuts}개 건너뜀`);
    const ok = await waitFor(p, () => window.game.scene.isActive('BattleScene'), 25000);
    if (!ok) { rec.notes.push('BattleScene 미진입'); return; }
    await p.waitForTimeout(2500);
    const info = await safeEval(p, () => {
      const bs = window.game.scene.getScene('BattleScene');
      return {
        turn: bs.turn,
        autoBattle: bs.autoBattle ?? null,
        allies: (bs.allies || []).length,
        aliveAllies: (bs.allies || []).filter((a) => a && a.isAlive !== false).length,
        enemies: (bs.enemies || []).length,
        skillCards: (bs.skillCards || []).length,
        ended: !!bs.battleEnded,
      };
    });
    rec.notes.push(`전투 상태: ${JSON.stringify(info)}`);
    if (info.allies === 0) rec.notes.push('[결함] 아군 유닛 0 — 전투 배치 실패');
    if (info.skillCards === 0) rec.notes.push('[결함] 스킬 카드 0개 — 수동 조작 불가');
  });

  await runStep(ctx, 'battle-manual-skills', async (p, rec) => {
    if (!(await safeEval(p, () => !!(window.game && window.game.scene.isActive('BattleScene'))))) {
      rec.notes.push('BattleScene 이 이미 종료됨 — 수동 조작 캡처 생략');
      return;
    }
    const before = await safeEval(p, () => window.game.scene.getScene('BattleScene').autoBattle);
    const toggled = await tapLabel(p, ['BattleScene'], 'AUTO');
    if (!toggled) rec.notes.push('AUTO 토글 버튼을 찾지 못함');
    await p.waitForTimeout(2000);
    const st = await safeEval(p, () => {
      const bs = window.game.scene.getScene('BattleScene');
      if (!bs) return null;
      return {
        skillCards: (bs.skillCards || []).length,
        waitingManual: !!bs.waitingForManualInput,
        autoBattle: bs.autoBattle ?? null,
        turn: bs.turn,
      };
    });
    rec.notes.push(`AUTO ${before} → ${st ? st.autoBattle : 'n/a'} · 스킬 카드 ${st ? st.skillCards : 'n/a'}개 · ${JSON.stringify(st)}`);
    if (st && st.skillCards === 0) rec.notes.push('[결함] 스킬 카드가 하나도 만들어지지 않음');
    if (st && before === st.autoBattle) rec.notes.push('[확인필요] AUTO 토글이 상태를 바꾸지 않음');
  });

  await runStep(ctx, 'battleresult-win', async (p, rec) => {
    const forced = await safeEval(p, () => {
      const g = window.game;
      if (g.scene.isActive('BattleResultScene')) return 'already-result';
      const bs = g.scene.getScene('BattleScene');
      if (!bs || !g.scene.isActive('BattleScene')) return 'no-battle-scene';
      if (bs.battleEnded) return 'already-ended';
      (bs.enemies || []).forEach((e) => { if (e) { e.currentHp = 0; e.isAlive = false; } });
      try { bs.endBattle(true); return 'ok'; } catch (e) { return `throw: ${e.message}`; }
    });
    rec.notes.push(`승리 처리: ${forced}`);
    if (forced === 'no-battle-scene' || String(forced).startsWith('throw')) return;
    const ok = await waitFor(
      p,
      () => window.game.scene.isActive('BattleResultScene') || window.game.scene.isActive('CutsceneScene'),
      20000
    );
    if (!ok) rec.notes.push('결과 화면 미표시');
    if (await safeEval(p, () => window.game.scene.isActive('CutsceneScene'))) {
      await tapLabel(p, ['CutsceneScene'], '건너뛰기');
      await waitFor(p, () => !window.game.scene.isActive('CutsceneScene'), 15000);
    }
    await p.waitForTimeout(1600);
  });

  await runStep(ctx, 'battleresult-lose', async (p, rec) => {
    if (!(await ensureStageSelect(p))) { rec.notes.push('스테이지 선택 재진입 실패'); return; }
    const go = await safeEval(p, () => {
      const sc = window.game.scene.getScene('StageSelectScene');
      const stages = sc.generateStages(sc.currentChapter);
      sc.selectedStage = stages[0];
      try {
        sc.showPartySelect();
        if (typeof sc.autoFillParty === 'function') sc.autoFillParty();
        sc.startBattle();
        return 'ok';
      } catch (e) { return `throw: ${e.message}`; }
    });
    if (go !== 'ok') { rec.notes.push(`전투 진입 실패: ${go}`); return; }
    await skipCutscenes(p);
    const inBattle = await waitFor(p, () => window.game.scene.isActive('BattleScene'), 25000);
    if (!inBattle) { rec.notes.push('BattleScene 미진입'); return; }
    await p.waitForTimeout(1500);
    const forced = await safeEval(p, () => {
      const bs = window.game.scene.getScene('BattleScene');
      if (!bs || bs.battleEnded) return 'no-battle';
      try { bs.endBattle(false); return 'ok'; } catch (e) { return `throw: ${e.message}`; }
    });
    if (forced !== 'ok') { rec.notes.push(`패배 종료 실패: ${forced}`); return; }
    const shown = await waitFor(p, () => window.game.scene.isActive('BattleResultScene'), 15000);
    if (!shown) rec.notes.push('패배 결과 화면 미표시');
    await p.waitForTimeout(1600);
  });

  await gotoMain(page);

  // ---- 각인 3단계 ----
  await runStep(ctx, 'ascension-step1', async (p, rec) => {
    await gotoMain(p);
    const opened = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      try { mm.openPopup('ascension'); } catch (e) { return `throw: ${e.message}`; }
      return !!mm.activePopup;
    });
    if (opened !== true) rec.notes.push(`각인 팝업 열기 실패: ${opened}`);
    await p.waitForTimeout(1400);
  });

  await runStep(ctx, 'ascension-step2-route', async (p, rec) => {
    const r = await safeEval(p, () => {
      const collect = (list, out) => {
        list.forEach((o) => { if (!o) return; out.push(o); if (Array.isArray(o.list)) collect(o.list, out); });
        return out;
      };
      const mm = window.game.scene.getScene('MainMenuScene');
      const pop = mm.activePopup;
      const root = pop && pop.contentContainer ? [pop.contentContainer] : mm.children.list;
      const all = collect(root, []);
      const rows = all.filter((o) => {
        if (!o.input || !o.input.enabled || o.visible === false || !o.getBounds) return false;
        const b = o.getBounds();
        return b.width > 250 && b.height > 50;
      });
      if (!rows.length) return `no-row(popup=${pop ? pop.constructor.name : 'null'})`;
      rows[0].emit('pointerdown');
      rows[0].emit('pointerup');
      return `tapped(${rows.length} rows)`;
    });
    if (String(r).startsWith('no-')) rec.notes.push(`각인 1단계 선택 실패: ${r}`);
    else rec.notes.push(`각인 영웅 선택: ${r}`);
    await p.waitForTimeout(1500);
  });

  await runStep(ctx, 'ascension-step3-confirm', async (p, rec) => {
    const r = await safeEval(p, () => {
      const collect = (list, out) => {
        list.forEach((o) => { if (!o) return; out.push(o); if (Array.isArray(o.list)) collect(o.list, out); });
        return out;
      };
      const mm = window.game.scene.getScene('MainMenuScene');
      const pop = mm.activePopup;
      const root = pop && pop.contentContainer ? [pop.contentContainer] : mm.children.list;
      const all = collect(root, []);
      const rows = all.filter((o) => {
        if (!o.input || !o.input.enabled || o.visible === false || !o.getBounds) return false;
        const b = o.getBounds();
        return b.width > 250 && b.height > 50;
      });
      if (!rows.length) return `no-route(popup=${pop ? pop.constructor.name : 'null'})`;
      rows[0].emit('pointerdown');
      rows[0].emit('pointerup');
      return `tapped(${rows.length} routes)`;
    });
    if (String(r).startsWith('no-')) rec.notes.push(`각인 2단계 선택 실패: ${r}`);
    else rec.notes.push(`각인 루트 선택: ${r}`);
    await p.waitForTimeout(1600);
  });

  await gotoMain(page);

  // ---- 도감 2탭 ----
  await runStep(ctx, 'collection-tab-collect', async (p, rec) => {
    await gotoMain(p);
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('collection'));
    await p.waitForTimeout(1300);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop || typeof pop.openTab !== 'function') return 'no-openTab';
      try { pop.openTab('collection'); } catch (e) { return `throw: ${e.message}`; }
      return pop.activeTabKey || pop.currentTab || 'ok';
    });
    if (String(r).startsWith('no-') || String(r).startsWith('throw')) rec.notes.push(`도감 수집 탭 실패: ${r}`);
    await p.waitForTimeout(900);
  });

  await runStep(ctx, 'collection-tab-story', async (p, rec) => {
    const r = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const pop = mm.activePopup;
      if (!pop) return 'no-popup';
      if (typeof pop.openTab !== 'function') return `no-openTab(${pop.constructor.name})`;
      try { pop.openTab('storylog'); } catch (e) { return `throw: ${e.message}`; }
      return 'ok';
    });
    if (String(r).startsWith('no-') || String(r).startsWith('throw')) { rec.notes.push(`도감 이야기 탭 실패: ${r}`); return; }
    await p.waitForTimeout(1400);
    const after = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return mm.activePopup ? mm.activePopup.constructor.name : null;
    });
    rec.notes.push(`이야기 탭 결과 팝업: ${after}`);
    if (after !== 'StoryLogPopup') rec.notes.push(`[결함] '이야기' 탭이 StoryLogPopup 을 열지 못함 (실제: ${after})`);
  });

  await gotoMain(page);

  // ---- 설정 상세 ----
  await runStep(ctx, 'settings-detail', async (p, rec) => {
    await safeEval(p, () => window.game.scene.getScene('MainMenuScene').openPopup('settings'));
    await p.waitForTimeout(1300);
    const r = await safeEval(p, () => {
      const pop = window.game.scene.getScene('MainMenuScene').activePopup;
      if (!pop) return 'no-popup';
      return {
        hasVolumeApi: typeof pop.setBgmVolume === 'function' || !!pop.bgmSlider || !!pop.volumeRows,
        props: Object.keys(pop).slice(0, 18),
      };
    });
    rec.notes.push(`설정 팝업: ${JSON.stringify(r).slice(0, 200)}`);
  });
  await gotoMain(page);

  // ---- 복귀 카드 ----
  await runStep(ctx, 'returning-card', async (p, rec) => {
    const r = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      if (typeof mm.maybeShowReturningPlayerCard !== 'function') return 'no-api';
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
      const longAgo = Date.now() - 30 * 86400 * 1000;
      save.lastOnline = longAgo;
      save.lastLogoutTime = longAgo;
      if (save.onboarding) { save.onboarding.returningPlayerTier = null; save.onboarding.lastReturnRewardAt = null; }
      localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
      try { return mm.maybeShowReturningPlayerCard(save) ? 'queued' : 'skipped'; } catch (e) { return `throw: ${e.message}`; }
    });
    await p.waitForTimeout(1800);
    const shown = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return !!(mm.returningCard && (!mm.returningCard.isVisible || mm.returningCard.isVisible()));
    });
    rec.notes.push(`복귀 카드(30일 미접속): 판정=${r} 표시=${shown}`);
    if (r === 'queued' && !shown) rec.notes.push('[결함] 복귀 카드 판정은 통과했으나 화면에 뜨지 않음');
    if (r === 'skipped') rec.notes.push('[확인필요] 30일 미접속인데 복귀 카드 판정이 skip 됨');
    await p.waitForTimeout(600);
  });

  // ---- 디버그 FAB ----
  await runStep(ctx, 'debug-fab', async (p, rec) => {
    const r = await safeEval(p, () => {
      if (!window.debug) return 'no-window.debug';
      try { window.debug.setDebugMode(true); return 'on'; } catch (e) { return `throw: ${e.message}`; }
    });
    rec.notes.push(`디버그 모드: ${r}`);
    await p.waitForTimeout(1400);
  });
  await safeEval(page, () => { try { if (window.debug) window.debug.setDebugMode(false); } catch (e) { /* noop */ } });
}

// ============================================================
// 시나리오 C — 신규 게스트
// ============================================================

async function sweepScenarioC(ctx) {
  await runStep(ctx, 'boot-login', async (p, rec) => {
    const ok = await waitFor(p, () => window.game && window.game.scene.isActive('LoginScene'), 25000);
    if (!ok) rec.notes.push('LoginScene 미표시');
    await p.waitForTimeout(1300);
  });

  await runStep(ctx, 'guest-login-tap', async (p, rec) => {
    const tapped = await tapLabel(p, ['LoginScene'], '게스트로 시작');
    if (!tapped) rec.notes.push('게스트 버튼을 찾지 못함');
    const ok = await waitFor(
      p,
      () => window.game.scene.isActive('MainMenuScene') || window.game.scene.isActive('CutsceneScene'),
      45000
    );
    if (!ok) rec.notes.push('로그인 후 진입 실패');
    await p.waitForTimeout(1600);
  });

  await runStep(ctx, 'prologue-cutscene', async (p, rec) => {
    const inCut = await safeEval(p, () => window.game.scene.isActive('CutsceneScene'));
    if (!inCut) rec.notes.push('프롤로그 컷씬이 표시되지 않음');
    await p.waitForTimeout(1300);
  });

  await runStep(ctx, 'tutorial-T01', async (p, rec) => {
    const n = await skipCutscenes(p, 3);
    rec.notes.push(`컷씬 ${n}개 건너뜀`);
    await waitFor(p, () => window.game.scene.isActive('MainMenuScene'), 25000);
    await p.waitForTimeout(2200);
    const st = await safeEval(p, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const f = mm && mm.tutorialFlow;
      return {
        step: f ? f.currentStepId : null,
        overlay: !!(f && f.overlay && f.overlay.isVisible),
        coach: !!(f && f.coach && f.coach.isVisible),
      };
    });
    rec.notes.push(`튜토리얼 상태: ${JSON.stringify(st)}`);
    if (!st.step) rec.notes.push('튜토리얼 스텝이 시작되지 않음');
  });

  for (const label of ['tutorial-T02', 'tutorial-T03']) {
    // eslint-disable-next-line no-await-in-loop
    await runStep(ctx, label, async (p, rec) => {
      const st = await safeEval(p, () => {
        const mm = window.game.scene.getScene('MainMenuScene');
        const f = mm && mm.tutorialFlow;
        const hole = f && f.overlay ? f.overlay.hole : null;
        const closeHit = f && f.coach ? f.coach.closeHit : null;
        const cb = closeHit && closeHit.getBounds ? closeHit.getBounds() : null;
        return {
          step: f ? f.currentStepId : null,
          hole,
          close: cb ? { x: Math.round(cb.centerX), y: Math.round(cb.centerY) } : null,
        };
      });
      if (await safeEval(p, () => !!(window.game && window.game.scene.isActive('CutsceneScene')))) {
        const n = await skipCutscenes(p, 3);
        rec.notes.push(`컷씬 ${n}개 건너뜀`);
      }
      if (st.close) await tapWorld(p, st.close.x, st.close.y);
      else if (st.hole) await tapWorld(p, st.hole.x, st.hole.y);
      else {
        const diag = await safeEval(p, () => {
          const f = window.game.scene.getScene('MainMenuScene').tutorialFlow;
          return {
            step: f ? f.currentStepId : null,
            overlayVisible: !!(f && f.overlay && f.overlay.isVisible),
            coachVisible: !!(f && f.coach && f.coach.isVisible),
            target: f && f.coach ? f.coach.target : null,
          };
        });
        rec.notes.push(`탭할 튜토리얼 타깃 없음 — ${JSON.stringify(diag)}`);
      }
      await p.waitForTimeout(1800);
      const after = await safeEval(p, () => {
        const f = window.game.scene.getScene('MainMenuScene').tutorialFlow;
        return f ? f.currentStepId : null;
      });
      rec.notes.push(`진행: ${st.step} → ${after}`);
    });
  }

  await runStep(ctx, 'mainmenu-new-guest', async (p) => {
    await p.waitForTimeout(1600);
  });
}

// ============================================================
// 시나리오 A — 레거시
// ============================================================

async function sweepScenarioA(ctx) {
  await runStep(ctx, 'migration-result', async (p, rec) => {
    const save = await safeEval(p, () => {
      try { return JSON.parse(localStorage.getItem('arcane_collectors_save') || 'null'); } catch (e) { return null; }
    });
    rec.migration = save
      ? {
          version: save.version,
          characters: (save.characters || []).map((c) => c.id),
          party: save.parties && save.parties[0] ? save.parties[0] : null,
          tutorialCompleted: save.tutorial ? save.tutorial.completed : null,
          unlockedMenus: save.onboarding ? save.onboarding.unlockedMenus : null,
          grantVersion: save.onboarding ? save.onboarding.grantVersion : null,
          spiritStones: save.resources ? save.resources.spiritStones : null,
        }
      : null;
    if (!save) rec.notes.push('세이브 로드 실패');
    else if (save.version !== 2) rec.notes.push(`마이그레이션 미수행: version=${save.version}`);
    rec.notes.push(`마이그레이션: ${JSON.stringify(rec.migration)}`);
    await p.waitForTimeout(700);
  });

  await sweepCommonScreens(ctx);
}

// ============================================================
// 메인
// ============================================================

async function runScenario(browser, scenario, counter) {
  console.log(`\n=== 시나리오 ${scenario.id}: ${scenario.label} ===`);
  const page = await browser.newPage({ viewport: VIEWPORT });
  const ctx = makeCtx(page, scenario.id, counter);

  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[vite\] connect(ed|ing)|hmr update|hot updated/i.test(text)) ctx.viteReconnected = true;
    if (msg.type() !== 'error') return;
    if (!isIgnored(text)) ctx.consoleErrors.push(text.slice(0, 400));
  });
  page.on('pageerror', (err) => {
    const stack = String(err.stack || '').split(/\r?\n/).slice(1, 4).map((l) => l.trim()).join(' <- ');
    const text = `${err.name}: ${err.message}${stack ? ` @@ ${stack}` : ''}`;
    if (!isIgnored(text)) ctx.pageErrors.push(text.slice(0, 600));
  });

  await page.addInitScript(seedScript, { saveData: scenario.save, guest: scenario.guest });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const booted = await waitFor(page, () => !!(window.game && window.game.scene && window.game.scene.scenes.length), 30000);
  if (!booted) {
    console.log('   FAIL 부팅 실패');
    ctx.steps.push({ n: '00', scenario: scenario.id, name: 'boot', ok: false, error: '부팅 실패', notes: [] });
    await page.close();
    return { id: scenario.id, label: scenario.label, steps: ctx.steps, textures: [] };
  }

  if (scenario.id === 'C') {
    await sweepScenarioC(ctx);
  } else {
    let reached = await waitFor(page, () => window.game.scene.isActive('MainMenuScene'), 45000);
    if (!reached) {
      await tapLabel(page, ['LoginScene'], '게스트로 시작');
      reached = await waitFor(page, () => window.game.scene.isActive('MainMenuScene'), 45000);
    }
    if (!reached) console.log('   ! MainMenuScene 미도달 — 그대로 진행');
    await page.waitForTimeout(1500);
    if (scenario.id === 'A') await sweepScenarioA(ctx);
    else await sweepCommonScreens(ctx);
  }

  let textures = [];
  try {
    textures = await safeEval(page, textureReportImpl);
  } catch (e) { /* noop */ }

  await page.close();
  return { id: scenario.id, label: scenario.label, steps: ctx.steps, textures };
}

async function main() {
  const all = [
    { id: 'B', label: '풍부한 유저 (전 영웅 보유·튜토리얼 완주·챕터 3)', save: richSave(), guest: true },
    { id: 'A', label: '레거시 기존 유저 (version 1 · char_1~4 파티)', save: legacySave(), guest: true },
    { id: 'C', label: '신규 게스트 (프롤로그 → T-01~T-03)', save: null, guest: false },
  ];
  const scenarios = ONLY ? all.filter((s) => ONLY.split(',').includes(s.id)) : all;

  const browser = await chromium.launch({ headless: HEADLESS });
  const counter = { n: 1 };
  const results = [];
  try {
    for (const sc of scenarios) {
      try {
        // eslint-disable-next-line no-await-in-loop
        results.push(await runScenario(browser, sc, counter));
      } catch (e) {
        console.error(`   시나리오 ${sc.id} 중단: ${e.message}`);
        results.push({ id: sc.id, label: sc.label, aborted: e.message, steps: [], textures: [] });
      }
    }
  } finally {
    await browser.close();
  }

  const flat = results.flatMap((r) => r.steps);
  const sum = (pick) => flat.reduce((a, s) => a + ((s[pick] || []).length), 0);
  const summary = {
    steps: flat.length,
    stepsFailed: flat.filter((s) => s.ok === false).length,
    consoleErrors: sum('consoleErrors'),
    pageErrors: sum('pageErrors'),
    oldImageHits: sum('oldImages'),
    overlapHits: sum('overlaps'),
    offscreenHits: sum('offscreen'),
    smallTargetHits: sum('smallTargets'),
  };

  writeFileSync(
    RESULT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, viewport: VIEWPORT, summary, scenarios: results }, null, 2),
    'utf8'
  );

  console.log('\n=== 요약 ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과: ${path.relative(ROOT, RESULT_PATH)}`);
  console.log(`캡처: ${path.relative(ROOT, SHOT_DIR)}`);
}

main().catch((e) => {
  console.error('스윕 실행 실패:', e);
  process.exit(1);
});
