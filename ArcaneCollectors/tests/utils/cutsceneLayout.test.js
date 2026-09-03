/**
 * cutsceneLayout.test.js
 * 컷씬 배치·화자 슬롯 순수 로직 검증 (Phaser 비의존)
 */
import { describe, it, expect } from 'vitest';
import {
  ACTOR_SLOT,
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
