/**
 * playtest-fixtures.mjs — 계정 시나리오 A/B/C 세이브 픽스처
 *
 * `qa-sweep.mjs` 의 A/B/C 규약을 그대로 따른다. 두 스위트가 같은 계정 모양을 쓰지 않으면
 * "qa-sweep 은 통과하는데 playtest 는 실패한다" 가 결함인지 픽스처 차이인지 알 수 없다.
 * 그래서 영웅 ID 목록·레코드 모양·진행도 수치를 qa-sweep 과 동일하게 유지한다.
 * qa-sweep 을 고칠 때 이 파일도 같이 고쳐야 한다(스크립트가 실행 시 서로를 import 하지
 * 않는 이유는 qa-sweep 이 import 만으로 실행되는 스크립트이기 때문이다).
 *
 *   A 신규 게스트   세이브 없음. 로그인 → 프롤로그 → 튜토리얼 완주까지 직접 플레이한다.
 *   B 진행 유저     기본 10 + 전직 24 전원 보유, 튜토리얼 완주, 챕터 3.
 *   C 레거시 세이브 version 1. tutorial/onboarding/story 섹션 자체가 없다 → 마이그레이션 대상.
 */

export const BASE_IDS = [
  'base_iris', 'base_sera', 'base_luca', 'base_kai', 'base_lin',
  'base_omar', 'base_sol', 'base_hana', 'base_leon', 'base_paolo',
];

export const ASC_IDS = [
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

/** C. 레거시(version 1) — tutorial/onboarding/story 섹션이 없다 */
export function legacySave() {
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

/** B. 진행 유저 — v2, 기본 10 + 전직 24, 튜토리얼 완주, 챕터 3 */
export function richSave() {
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
    // v2 계정은 신 스키마다. 배열(구 스키마)로 두면 부팅 때 마이그레이션을 타서
    // B 가 "정상 v2 계정"이 아니라 "구세이브에서 올라온 계정"을 검증하게 된다.
    // 마이그레이션 경로는 C(레거시 v1)가 담당하므로 여기서 겹칠 이유가 없다.
    inventory: { equipment: [], items: [] },
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

/**
 * 게스트 자동 로그인 세션. 세이브를 주입할 때 같이 넣지 않으면 로그인 화면에서 멈춘다.
 * `page.addInitScript` 안에서 실행되므로 외부 스코프를 참조하지 않는다.
 */
export function seedScript({ saveData, guest = true, debug = true }) {
  try { localStorage.clear(); } catch (e) { /* noop */ }
  if (debug) {
    try { localStorage.setItem('arcane_debug_enabled', 'true'); } catch (e) { /* noop */ }
  }
  if (guest) {
    const user = { id: 'guest_playtest', nickname: 'QA', isGuest: true, createdAt: new Date().toISOString() };
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

/** 계정 시나리오 정의 — 보고서·결과 JSON 에서 계정을 구분하는 키 */
export const ACCOUNTS = Object.freeze({
  A: { id: 'A', label: '신규 게스트', save: null },
  B: { id: 'B', label: '진행 유저(기본10+전직24·챕터3)', save: richSave },
  C: { id: 'C', label: '레거시 v1 세이브', save: legacySave },
});
