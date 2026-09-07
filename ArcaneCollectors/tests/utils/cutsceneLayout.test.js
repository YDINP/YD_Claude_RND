/**
 * cutsceneLayout.test.js
 * 컷씬 배치·화자 슬롯 순수 로직 검증 (Phaser 비의존)
 */
import { describe, it, expect } from 'vitest';
import ENEMY_DATA from '../../src/data/enemies.json';
import SPEAKER_ASSETS from '../../src/data/speaker-assets.json';
import PORTRAIT_MAP from '../../src/data/portrait-mapping.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import STORY_DATA from '../../src/data/story.json';
import {
  ACTOR_SLOT,
  CUTSCENE_LAYOUT,
  CHAPTER_CARD,
  ENEMY_CARD,
  NARRATION,
  SPEAKER_ASSET_KIND,
  buildEnemyIndex,
  buildSpeakerNameIndex,
  chapterCardText,
  isPortraitCardKind,
  isSilhouetteByDesign,
  normalizeSpeakerName,
  enemyAssetPath,
  enemyCardRect,
  enemyFrameKey,
  enemyTextureKey,
  isChapterIntroScene,
  narrationBandRect,
  narrationRuleY,
  progressLabel,
  resolveEnemyForLine,
  resolveSpeakerAsset,
  CHAPTER_BG_RANGE,
  DEFAULT_CUTSCENE_BG,
  LOG_LINE_LIMIT,
  actorSlot,
  assignSpeakerSides,
  autoAdvanceDelay,
  isActorLine,
  recentLogLines,
  resolveChapterNumber,
  resolveCutsceneBgKey,
  speakerIdentity
} from '../../src/utils/cutsceneLayout.js';

const narrator = (text = '…') => ({ speaker: '', speakerType: 'narrator', portraitId: null, text });
const hero = (name, id, extra = {}) => ({ speaker: name, speakerType: 'hero', portraitId: id, text: '…', ...extra });
const npc = (name = '등록관', extra = {}) => ({ speaker: name, speakerType: 'npc', portraitId: null, text: '…', ...extra });
const enemy = (name, extra = {}) => ({ speaker: name, speakerType: 'enemy', portraitId: null, text: '…', ...extra });

describe('resolveChapterNumber', () => {
  it('stageId에서 챕터를 뽑는다', () => {
    expect(resolveChapterNumber({ stageId: '1-1' })).toBe(1);
    expect(resolveChapterNumber({ stageId: '5-5' })).toBe(5);
  });

  it('stageId가 없으면 chapterId를 본다', () => {
    expect(resolveChapterNumber({ stageId: null, chapterId: 'chapter_3' })).toBe(3);
  });

  it('앵커가 없으면 null이다', () => {
    expect(resolveChapterNumber({ stageId: null, chapterId: null })).toBeNull();
    expect(resolveChapterNumber(null)).toBeNull();
  });
});

describe('resolveCutsceneBgKey', () => {
  it('씬이 지정한 배경 텍스처가 실재하면 그것을 쓴다', () => {
    const key = resolveCutsceneBgKey({ background: 'bg_forest', stageId: '1-1' }, (k) => k === 'bg_forest');
    expect(key).toBe('bg_forest');
  });

  it('지정 배경 자산이 없으면 챕터 배경으로 내려간다', () => {
    const key = resolveCutsceneBgKey({ background: 'bg_forest', stageId: '2-5' }, () => false);
    expect(key).toBe('bg_chapter_2');
  });

  it('앵커가 없는 영웅 씬은 기본 배경을 쓴다', () => {
    const key = resolveCutsceneBgKey({ background: null, stageId: null, chapterId: null, heroId: 'base_iris' });
    expect(key).toBe(DEFAULT_CUTSCENE_BG);
  });

  it('챕터 배경 범위를 벗어나면 기본 배경으로 떨어진다', () => {
    const key = resolveCutsceneBgKey({ stageId: `${CHAPTER_BG_RANGE.max + 1}-1` }, () => false);
    expect(key).toBe(DEFAULT_CUTSCENE_BG);
  });
});

describe('isActorLine / speakerIdentity', () => {
  it('내레이터와 수집가는 슬롯을 차지하지 않는다', () => {
    expect(isActorLine(narrator())).toBe(false);
    expect(isActorLine({ speakerType: 'player', speaker: '수집가' })).toBe(false);
    expect(speakerIdentity(narrator())).toBeNull();
  });

  it('포트레이트가 있으면 그것이 식별자다', () => {
    expect(speakerIdentity(hero('아이리스', 'base_iris'))).toBe('base_iris');
  });

  it('포트레이트가 없으면 유형+이름으로 식별한다', () => {
    expect(speakerIdentity(npc())).toBe('npc:등록관');
    expect(speakerIdentity(enemy('고블린'))).toBe('enemy:고블린');
  });
});

describe('assignSpeakerSides', () => {
  it('데이터가 지정한 side를 그대로 쓴다', () => {
    const sides = assignSpeakerSides([
      npc('등록관', { speakerSide: 'left' }),
      hero('아이리스', 'base_iris', { speakerSide: 'right' })
    ]);
    expect(sides).toEqual(['left', 'right']);
  });

  it('side가 없으면 등장 순으로 좌·우를 교대 배정한다', () => {
    const sides = assignSpeakerSides([npc(), hero('아이리스', 'base_iris'), enemy('고블린')]);
    expect(sides).toEqual(['left', 'right', 'left']);
  });

  it('같은 화자는 씬 내내 같은 쪽을 유지한다', () => {
    const sides = assignSpeakerSides([
      npc(),
      hero('아이리스', 'base_iris'),
      npc(),
      hero('아이리스', 'base_iris')
    ]);
    expect(sides).toEqual(['left', 'right', 'left', 'right']);
  });

  it('내레이터·수집가 줄은 null이다', () => {
    const sides = assignSpeakerSides([narrator(), npc(), { speakerType: 'player', speaker: '수집가' }]);
    expect(sides).toEqual([null, 'left', null]);
  });

  it('배열이 아니면 빈 배열을 돌려준다', () => {
    expect(assignSpeakerSides(null)).toEqual([]);
  });
});

describe('actorSlot', () => {
  it('좌우 슬롯이 서로 다른 x를 갖고 같은 발치에 선다', () => {
    const left = actorSlot('left');
    const right = actorSlot('right');
    expect(left.x).toBeLessThan(right.x);
    expect(left.y).toBe(right.y);
    expect(left.y).toBe(ACTOR_SLOT.baselineY);
  });

  it('등장 슬라이드는 각자 바깥쪽에서 들어온다', () => {
    expect(actorSlot('left').slideFrom).toBeLessThan(0);
    expect(actorSlot('right').slideFrom).toBeGreaterThan(0);
  });

  it('요구 높이는 base 760px이다', () => {
    expect(actorSlot('left').boxH).toBe(760);
  });
});

describe('autoAdvanceDelay', () => {
  it('짧은 대사도 하한 1.2초를 지킨다', () => {
    expect(autoAdvanceDelay('…')).toBe(1200);
  });

  it('긴 대사도 상한 4.5초를 넘지 않는다', () => {
    expect(autoAdvanceDelay('가'.repeat(200))).toBe(4500);
  });

  it('중간 길이는 글자수 × 60ms + 700ms다', () => {
    expect(autoAdvanceDelay('가'.repeat(31))).toBe(31 * 60 + 700);
  });
});

describe('recentLogLines', () => {
  it('최근 5줄만 남긴다', () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ speaker: 'A', text: `${i}` }));
    const recent = recentLogLines(history);
    expect(recent).toHaveLength(LOG_LINE_LIMIT);
    expect(recent[recent.length - 1].text).toBe('8');
  });

  it('기록이 없으면 빈 배열이다', () => {
    expect(recentLogLines(null)).toEqual([]);
    expect(recentLogLines([])).toEqual([]);
  });
});

// ==================================================================
// 가독성 · 화자 아트 (2026-09-04 컷씬 리디자인)
// ==================================================================

describe('narrationBandRect', () => {
  it('짧은 내레이션도 최소 높이를 지킨다', () => {
    const band = narrationBandRect(20);
    expect(band.h).toBe(NARRATION.minH);
  });

  it('본문이 길면 여백만큼 커진다', () => {
    const band = narrationBandRect(200);
    expect(band.h).toBe(200 + NARRATION.padY * 2);
  });

  it('띠는 항상 본문 중심(centerY)을 감싼다', () => {
    [0, 40, 160, 320].forEach((h) => {
      const band = narrationBandRect(h);
      expect(band.y).toBeLessThan(NARRATION.centerY);
      expect(band.y + band.h).toBeGreaterThan(NARRATION.centerY);
      expect(band.centerY).toBe(NARRATION.centerY);
    });
  });

  it('잘못된 입력은 최소 높이로 폴백한다', () => {
    expect(narrationBandRect(NaN).h).toBe(NARRATION.minH);
    expect(narrationBandRect(undefined).h).toBe(NARRATION.minH);
    expect(narrationBandRect(-50).h).toBe(NARRATION.minH);
  });

  it('최대 4줄(UX §3-2 #8)까지도 대화박스 영역(y 890~)을 침범하지 않는다', () => {
    const band = narrationBandRect(180);
    expect(band.y + band.h + band.fadeH).toBeLessThan(CUTSCENE_LAYOUT.box.y);
  });
});

describe('narrationRuleY', () => {
  it('헤어라인 두 줄이 띠 안쪽에 놓인다', () => {
    const band = narrationBandRect(120);
    const rules = narrationRuleY(band);
    expect(rules.top).toBeGreaterThan(band.y);
    expect(rules.bottom).toBeLessThan(band.y + band.h);
    expect(rules.top).toBeLessThan(rules.bottom);
  });
});

describe('progressLabel', () => {
  it('씬이 하나면 줄 진행만 보여준다', () => {
    expect(progressLabel(0, 8, 0, 1)).toBe('1 / 8');
    expect(progressLabel(7, 8, 0, 1)).toBe('8 / 8');
  });

  it('대기열이 둘 이상이면 씬 진행을 덧붙인다', () => {
    expect(progressLabel(2, 8, 0, 2)).toContain('3 / 8');
    expect(progressLabel(2, 8, 0, 2)).toContain('장면 1/2');
  });

  it('범위를 벗어난 인덱스를 잘라낸다', () => {
    expect(progressLabel(-3, 8)).toBe('1 / 8');
    expect(progressLabel(99, 8)).toBe('8 / 8');
  });
});

describe('isChapterIntroScene / chapterCardText', () => {
  it('chapter_enter 씬만 타이틀 카드를 띄운다', () => {
    expect(isChapterIntroScene({ trigger: 'chapter_enter', chapterId: 'chapter_2' })).toBe(true);
    expect(isChapterIntroScene({ trigger: 'stage_enter', stageId: '2-1' })).toBe(false);
    expect(isChapterIntroScene(null)).toBe(false);
  });

  it('챕터 제목이 있으면 그대로 쓴다', () => {
    const card = chapterCardText({ trigger: 'chapter_enter', chapterId: 'chapter_3' }, () => '균열의 시작');
    expect(card).toEqual({ label: 'CHAPTER 3', title: '균열의 시작' });
  });

  it('제목 조회에 실패하면 "제 N 장"으로 폴백한다', () => {
    const card = chapterCardText({ trigger: 'chapter_enter', chapterId: 'chapter_4' }, () => null);
    expect(card.title).toBe('제 4 장');
  });

  it('타이틀 카드는 대화박스보다 위에 놓인다', () => {
    expect(CHAPTER_CARD.centerY).toBeLessThan(CUTSCENE_LAYOUT.box.y);
  });
});

describe('enemyTextureKey / enemyFrameKey / enemyCardRect', () => {
  it('BattleScene 과 같은 텍스처 키 규약을 쓴다', () => {
    expect(enemyTextureKey('enemy_zeus')).toBe('enemy_art_enemy_zeus');
    expect(enemyTextureKey('')).toBeNull();
    expect(enemyTextureKey(null)).toBeNull();
  });

  it('등급에 따라 카드 프레임이 달라진다', () => {
    expect(enemyFrameKey('normal')).toBe('frame_card_R');
    expect(enemyFrameKey('elite')).toBe('frame_card_SR');
    expect(enemyFrameKey('boss')).toBe('frame_card_SSR');
    expect(enemyFrameKey('tower_boss')).toBe('frame_card_SSR');
    expect(enemyFrameKey('알수없음')).toBe('frame_card_SR');
  });

  it('카드는 좌/우 슬롯 쪽에 서되 화면 밖으로 잘리지 않는다', () => {
    const left = enemyCardRect('left');
    const right = enemyCardRect('right');
    const halfW = ENEMY_CARD.size / 2 + ENEMY_CARD.edgeMargin;
    expect(left.x).toBeLessThan(right.x);
    expect(left.x).toBeGreaterThanOrEqual(halfW);
    expect(right.x).toBeLessThanOrEqual(720 - halfW);
    expect(left.x).toBeLessThanOrEqual(Math.max(ACTOR_SLOT.left.x, halfW));
    expect(left.artSize).toBe(ENEMY_CARD.size - ENEMY_CARD.inset * 2);
  });

  it('카드는 대화박스와 상단 레터박스 사이에 들어간다', () => {
    const card = enemyCardRect('left');
    expect(card.y + ENEMY_CARD.size / 2).toBeLessThan(CUTSCENE_LAYOUT.box.y);
    expect(card.y - ENEMY_CARD.size / 2).toBeGreaterThan(CUTSCENE_LAYOUT.letterboxTop);
  });
});

describe('buildEnemyIndex / resolveEnemyForLine', () => {
  const index = buildEnemyIndex(ENEMY_DATA);

  it('이름과 id 양쪽으로 찾을 수 있다', () => {
    expect(index.byName.get('제우스').id).toBe('enemy_zeus');
    expect(index.byId.get('enemy_zeus').type).toBe('boss');
  });

  it('적 화자는 이름으로 해석된다', () => {
    const line = { speakerType: 'enemy', speaker: '고블린 왕', portraitId: null };
    expect(resolveEnemyForLine(line, index)).toEqual({ id: 'enemy_goblin_king', type: 'boss' });
  });

  it('speakerAsset 이 있으면 그것을 우선한다', () => {
    const line = { speakerType: 'npc', speaker: '등록관', speakerAsset: 'enemy_lich' };
    expect(resolveEnemyForLine(line, index).id).toBe('enemy_lich');
  });

  it('??? (unknown) 줄은 revealAs 가 있어도 정체를 드러내지 않는다', () => {
    const line = { speakerType: 'unknown', speaker: '???', revealAs: 'enemy_rift_guardian' };
    expect(resolveEnemyForLine(line, index)).toBeNull();
  });

  it('이름이 색인에 없으면 null 이다', () => {
    expect(resolveEnemyForLine({ speakerType: 'enemy', speaker: '없는적' }, index)).toBeNull();
    expect(resolveEnemyForLine(null, index)).toBeNull();
  });
});

describe('enemyAssetPath', () => {
  it('매니페스트에 있는 키만 경로를 돌려준다', () => {
    expect(enemyAssetPath('enemy_zeus', ASSET_MANIFEST.enemies)).toContain('enemy_zeus');
    expect(enemyAssetPath('enemy_없음', ASSET_MANIFEST.enemies)).toBeNull();
    expect(enemyAssetPath(null, ASSET_MANIFEST.enemies)).toBeNull();
  });
});

describe('resolveSpeakerAsset', () => {
  const deps = { enemyIndex: buildEnemyIndex(ENEMY_DATA), manifestEnemies: ASSET_MANIFEST.enemies };

  it('내레이터·수집가는 슬롯을 쓰지 않는다', () => {
    expect(resolveSpeakerAsset(narrator(), deps)).toBeNull();
    expect(resolveSpeakerAsset({ speakerType: 'player', speaker: '수집가' }, deps)).toBeNull();
  });

  it('적 화자는 초상 카드 아트를 받는다', () => {
    const asset = resolveSpeakerAsset(enemy('제우스'), deps);
    expect(asset.kind).toBe(SPEAKER_ASSET_KIND.ENEMY);
    expect(asset.textureKey).toBe('enemy_art_enemy_zeus');
    expect(asset.frameKey).toBe('frame_card_SSR');
    expect(asset.path).toContain('enemy_zeus');
  });

  it('영웅은 portraitId 경로로 넘어간다', () => {
    const asset = resolveSpeakerAsset(hero('아이리스', 'base_iris'), deps);
    expect(asset.kind).toBe(SPEAKER_ASSET_KIND.HERO);
    expect(asset.portraitId).toBe('base_iris');
  });

  it('등록관·???는 실루엣 메달로 폴백한다', () => {
    expect(resolveSpeakerAsset(npc(), deps).kind).toBe(SPEAKER_ASSET_KIND.SILHOUETTE);
    expect(resolveSpeakerAsset({ speakerType: 'unknown', speaker: '???' }, deps).kind)
      .toBe(SPEAKER_ASSET_KIND.SILHOUETTE);
  });

  it('아트가 없는 적은 실루엣으로 떨어진다 (404 요청 금지)', () => {
    const asset = resolveSpeakerAsset(enemy('제우스'), { ...deps, manifestEnemies: {} });
    expect(asset.kind).toBe(SPEAKER_ASSET_KIND.SILHOUETTE);
    expect(asset.path).toBeNull();
  });
});

describe('normalizeSpeakerName', () => {
  it('앞뒤 공백과 내부 연속 공백을 정리한다', () => {
    expect(normalizeSpeakerName(' 등록관 ')).toBe('등록관');
    expect(normalizeSpeakerName('균열의   수호자')).toBe('균열의 수호자');
  });

  it('감싼 따옴표와 후행 존칭을 떼어낸다', () => {
    expect(normalizeSpeakerName('"등록관"')).toBe('등록관');
    expect(normalizeSpeakerName('등록관님')).toBe('등록관');
    expect(normalizeSpeakerName('제우스씨')).toBe('제우스');
  });

  it('문자열이 아니면 빈 문자열이다', () => {
    expect(normalizeSpeakerName(null)).toBe('');
    expect(normalizeSpeakerName(undefined)).toBe('');
  });
});

describe('speaker-assets.json 테이블', () => {
  const speakerIndex = buildSpeakerNameIndex(SPEAKER_ASSETS);
  const deps = {
    enemyIndex: buildEnemyIndex(ENEMY_DATA),
    speakerIndex,
    manifestEnemies: ASSET_MANIFEST.enemies,
    manifestNpc: ASSET_MANIFEST.npc
  };

  it('등록관은 NPC 초상 카드로 해석된다', () => {
    const asset = resolveSpeakerAsset(npc('등록관'), deps);
    expect(asset.kind).toBe(SPEAKER_ASSET_KIND.NPC);
    expect(asset.textureKey).toBe('npc_registrar_portrait');
    expect(asset.path).toContain('assets/characters/npc/');
    expect(isPortraitCardKind(asset.kind)).toBe(true);
  });

  it('표기가 흔들려도 같은 화자로 붙는다', () => {
    ['등록관', ' 등록관 ', '등록관님', '"등록관"'].forEach((name) => {
      expect(resolveSpeakerAsset(npc(name), deps).textureKey).toBe('npc_registrar_portrait');
    });
  });

  it('테이블 아트가 매니페스트에 없으면 다음 규칙으로 넘어간다', () => {
    const asset = resolveSpeakerAsset(npc('등록관'), { ...deps, manifestNpc: {} });
    expect(asset.kind).toBe(SPEAKER_ASSET_KIND.SILHOUETTE);
  });

  it('의도적 실루엣 목록은 ??? 뿐이다', () => {
    expect(SPEAKER_ASSETS.silhouetteOnly).toEqual(['???']);
    expect(isSilhouetteByDesign({ speaker: '???' }, SPEAKER_ASSETS)).toBe(true);
    expect(isSilhouetteByDesign({ speaker: '등록관' }, SPEAKER_ASSETS)).toBe(false);
  });

  it('테이블의 모든 항목이 매니페스트에 실재한다', () => {
    const dangling = [];
    for (const [name, entry] of Object.entries(SPEAKER_ASSETS.byName)) {
      const bucket = entry.kind === 'npc' ? ASSET_MANIFEST.npc : ASSET_MANIFEST.enemies;
      if (entry.kind === 'hero') {
        if (!PORTRAIT_MAP[entry.portraitId]) dangling.push(`${name} → ${entry.portraitId}`);
        continue;
      }
      if (!bucket || !bucket[entry.textureKey]) dangling.push(`${name} → ${entry.textureKey}`);
    }
    expect(dangling).toEqual([]);
  });
});

describe('story.json 화자 전수 검증', () => {
  const deps = {
    enemyIndex: buildEnemyIndex(ENEMY_DATA),
    speakerIndex: buildSpeakerNameIndex(SPEAKER_ASSETS),
    manifestEnemies: ASSET_MANIFEST.enemies,
    manifestNpc: ASSET_MANIFEST.npc
  };

  /** 해석 결과가 실제 파일로 이어지는지 확인한다 */
  const assetExists = (asset) => {
    if (asset.kind === SPEAKER_ASSET_KIND.HERO) {
      const file = PORTRAIT_MAP[asset.portraitId];
      return !!file && !!ASSET_MANIFEST.fullbody[`fb_${file}`];
    }
    return !!asset.path;
  };

  const speakers = new Map();
  for (const scene of STORY_DATA.scenes) {
    for (const line of scene.lines) {
      const key = `${line.speakerType}|${line.speaker || ''}`;
      if (!speakers.has(key)) speakers.set(key, { line, scene: scene.id });
    }
  }

  it('모든 화자가 실제 아트로 해석되거나 의도적 실루엣이다', () => {
    const unresolved = [];
    for (const [key, { line, scene }] of speakers) {
      const asset = resolveSpeakerAsset(line, deps);
      if (asset === null) continue;                                   // narrator / player
      if (asset.kind === SPEAKER_ASSET_KIND.SILHOUETTE) {
        if (!isSilhouetteByDesign(line, SPEAKER_ASSETS)) unresolved.push(`${scene} ${key} (실루엣 폴백)`);
        continue;
      }
      if (!assetExists(asset)) unresolved.push(`${scene} ${key} → ${asset.textureKey || asset.portraitId} (에셋 없음)`);
    }
    expect(unresolved).toEqual([]);
  });

  it('적 화자 8종이 전부 적 아트로 해석된다', () => {
    const enemies = [...speakers.values()].filter(({ line }) => line.speakerType === 'enemy');
    expect(enemies).toHaveLength(8);
    enemies.forEach(({ line }) => {
      expect(resolveSpeakerAsset(line, deps).kind).toBe(SPEAKER_ASSET_KIND.ENEMY);
    });
  });

  it('영웅 화자 34종이 전부 전신 시트를 가진다', () => {
    const heroes = [...speakers.values()].filter(({ line }) => line.speakerType === 'hero');
    expect(heroes).toHaveLength(34);
    heroes.forEach(({ line }) => {
      const asset = resolveSpeakerAsset(line, deps);
      expect(asset.kind).toBe(SPEAKER_ASSET_KIND.HERO);
      expect(assetExists(asset)).toBe(true);
    });
  });

  it('실루엣으로 남는 화자는 ??? 하나뿐이다', () => {
    const silhouettes = [...speakers.values()]
      .map(({ line }) => ({ line, asset: resolveSpeakerAsset(line, deps) }))
      .filter(({ asset }) => asset && asset.kind === SPEAKER_ASSET_KIND.SILHOUETTE)
      .map(({ line }) => line.speaker);
    expect(silhouettes).toEqual(['???']);
  });
});
