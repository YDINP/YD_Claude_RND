/**
 * PlayerService - 플레이어 데이터 서비스
 *
 * 플레이어 데이터 조회/저장, 에너지 관리, 재화 관리
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId, getGuestUserId } from './AuthService';

const COLLECTION = 'player_data';

// 에너지 회복 설정
const ENERGY_RECOVERY_RATE = 1; // 분당 회복량
const ENERGY_RECOVERY_INTERVAL = 60 * 1000; // 1분 (밀리초)

/**
 * 기본 플레이어 데이터
 */
const getDefaultPlayerData = (userId) => ({
  id: `local_${Date.now()}`,
  user_id: userId,
  gold: 10000,
  gems: 100,
  energy: 100,
  max_energy: 100,
  player_level: 1,
  exp: 0,
  vip_level: 0,
  sweep_tickets: 10,
  last_energy_update: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

/**
 * 시간 기반 에너지 회복 계산
 */
export const calculateEnergyRecovery = (playerData) => {
  if (!playerData) return null;

  const now = Date.now();
  const lastUpdate = new Date(playerData.last_energy_update).getTime();
  const elapsedMinutes = Math.floor((now - lastUpdate) / ENERGY_RECOVERY_INTERVAL);

  if (elapsedMinutes <= 0) {
    return {
      ...playerData,
      recoveredEnergy: 0,
      nextRecoveryIn: ENERGY_RECOVERY_INTERVAL - (now - lastUpdate)
    };
  }

  const recoveredEnergy = elapsedMinutes * ENERGY_RECOVERY_RATE;
  const newEnergy = Math.min(
    playerData.energy + recoveredEnergy,
    playerData.max_energy
  );

  return {
    ...playerData,
    energy: newEnergy,
    recoveredEnergy,
    last_energy_update: new Date().toISOString(),
    nextRecoveryIn: newEnergy >= playerData.max_energy ? null : ENERGY_RECOVERY_INTERVAL
  };
};

/**
 * 플레이어 데이터 조회
 */
export const getPlayerData = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    // 로컬 스토리지에서 조회
    let data = getLocalData(COLLECTION, userId);
    if (!data) {
      data = getDefaultPlayerData(userId);
      setLocalData(COLLECTION, data, userId);
    }
    return calculateEnergyRecovery(data);
  }

  try {
    const { data, error } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // 데이터가 없으면 새로 생성
      return await createPlayerData();
    }

    if (error) {
      console.error('Failed to get player data:', error);
      // 폴백: 로컬 데이터 사용
      const localData = getLocalData(COLLECTION, userId) || getDefaultPlayerData(userId);
      return calculateEnergyRecovery(localData);
    }

    // 로컬에도 동기화
    setLocalData(COLLECTION, data, userId);
    return calculateEnergyRecovery(data);
  } catch (error) {
    console.error('PlayerService.getPlayerData error:', error);
    const localData = getLocalData(COLLECTION, userId) || getDefaultPlayerData(userId);
    return calculateEnergyRecovery(localData);
  }
};

/**
 * 플레이어 데이터 생성
 */
export const createPlayerData = async () => {
  const userId = await getUserId();
  const defaultData = getDefaultPlayerData(userId);

  if (!isSupabaseConfigured || !supabase) {
    setLocalData(COLLECTION, defaultData, userId);
    return defaultData;
  }

  try {
    const { data, error } = await supabase
      .from('player_data')
      .insert(defaultData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create player data:', error);
      setLocalData(COLLECTION, defaultData, userId);
      return defaultData;
    }

    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('PlayerService.createPlayerData error:', error);
    setLocalData(COLLECTION, defaultData, userId);
    return defaultData;
  }
};

/**
 * 플레이어 데이터 업데이트
 */
export const updatePlayerData = async (updates) => {
  const userId = await getUserId();

  // 로컬 데이터 먼저 업데이트
  const currentData = getLocalData(COLLECTION, userId) || getDefaultPlayerData(userId);
  const updatedData = {
    ...currentData,
    ...updates,
    updated_at: new Date().toISOString()
  };
  setLocalData(COLLECTION, updatedData, userId);

  if (!isSupabaseConfigured || !supabase) {
    return updatedData;
  }

  try {
    const { data, error } = await supabase
      .from('player_data')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update player data:', error);
      return updatedData; // 로컬 데이터 반환
    }

    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('PlayerService.updatePlayerData error:', error);
    return updatedData;
  }
};

/**
 * 에너지 사용
 */
export const useEnergy = async (amount) => {
  const playerData = await getPlayerData();

  if (playerData.energy < amount) {
    return { success: false, error: 'Not enough energy', currentEnergy: playerData.energy };
  }

  const updated = await updatePlayerData({
    energy: playerData.energy - amount,
    last_energy_update: new Date().toISOString()
  });

  return { success: true, playerData: updated };
};

/**
 * 에너지 회복 (아이템 사용 등)
 */
export const recoverEnergy = async (amount) => {
  const playerData = await getPlayerData();
  const newEnergy = Math.min(playerData.energy + amount, playerData.max_energy);

  const updated = await updatePlayerData({
    energy: newEnergy,
    last_energy_update: new Date().toISOString()
  });

  return { success: true, playerData: updated };
};

/**
 * 에너지 완전 회복 (광고 시청 등)
 */
export const fullRecoverEnergy = async () => {
  const playerData = await getPlayerData();

  const updated = await updatePlayerData({
    energy: playerData.max_energy,
    last_energy_update: new Date().toISOString()
  });

  return { success: true, playerData: updated };
};

/**
 * 골드 추가
 */
export const addGold = async (amount) => {
  const playerData = await getPlayerData();

  const updated = await updatePlayerData({
    gold: playerData.gold + amount
  });

  return { success: true, playerData: updated };
};

/**
 * 골드 사용
 */
export const useGold = async (amount) => {
  const playerData = await getPlayerData();

  if (playerData.gold < amount) {
    return { success: false, error: 'Not enough gold', currentGold: playerData.gold };
  }

  const updated = await updatePlayerData({
    gold: playerData.gold - amount
  });

  return { success: true, playerData: updated };
};

/**
 * 젬 추가
 */
export const addGems = async (amount) => {
  const playerData = await getPlayerData();

  const updated = await updatePlayerData({
    gems: playerData.gems + amount
  });

  return { success: true, playerData: updated };
};

/**
 * 젬 사용
 */
export const useGems = async (amount) => {
  const playerData = await getPlayerData();

  if (playerData.gems < amount) {
    return { success: false, error: 'Not enough gems', currentGems: playerData.gems };
  }

  const updated = await updatePlayerData({
    gems: playerData.gems - amount
  });

  return { success: true, playerData: updated };
};

/**
 * 소탕권 추가
 */
export const addSweepTickets = async (amount) => {
  const playerData = await getPlayerData();

  const updated = await updatePlayerData({
    sweep_tickets: playerData.sweep_tickets + amount
  });

  return { success: true, playerData: updated };
};

/**
 * 소탕권 사용
 */
export const useSweepTickets = async (amount) => {
  const playerData = await getPlayerData();

  if (playerData.sweep_tickets < amount) {
    return { success: false, error: 'Not enough sweep tickets', currentTickets: playerData.sweep_tickets };
  }

  const updated = await updatePlayerData({
    sweep_tickets: playerData.sweep_tickets - amount
  });

  return { success: true, playerData: updated };
};

/**
 * 경험치 추가 및 레벨업 처리
 */
export const addExp = async (amount) => {
  const playerData = await getPlayerData();
  let newExp = playerData.exp + amount;
  let newLevel = playerData.player_level;
  let newMaxEnergy = playerData.max_energy;

  // 레벨업 계산 (간단한 공식: 레벨 * 100 경험치 필요)
  while (newExp >= getExpForLevel(newLevel)) {
    newExp -= getExpForLevel(newLevel);
    newLevel++;
    newMaxEnergy += 5; // 레벨당 최대 에너지 +5
  }

  const updated = await updatePlayerData({
    exp: newExp,
    player_level: newLevel,
    max_energy: newMaxEnergy
  });

  return {
    success: true,
    playerData: updated,
    leveledUp: newLevel > playerData.player_level,
    levelsGained: newLevel - playerData.player_level
  };
};

/**
 * 레벨별 필요 경험치 계산
 */
export const getExpForLevel = (level) => {
  return level * 100;
};

/**
 * 다음 에너지 회복까지 남은 시간 (밀리초)
 */
export const getTimeUntilNextEnergy = async () => {
  const playerData = await getPlayerData();

  if (playerData.energy >= playerData.max_energy) {
    return null; // 이미 최대 에너지
  }

  const now = Date.now();
  const lastUpdate = new Date(playerData.last_energy_update).getTime();
  const elapsed = now - lastUpdate;
  const remaining = ENERGY_RECOVERY_INTERVAL - (elapsed % ENERGY_RECOVERY_INTERVAL);

  return remaining;
};

/**
 * 에너지 완전 회복까지 남은 시간 (밀리초)
 */
export const getTimeUntilFullEnergy = async () => {
  const playerData = await getPlayerData();

  if (playerData.energy >= playerData.max_energy) {
    return 0;
  }

  const energyNeeded = playerData.max_energy - playerData.energy;
  return energyNeeded * ENERGY_RECOVERY_INTERVAL;
};

/**
 * 로컬 데이터를 클라우드에 동기화
 * @returns {Promise<Object>} 동기화 결과
 */
export const syncToCloud = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: 'Supabase not configured',
      synced: false
    };
  }

  try {
    // 로컬 데이터 가져오기
    const localData = getLocalData(COLLECTION, userId);

    if (!localData) {
      return {
        success: true,
        message: 'No local data to sync',
        synced: false
      };
    }

    // 클라우드 데이터 확인
    const { data: cloudData, error: fetchError } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    // 충돌 해결: 로컬이 더 최신인 경우만 업로드
    if (cloudData) {
      const localUpdated = new Date(localData.updated_at);
      const cloudUpdated = new Date(cloudData.updated_at);

      if (cloudUpdated > localUpdated) {
        return {
          success: true,
          message: 'Cloud data is newer, sync skipped',
          synced: false,
          conflict: true
        };
      }
    }

    // 업서트 (생성 또는 업데이트)
    const { data: syncedData, error: upsertError } = await supabase
      .from('player_data')
      .upsert({
        ...localData,
        user_id: userId,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (upsertError) {
      throw upsertError;
    }

    // 로컬 데이터도 업데이트
    setLocalData(COLLECTION, syncedData, userId);

    return {
      success: true,
      data: syncedData,
      synced: true
    };
  } catch (error) {
    console.error('PlayerService.syncToCloud error:', error);
    return {
      success: false,
      error: error.message,
      synced: false
    };
  }
};

/**
 * 클라우드에서 데이터 로드
 * @param {boolean} overwriteLocal - 로컬 데이터 덮어쓰기 여부
 * @returns {Promise<Object>} 로드 결과
 */
export const loadFromCloud = async (overwriteLocal = false) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: 'Supabase not configured',
      loaded: false
    };
  }

  try {
    const { data: cloudData, error } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: true,
          message: 'No cloud data found',
          loaded: false
        };
      }
      throw error;
    }

    // 로컬 데이터와 비교
    const localData = getLocalData(COLLECTION, userId);

    if (localData && !overwriteLocal) {
      const localUpdated = new Date(localData.updated_at);
      const cloudUpdated = new Date(cloudData.updated_at);

      if (localUpdated > cloudUpdated) {
        return {
          success: true,
          message: 'Local data is newer',
          loaded: false,
          conflict: true,
          localData,
          cloudData
        };
      }
    }

    // 로컬에 저장
    setLocalData(COLLECTION, cloudData, userId);

    return {
      success: true,
      data: calculateEnergyRecovery(cloudData),
      loaded: true
    };
  } catch (error) {
    console.error('PlayerService.loadFromCloud error:', error);
    return {
      success: false,
      error: error.message,
      loaded: false
    };
  }
};

/**
 * 일일 소탕 횟수 확인 및 리셋
 */
export const checkAndResetDailySweep = async () => {
  const playerData = await getPlayerData();

  if (!playerData) return null;

  const today = new Date().toISOString().split('T')[0];
  const resetDate = playerData.sweep_reset_date || today;

  if (resetDate < today) {
    // 일일 리셋
    const updated = await updatePlayerData({
      sweep_count_today: 0,
      sweep_reset_date: today
    });
    return updated;
  }

  return playerData;
};

/**
 * 일일 소탕 횟수 증가
 */
export const incrementDailySweepCount = async (amount = 1) => {
  const playerData = await checkAndResetDailySweep();

  const updated = await updatePlayerData({
    sweep_count_today: (playerData.sweep_count_today || 0) + amount
  });

  return updated;
};

/**
 * VIP 레벨에 따른 일일 소탕 제한 확인
 */
export const getDailySweepLimit = (vipLevel = 0) => {
  // VIP 레벨별 일일 소탕 제한
  const limits = {
    0: 5,
    1: 10,
    2: 15,
    3: 20,
    4: 30,
    5: 40,
    6: 50,
    7: 70,
    8: 100,
    9: 150,
    10: 999
  };
  return limits[vipLevel] || limits[0];
};

/**
 * 젬 소비 기록 및 VIP 레벨 업데이트
 */
export const recordGemSpending = async (amount) => {
  const playerData = await getPlayerData();

  const totalSpent = (playerData.total_gems_spent || 0) + amount;

  // VIP 레벨 계산
  const newVipLevel = calculateVipLevel(totalSpent);

  const updated = await updatePlayerData({
    total_gems_spent: totalSpent,
    vip_level: newVipLevel
  });

  return {
    playerData: updated,
    vipLevelUp: newVipLevel > (playerData.vip_level || 0)
  };
};

/**
 * VIP 레벨 계산 (클라이언트 측)
 */
const calculateVipLevel = (totalSpent) => {
  const thresholds = [
    { level: 10, amount: 200000 },
    { level: 9, amount: 100000 },
    { level: 8, amount: 50000 },
    { level: 7, amount: 20000 },
    { level: 6, amount: 10000 },
    { level: 5, amount: 5000 },
    { level: 4, amount: 3000 },
    { level: 3, amount: 1000 },
    { level: 2, amount: 500 },
    { level: 1, amount: 100 }
  ];

  for (const { level, amount } of thresholds) {
    if (totalSpent >= amount) return level;
  }
  return 0;
};

// 서비스 객체로 내보내기
const PlayerService = {
  getPlayerData,
  createPlayerData,
  updatePlayerData,
  calculateEnergyRecovery,
  useEnergy,
  recoverEnergy,
  fullRecoverEnergy,
  addGold,
  useGold,
  addGems,
  useGems,
  addSweepTickets,
  useSweepTickets,
  addExp,
  getExpForLevel,
  getTimeUntilNextEnergy,
  getTimeUntilFullEnergy,
  // v5 추가 기능
  syncToCloud,
  loadFromCloud,
  checkAndResetDailySweep,
  incrementDailySweepCount,
  getDailySweepLimit,
  recordGemSpending
};

export default PlayerService;
