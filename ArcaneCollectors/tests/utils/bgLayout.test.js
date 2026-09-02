/**
 * bgLayout.test.js — T-09
 * 배경 cover-fit 과 폴백 라우팅(REDESIGN_PLAN §2-7). Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBgKeys,
  coverFit,
  resolveDimAlpha,
  resolveFallbackMethod,
  getDimColor,
  DIM_ALPHA,
  BG_PREFIX
} from '../../src/utils/bgLayout.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../src/config/scaleConfig.js';
import { DESIGN } from '../../src/config/designSystem.js';

describe('resolveBgKeys', () => {
  it('씬 키에 bg_ 접두사와 블러 페어 키를 만든다', () => {
    expect(resolveBgKeys('main')).toEqual({ textureKey: 'bg_main', blurKey: 'bg_main_blur' });
  });

  it('이미 접두사가 붙어 있으면 그대로 쓴다', () => {
    expect(resolveBgKeys('bg_gacha').textureKey).toBe('bg_gacha');
  });

  it('빈 값은 null 이다', () => {
    expect(resolveBgKeys('')).toBeNull();
    expect(resolveBgKeys(undefined)).toBeNull();
  });

  it('접두사 상수와 실제 키가 어긋나지 않는다', () => {
    expect(resolveBgKeys('tower').textureKey.startsWith(BG_PREFIX)).toBe(true);
  });
});

describe('coverFit — 832x1216 원본을 1080x1920 에 맞추기', () => {
  it('업스케일본 1082x1581 은 세로 기준으로 채운다', () => {
    const fit = coverFit(1082, 1581);
    expect(fit.scale).toBeCloseTo(GAME_HEIGHT / 1581, 5);
    expect(fit.displayHeight).toBeCloseTo(GAME_HEIGHT, 5);
    expect(fit.displayWidth).toBeGreaterThan(GAME_WIDTH);
  });

  it('가로가 약 24% 잘려나간다 — 생성 프롬프트가 중앙 60% 를 요구하는 이유', () => {
    const fit = coverFit(1082, 1581);
    expect(fit.overflowX).toBeGreaterThan(0.15);
    expect(fit.overflowX).toBeLessThan(0.30);
    expect(fit.overflowY).toBe(0);
  });

  it('화면보다 가로로 긴 원본은 가로가 넘치고 세로는 딱 맞는다', () => {
    const fit = coverFit(1920, 1080, 1080, 1920);
    expect(fit.displayHeight).toBeCloseTo(1920, 5);
    expect(fit.overflowX).toBeGreaterThan(0);
  });

  it('크기가 0이면 대상 크기를 그대로 돌려준다', () => {
    expect(coverFit(0, 0)).toMatchObject({ scale: 1, displayWidth: GAME_WIDTH, displayHeight: GAME_HEIGHT });
  });
});

describe('딤 규칙', () => {
  it('기본 딤은 0.35 다', () => {
    expect(resolveDimAlpha('main')).toBe(DIM_ALPHA.DEFAULT);
    expect(resolveDimAlpha('bg_gacha')).toBe(0.35);
  });

  it('전투만 0.20 으로 낮춰 배경을 더 보여준다', () => {
    expect(resolveDimAlpha('battle')).toBe(0.20);
    expect(resolveDimAlpha('bg_battle')).toBe(0.20);
  });

  it('딤 색은 bg.primary 다', () => {
    expect(getDimColor()).toBe(DESIGN.colors.bg.primary);
  });
});

describe('resolveFallbackMethod — 텍스처가 없을 때', () => {
  it('알려진 씬은 기존 프로시저럴 배경으로 간다', () => {
    expect(resolveFallbackMethod('main')).toBe('createMainBg');
    expect(resolveFallbackMethod('bg_battle')).toBe('createBattleBg');
    expect(resolveFallbackMethod('stageselect')).toBe('createStageSelectBg');
    expect(resolveFallbackMethod('tower')).toBe('createTowerBg');
  });

  it('chapter_N 처럼 접두사가 붙은 키는 접두사로 매칭한다 (T-17: 전투 배경)', () => {
    expect(resolveFallbackMethod('bg_chapter_1')).toBe('createBattleBg');
    expect(resolveFallbackMethod('bg_chapter_5')).toBe('createBattleBg');
    expect(resolveFallbackMethod('bg_raid')).toBe('createBattleBg');
  });

  it('알 수 없는 키와 빈 값은 그래디언트다', () => {
    expect(resolveFallbackMethod('unknown_scene')).toBe('createGradientBg');
    expect(resolveFallbackMethod('')).toBe('createGradientBg');
  });
});
