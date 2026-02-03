/**
 * GachaService - 가챠 서비스
 *
 * 가챠 기록, 천장 시스템 관리
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId } from './AuthService';

const PITY_COLLECTION = 'gacha_pity';
const HISTORY_COLLECTION = 'gacha_history';

// 천장 설정
const PITY_CONFIG = {
  soft_pity_start: 74, // 소프트 천장 시작
  hard_pity: 90, // 하드 천장 (확정)
  rate_up_guarantee: true, // 50/50 실패 후 픽업 확정
  base_5star_rate: 0.006, // 기본 5성 확률 0.6%
  soft_pity_rate_increase: 0.06 // 소프트 천장 확률 증가 6%
};

/**
 * 기본 천장 데이터
 */
const getDefaultPityData = (userId, bannerId) => ({
  id: `local_pity_${Date.now()}`,
  user_id: userId,
  banner_id: bannerId,
  pity_count: 0,
  guaranteed_5star: false,
  last_5star_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

/**
 * 배너별 천장 카운트 조회
 * @param {string} bannerId - 배너 ID
 * @returns {Promise<Object>} 천장 데이터
 */
export const getPityCount = async (bannerId) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    // 로컬 스토리지에서 조회
    const allPity = getLocalData(PITY_COLLECTION, userId) || {};
    return allPity[bannerId] || getDefaultPityData(userId, bannerId);
  }

  try {
    const { data, error } = await supabase
      .from('gacha_pity')
      .select('*')
      .eq('user_id', userId)
      .eq('banner_id', bannerId)
      .single();

    if (error && error.code === 'PGRST116') {
      // 데이터가 없으면 기본값 반환
      return getDefaultPityData(userId, bannerId);
    }

    if (error) {
      console.error('Failed to get pity count:', error);
      const allPity = getLocalData(PITY_COLLECTION, userId) || {};
      return allPity[bannerId] || getDefaultPityData(userId, bannerId);
    }

    // 로컬에도 동기화
    const allPity = getLocalData(PITY_COLLECTION, userId) || {};
    allPity[bannerId] = data;
    setLocalData(PITY_COLLECTION, allPity, userId);

    return data;
  } catch (error) {
    console.error('GachaService.getPityCount error:', error);
    const allPity = getLocalData(PITY_COLLECTION, userId) || {};
    return allPity[bannerId] || getDefaultPityData(userId, bannerId);
  }
};

/**
 * 천장 카운트 업데이트
 * @param {string} bannerId - 배너 ID
 * @param {Object} updates - 업데이트할 데이터
 * @returns {Promise<Object>} 업데이트된 천장 데이터
 */
export const updatePityCount = async (bannerId, updates) => {
  const userId = await getUserId();
  const currentPity = await getPityCount(bannerId);

  const updatedPity = {
    ...currentPity,
    ...updates,
    updated_at: new Date().toISOString()
  };

  // 로컬 저장
  const allPity = getLocalData(PITY_COLLECTION, userId) || {};
  allPity[bannerId] = updatedPity;
  setLocalData(PITY_COLLECTION, allPity, userId);

  if (!isSupabaseConfigured || !supabase) {
    return updatedPity;
  }

  try {
    const { data, error } = await supabase
      .from('gacha_pity')
      .upsert({
        user_id: userId,
        banner_id: bannerId,
        ...updates,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to update pity count:', error);
      return updatedPity;
    }

    allPity[bannerId] = data;
    setLocalData(PITY_COLLECTION, allPity, userId);

    return data;
  } catch (error) {
    console.error('GachaService.updatePityCount error:', error);
    return updatedPity;
  }
};

/**
 * 천장 리셋 (5성 획득 시)
 * @param {string} bannerId - 배너 ID
 * @param {boolean} isRateUp - 픽업 캐릭터 획득 여부
 * @returns {Promise<Object>} 리셋된 천장 데이터
 */
export const resetPity = async (bannerId, isRateUp = true) => {
  return updatePityCount(bannerId, {
    pity_count: 0,
    guaranteed_5star: !isRateUp, // 픽업 실패 시 다음 5성은 픽업 확정
    last_5star_at: new Date().toISOString()
  });
};

/**
 * 천장 증가 (5성 미획득 시)
 * @param {string} bannerId - 배너 ID
 * @param {number} pullCount - 뽑기 횟수
 * @returns {Promise<Object>} 업데이트된 천장 데이터
 */
export const incrementPity = async (bannerId, pullCount = 1) => {
  const currentPity = await getPityCount(bannerId);
  return updatePityCount(bannerId, {
    pity_count: currentPity.pity_count + pullCount
  });
};

/**
 * 현재 5성 확률 계산 (소프트 천장 반영)
 * @param {number} pityCount - 현재 천장 카운트
 * @returns {number} 5성 확률 (0~1)
 */
export const calculate5StarRate = (pityCount) => {
  if (pityCount >= PITY_CONFIG.hard_pity) {
    return 1.0; // 하드 천장: 100%
  }

  if (pityCount >= PITY_CONFIG.soft_pity_start) {
    // 소프트 천장: 점진적 확률 증가
    const extraPulls = pityCount - PITY_CONFIG.soft_pity_start + 1;
    return Math.min(
      PITY_CONFIG.base_5star_rate + (extraPulls * PITY_CONFIG.soft_pity_rate_increase),
      1.0
    );
  }

  return PITY_CONFIG.base_5star_rate;
};

/**
 * 가챠 기록 저장
 * @param {Object} pullData - 뽑기 데이터
 * @returns {Promise<Object>} 저장된 기록
 */
export const recordPull = async (pullData) => {
  const userId = await getUserId();
  const { bannerId, pullType, results, gemsSpent } = pullData;

  // 현재 천장 정보
  const pityBefore = await getPityCount(bannerId);

  // 5성 획득 여부 확인
  const got5Star = results.some(r => r.rarity === 5);
  const isRateUp = results.some(r => r.rarity === 5 && r.is_rate_up);

  // 천장 업데이트
  let pityAfter;
  if (got5Star) {
    pityAfter = await resetPity(bannerId, isRateUp);
  } else {
    pityAfter = await incrementPity(bannerId, results.length);
  }

  const historyRecord = {
    id: `local_history_${Date.now()}`,
    user_id: userId,
    banner_id: bannerId,
    pull_type: pullType,
    results: results,
    pity_count_before: pityBefore.pity_count,
    pity_count_after: pityAfter.pity_count,
    gems_spent: gemsSpent,
    created_at: new Date().toISOString()
  };

  // 로컬에 기록 저장
  const history = getLocalData(HISTORY_COLLECTION, userId) || [];
  history.unshift(historyRecord);
  // 최근 1000개만 유지
  if (history.length > 1000) {
    history.splice(1000);
  }
  setLocalData(HISTORY_COLLECTION, history, userId);

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: true,
      record: historyRecord,
      pityData: pityAfter
    };
  }

  try {
    const { data, error } = await supabase
      .from('gacha_history')
      .insert({
        user_id: userId,
        banner_id: bannerId,
        pull_type: pullType,
        results: results,
        pity_count_before: pityBefore.pity_count,
        pity_count_after: pityAfter.pity_count,
        gems_spent: gemsSpent
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to record pull:', error);
      return {
        success: true,
        record: historyRecord,
        pityData: pityAfter,
        syncError: error.message
      };
    }

    return {
      success: true,
      record: data,
      pityData: pityAfter
    };
  } catch (error) {
    console.error('GachaService.recordPull error:', error);
    return {
      success: true,
      record: historyRecord,
      pityData: pityAfter,
      syncError: error.message
    };
  }
};

/**
 * 가챠 기록 조회
 * @param {string} bannerId - 배너 ID (optional)
 * @param {number} limit - 조회 개수
 * @returns {Promise<Array>} 가챠 기록 목록
 */
export const getGachaHistory = async (bannerId = null, limit = 100) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    let history = getLocalData(HISTORY_COLLECTION, userId) || [];
    if (bannerId) {
      history = history.filter(h => h.banner_id === bannerId);
    }
    return history.slice(0, limit);
  }

  try {
    let query = supabase
      .from('gacha_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (bannerId) {
      query = query.eq('banner_id', bannerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to get gacha history:', error);
      let history = getLocalData(HISTORY_COLLECTION, userId) || [];
      if (bannerId) {
        history = history.filter(h => h.banner_id === bannerId);
      }
      return history.slice(0, limit);
    }

    return data;
  } catch (error) {
    console.error('GachaService.getGachaHistory error:', error);
    let history = getLocalData(HISTORY_COLLECTION, userId) || [];
    if (bannerId) {
      history = history.filter(h => h.banner_id === bannerId);
    }
    return history.slice(0, limit);
  }
};

/**
 * 천장까지 남은 횟수 계산
 * @param {string} bannerId - 배너 ID
 * @returns {Promise<Object>} 천장 정보
 */
export const getPityInfo = async (bannerId) => {
  const pityData = await getPityCount(bannerId);
  const currentRate = calculate5StarRate(pityData.pity_count);

  return {
    currentPity: pityData.pity_count,
    toSoftPity: Math.max(0, PITY_CONFIG.soft_pity_start - pityData.pity_count),
    toHardPity: Math.max(0, PITY_CONFIG.hard_pity - pityData.pity_count),
    current5StarRate: currentRate,
    guaranteed5Star: pityData.guaranteed_5star,
    last5StarAt: pityData.last_5star_at,
    config: PITY_CONFIG
  };
};

/**
 * 모든 배너의 천장 정보 조회
 * @returns {Promise<Object>} 배너별 천장 정보
 */
export const getAllPityInfo = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    const allPity = getLocalData(PITY_COLLECTION, userId) || {};
    const result = {};

    for (const [bannerId, pityData] of Object.entries(allPity)) {
      result[bannerId] = {
        currentPity: pityData.pity_count,
        toSoftPity: Math.max(0, PITY_CONFIG.soft_pity_start - pityData.pity_count),
        toHardPity: Math.max(0, PITY_CONFIG.hard_pity - pityData.pity_count),
        current5StarRate: calculate5StarRate(pityData.pity_count),
        guaranteed5Star: pityData.guaranteed_5star
      };
    }

    return result;
  }

  try {
    const { data, error } = await supabase
      .from('gacha_pity')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to get all pity info:', error);
      return {};
    }

    const result = {};
    for (const pityData of data) {
      result[pityData.banner_id] = {
        currentPity: pityData.pity_count,
        toSoftPity: Math.max(0, PITY_CONFIG.soft_pity_start - pityData.pity_count),
        toHardPity: Math.max(0, PITY_CONFIG.hard_pity - pityData.pity_count),
        current5StarRate: calculate5StarRate(pityData.pity_count),
        guaranteed5Star: pityData.guaranteed_5star
      };
    }

    return result;
  } catch (error) {
    console.error('GachaService.getAllPityInfo error:', error);
    return {};
  }
};

/**
 * 가챠 통계 조회
 * @param {string} bannerId - 배너 ID (optional)
 * @returns {Promise<Object>} 통계 데이터
 */
export const getGachaStats = async (bannerId = null) => {
  const history = await getGachaHistory(bannerId, 1000);

  if (history.length === 0) {
    return {
      totalPulls: 0,
      total5Star: 0,
      total4Star: 0,
      total3Star: 0,
      averagePityFor5Star: 0,
      totalGemsSpent: 0
    };
  }

  let totalPulls = 0;
  let total5Star = 0;
  let total4Star = 0;
  let total3Star = 0;
  let totalGemsSpent = 0;
  let pitySum5Star = 0;

  for (const record of history) {
    totalPulls += record.results.length;
    totalGemsSpent += record.gems_spent;

    for (const result of record.results) {
      if (result.rarity === 5) {
        total5Star++;
        pitySum5Star += record.pity_count_before + 1;
      } else if (result.rarity === 4) {
        total4Star++;
      } else {
        total3Star++;
      }
    }
  }

  return {
    totalPulls,
    total5Star,
    total4Star,
    total3Star,
    averagePityFor5Star: total5Star > 0 ? Math.round(pitySum5Star / total5Star) : 0,
    totalGemsSpent,
    rate5Star: totalPulls > 0 ? (total5Star / totalPulls * 100).toFixed(2) + '%' : '0%',
    rate4Star: totalPulls > 0 ? (total4Star / totalPulls * 100).toFixed(2) + '%' : '0%'
  };
};

// 서비스 객체로 내보내기
const GachaService = {
  getPityCount,
  updatePityCount,
  resetPity,
  incrementPity,
  calculate5StarRate,
  recordPull,
  getGachaHistory,
  getPityInfo,
  getAllPityInfo,
  getGachaStats,
  PITY_CONFIG
};

export default GachaService;
