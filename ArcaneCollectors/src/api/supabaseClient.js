/**
 * Supabase Client Configuration
 *
 * Supabase 클라이언트 초기화 및 설정
 * 환경 변수가 없으면 로컬 스토리지 폴백 모드로 동작
 */

import { createClient } from '@supabase/supabase-js';

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Supabase 연결 가능 여부 확인
export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

// Supabase 클라이언트 생성 (설정이 있는 경우만)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    })
  : null;

/**
 * 로컬 스토리지 키 생성
 */
export const getStorageKey = (collection, userId = 'guest') => {
  return `arcane_collectors_${collection}_${userId}`;
};

/**
 * 로컬 스토리지에서 데이터 가져오기
 */
export const getLocalData = (collection, userId = 'guest') => {
  try {
    const key = getStorageKey(collection, userId);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Failed to get local data for ${collection}:`, error);
    return null;
  }
};

/**
 * 로컬 스토리지에 데이터 저장
 */
export const setLocalData = (collection, data, userId = 'guest') => {
  try {
    const key = getStorageKey(collection, userId);
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`Failed to set local data for ${collection}:`, error);
    return false;
  }
};

/**
 * 로컬 스토리지에서 데이터 삭제
 */
export const removeLocalData = (collection, userId = 'guest') => {
  try {
    const key = getStorageKey(collection, userId);
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove local data for ${collection}:`, error);
    return false;
  }
};

/**
 * 로컬 스토리지의 모든 게임 데이터 삭제
 */
export const clearAllLocalData = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('arcane_collectors_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return true;
  } catch (error) {
    console.error('Failed to clear all local data:', error);
    return false;
  }
};

/**
 * 온라인/오프라인 상태 확인
 */
export const isOnline = () => {
  return navigator.onLine && isSupabaseConfigured;
};

/**
 * 재시도 가능한 Supabase 쿼리 실행
 * @param {Function} queryFn - 쿼리 함수
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} delay - 재시도 간격 (ms)
 */
export const executeWithRetry = async (queryFn, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await queryFn();
      if (result.error) {
        // 재시도 가능한 에러인지 확인
        const retryableErrors = ['PGRST301', 'PGRST502', 'PGRST503'];
        if (retryableErrors.includes(result.error.code) && attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
          continue;
        }
        return result;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  }

  return { data: null, error: lastError || new Error('Max retries exceeded') };
};

/**
 * Supabase 에러 처리 헬퍼
 * @param {Object} error - Supabase 에러 객체
 * @returns {Object} 표준화된 에러 객체
 */
export const handleSupabaseError = (error) => {
  if (!error) return null;

  const errorMap = {
    'PGRST116': { code: 'NOT_FOUND', message: '데이터를 찾을 수 없습니다' },
    'PGRST301': { code: 'NETWORK_ERROR', message: '네트워크 오류가 발생했습니다' },
    'PGRST401': { code: 'UNAUTHORIZED', message: '인증이 필요합니다' },
    'PGRST403': { code: 'FORBIDDEN', message: '접근 권한이 없습니다' },
    '23505': { code: 'DUPLICATE', message: '이미 존재하는 데이터입니다' },
    '23503': { code: 'FOREIGN_KEY', message: '참조 무결성 오류입니다' }
  };

  const mapped = errorMap[error.code] || {
    code: error.code || 'UNKNOWN',
    message: error.message || '알 수 없는 오류가 발생했습니다'
  };

  return {
    ...mapped,
    originalError: error,
    hint: error.hint || null,
    details: error.details || null
  };
};

/**
 * 오프라인 큐 - 오프라인 상태에서 발생한 작업 저장
 */
const OFFLINE_QUEUE_KEY = 'arcane_collectors_offline_queue';

export const addToOfflineQueue = (operation) => {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    queue.push({
      ...operation,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (error) {
    console.error('Failed to add to offline queue:', error);
    return false;
  }
};

export const processOfflineQueue = async () => {
  if (!isOnline()) return { processed: 0, errors: [] };

  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return { processed: 0, errors: [] };

    const results = { processed: 0, errors: [] };
    const remainingQueue = [];

    for (const operation of queue) {
      try {
        // 작업 유형에 따라 처리
        const { table, action, data } = operation;
        let result;

        switch (action) {
          case 'insert':
            result = await supabase.from(table).insert(data);
            break;
          case 'update':
            result = await supabase.from(table).update(data.updates).eq('id', data.id);
            break;
          case 'upsert':
            result = await supabase.from(table).upsert(data);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        if (result.error) {
          results.errors.push({ operation, error: result.error });
          remainingQueue.push(operation);
        } else {
          results.processed++;
        }
      } catch (error) {
        results.errors.push({ operation, error });
        remainingQueue.push(operation);
      }
    }

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    return results;
  } catch (error) {
    console.error('Failed to process offline queue:', error);
    return { processed: 0, errors: [error] };
  }
};

/**
 * Supabase 연결 테스트
 */
export const testConnection = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return { connected: false, reason: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.from('users').select('count').limit(1);
    if (error) {
      return { connected: false, reason: error.message };
    }
    return { connected: true };
  } catch (error) {
    return { connected: false, reason: error.message };
  }
};

export default supabase;
