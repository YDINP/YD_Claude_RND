/**
 * legacy-migration-smoke.mjs — 레거시 스타터(char_1~4) 정리 실증
 *
 * 검증 내용
 *   v1 레거시 세이브(char_1~4 + 장비 + 파티 편성)를 주입 → 게스트 로그인
 *   → characters/파티에서 레거시가 사라지고 보유 영웅으로 대체되는지
 *   → 레벨·경험치가 이관되고 장비가 인벤토리로 반환되는지
 *   → 메인 메뉴 파티 아바타가 구버전 카툰(hero_001~004)이 아닌 실포트레이트인지
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/legacy-migration-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
const VIEWPORT = { width: 720, height: 1280 };
const SAVE_KEY = 'arcane_collectors_save';
/** portrait-mapping.json에서 char_1~4에만 연결된 구버전 카툰 파일명 */
const LEGACY_PORTRAITS = ['hero_001', 'hero_002', 'hero_003', 'hero_004'];

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function waitFor(page, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** char_1~4를 보유한 구버전(v1) 세이브 */
const LEGACY_SAVE = {
  version: 1,
  player: { name: '구버전유저', level: 1, exp: 0 },
  resources: { gold: 24000, gems: 900, summonTickets: 2, skillBooks: 0, characterShards: {} },
  characters: [
    {
      id: 'char_1', characterId: 'char_1', level: 24, exp: 500, stars: 2, skillLevels: [1, 1, 1],
      equipment: { weapon: 'eq_legacy_sword', armor: null, accessory: null }
    },
    { id: 'char_2', characterId: 'char_2', level: 18, exp: 120, stars: 2, skillLevels: [1, 1, 1] },
    { id: 'char_3', characterId: 'char_3', level: 15, exp: 40, stars: 2, skillLevels: [1, 1, 1] },
    { id: 'char_4', characterId: 'char_4', level: 11, exp: 10, stars: 2, skillLevels: [1, 1, 1] }
  ],
  parties: [['char_1', 'char_2', 'char_3', 'char_4']],
  inventory: { equipment: [{ id: 'eq_legacy_sword', slotType: 'weapon', equippedBy: 'char_1' }] },
  progress: { currentChapter: 'chapter_1', clearedStages: { stage_1_1: 3, stage_1_2: 2 }, towerFloor: 3, totalBattles: 41 },
  gacha: { pityCounter: 12, totalPulls: 30 },
  quests: { daily: {}, dailyProgress: {}, lastReset: null },
  settings: { bgmVolume: 1, sfxVolume: 1, autoSkip: false, battleSpeed: 1 },
  statistics: { totalGoldEarned: 30000, totalGemsSpent: 600, charactersCollected: 4, highestDamage: 900 },
  createdAt: 1700000000000
};

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 레거시 스타터 정리 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    // v1 레거시 세이브 주입 후 재기동
    await page.evaluate(
      ({ key, save }) => {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify(save));
      },
      { key: SAVE_KEY, save: LEGACY_SAVE }
    );
    await page.reload();
    await page.waitForTimeout(3000);

    // 빌드/다른 e2e와 동시에 돌면 부팅이 느려지므로 넉넉히 기다린다
    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'), 60000);
    assert(loginReady, 'LoginScene 활성화');
    if (!loginReady) throw new Error('LoginScene 진입 실패 — 부팅이 완료되지 않았다');

    await page.evaluate(() => window.game.scene.getScene('LoginScene')._handleGuestLogin());
    const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 60000);
    assert(mainMenu, '레거시 세이브로 게스트 로그인 → MainMenuScene');
    // 파티 아바타 텍스처가 붙을 때까지 대기
    await waitFor(
      page,
      () => {
        const scene = window.game?.scene.getScene('MainMenuScene');
        if (!scene) return false;
        const found = [];
        const walk = (list) =>
          list.forEach((o) => {
            if (o.texture?.key && String(o.texture.key).startsWith('hero_')) found.push(o.texture.key);
            if (o.list) walk(o.list);
          });
        walk(scene.children.list);
        return found.length > 0;
      },
      20000
    );

    const save = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    const legacyIds = ['char_1', 'char_2', 'char_3', 'char_4'];

    assert(save.version === 2, '세이브 버전 2로 마이그레이션', String(save.version));

    const ownedIds = save.characters.map((c) => c.characterId);
    assert(
      ownedIds.every((id) => !legacyIds.includes(id)),
      'characters[]에서 레거시 char_1~4 제거',
      ownedIds.join(',')
    );

    const heir = save.characters.find((c) => c.characterId === 'base_iris');
    assert(!!heir, '보유 영웅으로 base_iris 확보');
    assert(heir?.level === 24, '최고 레거시 레벨 24 이관', `level=${heir?.level}`);
    assert(heir?.exp === 670, '누적 경험치 670 이관', `exp=${heir?.exp}`);

    const partySlots = save.parties[0];
    assert(
      partySlots.every((id) => !legacyIds.includes(id)),
      '파티 슬롯에서 레거시 제거',
      JSON.stringify(partySlots)
    );
    assert(
      partySlots.filter(Boolean).every((id) => ownedIds.includes(id)),
      '파티 슬롯이 보유 영웅만 참조',
      JSON.stringify(partySlots)
    );

    const item = save.inventory.equipment.find((e) => e.id === 'eq_legacy_sword');
    assert(!!item && item.equippedBy === null, '장비 해제 후 인벤토리 보존', JSON.stringify(item));
    assert(typeof save.onboarding?.legacyMigratedAt === 'number', 'onboarding.legacyMigratedAt 기록');

    // 진행도는 보존된다
    assert(save.progress.clearedStages.stage_1_1 === 3, '기존 진행도 보존 (1-1 3성)');
    assert(save.resources.gold === 24000, '기존 재화 보존 (골드 24000)');

    // P2-4: portrait-mapping.json의 char_1~4 → hero_001~004 매핑은 보존하지만(하위 호환 SSOT),
    // PreloadScene의 부팅 로스터에서는 제외한다 — 마이그레이션으로 획득 불가능한 죽은 에셋을
    // 매 부팅 페이로드에 실을 이유가 없다. 텍스처 자체가 아예 로드되지 않아야 한다.
    const legacyTexturesLoaded = await page.evaluate(() => {
      const t = window.game.textures;
      return ['hero_char_1', 'hero_char_2', 'hero_char_3', 'hero_char_4'].filter((k) => t.exists(k));
    });
    assert(
      legacyTexturesLoaded.length === 0,
      'P2-4: char_1~4 포트레이트가 부팅 로드 큐에서 제외됨',
      legacyTexturesLoaded.join(',') || '(없음)'
    );

    // 메인 메뉴에 실제로 그려진 아바타의 텍스처를 확인한다.
    // 레거시를 참조하는 캐릭터가 없으므로 화면에는 나타나지 않아야 한다.
    const rendered = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const keys = [];
      const walk = (list) => {
        list.forEach((obj) => {
          if (obj.texture?.key && String(obj.texture.key).startsWith('hero_')) keys.push(obj.texture.key);
          if (obj.list) walk(obj.list);
        });
      };
      walk(scene.children.list);
      return keys;
    });
    const legacyOnScreen = rendered.filter((k) =>
      ['hero_char_1', 'hero_char_2', 'hero_char_3', 'hero_char_4'].includes(k)
    );
    assert(
      legacyOnScreen.length === 0,
      '메인 메뉴에 구버전 카툰 아바타가 그려지지 않음',
      legacyOnScreen.join(',')
    );
    assert(
      rendered.some((k) => k === 'hero_base_iris'),
      '파티 아바타가 실포트레이트(hero_base_iris)로 렌더링',
      rendered.join(',') || '(없음)'
    );
    console.log(`   화면에 그려진 영웅 텍스처: ${rendered.join(', ') || '(없음)'}`);

    await page.screenshot({ path: new URL('legacy-migration.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/legacy-migration.png');

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();

export { LEGACY_PORTRAITS };
