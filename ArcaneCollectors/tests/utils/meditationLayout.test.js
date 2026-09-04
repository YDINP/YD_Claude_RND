/**
 * meditationLayout.test.js — 명상 성소 배치·연출·라벨 규칙 고정
 *
 * 지키는 불변식:
 *   - 파티 4인과 제단이 관측창 밖으로 나가지 않는다 (창은 마스크로 잘린다)
 *   - 앞줄이 뒷줄보다 크고 아래에 있으며 뒷줄을 가린다 (원근)
 *   - 마력 비율·수확 판정이 기존 진행도 계산과 같은 값을 낸다 (밸런스 불변)
 *   - 화면의 숫자는 실제 시뮬레이션 값에서 나온다 (지어내지 않는다)
 *   - 라벨에 전투 어휘가 없고 수치가 항상 병기된다 (A11Y)
 *   - 매니페스트에 없는 치비 시트를 요청하지 않는다 (dev 404 가드가 콘솔 에러를 남긴다)
 */
import { describe, it, expect } from 'vitest';
import {
  SANCTUM,
  AURA,
  CHANNEL,
  MAX_CONCURRENT_TWEENS,
  LABELS,
  computeRuneRing,
  computeMeditationSeats,
  computeAltar,
  computeManaGauge,
  computeSanctumLabels,
  computeReadyBanner,
  computeLightPillar,
  computeSeatDisc,
  computeChibiFit,
  auraSpawnDelay,
  channelPulseDelay,
  altarGlowAlpha,
  runeSpinDuration,
  manaRatio,
  isHarvestReady,
  formatManaLabel,
  formatFocusRate,
  estimateHarvestSeconds,
  formatHarvestEta,
  formatSanctumTitle,
  chibiSheetKey,
  baseHeroIdFromAscended,
  frameIndex,
  resolveChibiSheet
} from '../../src/utils/meditationLayout.js';

// MainMenuScene 의 관측창 실측 크기 (mainMenuLayout.computeIdleBand 의 view)
const VIEW_W = 668;
const VIEW_H = 300;

const half = { x: VIEW_W / 2, y: VIEW_H / 2 };

describe('룬 원 · 좌석 배치', () => {
  it('룬 원은 뷰 중앙 아래에 눕고, 세로 반지름이 가로보다 짧다 (바닥 원근)', () => {
    const ring = computeRuneRing(VIEW_W, VIEW_H);
    expect(ring.cx).toBe(0);
    expect(ring.cy).toBeGreaterThan(0);            // 중앙보다 아래
    expect(ring.ry).toBeLessThan(ring.rx);
    expect(ring.rx).toBeLessThan(half.x);          // 원이 창을 넘지 않는다
  });

  it('좌석은 4개이고 앞 2 · 뒤 2 로 나뉜다', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    expect(seats).toHaveLength(4);
    expect(seats.filter((s) => s.row === 'front')).toHaveLength(2);
    expect(seats.filter((s) => s.row === 'back')).toHaveLength(2);
    expect(seats.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it('앞줄이 뒷줄보다 아래에 있고 크며, 뒷줄을 가린다 (원근)', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    const front = seats.filter((s) => s.row === 'front');
    const back = seats.filter((s) => s.row === 'back');

    front.forEach((f) => back.forEach((b) => {
      expect(f.y).toBeGreaterThan(b.y);            // 아래
      expect(f.height).toBeGreaterThan(b.height);  // 크다
      expect(f.depth).toBeGreaterThan(b.depth);    // 앞에 그려진다
    }));
    expect(back[0].height / front[0].height).toBeCloseTo(SANCTUM.backRowScale, 5);
  });

  it('좌석 4인은 제단을 사이에 두고 좌우로 갈린다 (원형 배치)', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    expect(seats.filter((s) => s.x > 0)).toHaveLength(2);
    expect(seats.filter((s) => s.x < 0)).toHaveLength(2);
  });

  it('치비 4인 + 레벨 라벨이 관측창을 넘지 않는다', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    seats.forEach((seat) => {
      const halfW = seat.height * 0.5;             // 정사각 셀이라 폭 = 높이
      expect(seat.x - halfW).toBeGreaterThan(-half.x);
      expect(seat.x + halfW).toBeLessThan(half.x);
      expect(seat.y - seat.height).toBeGreaterThan(-half.y);
      expect(seat.y + 18).toBeLessThan(half.y);    // 레벨 라벨 자리까지
    });
  });
});

describe('제단 · 게이지 · 헤더', () => {
  it('제단은 룬 원 중심에 서고 구슬이 그 위에 뜬다', () => {
    const ring = computeRuneRing(VIEW_W, VIEW_H);
    const altar = computeAltar(VIEW_W, VIEW_H);
    expect(altar.x).toBe(ring.cx);
    expect(altar.y).toBe(ring.cy);
    expect(altar.topY).toBeLessThan(altar.y);      // 기둥이 위로 선다
    expect(altar.orbY).toBeLessThan(altar.topY);   // 구슬은 기둥보다 더 위
    expect(altar.orbY - altar.orbR).toBeGreaterThan(-half.y);
  });

  it('제단이 앞줄보다 뒤, 뒷줄보다 앞에 그려진다', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    const altar = computeAltar(VIEW_W, VIEW_H);
    const front = Math.min(...seats.filter((s) => s.row === 'front').map((s) => s.depth));
    const back = Math.max(...seats.filter((s) => s.row === 'back').map((s) => s.depth));
    expect(altar.depth).toBeGreaterThan(back);
    expect(altar.depth).toBeLessThan(front);
  });

  it('마력 게이지는 가운데 정렬이고 창 안에 들어간다', () => {
    const gauge = computeManaGauge(VIEW_W, VIEW_H);
    expect(gauge.x).toBe(0);
    expect(gauge.w / 2).toBeLessThan(half.x);
    expect(gauge.y).toBeGreaterThan(-half.y);
    expect(gauge.labelY).toBeGreaterThan(gauge.y + gauge.h); // 라벨은 바 아래
    expect(gauge.labelY).toBeLessThan(half.y);
  });

  it('헤더 라벨 3자리가 창 안쪽 여백을 지킨다', () => {
    const labels = computeSanctumLabels(VIEW_W, VIEW_H);
    expect(labels.title.x).toBe(-half.x + SANCTUM.padding);
    expect(labels.progress.x).toBe(half.x - SANCTUM.padding);
    expect(labels.eta.y).toBeGreaterThan(labels.progress.y);  // eta 가 진행률 아래줄
    expect(labels.title.y).toBe(-half.y + SANCTUM.padding);
  });

  it('수확 준비 배너와 빛기둥은 제단 위 · 창 안에 놓인다', () => {
    const banner = computeReadyBanner(VIEW_W, VIEW_H);
    const pillar = computeLightPillar(VIEW_W, VIEW_H);
    const altar = computeAltar(VIEW_W, VIEW_H);
    expect(banner.x).toBe(0);
    expect(banner.y).toBeGreaterThan(-half.y);
    expect(pillar.x).toBe(altar.orbX);
    expect(pillar.y).toBe(-half.y);
    expect(pillar.h).toBeGreaterThan(0);           // 창 위쪽 끝에서 구슬까지
  });

  it('좌석 명상 원은 좌석 높이에서 파생돼 뒷줄이 자동으로 작아진다', () => {
    const seats = computeMeditationSeats(VIEW_W, VIEW_H);
    const front = computeSeatDisc(seats[0]);
    const back = computeSeatDisc(seats[2]);

    expect(front.ry).toBeLessThan(front.rx);          // 바닥에 누운 타원
    expect(back.rx).toBeLessThan(front.rx);           // 원근
    expect(front.rx).toBeLessThan(VIEW_W / 4);        // 옆 자리와 겹치지 않는다
    expect(computeSeatDisc(null)).toBeNull();
    expect(computeSeatDisc({ height: 0 })).toBeNull();
  });

  it('치비 표시 크기는 비율을 유지하고 잘못된 입력에는 null 을 준다', () => {
    expect(computeChibiFit(256, 256, 100)).toEqual({ w: 100, h: 100 });
    expect(computeChibiFit(512, 256, 100)).toEqual({ w: 200, h: 100 });
    expect(computeChibiFit(0, 256, 100)).toBeNull();
    expect(computeChibiFit(256, 256, NaN)).toBeNull();
  });
});

describe('연출 주기', () => {
  it('오라 간격은 집중력이 높을수록 짧아지고 항상 범위 안이다', () => {
    const zero = auraSpawnDelay(0);
    const low = auraSpawnDelay(50);
    const high = auraSpawnDelay(5000);
    const absurd = auraSpawnDelay(10_000_000);

    expect(zero).toBe(AURA.maxDelay);
    expect(low).toBeLessThan(zero);
    expect(high).toBeLessThan(low);
    expect(absurd).toBeGreaterThanOrEqual(AURA.minDelay);
    [zero, low, high, absurd].forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(AURA.minDelay);
      expect(d).toBeLessThanOrEqual(AURA.maxDelay);
    });
  });

  it('오라 간격은 잘못된 입력에도 최대 간격으로 떨어진다', () => {
    expect(auraSpawnDelay(NaN)).toBe(AURA.maxDelay);
    expect(auraSpawnDelay(-10)).toBe(AURA.maxDelay);
    expect(auraSpawnDelay(undefined)).toBe(AURA.maxDelay);
  });

  it('meditate <-> channel 교차는 마력이 찰수록 잦아진다', () => {
    expect(channelPulseDelay(0)).toBe(CHANNEL.idleDelay);
    expect(channelPulseDelay(1)).toBe(CHANNEL.fullDelay);
    expect(channelPulseDelay(0.5)).toBeLessThan(CHANNEL.idleDelay);
    expect(channelPulseDelay(0.5)).toBeGreaterThan(CHANNEL.fullDelay);
    expect(channelPulseDelay(9)).toBe(CHANNEL.fullDelay);   // 범위 밖은 잘린다
  });

  it('제단은 0% 에서도 꺼지지 않고 100% 에서 가장 밝다', () => {
    expect(altarGlowAlpha(0)).toBeGreaterThan(0.3);
    expect(altarGlowAlpha(0)).toBeLessThan(altarGlowAlpha(0.5));
    expect(altarGlowAlpha(1)).toBeCloseTo(1, 5);
    expect(altarGlowAlpha(NaN)).toBe(altarGlowAlpha(0));
  });

  it('룬 회전은 마력이 찰수록 빨라진다 (주기가 짧아진다)', () => {
    expect(runeSpinDuration(1)).toBeLessThan(runeSpinDuration(0));
    expect(runeSpinDuration(0)).toBeGreaterThan(0);
  });

  it('일회성 트윈 상한은 팀 규약(8개)을 지킨다', () => {
    expect(MAX_CONCURRENT_TWEENS).toBeLessThanOrEqual(8);
    expect(AURA.maxAlive).toBeLessThanOrEqual(MAX_CONCURRENT_TWEENS);
  });
});

describe('진행 상태 — 기존 로직과 같은 값', () => {
  it('마력 비율은 누적/필요 이고 0~1 로 잘린다', () => {
    expect(manaRatio(0, 1000)).toBe(0);
    expect(manaRatio(250, 1000)).toBe(0.25);
    expect(manaRatio(1500, 1000)).toBe(1);
    expect(manaRatio(-5, 1000)).toBe(0);
    expect(manaRatio(100, 0)).toBe(0);      // 대상이 없으면 0 (0 나눗셈 금지)
    expect(manaRatio(100, NaN)).toBe(0);
  });

  it('수확 판정은 비율 100% 에서만 참이다 (BOSS READY 와 같은 임계)', () => {
    expect(isHarvestReady(999, 1000)).toBe(false);
    expect(isHarvestReady(1000, 1000)).toBe(true);
    expect(isHarvestReady(1200, 1000)).toBe(true);
  });

  it('남은 시간은 실제 집중력에서만 나온다 (집중력 0 이면 계산 불가)', () => {
    expect(estimateHarvestSeconds(1000, 100)).toBe(10);
    expect(estimateHarvestSeconds(0, 100)).toBe(0);
    expect(estimateHarvestSeconds(1000, 0)).toBe(Infinity);
    expect(estimateHarvestSeconds(1000, NaN)).toBe(Infinity);
  });
});

describe('라벨 — 전투 어휘 없음 · 수치 병기', () => {
  it('게이지 라벨에 축적/필요 마력을 함께 적는다', () => {
    expect(formatManaLabel(1240, 5000)).toBe('1,240 / 5,000 마력');
    expect(formatManaLabel(9999, 5000)).toBe('5,000 / 5,000 마력'); // 넘쳐도 최대까지만
    expect(formatManaLabel(-1, 5000)).toBe('0 / 5,000 마력');
  });

  it('집중력 라벨은 초당 값이고, 없으면 숫자를 지어내지 않는다', () => {
    expect(formatFocusRate(128)).toBe(`${LABELS.focus} 128/초`);
    expect(formatFocusRate(12.34)).toBe(`${LABELS.focus} 12.3/초`);
    expect(formatFocusRate(0)).toBe(`${LABELS.focus} —`);
    expect(formatFocusRate(NaN)).toBe(`${LABELS.focus} —`);
  });

  it('수확 예정 시간을 한국어 한 마디로 적는다', () => {
    expect(formatHarvestEta(0)).toBe(LABELS.harvestReady);
    expect(formatHarvestEta(42)).toBe('다음 수확까지 42초');
    expect(formatHarvestEta(120)).toBe('다음 수확까지 2분');
    expect(formatHarvestEta(192)).toBe('다음 수확까지 3분 12초');
    expect(formatHarvestEta(7200)).toBe('다음 수확까지 1시간 이상');
    expect(formatHarvestEta(Infinity)).toBe('다음 수확까지 —');
  });

  it('헤더 제목은 성소 어휘를 쓰고 전투 어휘를 쓰지 않는다', () => {
    expect(formatSanctumTitle(2, 3)).toBe('챕터 2-3 성소');
    expect(formatSanctumTitle(2, 3, '고블린 왕')).toBe('챕터 2-3 성소 · 고블린 왕');
    expect(formatSanctumTitle(undefined, undefined)).toBe('챕터 1-1 성소');
  });

  it('명상 어휘 사전에 전투 용어가 남아 있지 않다', () => {
    const combat = ['보스', '전투', '데미지', '피해', 'HP', '격파', '공격'];
    Object.values(LABELS).forEach((label) => {
      combat.forEach((word) => expect(label).not.toContain(word));
    });
  });
});

describe('치비 시트 조회 — 없는 키를 요청하지 않는다', () => {
  const manifest = {
    chibi: {
      chibi_base_iris: {
        key: 'chibi_base_iris',
        path: 'assets/characters/chibi/base_iris_sheet.webp',
        cell: 256,
        frames: ['idle', 'meditate', 'channel', 'awaken'],
        footY: 240
      }
    }
  };

  it('시트 키는 접두사 + 영웅 id 다', () => {
    expect(chibiSheetKey('base_iris')).toBe('chibi_base_iris');
    expect(chibiSheetKey('')).toBeNull();
    expect(chibiSheetKey(null)).toBeNull();
  });

  it('프레임 이름을 인덱스로 바꾸고, 모르는 이름은 첫 프레임이 된다', () => {
    const frames = ['idle', 'meditate', 'channel', 'awaken'];
    expect(frameIndex(frames, 'idle')).toBe(0);
    expect(frameIndex(frames, 'meditate')).toBe(1);
    expect(frameIndex(frames, 'channel')).toBe(2);
    expect(frameIndex(frames, 'awaken')).toBe(3);
    expect(frameIndex(frames, 'dance')).toBe(0);
    expect(frameIndex(null, 'idle')).toBe(0);
  });

  it('등록된 영웅만 시트를 돌려준다 (없으면 null → 폴백)', () => {
    const found = resolveChibiSheet({ id: 'base_iris' }, manifest);
    expect(found).not.toBeNull();
    expect(found.key).toBe('chibi_base_iris');
    expect(found.cell).toBe(256);
    expect(found.footY).toBe(240);
    expect(found.inherited).toBe(false);

    expect(resolveChibiSheet({ id: 'base_unknown' }, manifest)).toBeNull();
    expect(resolveChibiSheet({ id: 'base_iris' }, {})).toBeNull();
    expect(resolveChibiSheet(null, manifest)).toBeNull();
  });

  it('전직 영웅은 자기 시트가 없으면 원본 영웅 시트를 물려받는다 (C-4 자동 전환)', () => {
    const asc = resolveChibiSheet({ id: 'asc_iris_olympus', baseHeroId: 'base_iris' }, manifest);
    expect(asc).not.toBeNull();
    expect(asc.key).toBe('chibi_base_iris');
    expect(asc.inherited).toBe(true);              // 물려받은 시트는 교단색 틴트 대상
  });

  it('전직 영웅 id 에서 원본 영웅 id 를 뽑는다 (참조 필드가 없을 때의 방어선)', () => {
    expect(baseHeroIdFromAscended('asc_iris_olympus')).toBe('base_iris');
    expect(baseHeroIdFromAscended('asc_sera_kunlun')).toBe('base_sera');
    expect(baseHeroIdFromAscended('base_iris')).toBeNull();
    expect(baseHeroIdFromAscended('asc_broken')).toBeNull();
    expect(baseHeroIdFromAscended(null)).toBeNull();
  });

  it('baseHeroId 가 없는 전직 영웅도 id 파싱으로 원본 시트를 찾는다', () => {
    const asc = resolveChibiSheet({ id: 'asc_iris_chaos', cult: 'chaos' }, manifest);
    expect(asc).not.toBeNull();
    expect(asc.key).toBe('chibi_base_iris');
    expect(asc.inherited).toBe(true);
  });

  it('실제 매니페스트에 기본영웅 10인 시트가 모두 등록돼 있다', async () => {
    const real = (await import('../../tools/art/asset-manifest.json')).default;
    const base = (await import('../../src/data/base-heroes.json')).default;
    const heroes = base.baseHeroes || [];
    expect(heroes.length).toBeGreaterThan(0);
    heroes.forEach((hero) => {
      expect(resolveChibiSheet({ id: hero.id }, real)).not.toBeNull();
    });
  });

  it('실제 asset-manifest 의 chibi 버킷 항목은 규격을 갖춘다', async () => {
    const real = (await import('../../tools/art/asset-manifest.json')).default;
    Object.entries(real.chibi || {}).forEach(([key, meta]) => {
      expect(key.startsWith('chibi_')).toBe(true);
      expect(meta.path).toMatch(/^assets\/characters\/chibi\/.+\.webp$/);
      expect(meta.cell).toBeGreaterThan(0);
      expect(meta.frames.length).toBeGreaterThanOrEqual(4);
      expect(meta.width).toBe(meta.cell * meta.frames.length);
      expect(meta.height).toBe(meta.cell);
      expect(meta.footY).toBeLessThanOrEqual(meta.cell);
      // 치비는 지연 로드 버킷이다 — eager 텍스처로 새어 들어가면 초기 전송량 예산이 깨진다
      expect(real.textures?.[key]).toBeUndefined();
    });
  });
});
