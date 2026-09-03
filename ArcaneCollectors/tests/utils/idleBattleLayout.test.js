/**
 * idleBattleLayout.test.js — 방치 전투 무대 규칙 고정
 *
 * 지키는 불변식:
 *   - 유닛이 관측창 밖으로 나가지 않는다 (창은 마스크로 잘리므로 넘치면 잘린 채 보인다)
 *   - 앞줄이 뒷줄보다 크고 아래에 있으며 뒷줄을 가린다 (원근)
 *   - 공격 간격이 요구 범위(1.2~2초) 안에 있고 순번이 파티를 순환한다
 *   - 화면의 숫자는 실제 시뮬레이션 값에서 나온다 (지어내지 않는다)
 *   - 없는 적 아트를 요청하지 않는다 (dev 404 가드가 콘솔 에러를 남긴다)
 */
import { describe, it, expect } from 'vitest';
import {
  STAGE,
  ATTACK,
  groundY,
  computePartyStands,
  computeBossStand,
  computeBossHpBar,
  computeStageLabels,
  computeFloorBand,
  computeSpriteFit,
  attackDelay,
  attackerIndex,
  isRoundEnd,
  splitDamage,
  hpRatio,
  estimateEtaSeconds,
  formatEta,
  formatHpLabel,
  heroSpriteKey,
  heroSpritePath,
  resolveEnemyArt,
  chapterBgKey
} from '../../src/utils/idleBattleLayout.js';
import { computeIdleBand } from '../../src/utils/mainMenuLayout.js';

/** 실제 관측창 크기 — mainMenuLayout 에서 가져와 두 모듈이 어긋나지 않게 한다 */
const { view } = computeIdleBand();
const W = view.w;
const H = view.h;

describe('idleBattleLayout — 무대 배치', () => {
  it('모든 유닛이 관측창 안에 선다', () => {
    const stands = computePartyStands(W, H);
    const boss = computeBossStand(W, H);
    const half = { x: W / 2, y: H / 2 };

    stands.forEach((stand) => {
      const spriteHalfW = stand.height * 0.5; // 세로형 시트라 폭은 높이보다 좁다
      expect(stand.x - spriteHalfW, `slot ${stand.index} 좌측`).toBeGreaterThan(-half.x);
      expect(stand.x + spriteHalfW, `slot ${stand.index} 우측`).toBeLessThan(0);
      expect(stand.y, `slot ${stand.index} 발밑`).toBeLessThanOrEqual(half.y);
      expect(stand.y - stand.height, `slot ${stand.index} 머리`).toBeGreaterThan(-half.y);
    });

    expect(boss.x + boss.height * 0.5).toBeLessThan(half.x);
    expect(boss.y - boss.height).toBeGreaterThan(-half.y);
  });

  it('파티는 좌측, 보스는 우측에 서고 서로 겹치지 않는다', () => {
    const stands = computePartyStands(W, H);
    const boss = computeBossStand(W, H);
    stands.forEach((stand) => expect(stand.x).toBeLessThan(0));
    expect(boss.x).toBeGreaterThan(0);
    const closest = Math.max(...stands.map((s) => s.x));
    expect(boss.x - closest).toBeGreaterThan(ATTACK.lungeDx);  // 전진해도 파고들지 않는다
  });

  it('뒷줄은 앞줄보다 작고 위에 있으며 앞줄에 가려진다 (원근)', () => {
    const stands = computePartyStands(W, H);
    const front = stands.filter((s) => s.row === 'front');
    const back = stands.filter((s) => s.row === 'back');

    expect(front).toHaveLength(2);
    expect(back).toHaveLength(2);
    back.forEach((b) => {
      front.forEach((f) => {
        expect(b.scale).toBeLessThan(f.scale);
        expect(b.y).toBeLessThan(f.y);      // 위쪽
        expect(b.depth).toBeLessThan(f.depth); // 뒤쪽
        expect(b.height).toBeLessThan(f.height);
      });
    });
  });

  it('보스 HP 바가 보스 머리 위에 있고 창 위쪽으로 넘치지 않는다', () => {
    const boss = computeBossStand(W, H);
    const bar = computeBossHpBar(W, H);
    expect(bar.y).toBeLessThan(boss.y - boss.height);
    expect(bar.y).toBeGreaterThan(-H / 2);
    expect(bar.x - bar.w / 2).toBeGreaterThan(-W / 2);
    expect(bar.x + bar.w / 2).toBeLessThan(W / 2);
  });

  it('상단 라벨이 좌우로 갈리고 창 안에 있다', () => {
    const labels = computeStageLabels(W, H);
    expect(labels.title.x).toBeLessThan(0);
    expect(labels.progress.x).toBeGreaterThan(0);
    expect(labels.eta.y).toBeGreaterThan(labels.progress.y); // 진행률 아래 줄
    [labels.title, labels.progress, labels.eta].forEach((l) => {
      expect(Math.abs(l.x)).toBeLessThan(W / 2);
      expect(l.y).toBeGreaterThan(-H / 2);
    });
  });

  it('바닥 띠가 유닛 발밑 높이에 깔린다', () => {
    const floor = computeFloorBand(W, H);
    expect(floor.y).toBe(groundY(H));
    expect(floor.w).toBe(W);
    expect(computePartyStands(W, H)[0].y).toBe(floor.y);
    expect(computeBossStand(W, H).y).toBe(floor.y);
  });

  it('스프라이트 맞춤이 비율을 유지하고 잘못된 입력은 거른다', () => {
    const fit = computeSpriteFit(683, 1024, STAGE.heroHeight);
    expect(fit.h).toBe(STAGE.heroHeight);
    expect(fit.w / fit.h).toBeCloseTo(683 / 1024, 6);
    expect(computeSpriteFit(0, 1024, 150)).toBeNull();
    expect(computeSpriteFit(683, 1024, 0)).toBeNull();
    expect(computeSpriteFit(undefined, undefined, 150)).toBeNull();
  });
});

describe('idleBattleLayout — 공격 사이클', () => {
  it('공격 간격이 항상 1.2~2초 안에 있다', () => {
    for (let i = 0; i < 20; i++) {
      const delay = attackDelay(i);
      expect(delay, `turn ${i}`).toBeGreaterThanOrEqual(ATTACK.minDelay);
      expect(delay, `turn ${i}`).toBeLessThanOrEqual(ATTACK.maxDelay);
    }
    expect(attackDelay(-3)).toBeGreaterThanOrEqual(ATTACK.minDelay);
    expect(attackDelay(NaN)).toBe(ATTACK.minDelay);
  });

  it('공격 순번이 편성 인원을 빠짐없이 순환한다', () => {
    const seen = new Set();
    for (let turn = 0; turn < 12; turn++) seen.add(attackerIndex(turn, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);

    // 1인 파티도 성립한다
    expect(attackerIndex(7, 1)).toBe(0);
    // 편성 0명이면 공격자가 없다
    expect(attackerIndex(0, 0)).toBe(-1);
  });

  it('한 바퀴의 마지막 순번 뒤에 보스가 반격한다', () => {
    const ends = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => isRoundEnd(t, 4));
    expect(ends).toEqual([false, false, false, true, false, false, false, true]);
    expect(isRoundEnd(0, 1)).toBe(true);
    expect(isRoundEnd(0, 0)).toBe(false);
  });

  it('타격 숫자는 실제 피해를 나눈 값이지 지어낸 값이 아니다', () => {
    expect(splitDamage(400, 4)).toBe(100);
    expect(splitDamage(401, 4)).toBe(100);
    expect(splitDamage(3, 4)).toBe(1);     // 0 은 띄우지 않는다
    expect(splitDamage(0, 4)).toBe(1);
    expect(splitDamage(500, 0)).toBe(500); // hits 방어
  });
});

describe('idleBattleLayout — 진행 상태', () => {
  it('진행률이 0~1 로 잘린다', () => {
    expect(hpRatio(0, 1000)).toBe(0);
    expect(hpRatio(500, 1000)).toBe(0.5);
    expect(hpRatio(2000, 1000)).toBe(1);
    expect(hpRatio(-5, 1000)).toBe(0);
    expect(hpRatio(100, 0)).toBe(0);
  });

  it('예상 격파 시간이 남은 피해와 DPS 로 계산된다', () => {
    expect(estimateEtaSeconds(600, 60)).toBe(10);
    expect(estimateEtaSeconds(0, 60)).toBe(0);
    expect(estimateEtaSeconds(600, 0)).toBe(Infinity);
    expect(estimateEtaSeconds(600, -1)).toBe(Infinity);
  });

  it('예상 시간이 한국어 한 마디로 읽힌다', () => {
    expect(formatEta(0)).toBe('격파 가능');
    expect(formatEta(45)).toBe('약 45초');
    expect(formatEta(60)).toBe('약 1분');
    expect(formatEta(80)).toBe('약 1분 20초');
    expect(formatEta(3600)).toBe('1시간 이상');
    expect(formatEta(Infinity)).toBe('—');
  });

  it('HP 라벨에 수치를 병기한다 (색상 단독 전달 금지)', () => {
    expect(formatHpLabel(1234, 10000)).toBe('1,234 / 10,000');
    expect(formatHpLabel(99999, 1000)).toBe('1,000 / 1,000'); // 최대치를 넘지 않는다
    expect(formatHpLabel(-5, 1000)).toBe('0 / 1,000');
  });
});

describe('idleBattleLayout — 에셋 조회', () => {
  it('영웅 전신 키와 경로를 포트레이트 매핑에서 끌어온다', () => {
    const map = { base_iris: 'hero_005' };
    expect(heroSpriteKey('base_iris', map)).toBe('fb_hero_005');
    expect(heroSpritePath('fb_hero_005')).toBe('assets/characters/fullbody/hero_005.webp');
    expect(heroSpriteKey('unknown', map)).toBeNull();
    expect(heroSpritePath('hero_005')).toBeNull();
  });

  it('매니페스트에 없는 적 아트는 요청하지 않는다 (dev 404 가드 보호)', () => {
    const manifest = {
      textures: {},
      lazyTextures: {},
      missing: ['enemy_goblin_king']
    };
    expect(resolveEnemyArt('enemy_goblin_king', manifest)).toBeNull();
    expect(resolveEnemyArt('enemy_goblin_king', null)).toBeNull();
    expect(resolveEnemyArt(null, manifest)).toBeNull();
  });

  it('적 아트가 매니페스트에 들어오면 자동으로 찾아 쓴다', () => {
    const withArt = {
      enemies: { enemy_goblin_king: { path: 'assets/characters/enemies/enemy_goblin_king.webp' } },
      textures: {},
      lazyTextures: {}
    };
    expect(resolveEnemyArt('enemy_goblin_king', withArt)).toEqual({
      key: 'enemy_goblin_king',
      path: 'assets/characters/enemies/enemy_goblin_king.webp',
      eager: false
    });

    const inLazy = { textures: {}, lazyTextures: { enemy_slime: { path: 'a/b.webp' } } };
    expect(resolveEnemyArt('enemy_slime', inLazy).path).toBe('a/b.webp');
  });

  it('챕터 배경 키가 1~5 로 잘린다', () => {
    expect(chapterBgKey(1)).toBe('bg_chapter_1');
    expect(chapterBgKey(3)).toBe('bg_chapter_3');
    expect(chapterBgKey(9)).toBe('bg_chapter_5');
    expect(chapterBgKey(0)).toBe('bg_chapter_1');
    expect(chapterBgKey(undefined)).toBe('bg_chapter_1');
  });
});
