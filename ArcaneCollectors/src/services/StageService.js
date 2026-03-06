/**
 * StageService - 스테이지 서비스
 *
 * 스테이지 진행도 조회/저장, 소탕 가능 여부 확인, 소탕 실행
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId } from './AuthService';
import { useEnergy, useSweepTickets } from './PlayerService';

const COLLECTION = 'stage_progress';

// 스테이지별 에너지 소모량
const ENERGY_COST_PER_STAGE = {
  normal: 6,
  hard: 12,
  hell: 20
};

/**
 * 모든 스테이지 진행도 조회
 */
export const getAllStageProgress = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    return getLocalData(COLLECTION, userId) || [];
  }

  try {
    const { data, error } = await supabase
      .from('stage_progress')
      .select('*')
      .eq('user_id', userId)
      .order('stage_id', { ascending: true });

    if (error) {
      console.error('Failed to get stage progress:', error);
      return getLocalData(COLLECTION, userId) || [];
    }

    // 로컬 동기화
    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('StageService.getAllStageProgress error:', error);
    return getLocalData(COLLECTION, userId) || [];
  }
};

/**
 * 특정 스테이지 진행도 조회
 */
export const getStageProgress = async (stageId) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    const allProgress = getLocalData(COLLECTION, userId) || [];
    return allProgress.find(p => p.stage_id === stageId) || null;
  }

  try {
    const { data, error } = await supabase
      .from('stage_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('stage_id', stageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Failed to get stage progress:', error);
      const allProgress = getLocalData(COLLECTION, userId) || [];
      return allProgress.find(p => p.stage_id === stageId) || null;
    }

    return data;
  } catch (error) {
    console.error('StageService.getStageProgress error:', error);
    return null;
  }
};

/**
 * 스테이지 클리어 여부 확인
 */
export const isStageCleared = async (stageId) => {
  const progress = await getStageProgress(stageId);
  return progress !== null && progress.stars > 0;
};

/**
 * 소탕 가능 여부 확인 (3성 클리어 필요)
 */
export const canSweep = async (stageId) => {
  const progress = await getStageProgress(stageId);
  return progress !== null && progress.stars === 3;
};

/**
 * 스테이지 진행도 생성/업데이트
 */
export const updateStageProgress = async (stageId, updates) => {
  const userId = await getUserId();
  const existing = await getStageProgress(stageId);

  const progressData = {
    user_id: userId,
    stage_id: stageId,
    stars: updates.stars ?? existing?.stars ?? 0,
    clear_count: updates.clear_count ?? existing?.clear_count ?? 0,
    best_time: updates.best_time ?? existing?.best_time ?? null,
    first_clear_at: existing?.first_clear_at ?? (updates.stars > 0 ? new Date().toISOString() : null),
    last_clear_at: updates.stars > 0 ? new Date().toISOString() : existing?.last_clear_at,
    updated_at: new Date().toISOString()
  };

  // 로컬 업데이트
  const allProgress = getLocalData(COLLECTION, userId) || [];
  const existingIndex = allProgress.findIndex(p => p.stage_id === stageId);

  if (existingIndex >= 0) {
    allProgress[existingIndex] = { ...allProgress[existingIndex], ...progressData };
  } else {
    allProgress.push({
      id: `local_${Date.now()}`,
      ...progressData,
      created_at: new Date().toISOString()
    });
  }
  setLocalData(COLLECTION, allProgress, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, progress: progressData };
  }

  try {
    const { data, error } = await supabase
      .from('stage_progress')
      .upsert(progressData, {
        onConflict: 'user_id,stage_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to update stage progress:', error);
      return { success: true, progress: progressData };
    }

    // 로컬 동기화
    const idx = allProgress.findIndex(p => p.stage_id === stageId);
    if (idx >= 0) {
      allProgress[idx] = data;
    }
    setLocalData(COLLECTION, allProgress, userId);

    return { success: true, progress: data };
  } catch (error) {
    console.error('StageService.updateStageProgress error:', error);
    return { success: true, progress: progressData };
  }
};

/**
 * 스테이지 클리어 기록
 */
export const recordStageClear = async (stageId, stars, clearTime = null) => {
  const existing = await getStageProgress(stageId);

  // 최고 성적만 업데이트
  const newStars = Math.max(stars, existing?.stars || 0);
  const newBestTime = clearTime
    ? (existing?.best_time ? Math.min(clearTime, existing.best_time) : clearTime)
    : existing?.best_time;

  return await updateStageProgress(stageId, {
    stars: newStars,
    clear_count: (existing?.clear_count || 0) + 1,
    best_time: newBestTime
  });
};

/**
 * 스테이지 난이도별 에너지 비용 조회
 */
export const getEnergyCost = (stageId) => {
  // stageId 형식: "1-1-normal", "2-5-hard" 등
  const parts = stageId.split('-');
  const difficulty = parts[2] || 'normal';
  return ENERGY_COST_PER_STAGE[difficulty] || ENERGY_COST_PER_STAGE.normal;
};

/**
 * 스테이지 입장 (에너지 소모)
 */
export const enterStage = async (stageId) => {
  const energyCost = getEnergyCost(stageId);
  const result = await useEnergy(energyCost);

  if (!result.success) {
    return {
      success: false,
      error: 'Not enough energy',
      required: energyCost,
      current: result.currentEnergy
    };
  }

  return {
    success: true,
    energyUsed: energyCost,
    playerData: result.playerData
  };
};

/**
 * 소탕 실행 (3성 클리어 스테이지만)
 */
export const sweepStage = async (stageId, count = 1) => {
  // 소탕 가능 여부 확인
  const sweepable = await canSweep(stageId);
  if (!sweepable) {
    return {
      success: false,
      error: 'Stage not eligible for sweep (need 3 stars)'
    };
  }

  // 소탕권 확인 및 소모
  const ticketResult = await useSweepTickets(count);
  if (!ticketResult.success) {
    return {
      success: false,
      error: 'Not enough sweep tickets',
      required: count,
      current: ticketResult.currentTickets
    };
  }

  // 에너지 확인 및 소모
  const energyCost = getEnergyCost(stageId) * count;
  const energyResult = await useEnergy(energyCost);
  if (!energyResult.success) {
    // 소탕권 복구 (롤백)
    // 실제로는 트랜잭션으로 처리해야 함
    return {
      success: false,
      error: 'Not enough energy',
      required: energyCost,
      current: energyResult.currentEnergy
    };
  }

  // 클리어 카운트 증가
  const existing = await getStageProgress(stageId);
  await updateStageProgress(stageId, {
    clear_count: (existing?.clear_count || 0) + count
  });

  // 보상 계산 (실제로는 스테이지 데이터에서 가져옴)
  const rewards = calculateSweepRewards(stageId, count);

  return {
    success: true,
    sweepCount: count,
    energyUsed: energyCost,
    ticketsUsed: count,
    rewards,
    playerData: energyResult.playerData
  };
};

/**
 * 소탕 보상 계산
 */
export const calculateSweepRewards = (stageId, count) => {
  // 스테이지별 기본 보상 (실제로는 게임 데이터에서 가져옴)
  const baseRewards = {
    gold: 100,
    exp: 50,
    items: [] // 아이템 드롭은 별도 시스템
  };

  return {
    gold: baseRewards.gold * count,
    exp: baseRewards.exp * count,
    items: baseRewards.items
  };
};

/**
 * 챕터별 진행도 요약
 */
export const getChapterProgress = async (chapter) => {
  const allProgress = await getAllStageProgress();

  // 해당 챕터의 스테이지만 필터링
  const chapterProgress = allProgress.filter(p =>
    p.stage_id.startsWith(`${chapter}-`)
  );

  const totalStages = chapterProgress.length;
  const clearedStages = chapterProgress.filter(p => p.stars > 0).length;
  const threeStarStages = chapterProgress.filter(p => p.stars === 3).length;
  const totalStars = chapterProgress.reduce((sum, p) => sum + p.stars, 0);

  return {
    chapter,
    totalStages,
    clearedStages,
    threeStarStages,
    totalStars,
    maxStars: totalStages * 3,
    clearRate: totalStages > 0 ? (clearedStages / totalStages) * 100 : 0,
    perfectRate: totalStages > 0 ? (threeStarStages / totalStages) * 100 : 0
  };
};

/**
 * 전체 진행도 요약
 */
export const getOverallProgress = async () => {
  const allProgress = await getAllStageProgress();

  const totalStages = allProgress.length;
  const clearedStages = allProgress.filter(p => p.stars > 0).length;
  const threeStarStages = allProgress.filter(p => p.stars === 3).length;
  const totalStars = allProgress.reduce((sum, p) => sum + p.stars, 0);

  return {
    totalStages,
    clearedStages,
    threeStarStages,
    totalStars,
    maxStars: totalStages * 3,
    clearRate: totalStages > 0 ? (clearedStages / totalStages) * 100 : 0,
    perfectRate: totalStages > 0 ? (threeStarStages / totalStages) * 100 : 0
  };
};

/**
 * 가장 최근 클리어한 스테이지 조회
 */
export const getLastClearedStage = async () => {
  const allProgress = await getAllStageProgress();

  const clearedStages = allProgress.filter(p => p.stars > 0 && p.last_clear_at);
  if (clearedStages.length === 0) return null;

  clearedStages.sort((a, b) =>
    new Date(b.last_clear_at) - new Date(a.last_clear_at)
  );

  return clearedStages[0];
};

/**
 * 다음 진행 가능한 스테이지 찾기
 */
export const getNextAvailableStage = async (currentStageId) => {
  // 스테이지 ID 파싱 (예: "1-5-normal")
  const parts = currentStageId.split('-');
  const chapter = parseInt(parts[0]) || 1;
  const stage = parseInt(parts[1]) || 1;
  const difficulty = parts[2] || 'normal';

  // 다음 스테이지 계산
  // (실제로는 게임의 스테이지 구조에 따라 다름)
  const nextStage = stage + 1;
  const nextStageId = `${chapter}-${nextStage}-${difficulty}`;

  // 해당 스테이지가 존재하는지 확인 (게임 데이터와 비교)
  // 여기서는 간단히 20스테이지까지 있다고 가정
  if (nextStage > 20) {
    // 다음 챕터로
    return `${chapter + 1}-1-${difficulty}`;
  }

  return nextStageId;
};

/**
 * 스테이지 진행도 초기화 (개발/테스트용)
 */
export const resetAllProgress = async () => {
  const userId = await getUserId();

  // 로컬 데이터 삭제
  setLocalData(COLLECTION, [], userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('stage_progress')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to reset progress:', error);
    }

    return { success: true };
  } catch (error) {
    console.error('StageService.resetAllProgress error:', error);
    return { success: true };
  }
};

// 서비스 객체로 내보내기
const StageService = {
  getAllStageProgress,
  getStageProgress,
  isStageCleared,
  canSweep,
  updateStageProgress,
  recordStageClear,
  getEnergyCost,
  enterStage,
  sweepStage,
  calculateSweepRewards,
  getChapterProgress,
  getOverallProgress,
  getLastClearedStage,
  getNextAvailableStage,
  resetAllProgress
};

export default StageService;
