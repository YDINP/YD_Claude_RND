/**
 * InventoryService - 인벤토리 서비스
 *
 * 인벤토리 조회, 아이템 추가/소모
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId } from './AuthService';

const COLLECTION = 'inventory';

// 아이템 타입 정의
export const ITEM_TYPES = {
  MATERIAL: 'material',      // 강화/진화 재료
  CONSUMABLE: 'consumable',  // 소모품 (에너지 물약 등)
  EQUIPMENT: 'equipment',    // 장비
  SHARD: 'shard',           // 영웅 조각
  CURRENCY: 'currency',      // 재화 (골드, 젬은 PlayerService)
  KEY: 'key',               // 던전 키
  TICKET: 'ticket',         // 티켓류
  GIFT: 'gift',             // 선물/박스
  ETC: 'etc'                // 기타
};

/**
 * 전체 인벤토리 조회
 */
export const getInventory = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    return getLocalData(COLLECTION, userId) || [];
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .order('item_id', { ascending: true });

    if (error) {
      console.error('Failed to get inventory:', error);
      return getLocalData(COLLECTION, userId) || [];
    }

    // 로컬 동기화
    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('InventoryService.getInventory error:', error);
    return getLocalData(COLLECTION, userId) || [];
  }
};

/**
 * 특정 아이템 조회
 */
export const getItem = async (itemId) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    const inventory = getLocalData(COLLECTION, userId) || [];
    return inventory.find(item => item.item_id === itemId) || null;
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Failed to get item:', error);
      const inventory = getLocalData(COLLECTION, userId) || [];
      return inventory.find(item => item.item_id === itemId) || null;
    }

    return data;
  } catch (error) {
    console.error('InventoryService.getItem error:', error);
    return null;
  }
};

/**
 * 아이템 수량 조회
 */
export const getItemQuantity = async (itemId) => {
  const item = await getItem(itemId);
  return item?.quantity || 0;
};

/**
 * 아이템 보유 여부 확인
 */
export const hasItem = async (itemId, requiredQuantity = 1) => {
  const quantity = await getItemQuantity(itemId);
  return quantity >= requiredQuantity;
};

/**
 * 아이템 추가
 */
export const addItem = async (itemId, quantity = 1) => {
  if (quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  const userId = await getUserId();
  const existing = await getItem(itemId);

  const newQuantity = (existing?.quantity || 0) + quantity;

  // 로컬 업데이트
  const inventory = getLocalData(COLLECTION, userId) || [];
  const existingIndex = inventory.findIndex(item => item.item_id === itemId);

  const itemData = {
    user_id: userId,
    item_id: itemId,
    quantity: newQuantity,
    updated_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    inventory[existingIndex] = { ...inventory[existingIndex], ...itemData };
  } else {
    inventory.push({
      id: `local_${Date.now()}`,
      ...itemData,
      created_at: new Date().toISOString()
    });
  }
  setLocalData(COLLECTION, inventory, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, item: itemData, newQuantity };
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .upsert(itemData, {
        onConflict: 'user_id,item_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to add item:', error);
      return { success: true, item: itemData, newQuantity };
    }

    // 로컬 동기화
    const idx = inventory.findIndex(item => item.item_id === itemId);
    if (idx >= 0) {
      inventory[idx] = data;
    }
    setLocalData(COLLECTION, inventory, userId);

    return { success: true, item: data, newQuantity };
  } catch (error) {
    console.error('InventoryService.addItem error:', error);
    return { success: true, item: itemData, newQuantity };
  }
};

/**
 * 아이템 여러 개 추가
 */
export const addItems = async (items) => {
  const results = [];
  for (const { itemId, quantity } of items) {
    const result = await addItem(itemId, quantity);
    results.push({ itemId, ...result });
  }
  return results;
};

/**
 * 아이템 소모
 */
export const useItem = async (itemId, quantity = 1) => {
  if (quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  const userId = await getUserId();
  const existing = await getItem(itemId);

  if (!existing || existing.quantity < quantity) {
    return {
      success: false,
      error: 'Not enough items',
      required: quantity,
      current: existing?.quantity || 0
    };
  }

  const newQuantity = existing.quantity - quantity;

  // 로컬 업데이트
  const inventory = getLocalData(COLLECTION, userId) || [];
  const existingIndex = inventory.findIndex(item => item.item_id === itemId);

  if (newQuantity <= 0) {
    // 수량이 0이면 삭제
    inventory.splice(existingIndex, 1);
    setLocalData(COLLECTION, inventory, userId);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('inventory')
          .delete()
          .eq('user_id', userId)
          .eq('item_id', itemId);
      } catch (error) {
        console.error('Failed to delete item:', error);
      }
    }

    return { success: true, newQuantity: 0, removed: true };
  }

  // 수량 감소
  const itemData = {
    ...inventory[existingIndex],
    quantity: newQuantity,
    updated_at: new Date().toISOString()
  };
  inventory[existingIndex] = itemData;
  setLocalData(COLLECTION, inventory, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, item: itemData, newQuantity };
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .select()
      .single();

    if (error) {
      console.error('Failed to use item:', error);
      return { success: true, item: itemData, newQuantity };
    }

    inventory[existingIndex] = data;
    setLocalData(COLLECTION, inventory, userId);

    return { success: true, item: data, newQuantity };
  } catch (error) {
    console.error('InventoryService.useItem error:', error);
    return { success: true, item: itemData, newQuantity };
  }
};

/**
 * 아이템 여러 개 소모
 */
export const useItems = async (items) => {
  // 먼저 모든 아이템이 충분한지 확인
  for (const { itemId, quantity } of items) {
    const hasEnough = await hasItem(itemId, quantity);
    if (!hasEnough) {
      const current = await getItemQuantity(itemId);
      return {
        success: false,
        error: `Not enough ${itemId}`,
        required: quantity,
        current
      };
    }
  }

  // 모두 충분하면 소모
  const results = [];
  for (const { itemId, quantity } of items) {
    const result = await useItem(itemId, quantity);
    results.push({ itemId, ...result });
  }

  return { success: true, results };
};

/**
 * 아이템 수량 설정 (직접 설정)
 */
export const setItemQuantity = async (itemId, quantity) => {
  if (quantity < 0) {
    return { success: false, error: 'Quantity cannot be negative' };
  }

  const userId = await getUserId();

  if (quantity === 0) {
    // 수량이 0이면 삭제
    return await removeItem(itemId);
  }

  const inventory = getLocalData(COLLECTION, userId) || [];
  const existingIndex = inventory.findIndex(item => item.item_id === itemId);

  const itemData = {
    user_id: userId,
    item_id: itemId,
    quantity,
    updated_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    inventory[existingIndex] = { ...inventory[existingIndex], ...itemData };
  } else {
    inventory.push({
      id: `local_${Date.now()}`,
      ...itemData,
      created_at: new Date().toISOString()
    });
  }
  setLocalData(COLLECTION, inventory, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, item: itemData };
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .upsert(itemData, {
        onConflict: 'user_id,item_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to set item quantity:', error);
      return { success: true, item: itemData };
    }

    return { success: true, item: data };
  } catch (error) {
    console.error('InventoryService.setItemQuantity error:', error);
    return { success: true, item: itemData };
  }
};

/**
 * 아이템 삭제
 */
export const removeItem = async (itemId) => {
  const userId = await getUserId();

  // 로컬에서 삭제
  const inventory = getLocalData(COLLECTION, userId) || [];
  const updatedInventory = inventory.filter(item => item.item_id !== itemId);
  setLocalData(COLLECTION, updatedInventory, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', itemId);

    if (error) {
      console.error('Failed to remove item:', error);
    }

    return { success: true };
  } catch (error) {
    console.error('InventoryService.removeItem error:', error);
    return { success: true };
  }
};

/**
 * 타입별 아이템 조회
 */
export const getItemsByType = async (itemType) => {
  const inventory = await getInventory();

  // 아이템 ID에서 타입 추출 (예: "shard_hero001", "material_exp_potion")
  return inventory.filter(item => {
    const type = item.item_id.split('_')[0];
    return type === itemType;
  });
};

/**
 * 영웅 조각 조회
 */
export const getHeroShards = async (heroId = null) => {
  const shards = await getItemsByType(ITEM_TYPES.SHARD);

  if (heroId) {
    return shards.find(shard => shard.item_id === `shard_${heroId}`);
  }

  return shards;
};

/**
 * 영웅 조각 추가
 */
export const addHeroShards = async (heroId, quantity) => {
  return await addItem(`shard_${heroId}`, quantity);
};

/**
 * 인벤토리 용량 확인 (선택적)
 */
export const getInventoryCount = async () => {
  const inventory = await getInventory();
  return inventory.length;
};

/**
 * 인벤토리 비우기 (개발/테스트용)
 */
export const clearInventory = async () => {
  const userId = await getUserId();

  // 로컬 데이터 삭제
  setLocalData(COLLECTION, [], userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to clear inventory:', error);
    }

    return { success: true };
  } catch (error) {
    console.error('InventoryService.clearInventory error:', error);
    return { success: true };
  }
};

/**
 * 인벤토리 요약 정보
 */
export const getInventorySummary = async () => {
  const inventory = await getInventory();

  const summary = {
    totalItems: inventory.length,
    totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0),
    byType: {}
  };

  // 타입별 집계
  for (const item of inventory) {
    const type = item.item_id.split('_')[0];
    if (!summary.byType[type]) {
      summary.byType[type] = {
        count: 0,
        quantity: 0
      };
    }
    summary.byType[type].count++;
    summary.byType[type].quantity += item.quantity;
  }

  return summary;
};

// 서비스 객체로 내보내기
const InventoryService = {
  ITEM_TYPES,
  getInventory,
  getItem,
  getItemQuantity,
  hasItem,
  addItem,
  addItems,
  useItem,
  useItems,
  setItemQuantity,
  removeItem,
  getItemsByType,
  getHeroShards,
  addHeroShards,
  getInventoryCount,
  clearInventory,
  getInventorySummary
};

export default InventoryService;
