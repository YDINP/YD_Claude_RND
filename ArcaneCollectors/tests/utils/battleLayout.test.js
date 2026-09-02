import { describe, it, expect } from 'vitest';
import {
  BASE_W,
  BATTLE_LAYOUT,
  SKILL_SLOT,
  UNIT_BAND,
  RESULT_LAYOUT,
  DEFAULT_BATTLE_BG,
  getChapterNumber,
  resolveBattleBgKey,
  computeUnitSlots,
  getAllySlots,
  getEnemySlots,
  getUnitAttachments,
  getSkillSlot,
  getSkillSlots,
  computeCooldownArc,
  computeTurnOrderSlots,
  pushLogLine,
  getLogLineY,
  buildCultBadges,
  computeStarSlots,
  computeResultButtonLayout,
  computePartyExpSlots
} from '../../src/utils/battleLayout.js';

describe('battleLayout — 배경 선택', () => {
  it('탑·레이드 모드는 전용 배경을 쓴다', () => {
    expect(resolveBattleBgKey({ mode: 'tower', stage: { id: '1-1' } })).toBe('bg_tower');
    expect(resolveBattleBgKey({ mode: 'raid', stage: { id: '2-3' } })).toBe('bg_raid');
  });

  it('스토리 스테이지는 id 앞자리로 챕터 배경을 고른다', () => {
    expect(resolveBattleBgKey({ mode: 'normal', stage: { id: '3-7' } })).toBe('bg_chapter_3');
    expect(resolveBattleBgKey({ mode: 'boss', stage: { id: '5-10' } })).toBe('bg_chapter_5');
  });

  it('stage.chapter 가 있으면 id 보다 우선한다', () => {
    expect(resolveBattleBgKey({ stage: { id: '1-1', chapter: 4 } })).toBe('bg_chapter_4');
  });

  it('챕터 배경이 없는 범위와 판별 불가는 공용 배경으로 내려간다', () => {
    expect(resolveBattleBgKey({ stage: { id: '6-1' } })).toBe(DEFAULT_BATTLE_BG);
    expect(resolveBattleBgKey({ stage: { id: 'event_boss' } })).toBe(DEFAULT_BATTLE_BG);
    expect(resolveBattleBgKey({})).toBe(DEFAULT_BATTLE_BG);
    expect(resolveBattleBgKey()).toBe(DEFAULT_BATTLE_BG);
  });

  it('getChapterNumber 는 잘못된 입력에 null 을 준다', () => {
    expect(getChapterNumber(null)).toBeNull();
    expect(getChapterNumber({ id: 'tower_12' })).toBeNull();
    expect(getChapterNumber({ id: '0-1' })).toBeNull();
    expect(getChapterNumber({ id: '2-4' })).toBe(2);
    expect(getChapterNumber({ chapter: '3' })).toBe(3);
  });
});

describe('battleLayout — 유닛 배치', () => {
  it('아군 4인은 좌우 대칭으로 펼쳐진다', () => {
    const slots = getAllySlots(4);
    expect(slots).toHaveLength(4);
    const xs = slots.map(sl => sl.x);
    expect(xs[0]).toBeLessThan(xs[3]);
    // 중심(360)에 대한 대칭
    expect(xs[0] + xs[3]).toBeCloseTo(BASE_W, 5);
    expect(xs[1] + xs[2]).toBeCloseTo(BASE_W, 5);
  });

  it('아군 아크는 바깥쪽이 앞(아래), 적 아크는 바깥쪽이 뒤(위)로 간다', () => {
    const allies = getAllySlots(4);
    const enemies = getEnemySlots(3);
    expect(allies[0].y).toBeGreaterThan(allies[1].y);   // 가장자리가 더 아래
    expect(enemies[0].y).toBeLessThan(enemies[1].y);    // 가장자리가 더 위
  });

  it('아군과 적은 기획 대역(§3-5) 안에 들어간다', () => {
    for (const slot of getAllySlots(4)) {
      expect(slot.y).toBeGreaterThanOrEqual(BATTLE_LAYOUT.allyBand.top);
      expect(slot.y).toBeLessThanOrEqual(BATTLE_LAYOUT.allyBand.bottom);
    }
    for (const slot of getEnemySlots(5)) {
      expect(slot.y).toBeGreaterThanOrEqual(BATTLE_LAYOUT.enemyBand.top);
      expect(slot.y).toBeLessThanOrEqual(BATTLE_LAYOUT.enemyBand.bottom);
    }
  });

  it('한 명이면 정중앙에 선다', () => {
    const [only] = getEnemySlots(1);
    expect(only.x).toBe(UNIT_BAND.enemy.centerX);
    expect(only.y).toBe(UNIT_BAND.enemy.baseY);
  });

  it('행 최대치를 넘으면 다음 행으로 접어 뒤로 민다', () => {
    const slots = computeUnitSlots({
      count: 7, centerX: 360, baseY: 400, spread: 240, arcDepth: 0, maxPerRow: 5, rowGap: 80
    });
    expect(slots).toHaveLength(7);
    expect(slots.filter(sl => sl.row === 0)).toHaveLength(5);
    expect(slots.filter(sl => sl.row === 1)).toHaveLength(2);
    expect(slots[6].y).toBe(320);
  });

  it('유닛 수가 0이거나 음수면 빈 배열이다', () => {
    expect(getAllySlots(0)).toEqual([]);
    expect(getEnemySlots(-3)).toEqual([]);
    expect(computeUnitSlots()).toEqual([]);
  });

  it('부착물은 HP바 아래에 이름을 두어 겹침을 없앤다', () => {
    const attach = getUnitAttachments();
    expect(attach.nameY).toBeGreaterThan(attach.hpBarY);
    expect(attach.badgeY).toBeLessThan(attach.hpBarY);
  });

  it('보스는 부착물이 스프라이트 확대 비율만큼 밀린다', () => {
    const normal = getUnitAttachments();
    const boss = getUnitAttachments({ isBoss: true });
    expect(boss.hpBarY).toBeGreaterThan(normal.hpBarY);
    expect(boss.hpBarW).toBeGreaterThan(normal.hpBarW);
  });
});

describe('battleLayout — 스킬 액션바', () => {
  it('4칸이 기획 좌표(x=48/188/328/468)에 고정된다', () => {
    const lefts = getSkillSlots().map(slot => slot.x - slot.w / 2);
    expect(lefts).toEqual([48, 188, 328, 468]);
  });

  it('마지막 칸이 화면 폭 안에 있다', () => {
    const last = getSkillSlot(SKILL_SLOT.count - 1);
    expect(last.x + last.w / 2).toBeLessThanOrEqual(BASE_W);
  });

  it('범위 밖 인덱스는 null 이다', () => {
    expect(getSkillSlot(-1)).toBeNull();
    expect(getSkillSlot(4)).toBeNull();
  });

  it('쿨다운 링은 12시에서 시작해 비율만큼 시계 방향으로 돈다', () => {
    const half = computeCooldownArc(50, 100);
    expect(half.ratio).toBe(0.5);
    expect(half.startAngle).toBeCloseTo(-Math.PI / 2, 6);
    expect(half.endAngle).toBeCloseTo(-Math.PI / 2 + Math.PI, 6);
    expect(half.ready).toBe(false);
  });

  it('쿨다운 링은 0~1 로 잘리고 가득 차면 ready 다', () => {
    expect(computeCooldownArc(-10, 100).ratio).toBe(0);
    expect(computeCooldownArc(300, 100).ratio).toBe(1);
    expect(computeCooldownArc(100, 100).ready).toBe(true);
    expect(computeCooldownArc(10, 0).ratio).toBeCloseTo(0.1, 6);
  });
});

describe('battleLayout — 턴 순서', () => {
  const battlers = [
    { name: '아이리스', isAlly: true, isAlive: true, stats: { spd: 95 } },
    { name: '고블린', isAlly: false, isAlive: true, stats: { spd: 40 } },
    { name: '늑대', isAlly: false, isAlive: true, stats: { spd: 70 } },
    { name: '쓰러진', isAlly: true, isAlive: false, stats: { spd: 999 } }
  ];

  it('SPD 내림차순으로 정렬하고 첫 칸을 현재 턴으로 표시한다', () => {
    const slots = computeTurnOrderSlots(battlers);
    expect(slots.map(sl => sl.spd)).toEqual([95, 70, 40]);
    expect(slots[0].isCurrent).toBe(true);
    expect(slots[1].isCurrent).toBe(false);
    expect(slots[0].initial).toBe('아');
  });

  it('사망한 유닛은 빼고 원본 배열은 건드리지 않는다', () => {
    const before = battlers.map(b => b.name);
    const slots = computeTurnOrderSlots(battlers);
    expect(slots).toHaveLength(3);
    expect(battlers.map(b => b.name)).toEqual(before);
  });

  it('max 를 넘는 유닛은 잘리고 x 는 등간격이다', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `U${i}`, isAlive: true, stats: { spd: 100 - i }
    }));
    const slots = computeTurnOrderSlots(many, { max: 6, startX: 100, spacing: 50 });
    expect(slots).toHaveLength(6);
    expect(slots[0].x).toBe(100);
    expect(slots[5].x).toBe(350);
  });

  it('입력이 배열이 아니면 빈 배열이다', () => {
    expect(computeTurnOrderSlots(null)).toEqual([]);
    expect(computeTurnOrderSlots(undefined)).toEqual([]);
  });
});

describe('battleLayout — 전투 로그 대역', () => {
  it('최근 2줄만 남기고 원본을 바꾸지 않는다', () => {
    const first = pushLogLine([], 'a');
    const second = pushLogLine(first, 'b');
    const third = pushLogLine(second, 'c');
    expect(third).toEqual(['b', 'c']);
    expect(first).toEqual(['a']);
  });

  it('빈 메시지는 무시한다', () => {
    expect(pushLogLine(['a'], '')).toEqual(['a']);
    expect(pushLogLine(['a'], '   ')).toEqual(['a']);
    expect(pushLogLine(['a'], null)).toEqual(['a']);
  });

  it('줄 y 좌표가 로그 대역 안에 들어간다', () => {
    const band = BATTLE_LAYOUT.log;
    for (let total = 1; total <= 2; total++) {
      for (let i = 0; i < total; i++) {
        const y = getLogLineY(i, total);
        expect(y).toBeGreaterThan(band.y);
        expect(y).toBeLessThan(band.y + band.h);
      }
    }
  });

  it('두 줄일 때 아래 줄이 위 줄보다 아래에 온다', () => {
    expect(getLogLineY(1, 2)).toBeGreaterThan(getLogLineY(0, 2));
  });
});

describe('battleLayout — 교단 배지', () => {
  it('값이 0인 상태는 배지를 만들지 않는다', () => {
    const empty = { divinity: 0, doom: 0, barrier: 0, runes: [], runeburst: false, runeShield: 0, statuses: [] };
    expect(buildCultBadges(empty)).toEqual([]);
    expect(buildCultBadges(null)).toEqual([]);
  });

  it('divinity·doom·barrier 를 값과 함께 배지로 만든다', () => {
    const badges = buildCultBadges({ divinity: 40, doom: 3, barrier: 120, runes: [], statuses: [] });
    expect(badges.map(b => b.key)).toEqual(['divinity', 'doom', 'barrier']);
    expect(badges[0].value).toBe(40);
    expect(badges[2].label).toBe('WARD');
    expect(typeof badges[0].color).toBe('number');
  });

  it('룬은 배열 길이를, runeburst 는 값 없는 배지를 만든다', () => {
    const badges = buildCultBadges({ runes: ['atk', 'def'], runeburst: true, statuses: [] });
    const rune = badges.find(b => b.key === 'runes');
    const burst = badges.find(b => b.key === 'runeburst');
    expect(rune.value).toBe(2);
    expect(burst.value).toBeNull();
  });

  it('상태이상은 뒤에 붙고 max 로 잘린다', () => {
    const badges = buildCultBadges(
      { divinity: 10, doom: 2, barrier: 5, statuses: [{ type: 'thunderstruck', duration: 2 }] },
      { max: 3 }
    );
    expect(badges).toHaveLength(3);
    expect(badges.every(b => !b.key.startsWith('status:'))).toBe(true);
  });

  it('상태이상만 있으면 상태 배지가 보인다', () => {
    const badges = buildCultBadges({ statuses: [{ type: 'curse', duration: 3 }] });
    expect(badges).toHaveLength(1);
    expect(badges[0].label).toBe('CURS');
    expect(badges[0].value).toBe(3);
  });
});

describe('battleLayout — 전투 결과 화면', () => {
  it('별 3개가 화면 중앙에 대칭으로 놓인다', () => {
    const xs = computeStarSlots(3);
    expect(xs).toHaveLength(3);
    expect(xs[1]).toBe(BASE_W / 2);
    expect(xs[0] + xs[2]).toBeCloseTo(BASE_W, 5);
  });

  it('버튼 1개는 전폭 주 버튼이다', () => {
    const [only] = computeResultButtonLayout(1);
    expect(only.w).toBe(RESULT_LAYOUT.actions.w);
    expect(only.primary).toBe(true);
    expect(only.x).toBe(BASE_W / 2);
  });

  it('버튼 3개는 전폭 1 + 2분할 1행이 된다', () => {
    const slots = computeResultButtonLayout(3);
    expect(slots).toHaveLength(3);
    expect(slots[0].w).toBe(RESULT_LAYOUT.actions.w);
    expect(slots[1].w).toBeLessThan(RESULT_LAYOUT.actions.w);
    expect(slots[1].w).toBe(slots[2].w);
    expect(slots[1].y).toBe(slots[2].y);
    expect(slots[1].y).toBeGreaterThan(slots[0].y);
  });

  it('버튼 4개는 홀로 남는 마지막 버튼이 전폭으로 돌아간다', () => {
    const slots = computeResultButtonLayout(4);
    expect(slots).toHaveLength(4);
    expect(slots[3].w).toBe(RESULT_LAYOUT.actions.w);
    expect(slots[3].y).toBeGreaterThan(slots[1].y);
  });

  it('버튼이 없으면 빈 배열이다', () => {
    expect(computeResultButtonLayout(0)).toEqual([]);
    expect(computeResultButtonLayout()).toEqual([]);
  });

  it('승리 화면의 보상 패널과 파티 대역이 겹치지 않는다', () => {
    const reward = RESULT_LAYOUT.reward;
    const party = RESULT_LAYOUT.party;
    const firstAction = computeResultButtonLayout(3)[0];
    expect(party.y).toBeGreaterThan(reward.y + reward.h);
    expect(firstAction.y - firstAction.h / 2).toBeGreaterThanOrEqual(party.y + party.h);
  });

  it('파티 EXP 슬롯은 대역 안에서 겹치지 않는다', () => {
    const band = RESULT_LAYOUT.party;
    const slots = computePartyExpSlots(4);
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.y - slot.h / 2).toBeGreaterThanOrEqual(band.y);
      expect(slot.y + slot.h / 2).toBeLessThanOrEqual(band.y + band.h);
    }
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].y - slots[i].h / 2).toBeGreaterThanOrEqual(slots[i - 1].y + slots[i - 1].h / 2);
    }
    expect(computePartyExpSlots(0)).toEqual([]);
  });

  it('파티 슬롯은 대역을 주입하면 그 안에 배치된다 (패배 화면 전용 대역)', () => {
    const band = RESULT_LAYOUT.defeatParty;
    const slots = computePartyExpSlots(4, band);
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.y - slot.h / 2).toBeGreaterThanOrEqual(band.y);
      expect(slot.y + slot.h / 2).toBeLessThanOrEqual(band.y + band.h);
    }
    // 승리 대역과 겹치지 않는 별개의 위치여야 한다
    expect(slots[0].y).not.toBe(computePartyExpSlots(4)[0].y);
  });

  it('패배 진단 패널과 편성 대역과 액션 버튼이 서로 겹치지 않는다', () => {
    const detail = RESULT_LAYOUT.detail;
    const party = RESULT_LAYOUT.defeatParty;
    const firstAction = computeResultButtonLayout(3)[0];
    expect(party.y).toBeGreaterThan(detail.y + detail.h);
    expect(firstAction.y - firstAction.h / 2).toBeGreaterThanOrEqual(party.y + party.h);
  });
});
