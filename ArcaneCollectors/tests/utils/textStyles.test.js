/**
 * textStyles.test.js — T-08
 * 타이포 토큰 해석(REDESIGN_PLAN §2-6). 세 서체의 역할 분리를 검증한다.
 *
 * 주의: src/utils 에 textStyles.js(레거시, 미참조)와 textStyles.ts 가 함께 있다.
 * 실사용본은 .ts 이므로 확장자를 명시해 가져온다.
 */
import { describe, it, expect } from 'vitest';
import {
  ts,
  resolveTypoToken,
  familyForRole,
  TYPO_TOKENS,
  TYPO_ROLE
} from '../../src/utils/textStyles.ts';
import { DESIGN, getTypoToken } from '../../src/config/designSystem.js';
import { sf } from '../../src/config/scaleConfig.js';

describe('타이포 스케일 토큰', () => {
  it('문서의 10개 토큰이 모두 존재한다', () => {
    expect(TYPO_TOKENS).toHaveLength(10);
    TYPO_TOKENS.forEach((token) => {
      expect(getTypoToken(token)).not.toBeNull();
    });
  });

  it('base 크기가 문서 표와 일치한다', () => {
    const expected = {
      'display.xl': 40, 'display.lg': 28,
      title: 24, subtitle: 20, body: 16, label: 14, caption: 12,
      'num.lg': 24, 'num.md': 16, 'num.sm': 12
    };
    Object.entries(expected).forEach(([token, base]) => {
      expect(resolveTypoToken(token).base).toBe(base);
    });
  });

  it('렌더 크기는 base 에 스케일을 적용한 값이다', () => {
    expect(resolveTypoToken('display.xl').fontSize).toBe(sf(40));
    expect(resolveTypoToken('body').fontSize).toBe('24px');
  });
});

describe('서체 역할 분리', () => {
  it('display 토큰은 Orbitron 을 쓴다', () => {
    ['display.xl', 'display.lg'].forEach((token) => {
      const resolved = resolveTypoToken(token);
      expect(resolved.role).toBe(TYPO_ROLE.DISPLAY);
      expect(resolved.family).toContain('Orbitron');
    });
  });

  it('수치 토큰은 Roboto Mono 를 쓴다', () => {
    ['num.lg', 'num.md', 'num.sm'].forEach((token) => {
      const resolved = resolveTypoToken(token);
      expect(resolved.role).toBe(TYPO_ROLE.MONO);
      expect(resolved.family).toContain('Roboto Mono');
    });
  });

  it('한글 본문 토큰은 Noto Sans KR 을 쓴다', () => {
    ['title', 'subtitle', 'body', 'label', 'caption'].forEach((token) => {
      const resolved = resolveTypoToken(token);
      expect(resolved.role).toBe(TYPO_ROLE.BODY);
      expect(resolved.family).toContain('Noto Sans KR');
    });
  });

  it('알 수 없는 역할은 본문 서체로 떨어진다', () => {
    expect(familyForRole('nope')).toBe(DESIGN.font.family.primary);
  });
});

describe('ts() — Phaser 텍스트 스타일 생성', () => {
  it('서체·크기·굵기·색을 한 번에 채운다', () => {
    const style = ts('display.lg');
    expect(style).toEqual({
      fontFamily: DESIGN.font.family.display,
      fontSize: sf(28),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });
  });

  it('굵기 400은 normal, 500은 500, 700은 bold 로 매핑된다', () => {
    expect(ts('body').fontStyle).toBe('normal');
    expect(ts('num.md').fontStyle).toBe('500');
    expect(ts('title').fontStyle).toBe('bold');
  });

  it('덮어쓰기가 기본값을 이긴다', () => {
    const style = ts('num.lg', { color: '#FFD60A', align: 'right' });
    expect(style.color).toBe('#FFD60A');
    expect(style.align).toBe('right');
    expect(style.fontFamily).toContain('Roboto Mono');
  });

  it('알 수 없는 토큰은 body 로 폴백해 예외를 내지 않는다', () => {
    expect(ts('does.not.exist')).toEqual(ts('body'));
  });
});
