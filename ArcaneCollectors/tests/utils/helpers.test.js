/**
 * utils/helpers.js Unit Tests
 * QAT-T1-2: 유틸리티 함수 유닛 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  getRarityKey,
  getRarityNum,
  formatNumber,
  formatTime,
  formatDate,
  randomInt,
  randomFloat,
  weightedRandom,
  shuffleArray,
  clamp,
  lerp,
  hexToRgb,
  rgbToHex,
  colorLerp,
  deepClone,
  generateId,
  randomElement,
  removeElement,
  formatEnergy,
  formatBattleTimer,
  getMoodIcon,
  getCultIcon,
  generateStars,
  formatNumberShort,
  randomRange,
  shuffle,
} from '../../src/utils/helpers.js';

// ==================== getRarityKey ====================

describe('getRarityKey', () => {
  it('숫자 → 문자열 변환', () => {
    expect(getRarityKey(1)).toBe('N');
    expect(getRarityKey(2)).toBe('N');
    expect(getRarityKey(3)).toBe('R');
    expect(getRarityKey(4)).toBe('SR');
    expect(getRarityKey(5)).toBe('SSR');
  });

  it('문자열 → 그대로 반환', () => {
    expect(getRarityKey('N')).toBe('N');
    expect(getRarityKey('R')).toBe('R');
    expect(getRarityKey('SR')).toBe('SR');
    expect(getRarityKey('SSR')).toBe('SSR');
  });

  it('알 수 없는 숫자 → N', () => {
    expect(getRarityKey(0)).toBe('N');
    expect(getRarityKey(99)).toBe('N');
  });
});

// ==================== getRarityNum ====================

describe('getRarityNum', () => {
  it('문자열 → 숫자 변환', () => {
    expect(getRarityNum('N')).toBe(1);
    expect(getRarityNum('R')).toBe(3);
    expect(getRarityNum('SR')).toBe(4);
    expect(getRarityNum('SSR')).toBe(5);
  });

  it('숫자 → 그대로 반환', () => {
    expect(getRarityNum(1)).toBe(1);
    expect(getRarityNum(5)).toBe(5);
  });

  it('알 수 없는 문자열 → 1', () => {
    expect(getRarityNum('UNKNOWN')).toBe(1);
  });
});

// ==================== formatNumber ====================

describe('formatNumber', () => {
  it('1000 미만 → 그대로 문자열', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('1000 이상 → 쉼표 포맷', () => {
    const result = formatNumber(1000);
    // toLocaleString 결과는 환경에 따라 다를 수 있으나, 숫자와 구분자 포함
    expect(result).toContain('1');
    expect(result).toContain('000');
  });

  it('1M 이상 → M 접미사', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(2500000)).toBe('2.5M');
  });

  it('1B 이상 → B 접미사', () => {
    expect(formatNumber(1000000000)).toBe('1.0B');
    expect(formatNumber(3700000000)).toBe('3.7B');
  });
});

// ==================== formatTime ====================

describe('formatTime', () => {
  it('초 단위', () => {
    expect(formatTime(30)).toBe('30s');
    expect(formatTime(0)).toBe('0s');
  });

  it('분+초', () => {
    expect(formatTime(90)).toBe('1m 30s');
    expect(formatTime(600)).toBe('10m 0s');
  });

  it('시+분', () => {
    expect(formatTime(3600)).toBe('1h 0m');
    expect(formatTime(5400)).toBe('1h 30m');
  });

  it('음수 → 0s', () => {
    expect(formatTime(-10)).toBe('0s');
  });
});

// ==================== formatDate ====================

describe('formatDate', () => {
  it('타임스탬프 → 날짜 문자열', () => {
    // 2024-01-15 00:00:00 UTC
    const ts = new Date('2024-01-15T00:00:00Z').getTime();
    const result = formatDate(ts);
    // 로컬 시간대에 따라 날짜가 다를 수 있으므로 형식만 검증
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ==================== randomInt ====================

describe('randomInt', () => {
  it('범위 내 정수 반환', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInt(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('min === max → 해당 값', () => {
    expect(randomInt(5, 5)).toBe(5);
  });
});

// ==================== randomFloat ====================

describe('randomFloat', () => {
  it('범위 내 실수 반환', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomFloat(0, 1);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

// ==================== weightedRandom ====================

describe('weightedRandom', () => {
  it('아이템 중 하나 반환', () => {
    const items = ['a', 'b', 'c'];
    const weights = [1, 1, 1];
    const result = weightedRandom(items, weights);
    expect(items).toContain(result);
  });

  it('가중치가 0인 항목은 거의 선택되지 않음', () => {
    const items = ['a', 'b'];
    const weights = [100, 0];
    let countB = 0;
    for (let i = 0; i < 100; i++) {
      if (weightedRandom(items, weights) === 'b') countB++;
    }
    expect(countB).toBeLessThanOrEqual(5); // 약간의 부동소수점 오차 허용
  });

  it('배열 길이 불일치 → 에러', () => {
    expect(() => weightedRandom([1, 2], [1])).toThrow();
  });
});

// ==================== shuffleArray ====================

describe('shuffleArray', () => {
  it('원본 배열 변경하지 않음', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it('동일한 요소 포함', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('길이 유지', () => {
    const arr = [1, 2, 3];
    expect(shuffleArray(arr)).toHaveLength(3);
  });
});

// ==================== clamp ====================

describe('clamp', () => {
  it('범위 내 값 → 그대로', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('min 미만 → min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('max 초과 → max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('경계값', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

// ==================== lerp ====================

describe('lerp', () => {
  it('t=0 → start', () => {
    expect(lerp(0, 100, 0)).toBe(0);
  });

  it('t=1 → end', () => {
    expect(lerp(0, 100, 1)).toBe(100);
  });

  it('t=0.5 → 중간값', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('t < 0 → clamp to start', () => {
    expect(lerp(0, 100, -1)).toBe(0);
  });

  it('t > 1 → clamp to end', () => {
    expect(lerp(0, 100, 2)).toBe(100);
  });
});

// ==================== hexToRgb ====================

describe('hexToRgb', () => {
  it('#FF0000 → red', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('#없이도 동작', () => {
    expect(hexToRgb('00FF00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('#FFFFFF → white', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('#000000 → black', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

// ==================== rgbToHex ====================

describe('rgbToHex', () => {
  it('red → #ff0000', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
  });

  it('white → #ffffff', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  it('black → #000000', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('값 범위 클램핑', () => {
    expect(rgbToHex(300, -10, 128)).toBe('#ff0080');
  });
});

// ==================== colorLerp ====================

describe('colorLerp', () => {
  it('t=0 → 첫 번째 색상', () => {
    expect(colorLerp('#000000', '#FFFFFF', 0)).toBe('#000000');
  });

  it('t=1 → 두 번째 색상', () => {
    expect(colorLerp('#000000', '#FFFFFF', 1)).toBe('#ffffff');
  });
});

// ==================== deepClone ====================

describe('deepClone', () => {
  it('원시 타입 복사', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBeNull();
  });

  it('객체 깊은 복사', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it('배열 깊은 복사', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[1]).not.toBe(arr[1]);
  });

  it('Date 복사', () => {
    const date = new Date('2024-01-15');
    const cloned = deepClone(date);
    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
  });
});

// ==================== generateId ====================

describe('generateId', () => {
  it('문자열 반환', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('고유한 값 생성', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('하이픈 포함', () => {
    expect(generateId()).toContain('-');
  });
});

// ==================== randomElement ====================

describe('randomElement', () => {
  it('배열에서 요소 반환', () => {
    const arr = [1, 2, 3];
    const result = randomElement(arr);
    expect(arr).toContain(result);
  });

  it('빈 배열 → null', () => {
    expect(randomElement([])).toBeNull();
  });

  it('null → null', () => {
    expect(randomElement(null)).toBeNull();
  });
});

// ==================== removeElement ====================

describe('removeElement', () => {
  it('요소 제거 성공', () => {
    const arr = [1, 2, 3];
    expect(removeElement(arr, 2)).toBe(true);
    expect(arr).toEqual([1, 3]);
  });

  it('존재하지 않는 요소 → false', () => {
    const arr = [1, 2, 3];
    expect(removeElement(arr, 5)).toBe(false);
    expect(arr).toEqual([1, 2, 3]);
  });
});

// ==================== formatEnergy ====================

describe('formatEnergy', () => {
  it('에너지 포맷', () => {
    expect(formatEnergy(50, 100)).toContain('50');
    expect(formatEnergy(50, 100)).toContain('100');
  });
});

// ==================== formatBattleTimer ====================

describe('formatBattleTimer', () => {
  it('밀리초 → mm:ss 변환', () => {
    expect(formatBattleTimer(0)).toBe('0:00');
    expect(formatBattleTimer(1000)).toBe('0:01');
    expect(formatBattleTimer(60000)).toBe('1:00');
    expect(formatBattleTimer(90000)).toBe('1:30');
    expect(formatBattleTimer(65000)).toBe('1:05');
  });
});

// ==================== getMoodIcon ====================

describe('getMoodIcon', () => {
  const ALL_MOODS = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];

  it('9종 분위기 모두 아이콘 반환', () => {
    ALL_MOODS.forEach((mood) => {
      const icon = getMoodIcon(mood);
      expect(icon).toBeDefined();
      expect(icon).not.toBe('');
    });
  });

  it('알 수 없는 분위기 → 기본 아이콘', () => {
    expect(getMoodIcon('unknown')).toBeDefined();
  });
});

// ==================== getCultIcon ====================

describe('getCultIcon', () => {
  it('교단 아이콘 반환', () => {
    ['valhalla', 'takamagahara', 'olympus', 'asgard', 'yomi'].forEach((cult) => {
      const icon = getCultIcon(cult);
      expect(icon).toBeDefined();
      expect(icon).not.toBe('');
    });
  });

  it('알 수 없는 교단 → 기본 아이콘', () => {
    expect(getCultIcon('unknown')).toBeDefined();
  });
});

// ==================== generateStars ====================

describe('generateStars', () => {
  it('별 생성', () => {
    const stars = generateStars(3, 5);
    expect(stars).toContain('⭐');
    expect(stars).toContain('☆');
  });

  it('최대 별 모두 채움', () => {
    const stars = generateStars(3, 3);
    expect(stars).not.toContain('☆');
  });

  it('0개 별', () => {
    const stars = generateStars(0, 3);
    expect(stars).not.toContain('⭐');
  });
});

// ==================== formatNumberShort ====================

describe('formatNumberShort', () => {
  it('1000 미만 → 그대로', () => {
    expect(formatNumberShort(999)).toBe('999');
  });

  it('1K', () => {
    expect(formatNumberShort(1000)).toBe('1.0K');
    expect(formatNumberShort(2500)).toBe('2.5K');
  });

  it('1M', () => {
    expect(formatNumberShort(1000000)).toBe('1.0M');
  });
});

// ==================== shuffle ====================

describe('shuffle', () => {
  it('원본 배열 변경하지 않음', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });

  it('동일한 요소 포함', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });
});
