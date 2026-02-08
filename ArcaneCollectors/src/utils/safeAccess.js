/**
 * ArcaneCollectors - Safe Access Utilities
 * Null/undefined 방어를 위한 유틸리티 함수
 */

/**
 * 객체의 경로를 안전하게 접근
 * @param {Object} obj - 접근할 객체
 * @param {string} path - 접근 경로 (점 표기법, 예: 'user.profile.name')
 * @param {*} defaultValue - 기본값 (경로가 존재하지 않을 때 반환)
 * @returns {*} 값 또는 기본값
 *
 * @example
 * const user = { profile: { name: 'Alice' } };
 * safeGet(user, 'profile.name', 'Unknown'); // 'Alice'
 * safeGet(user, 'profile.age', 0); // 0
 */
export function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }

  return result ?? defaultValue;
}

/**
 * 함수를 안전하게 호출
 * @param {Function} fn - 호출할 함수
 * @param {...any} args - 함수 인자
 * @returns {*} 함수 반환값 또는 null (에러 발생 시)
 *
 * @example
 * const result = safeCall(riskyFunction, arg1, arg2);
 */
export function safeCall(fn, ...args) {
  if (typeof fn !== 'function') {
    return null;
  }

  try {
    return fn(...args);
  } catch (error) {
    console.error('[safeCall] 함수 호출 실패:', error);
    return null;
  }
}

/**
 * 배열 요소를 안전하게 접근
 * @param {Array} arr - 배열
 * @param {number} index - 인덱스
 * @param {*} defaultValue - 기본값
 * @returns {*} 배열 요소 또는 기본값
 */
export function safeArrayGet(arr, index, defaultValue = null) {
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
    return defaultValue;
  }
  return arr[index] ?? defaultValue;
}

/**
 * 객체의 속성이 존재하고 유효한지 확인
 * @param {Object} obj - 확인할 객체
 * @param {string} key - 속성 키
 * @returns {boolean} 존재 및 유효 여부
 */
export function hasValidProperty(obj, key) {
  return obj && typeof obj === 'object' && key in obj && obj[key] != null;
}
