/**
 * cutscene-smoke.mjs — 컷씬 재생 e2e 실증 (T-C4 / T-Q1)
 *
 * 검증 내용
 *   게스트 로그인 → 스테이지 선택 → 1-1 출격
 *   → chapter_enter + stage_enter 컷씬이 CutsceneScene으로 뜨는지
 *   → 화면 탭으로 다음 줄이 진행되는지
 *   → [전체 건너뛰기]가 동작하고 시청 이력이 세이브에 남는지(스킵 무손실)
 *   → 컷씬 종료 후 전투로 진행되는지
 *   → 대사·내레이션 텍스트 대비가 WCAG AA(4.5:1) 이상인지 — 캔버스 픽셀 실측
 *   → 보스·등록관 화자에 실제 아트가 붙는지 / 챕터 인트로 타이틀 카드가 뜨는지
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/cutscene-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

import { blockHmr } from './hmr-guard.mjs';
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
/** 리디자인 전후 대조용 캡처 (T-C5 컷씬 가독성·화자 아트) */
const REDESIGN_SHOT_DIR = new URL('../../docs/redesign/screenshots/after/', import.meta.url);
/** WCAG 2.1 AA — 일반 텍스트 대비 하한 */
const AA_CONTRAST = 4.5;
/** 게임 해상도 = 뷰포트 (동일 종횡비 → 레터박스 없음, 좌표 변환이 단순 스케일) */
const VIEWPORT = { width: 720, height: 1280 };
const GAME_WIDTH = 1080;
/** 부팅·씬 전환 대기 상한 (에셋 로드량과 머신 부하에 따라 변동) */
const BOOT_TIMEOUT_MS = 40000;

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

async function waitFor(page, fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/**
 * base 720×1280 좌표 → 페이지 좌표
 * Phaser의 `scale.canvasBounds` / `scale.displayScale`을 그대로 역산한다
 * (캔버스가 레터박스로 오프셋될 수 있으므로 단순 비례로 계산하면 어긋난다).
 */
async function tapPoint(page, baseX, baseY) {
  const gameScale = GAME_WIDTH / 720; // s()
  return page.evaluate(
    ({ gx, gy }) => {
      const scale = window.game.scale;
      return {
        x: scale.canvasBounds.x + gx / scale.displayScale.x,
        y: scale.canvasBounds.y + gy / scale.displayScale.y
      };
    },
    { gx: baseX * gameScale, gy: baseY * gameScale }
  );
}

/**
 * 텍스트 오브젝트가 실제로 얹힌 배경의 **최악 밝기**로 대비를 잰다.
 *
 * 글자 픽셀과 배경 픽셀을 색으로 가르면 안티에일리어싱에 판정이 흔들린다.
 * 그래서 텍스트를 한 프레임 숨기고 같은 영역을 다시 찍어 "글자 없는 배경"만 본다.
 * 배경의 최대 휘도(가장 밝은 지점)를 쓰므로 통과하면 그 줄의 모든 획이 AA를 넘긴다.
 *
 * @param {import('playwright').Page} page
 * @param {string} textProp - CutscenePlayer 의 텍스트 필드명 (bodyText | narratorText)
 * @returns {Promise<{ratio:number, medianRatio:number, color:string, rect:object}|null>}
 */
async function measureTextContrast(page, textProp) {
  return page.evaluate(async (prop) => {
    const relLum = (r, g, b) => {
      const f = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const player = window.game.scene.getScene('CutsceneScene')?.player;
    const target = player?.[prop];
    if (!target || !target.visible || !target.text) return null;

    const bounds = target.getBounds();
    const rect = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      w: Math.max(1, Math.round(bounds.width)),
      h: Math.max(1, Math.round(bounds.height))
    };
    const css = target.style.color || '#FFFFFF';
    const hex = css.replace('#', '');
    const textLum = relLum(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));

    // 글자를 지운 배경만 찍는다
    target.setVisible(false);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const img = await new Promise((resolve) => {
      window.game.renderer.snapshotArea(rect.x, rect.y, rect.w, rect.h, resolve);
    });
    target.setVisible(true);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const lums = [];
    for (let i = 0; i < data.length; i += 4) lums.push(relLum(data[i], data[i + 1], data[i + 2]));
    lums.sort((a, b) => a - b);
    const worst = lums[lums.length - 1];
    const median = lums[Math.floor(lums.length / 2)];
    const contrast = (lo, hi) => (Math.max(lo, hi) + 0.05) / (Math.min(lo, hi) + 0.05);

    return {
      ratio: Number(contrast(textLum, worst).toFixed(2)),
      medianRatio: Number(contrast(textLum, median).toFixed(2)),
      color: css,
      rect
    };
  }, textProp);
}

/**
 * 게임 프레임버퍼 원본을 PNG 로 저장한다.
 * 페이지 CSS 가 캔버스를 세로로 늘려 붙이므로 `page.screenshot()` 은 종횡비가 어긋난다.
 * 대조용 캡처는 렌더러 스냅샷으로 1080×1920 원본 그대로 남긴다.
 */
async function snapshotToFile(page, url) {
  const dataUrl = await page.evaluate(
    () => new Promise((resolve) => {
      window.game.renderer.snapshot((img) => resolve(img.src));
    })
  );
  writeFileSync(url.pathname.slice(1), Buffer.from(dataUrl.split(',')[1], 'base64'));
}

/** 지정한 컷씬 1개를 MainMenu 위에 직접 띄운다 (대본 지점을 결정적으로 재현) */
async function openCutscene(page, sceneId) {
  await page.evaluate(async (id) => {
    const mod = await import('/src/systems/StoryManager.js');
    const cutscene = mod.StoryManager.getScene(id);
    const menu = window.game.scene.getScene('MainMenuScene');
    if (window.game.scene.isActive('CutsceneScene')) window.game.scene.stop('CutsceneScene');
    menu.scene.launch('CutsceneScene', { scenes: [cutscene], parentKey: 'MainMenuScene' });
    menu.scene.bringToTop('CutsceneScene');
  }, sceneId);
  await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), 10000);
  await page.waitForTimeout(400);
}

/** 특정 줄로 이동해 타이핑을 끝낸 상태로 만든다 */
async function showLine(page, index) {
  await page.evaluate((i) => {
    const player = window.game.scene.getScene('CutsceneScene').player;
    player._showLine(i);
    player._completeLine();
  }, index);
  await page.waitForTimeout(450);
}

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync(REDESIGN_SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });


  // 공유 dev 서버 격리 — 남이 소스를 저장해도 이 페이지는 리로드되지 않는다.
  // 실증: node tests/e2e/hmr-guard-verify.mjs
  await blockHmr(page, BASE_URL);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 컷씬 재생 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 1. 게스트 로그인
    // 부팅(Boot → Preload → Login)은 에셋 로드량에 따라 수 초에서 십수 초까지 걸린다.
    // 고정 대기 대신 씬 활성화를 조건으로 기다린다.
    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'), BOOT_TIMEOUT_MS);
    assert(loginReady, 'LoginScene 활성화');

    await page.evaluate(() => {
      window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
    });
    const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), BOOT_TIMEOUT_MS);
    assert(mainMenu, '게스트 로그인 → MainMenuScene');

    // 2. 스테이지 선택 진입 후 1-1 출격 (실제 startBattle 경로)
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene');
    });
    const stageSelect = await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene'));
    assert(stageSelect, 'StageSelectScene 진입');
    await page.waitForTimeout(500);

    const launched = await page.evaluate(() => {
      const scene = window.game.scene.getScene('StageSelectScene');
      const stage = scene.generateStages(1).find((s) => s.id === '1-1');
      if (!stage) return false;
      scene.selectedStage = stage;
      scene.showPartySelect();
      scene.autoFillParty();
      scene.startBattle();
      return true;
    });
    assert(launched, '1-1 출격 실행');

    // 3. 컷씬이 떴는가
    const cutsceneUp = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    assert(cutsceneUp, 'CutsceneScene 오버레이 표시');

    const queue = await page.evaluate(() => {
      const scene = window.game.scene.getScene('CutsceneScene');
      return scene?.player?.queue?.map((s) => s.id) || [];
    });
    assert(
      queue.join(',') === 'cs_ch1_enter,cs_1_1_enter',
      'chapter_enter → stage_enter 순으로 대기열 구성',
      queue.join(',')
    );

    const parentPaused = await page.evaluate(() => window.game.scene.isPaused('StageSelectScene'));
    assert(parentPaused, '호출 씬(StageSelectScene) 일시정지');

    await page.waitForTimeout(1200);
    await page.screenshot({ path: new URL('cutscene_1_1_intro.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_intro.png');

    // 4. 탭으로 다음 줄 진행
    const beforeTap = await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.lineIndex);
    const center = await tapPoint(page, 360, 640);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(300);
    const afterTap = await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.lineIndex);
    assert(afterTap > beforeTap, '탭으로 대사 진행', `${beforeTap} → ${afterTap}`);

    // 4-b. 캐릭터 대사 줄(대화박스 + 이름표 + 실루엣)까지 진행
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(400);
    }
    const speakerLine = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      const line = player.queue[player.sceneIndex].lines[player.lineIndex];
      return { speaker: line.speaker, type: line.speakerType, hasSilhouette: !!player.silhouette.current };
    });
    assert(
      speakerLine.type !== 'narrator' && speakerLine.hasSilhouette,
      '캐릭터 대사에서 이름표·실루엣 표시',
      JSON.stringify(speakerLine)
    );
    await page.screenshot({ path: new URL('cutscene_1_1_dialogue.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_dialogue.png');

    // 5. [전체 건너뛰기] 탭
    const skipAll = await tapPoint(page, 24 + 220 / 2, 1196 + 48 / 2);
    await page.mouse.click(skipAll.x, skipAll.y);
    await page.waitForTimeout(600);

    const cutsceneClosed = await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'));
    assert(cutsceneClosed, '전체 건너뛰기로 컷씬 종료');

    // 6. 스킵해도 시청 이력이 남는다 (무손실)
    const viewed = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save');
      const save = raw ? JSON.parse(raw) : {};
      return {
        version: save.version,
        keys: Object.keys(save.story || {}).sort(),
        currentChapterStory: save.story?.currentChapterStory,
        lastViewedAt: save.story?.lastViewedAt,
        viewed: save.story?.viewedCutscenes || [],
        skipped: save.story?.skippedCutscenes || []
      };
    });
    assert(
      viewed.viewed.includes('cs_ch1_enter') && viewed.viewed.includes('cs_1_1_enter'),
      '스킵한 씬도 viewedCutscenes에 기록됨',
      JSON.stringify(viewed.viewed)
    );
    assert(
      viewed.skipped.includes('cs_ch1_enter') && viewed.skipped.includes('cs_1_1_enter'),
      'skippedCutscenes에도 기록됨',
      JSON.stringify(viewed.skipped)
    );

    // 6-b. 세이브 v2 story 섹션 4개 키가 온전히 유지된다
    assert(
      viewed.keys.join(',') === 'currentChapterStory,lastViewedAt,skippedCutscenes,viewedCutscenes',
      'save.story 4개 키 유지 (SaveManager v2 스키마)',
      `v${viewed.version} ${viewed.keys.join(',')}`
    );
    assert(
      viewed.currentChapterStory === 'chapter_1' && typeof viewed.lastViewedAt === 'number',
      'currentChapterStory / lastViewedAt 갱신',
      `${viewed.currentChapterStory} / ${viewed.lastViewedAt}`
    );

    // 7. 컷씬 종료 후 전투 진행
    const battleStarted = await waitFor(page, () => !!window.game?.scene.isActive('BattleScene'), 12000);
    assert(battleStarted, '컷씬 종료 후 전투 진입');
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL('cutscene_1_1_after_skip.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_after_skip.png');

    // 8. 전신 시트 화자 — 1-1 대본에는 영웅 대사가 없으므로 첫 각성 씬으로 확인한다
    // 전투 진입 직후라 활성 씬이 BattleScene / BattleResultScene 어느 쪽일지 확정되지 않는다.
    // 지금 살아 있는 씬에서 메인 메뉴로 돌린다.
    const backToMenu = await waitFor(
      page,
      () => {
        if (window.game.scene.isActive('MainMenuScene')) return true;
        const active = window.game.scene.scenes.find((sc) => sc.scene.isActive());
        active?.scene.start('MainMenuScene');
        return false;
      },
      BOOT_TIMEOUT_MS
    );
    assert(backToMenu, '메인 메뉴 복귀');

    await page.evaluate(async () => {
      const mod = await import('/src/systems/StoryManager.js');
      const menu = window.game.scene.getScene('MainMenuScene');
      mod.StoryManager.trigger('first_hero', { scene: menu, heroId: 'base_iris', allowRepeat: true });
    });
    const heroCutscene = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    assert(heroCutscene, '영웅 컷씬(cs_first_hero_iris) 표시');

    // 아이리스가 말하는 줄까지 진행한다 (앞 2줄은 내레이션).
    //
    // 고정 횟수 탭(4회)으로 세던 것을 조건 대기로 바꿨다. 탭 1회가 "타이핑 완성"이 될지
    // "다음 줄"이 될지는 그 순간 줄이 다 찍혔는지에 달려 있어(30자/초 × 줄 길이 33~35자
    // ≈ 1.1초 vs 탭 간격 0.4초), 머신 부하나 씬 전환 타이밍이 흔들리면 내레이션 줄에서
    // 멈춰 아래 세 어서션이 한꺼번에 깨진다. 실제 탭 경로는 그대로 태우되(입력 계약 유지)
    // **영웅 줄에 닿을 때까지** 두드린다.
    const heroTap = await tapPoint(page, 360, 640);
    const currentSpeakerType = () => page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene')?.player;
      if (!player) return null;
      return player.queue[player.sceneIndex]?.lines?.[player.lineIndex]?.speakerType ?? null;
    });
    let heroLineReached = (await currentSpeakerType()) === 'hero';
    for (let i = 0; i < 12 && !heroLineReached; i += 1) {
      await page.mouse.click(heroTap.x, heroTap.y);
      await page.waitForTimeout(320);
      heroLineReached = (await currentSpeakerType()) === 'hero';
    }
    assert(heroLineReached, '탭으로 영웅 대사 줄까지 진행');

    // 전신 시트는 지연 로드다. 슬롯에 텍스처가 붙을 때까지 기다린다
    // (안 기다리면 아직 실루엣 폴백인 순간을 찍어 "텍스처 없음"으로 오판한다)
    await waitFor(
      page,
      () => !!window.game.scene.getScene('CutsceneScene')?.player?.characterStage?.getActorTextures()?.right,
      8000
    );
    const actor = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      const line = player.queue[player.sceneIndex].lines[player.lineIndex];
      const ids = player.characterStage.getActorIds();
      const object = player.silhouette.current;
      return {
        speakerType: line.speakerType,
        portraitId: line.portraitId,
        side: player._activeSide,
        ids,
        texture: object?.texture?.key ?? null
      };
    });
    assert(actor.speakerType === 'hero', '영웅 대사 줄 도달', JSON.stringify(actor));
    assert(
      actor.ids.right === 'base_iris' && actor.side === 'right',
      '영웅이 오른쪽 슬롯에 선다',
      JSON.stringify(actor.ids)
    );
    assert(
      actor.texture === 'fb_hero_005' || actor.texture === 'hero_base_iris',
      '전신 시트(폴백은 포트레이트) 텍스처 적용',
      String(actor.texture)
    );
    await page.screenshot({ path: new URL('cutscene_hero_fullbody.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_hero_fullbody.png');

    // 9. 가독성 · 화자 아트 (컷씬 리디자인)
    // 대본 지점을 직접 띄워 결정적으로 재현한다. 스킵 경로에는 손대지 않는다.
    await page.evaluate(() => {
      if (window.game.scene.isActive('CutsceneScene')) window.game.scene.stop('CutsceneScene');
      const active = window.game.scene.scenes.find((sc) => sc.scene.isActive());
      if (!window.game.scene.isActive('MainMenuScene')) active?.scene.start('MainMenuScene');
    });
    await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), BOOT_TIMEOUT_MS);

    // 9-a. 챕터 인트로 타이틀 카드
    await openCutscene(page, 'cs_ch1_enter');
    await page.waitForTimeout(500);
    const chapterCard = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      return { visible: !!player.chapterLayer?.visible, card: player._chapterCard };
    });
    assert(
      chapterCard.visible && chapterCard.card?.label === 'CHAPTER 1',
      '챕터 인트로 타이틀 카드 표시',
      JSON.stringify(chapterCard)
    );
    await snapshotToFile(page, new URL('cutscene-chapter.png', REDESIGN_SHOT_DIR));
    console.log('   📸 docs/redesign/screenshots/after/cutscene-chapter.png');

    // 타이틀 카드가 스스로 사라진다 (입력을 붙잡지 않는다)
    const cardGone = await waitFor(
      page,
      () => !window.game.scene.getScene('CutsceneScene').player.chapterLayer.visible,
      6000
    );
    assert(cardGone, '타이틀 카드가 자동으로 사라짐');

    // 9-b. 내레이션 — 밴드 위 텍스트 대비
    await showLine(page, 0);
    const narrationContrast = await measureTextContrast(page, 'narratorText');
    assert(
      !!narrationContrast && narrationContrast.ratio >= AA_CONTRAST,
      `내레이션 텍스트 대비 ≥ ${AA_CONTRAST}:1 (최악 지점)`,
      JSON.stringify(narrationContrast)
    );
    await snapshotToFile(page, new URL('cutscene-narration.png', REDESIGN_SHOT_DIR));
    console.log(`   📸 cutscene-narration.png — 최악 ${narrationContrast?.ratio}:1 / 중앙값 ${narrationContrast?.medianRatio}:1`);

    // 9-c. 대사 — 대화박스 위 텍스트 대비
    const dialogueIndex = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      return player.queue[0].lines.findIndex((l) => l.speakerType !== 'narrator');
    });
    await showLine(page, dialogueIndex);
    const dialogueContrast = await measureTextContrast(page, 'bodyText');
    assert(
      !!dialogueContrast && dialogueContrast.ratio >= AA_CONTRAST,
      `대사 텍스트 대비 ≥ ${AA_CONTRAST}:1 (최악 지점)`,
      JSON.stringify(dialogueContrast)
    );
    await snapshotToFile(page, new URL('cutscene-dialogue.png', REDESIGN_SHOT_DIR));
    console.log(`   📸 cutscene-dialogue.png — 최악 ${dialogueContrast?.ratio}:1 / 중앙값 ${dialogueContrast?.medianRatio}:1`);

    // 9-c2. 등록관 — 대본 최다 화자(68줄). NPC 초상 카드가 서야 한다
    await openCutscene(page, 'cs_1_1_enter');
    const registrarIndex = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      return player.queue[0].lines.findIndex((l) => l.speaker === '등록관');
    });
    assert(registrarIndex >= 0, '1-1 대본에 등록관 대사 존재', String(registrarIndex));
    await showLine(page, registrarIndex);
    await waitFor(
      page,
      () => {
        const tex = window.game.scene.getScene('CutsceneScene').player.characterStage.getActorTextures();
        return tex.left === 'npc_registrar_portrait' || tex.right === 'npc_registrar_portrait';
      },
      8000
    );
    const registrarActor = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      return { textures: player.characterStage.getActorTextures(), side: player._activeSide };
    });
    assert(
      registrarActor.textures[registrarActor.side] === 'npc_registrar_portrait',
      '등록관 화자에 NPC 아트 적용 (실루엣 아님)',
      JSON.stringify(registrarActor)
    );
    const registrarContrast = await measureTextContrast(page, 'bodyText');
    assert(
      !!registrarContrast && registrarContrast.ratio >= AA_CONTRAST,
      `등록관 장면 대사 대비 ≥ ${AA_CONTRAST}:1`,
      JSON.stringify(registrarContrast)
    );
    await snapshotToFile(page, new URL('cutscene-registrar.png', REDESIGN_SHOT_DIR));
    console.log(`   📸 cutscene-registrar.png — 최악 ${registrarContrast?.ratio}:1`);

    // 9-d. 보스 화자 — 실루엣이 아니라 실제 적 아트가 서야 한다
    await openCutscene(page, 'cs_4_5_boss_before');
    const bossIndex = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      return player.queue[0].lines.findIndex((l) => l.speakerType === 'enemy');
    });
    await showLine(page, bossIndex);
    // 적 아트는 지연 로드다. 붙을 때까지 잠깐 기다린다
    await waitFor(
      page,
      () => {
        const stage = window.game.scene.getScene('CutsceneScene').player.characterStage;
        const tex = stage.getActorTextures();
        return tex.left === 'enemy_art_enemy_zeus' || tex.right === 'enemy_art_enemy_zeus';
      },
      8000
    );
    const bossActor = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      const line = player.queue[0].lines[player.lineIndex];
      return {
        speaker: line.speaker,
        textures: player.characterStage.getActorTextures(),
        side: player._activeSide
      };
    });
    assert(
      bossActor.textures[bossActor.side] === 'enemy_art_enemy_zeus',
      '보스 화자에 실제 적 아트 적용 (제우스)',
      JSON.stringify(bossActor)
    );
    const bossContrast = await measureTextContrast(page, 'bodyText');
    assert(
      !!bossContrast && bossContrast.ratio >= AA_CONTRAST,
      `보스 장면 대사 대비 ≥ ${AA_CONTRAST}:1`,
      JSON.stringify(bossContrast)
    );
    await snapshotToFile(page, new URL('cutscene-boss.png', REDESIGN_SHOT_DIR));
    console.log(`   📸 cutscene-boss.png — 최악 ${bossContrast?.ratio}:1`);

    // 9-e. 씬을 내려도 스스로 로드한 적 텍스처만 해제한다 (공용 해제 금지)
    const released = await page.evaluate(async () => {
      window.game.scene.stop('CutsceneScene');
      await new Promise((r) => setTimeout(r, 300));
      return {
        enemyGone: !window.game.textures.exists('enemy_art_enemy_zeus'),
        npcGone: !window.game.textures.exists('npc_registrar_portrait'),
        sharedKept: window.game.textures.exists('frame_card_SSR')
      };
    });
    assert(
      released.enemyGone && released.npcGone,
      '씬 이탈 시 자기가 로드한 적·NPC 텍스처 해제',
      JSON.stringify(released)
    );
    assert(released.sharedKept, '공용 텍스처(frame_card_SSR)는 유지', JSON.stringify(released));

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
