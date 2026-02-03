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
