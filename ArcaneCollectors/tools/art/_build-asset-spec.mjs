/**
 * _build-asset-spec.mjs — asset-spec.json 생성기
 * 실행: node tools/art/_build-asset-spec.mjs
 *
 * 이 파일은 스펙의 SSOT이다. 항목을 고칠 때는 JSON이 아니라 이 스크립트를 고치고 재실행한다.
 */
import { writeFileSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 공통 프롬프트 조각
// ---------------------------------------------------------------------------
const QUALITY = 'masterpiece, best quality, highly detailed, sharp focus, dramatic cinematic lighting';
const STYLE = 'anime key visual, gacha mobile game art, dark fantasy mythology, deep indigo night palette, cyan and gold rim light';

/** 배경 공통 네거티브. 텍스트/워터마크/인물 얼굴 클로즈업을 강하게 배제 */
const NEG_BG =
  'text, letters, words, watermark, signature, logo, ui, hud, interface, buttons, ' +
  'people, face, portrait, close-up character, blurry, lowres, jpeg artifacts, ' +
  'bright daylight, washed out, flat lighting, oversaturated, purple white gradient';

/** 알파 추출용(크로마키) 공통 네거티브 */
const NEG_ALPHA =
  'text, letters, words, watermark, signature, background scenery, gradient background, ' +
  'shadow on background, multiple objects, cluttered, blurry, lowres, jpeg artifacts, ' +
  'photo, realistic photograph, drop shadow, reflection';

/** 9-slice 프레임 공통 네거티브. 코너 안쪽 형태 금지가 핵심 */
const NEG_FRAME =
  NEG_ALPHA + ', filled center, solid center, content inside frame, character, ' +
  'asymmetric corners, perspective, tilted, 3d rotation';

const CHROMA = 'isolated on a pure flat chroma green background #00FF00, no shadow, no gradient';

// 배경은 세로 832×1216, 가로 잘림을 전제로 중앙 배치
const BG_COMPOSITION =
  'vertical portrait composition, main subject centered within the middle 60 percent of the width, ' +
  'empty atmospheric margins on left and right, clear negative space in the lower third for UI overlay';

const bg = (id, targetPath, subject, extra = {}) => ({
  id,
  category: 'background',
  priority: extra.priority || 'P1',
  // 전송량 예산 초과(§ASSET_USAGE_MAP §11-6)로 배경 본+블러 페어를 WebP q80 무알파로 전환.
  targetPath: targetPath.replace(/\.png$/, '.webp'),
  width: 832,
  height: 1216,
  count: extra.count || 2,
  positive: `${QUALITY}, ${STYLE}, ${subject}, ${BG_COMPOSITION}`,
  negative: NEG_BG,
  seedNote:
    extra.seedNote ||
    '동일 계열 배경끼리는 seed 를 100 단위로 묶어 기록한다. 채택본 seed 를 이 필드에 덮어쓸 것',
  postProcess: [
    'upscale x1.30 (Lanczos) -> 1082x1581',
    'derive blur pair: gaussian 24px + brightness -15% -> {targetPath 파일명}_blur.webp',
    'export both as WebP q80, no alpha'
  ],
  usedBy: extra.usedBy || []
});

const frame = (id, targetPath, subject, corners, extra = {}) => ({
  id,
  category: 'frame',
  priority: extra.priority || 'P1',
  // 전송량 예산 초과(§ASSET_USAGE_MAP §11-6)로 알파 유지 WebP q85 로 전환.
  targetPath: targetPath.replace(/\.png$/, '.webp'),
  width: extra.width || 1024,
  height: extra.height || 1024,
  count: extra.count || 3,
  positive: `${QUALITY}, ornate ui frame border only, hollow empty center, ${subject}, ${CHROMA}, perfectly symmetrical, flat orthographic front view, game ui asset sheet`,
  negative: NEG_FRAME,
  seedNote: '동일 세트(N/R/SR/SSR)는 같은 seed 로 뽑아 형태를 일치시키고 색만 프롬프트로 바꾼다',
  postProcess: [
    `alpha via chroma key #00FF00 (despill 적용)`,
    `downscale ${extra.out || 512}`,
    `export as WebP q85 (알파 유지)`,
    `9-slice ${corners}`
  ],
  usedBy: extra.usedBy || []
});

const button = (id, targetPath, subject, extra = {}) => ({
  id,
  category: 'button',
  priority: extra.priority || 'P1',
  targetPath: targetPath.replace(/\.png$/, '.webp'),
  width: 1024,
  height: 320,
  count: 3,
  positive: `${QUALITY}, horizontal ui button plate, ${subject}, ${CHROMA}, flat orthographic front view, perfectly symmetrical left and right, empty center label area, game ui asset`,
  negative: NEG_FRAME + ', text label, icon in center',
  seedNote: 'primary/secondary/ghost 3종은 같은 seed 로 뽑아 실루엣을 일치시킨다',
  postProcess: ['alpha via chroma key #00FF00', 'downscale 512x160', 'export as WebP q85 (알파 유지)', '9-slice 72,72,40,40'],
  usedBy: extra.usedBy || []
});

const icon = (id, targetPath, subject, extra = {}) => ({
  id,
  category: 'icon',
  priority: extra.priority || 'P1',
  targetPath,
  width: 1024,
  height: 1024,
  count: extra.count || 4,
  positive: `${QUALITY}, single game ui icon, ${subject}, centered, flat orthographic front view, thick clean silhouette, strong readable shape at small size, ${CHROMA}`,
  negative: NEG_ALPHA + ', thin lines, intricate tiny details, multiple icons, grid of icons',
  seedNote: extra.seedNote || '같은 카테고리 아이콘은 seed 를 연속 배정해 스타일 일관성을 확보한다',
  postProcess: ['alpha via chroma key #00FF00', 'downscale 256', 'trim to content + 8px padding'],
  usedBy: extra.usedBy || []
});

// ---------------------------------------------------------------------------
// 1. 배경 (background)
// ---------------------------------------------------------------------------
const backgrounds = [
  bg(
    'bg_main',
    'public/assets/backgrounds/scenes/bg_main.png',
    'vast ruined mythic sanctuary hall at night, towering broken stone pillars, floating glowing runic shards, a hairline dimensional rift crack glowing cyan in the far center, cold moonlight from above, drifting dust motes',
    { usedBy: ['MainMenuScene'] }
  ),
  bg(
    'bg_login',
    'public/assets/backgrounds/scenes/bg_login.png',
    'three heroic silhouettes standing in backlight on a cliff edge facing a colossal glowing dimensional rift in the night sky, gold and cyan light bleeding from the rift, epic scale, figures small and dark against the light',
    { usedBy: ['LoginScene', 'BootScene'] }
  ),
  bg(
    'bg_gacha',
    'public/assets/backgrounds/scenes/bg_gacha.png',
    'ornate summoning chamber, huge glowing golden magic circle on the floor seen in perspective, vertical light pillars rising, floating golden particles, deep violet and gold, altar in center',
    { usedBy: ['GachaScene', 'GachaPopup'] }
  ),
  bg(
    'bg_stageselect',
    'public/assets/backgrounds/scenes/bg_stageselect.png',
    'ancient star map chamber, a great celestial constellation chart projected in the air, faint continent outlines, brass astrolabe rings, deep indigo with cyan constellation lines',
    { usedBy: ['StageSelectScene'] }
  ),
  bg(
    'bg_tower',
    'public/assets/backgrounds/scenes/bg_tower.png',
    'endless black spire tower ascending into a storm sky, seen from its base looking up, countless floors receding, torch lights spiraling upward, ominous scale',
    { usedBy: ['TowerPopup', 'TowerScene'] }
  ),
  bg(
    'bg_result_victory',
    'public/assets/backgrounds/scenes/bg_result_victory.png',
    'triumphant golden dawn light breaking through storm clouds over a battlefield, radiant god rays from top center, floating gold embers, warm gold against deep indigo',
    { usedBy: ['BattleResultScene'] }
  ),
  bg(
    'bg_result_defeat',
    'public/assets/backgrounds/scenes/bg_result_defeat.png',
    'cold desolate battlefield under ashen sky, shattered weapons in the ground, grey falling ash, muted desaturated blue and grey, somber',
    { usedBy: ['BattleResultScene'] }
  ),
  bg(
    'bg_chapter_1',
    'public/assets/backgrounds/battle/bg_chapter_1.png',
    'dark ancient forest at night, colossal twisted trees, faint bioluminescent green fungi, thin mist between the trunks, a narrow moonlit clearing in the center as the fighting ground',
    { usedBy: ['BattleScene(ch1)', 'StageSelectScene(ch1)', 'CutsceneScene'] }
  ),
  bg(
    'bg_chapter_2',
    'public/assets/backgrounds/battle/bg_chapter_2.png',
    'battlefield where two mythologies collide, half japanese torii gate ruins and half nordic stone runes, sky split between gold dawn and violet dusk, cracked ground in the center',
    { usedBy: ['BattleScene(ch2)', 'StageSelectScene(ch2)', 'CutsceneScene'] }
  ),
  bg(
    'bg_chapter_3',
    'public/assets/backgrounds/battle/bg_chapter_3.png',
    'the underworld Yomi, black rock cavern with rivers of pale violet spirit fire, hanging paper talismans, endless dark depth behind, flat dark stone floor in the center',
    { priority: 'P2', usedBy: ['BattleScene(ch3)', 'StageSelectScene(ch3)', 'CutsceneScene'] }
  ),
  bg(
    'bg_chapter_4',
    'public/assets/backgrounds/battle/bg_chapter_4.png',
    'collapsing greek marble temple on a mountain peak above the clouds, broken corinthian columns, orange volcanic fissures splitting the white marble, sunset amber and white',
    { priority: 'P2', usedBy: ['BattleScene(ch4)', 'StageSelectScene(ch4)', 'CutsceneScene'] }
  ),
  bg(
    'bg_chapter_5',
    'public/assets/backgrounds/battle/bg_chapter_5.png',
    'Ragnarok final battlefield, the world tree burning in the far distance, sky torn open with white light, scorched earth, all mythologies converging, apocalyptic scale',
    { priority: 'P2', usedBy: ['BattleScene(ch5)', 'StageSelectScene(ch5)', 'CutsceneScene'] }
  ),
  bg(
    'bg_pvp',
    'public/assets/backgrounds/scenes/bg_pvp.png',
    'grand colosseum arena at night lit by cyan braziers, empty tiered stands rising into darkness, sand floor in the center',
    { priority: 'P2', usedBy: ['PvPPopup'] }
  ),
  bg(
    'bg_raid',
    'public/assets/backgrounds/scenes/bg_raid.png',
    'enormous draconic silhouette coiled in a dark cavern, only its glowing eye and scale highlights visible, overwhelming scale, deep red rim light against black',
    { priority: 'P2', usedBy: ['RaidPopup'] }
  )
];

// ---------------------------------------------------------------------------
// 2. 프레임 / 패널 (frame)
// ---------------------------------------------------------------------------
const RARITY_FRAMES = [
  ['N', 'plain dark iron border, matte grey metal, no ornament, minimal'],
  ['R', 'polished steel border with a thin blue enamel inlay, restrained ornament'],
  ['SR', 'silver border with violet crystal shards embedded at the corners, arcane engraving'],
  ['SSR', 'radiant gold border with glowing golden filigree and small light flares at the corners, most ornate']
];

const frames = [
  frame(
    'frame_panel',
    'public/assets/ui/frames/frame_panel.png',
    'thin dark metal panel border with subtle cyan energy line running along the inner edge, restrained sci-fi arcane ornament, corners slightly reinforced',
    '96,96,96,96',
    { usedBy: ['GlassPanel', 'all scenes'] }
  ),
  frame(
    'frame_popup',
    'public/assets/ui/frames/frame_popup.png',
    'modal window border, dark metal, with a wider decorated header bar across the top edge, small emblem notch centered on the top bar, cyan accent line',
    '96,96,120,96',
    { usedBy: ['PopupBase'] }
  ),
  ...RARITY_FRAMES.map(([r, desc]) =>
    frame(
      `frame_card_${r}`,
      `public/assets/ui/frames/frame_card_${r}.png`,
      `trading card border frame, ${desc}, hollow empty center`,
      '64,64,64,64',
      { usedBy: ['HeroCard', 'GachaResultOverlay', 'BattleResultScene', 'InventoryPopup'] }
    )
  ),
  frame(
    'frame_hex',
    'public/assets/ui/frames/frame_hex.png',
    'hexagonal portrait socket frame, dark metal ring with six small notches, hollow empty center, used for party slots and stage number badges',
    '0,0,0,0 (9-slice 미사용, 단일 스프라이트)',
    { out: 256, usedBy: ['MainMenuScene party slots', 'StageSelectScene stage badge'] }
  ),
  frame(
    'panel_header_ornament',
    'public/assets/ui/panels/panel_header_ornament.png',
    'thin horizontal decorative divider bar, symmetrical, small diamond at the center, tapering cyan energy line to both ends',
    '160,160,0,0 (가로 3-slice)',
    { width: 1024, height: 128, out: '512x64', priority: 'P2', usedBy: ['PopupBase header', 'section titles'] }
  )
];

// ---------------------------------------------------------------------------
// 3. 버튼 (button)
// ---------------------------------------------------------------------------
const buttons = [
  button(
    'btn_primary',
    'public/assets/ui/buttons/btn_primary.png',
    'bright cyan energy filled plate with a glowing outer rim and a subtle inner highlight along the top edge, confident and prominent',
    { usedBy: ['all CTA buttons'] }
  ),
  button(
    'btn_secondary',
    'public/assets/ui/buttons/btn_secondary.png',
    'dark slate metal plate with a thin cyan outline, matte and recessive',
    { usedBy: ['secondary actions'] }
  ),
  button(
    'btn_ghost',
    'public/assets/ui/buttons/btn_ghost.png',
    'nearly transparent plate, outline only, thin grey border with faint corner ticks',
    { usedBy: ['tertiary actions, cancel'] }
  )
];

// ---------------------------------------------------------------------------
// 4. 아이콘 (icon) — 재화 5 + 교단 엠블럼 9
// ---------------------------------------------------------------------------
const CURRENCY = [
  ['gold', 'a stack of ancient gold coins with a rune stamped on the top coin, warm gold #F59E0B'],
  ['gem', 'a faceted magenta crystal gem, sharp facets catching light, #EC4899'],
  ['energy', 'a stylized lightning bolt inside a hexagon, bright cyan #06BBFA'],
  ['ticket', 'an ornate summoning ticket with a rune seal and a torn edge, gold and violet'],
  ['spirit_stone', 'a smooth polished spirit stone orb with an inner glow, pale gold #FFD60A']
];

const CULTS = [
  ['valhalla', 'crossed nordic axes over a winged helm, wind-blue #4A90D9'],
  ['takamagahara', 'a radiant sun disc with eight rays and a torii silhouette, gold #FFD700'],
  ['olympus', 'a lightning bolt gripped by an eagle claw, fire orange #FF6B35'],
  ['asgard', 'the rainbow bridge arch over a fortress gate, cyan blue #5DADE2'],
  ['yomi', 'a cracked oni mask half in shadow, dark violet #8E44AD'],
  ['tartarus', 'a broken chain over an abyssal spiral, deep navy #2C3E50'],
  ['avalon', 'a sword through a chalice wreathed in leaves, mint teal #4ECDC4'],
  ['helheim', 'a frozen skull half buried in ice crystals, pale steel #B0C4DE'],
  ['kunlun', 'a coiled eastern dragon around a peach of immortality, emerald #50C878']
];

const icons = [
  ...CURRENCY.map(([id, desc]) =>
    icon(`icon_currency_${id}`, `public/assets/ui/icons/currency/${id}.png`, desc, {
      usedBy: ['TopBar', 'reward displays', 'GachaScene', 'QuestPopup']
    })
  ),
  ...CULTS.map(([id, desc]) =>
    icon(
      `icon_cult_${id}`,
      `public/assets/ui/icons/cults/${id}.png`,
      `heraldic emblem crest, ${desc}, engraved metal medallion style, bold symmetrical silhouette`,
      {
        priority: 'P1',
        usedBy: ['HeroDetailScene watermark', 'CollectionPopup', 'AscensionPopup', 'HeroCard badge']
      }
    )
  )
];

// ---------------------------------------------------------------------------
// 5. 배너 (banner)
// ---------------------------------------------------------------------------
const banners = [
  {
    id: 'banner_pickup_iris',
    category: 'banner',
    priority: 'P1',
    targetPath: 'public/assets/ui/panels/banner_pickup_iris.png',
    width: 832,
    height: 1216,
    count: 4,
    positive: `${QUALITY}, ${STYLE}, gacha pickup banner key visual, a single female anime warrior with lightning magic, dynamic hero pose, full body, lightning arcs and gold sparks around her, dramatic backlight, empty darker area across the bottom fifth for the text plate`,
    negative: NEG_BG.replace('people, face, portrait, close-up character, ', ''),
    seedNote: '픽업 캐릭터는 hero_005(base_iris) 포트레이트와 머리색·의상 실루엣을 맞출 것. 참조 이미지로 IPAdapter 권장',
    postProcess: [
      'crop to 680x560 display area (base 720 기준), keep character in upper 70%',
      'bake bottom gradient fade to #0D0F1A over the lowest 20%'
    ],
    usedBy: ['GachaScene', 'GachaPopup']
  },
  {
    id: 'banner_pickup_generic',
    category: 'banner',
    priority: 'P2',
    targetPath: 'public/assets/ui/panels/banner_pickup_generic.png',
    width: 832,
    height: 1216,
    count: 3,
    positive: `${QUALITY}, ${STYLE}, gacha standard banner key visual, an ornate empty summoning altar with a glowing silhouette forming above it, no defined character face, gold particles, empty darker area across the bottom fifth`,
    negative: NEG_BG,
    seedNote: 'bg_gacha 와 다른 seed 로 뽑아 배경과 배너가 겹쳐 보이지 않게 한다',
    postProcess: ['crop to 680x560 display area', 'bake bottom gradient fade to #0D0F1A'],
    usedBy: ['GachaScene 상시 배너']
  },
  {
    id: 'fx_summon_circle',
    category: 'banner',
    priority: 'P1',
    targetPath: 'public/assets/effects/skills/fx_summon_circle.png',
    width: 1024,
    height: 1024,
    count: 3,
    positive: `${QUALITY}, a single ornate circular magic summoning sigil seen flat from directly above, concentric rune rings, radially symmetrical, pure white and light grey lines only so it can be tinted in engine, ${CHROMA}`,
    negative: NEG_ALPHA + ', color, colored, perspective, tilted, character, altar',
    seedNote: '엔진에서 setTint 로 등급별 색을 입히므로 반드시 무채색으로 생성',
    postProcess: ['alpha via chroma key #00FF00', 'desaturate to pure greyscale', 'downscale 512'],
    usedBy: ['GachaResultOverlay 2단계']
  }
];

// ---------------------------------------------------------------------------
// 6. 로고 (logo)
// ---------------------------------------------------------------------------
const logos = [
  {
    id: 'logo_arcane_collectors',
    category: 'logo',
    priority: 'P1',
    targetPath: 'public/assets/ui/logo_arcane_collectors.png',
    width: 1024,
    height: 512,
    count: 4,
    positive: `${QUALITY}, a game logo emblem MARK ONLY with no text, a winged arcane sigil over crossed keys inside a broken circle, gold and cyan metal, symmetrical, ${CHROMA}`,
    negative: NEG_ALPHA + ', text, letters, typography, wordmark, title',
    seedNote:
      'SDXL 은 문자를 못 만든다. "ARCANE COLLECTORS" 워드마크는 Orbitron 700 으로 코드에서 렌더하고, 이 에셋은 그 위의 엠블럼으로만 쓴다',
    postProcess: ['alpha via chroma key #00FF00', 'downscale 512x256'],
    usedBy: ['LoginScene', 'BootScene']
  }
];

// ---------------------------------------------------------------------------
// 7. 적 유닛 (fullbody-extra)
// ---------------------------------------------------------------------------
const ENEMIES = [
  ['enemy_slime', 'a translucent green slime blob with a glowing core, simple and round', 'P1'],
  ['enemy_goblin', 'a small hunched green goblin with a rusty dagger, mischievous', 'P1'],
  ['enemy_wolf', 'a lean grey dire wolf snarling, low stance', 'P1'],
  ['enemy_mushroom', 'a walking poisonous mushroom creature with a spotted violet cap, spores drifting', 'P1'],
  ['enemy_treant', 'a hulking moss covered tree ent with glowing amber eyes, elite', 'P1'],
  ['enemy_golem', 'a stone statue golem carved with runes, cracked and mossy, elite', 'P1'],
  ['enemy_goblin_king', 'an armored goblin king wearing a crooked gold crown, sitting weight, boss scale', 'P1'],
  ['enemy_cerberus', 'a three headed black hound wreathed in ember, boss scale', 'P2'],
  ['enemy_yamata', 'an eight headed serpent, violet scales, boss scale', 'P2'],
  ['enemy_jormungandr', 'a colossal world serpent coiling, blue-green scales, boss scale', 'P2']
];

const enemies = ENEMIES.map(([id, desc, priority]) => ({
  id,
  category: 'fullbody-extra',
  priority,
  targetPath: `public/assets/characters/battle/${id}.png`,
  width: 832,
  height: 1216,
  count: 3,
  positive: `${QUALITY}, anime game monster design, ${desc}, full body, standing on the ground, three quarter view facing left, ${CHROMA}, consistent flat lighting with cyan rim light from behind`,
  negative: NEG_ALPHA + ', human, girl, boy, weapon rack, environment, ground shadow',
  seedNote: '적 전체를 같은 seed 대역(9000~9100)으로 묶어 조명과 두께감을 통일',
  postProcess: [
    'alpha via chroma key #00FF00 (despill)',
    'trim to content',
    'downscale to 512 height, anchor origin (0.5, 1.0)'
  ],
  usedBy: ['BattleScene', 'IdleBattleView', 'TowerPopup 층 정보']
}));

// ---------------------------------------------------------------------------
// 8. 레거시 캐릭터 전신 보강 (fullbody-extra)
// ---------------------------------------------------------------------------
const legacyFullbody = [1, 2, 3, 4].map((n) => {
  const id = `fullbody_hero_00${n}`;
  return {
    id,
    category: 'fullbody-extra',
    priority: 'P2',
    targetPath: `public/assets/characters/fullbody/hero_00${n}.png`,
    width: 832,
    height: 1216,
    count: 3,
    positive: `${QUALITY}, ${STYLE}, a single anime hero character, full body, standing hero pose, facing viewer, detailed fantasy armor and cloak, ${CHROMA}`,
    negative: NEG_ALPHA + ', multiple characters, cropped limbs, environment, ground shadow',
    seedNote: `기존 portraits/hero_00${n}.png (256px 카툰 플레이스홀더) 를 교체하는 것이 목적이므로 원본과 닮을 필요 없음. char_${n} 의 교단·클래스에 맞춘 색만 유지`,
    postProcess: ['alpha via chroma key #00FF00', 'trim to content', 'origin (0.5, 0.0) 기준 정렬'],
    usedBy: ['HeroDetailScene 전신 영역']
  };
});

// ---------------------------------------------------------------------------
// 조립
// ---------------------------------------------------------------------------
const assets = [
  ...backgrounds,
  ...frames,
  ...buttons,
  ...icons,
  ...banners,
  ...logos,
  ...enemies,
  ...legacyFullbody
];

const p1 = assets.filter((a) => a.priority === 'P1').length;
const p2 = assets.filter((a) => a.priority === 'P2').length;

const doc = {
  $schema: 'internal://arcanecollectors/asset-spec/v1',
  generatedBy: 'tools/art/_build-asset-spec.mjs',
  generatedAt: '2026-09-02',
  relatedDocs: [
    'docs/redesign/REDESIGN_PLAN.md',
    'docs/redesign/ASSET_USAGE_MAP.md',
    'docs/DESIGN_SYSTEM.md'
  ],
  generator: {
    backend: 'local ComfyUI',
    model: 'novaAnimeXL (SDXL)',
    notes: [
      'SDXL 은 문자를 렌더하지 못한다. 모든 텍스트는 Phaser 코드에서 그린다.',
      '세로 배경은 832x1216, 가로 배경은 1216x832 를 넘기지 않는다. 그 이상은 구도가 붕괴한다.',
      '알파가 필요한 항목은 순수 크로마 그린 #00FF00 배경으로 생성한 뒤 키잉한다. despill 을 반드시 적용한다.',
      '9-slice 대상은 코너 영역 안쪽에 형태를 두지 않아야 한다. 프롬프트의 hollow empty center 가 이 조건이다.',
      '배경은 1080x1920 cover-fit 시 가로 약 24% 가 잘린다. 주요 형태를 중앙 60% 안에 둔다.'
    ]
  },
  conventions: {
    baseResolution: '720x1280 (렌더 1080x1920, s() = x1.5)',
    blurPair:
      'category=background 인 항목은 전부 {name}_blur.png 페어를 빌드 스크립트로 함께 굽는다. glass 패널 백드롭에 쓰인다.',
    chromaKey: '#00FF00',
    priority: { P1: '필수 — 리디자인 W2 착수 전 준비', P2: '권장 — 이후 보강' }
  },
  summary: {
    total: assets.length,
    P1: p1,
    P2: p2,
    byCategory: assets.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {})
  },
  assets
};

const out = path.resolve('tools/art/asset-spec.json');
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`wrote ${out}`);
console.log(`total ${assets.length}  P1 ${p1}  P2 ${p2}`);
console.log(JSON.stringify(doc.summary.byCategory, null, 1));
