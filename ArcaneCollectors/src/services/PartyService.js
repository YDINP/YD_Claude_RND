/**
 * PartyService - 파티 서비스
 *
 * 파티 저장/불러오기 (5개 슬롯), 활성 파티 설정
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId } from './AuthService';
import { getHero } from './HeroService';

const COLLECTION = 'parties';
const MAX_PARTY_SLOTS = 5;
const MAX_HEROES_PER_PARTY = 4;

/**
 * 기본 파티 슬롯 생성
 */
const createDefaultPartySlot = (userId, slotNumber) => ({
  id: `local_party_${slotNumber}_${Date.now()}`,
  user_id: userId,
  slot_number: slotNumber,
  hero_ids: [],
  party_name: `Party ${slotNumber}`,
  is_active: slotNumber === 1, // 첫 번째 슬롯이 기본 활성
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

/**
 * 모든 파티 슬롯 조회
 */
export const getParties = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    let parties = getLocalData(COLLECTION, userId);
    if (!parties || parties.length === 0) {
      // 기본 파티 슬롯 5개 생성
      parties = Array.from({ length: MAX_PARTY_SLOTS }, (_, i) =>
        createDefaultPartySlot(userId, i + 1)
      );
      setLocalData(COLLECTION, parties, userId);
    }
    return parties.sort((a, b) => a.slot_number - b.slot_number);
  }

  try {
    const { data, error } = await supabase
      .from('parties')
      .select('*')
      .eq('user_id', userId)
      .order('slot_number', { ascending: true });

    if (error) {
      console.error('Failed to get parties:', error);
      return getLocalData(COLLECTION, userId) || [];
    }

    // 파티 슬롯이 없으면 생성
    if (data.length === 0) {
      const defaultParties = [];
      for (let i = 1; i <= MAX_PARTY_SLOTS; i++) {
        const party = createDefaultPartySlot(userId, i);
        const { data: newParty } = await supabase
          .from('parties')
          .insert(party)
          .select()
          .single();
        defaultParties.push(newParty || party);
      }
      setLocalData(COLLECTION, defaultParties, userId);
      return defaultParties;
    }

    // 로컬 동기화
    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('PartyService.getParties error:', error);
    return getLocalData(COLLECTION, userId) || [];
  }
};

/**
 * 특정 파티 슬롯 조회
 */
export const getParty = async (slotNumber) => {
  const parties = await getParties();
  return parties.find(p => p.slot_number === slotNumber) || null;
};

/**
 * 활성 파티 조회
 */
export const getActiveParty = async () => {
  const parties = await getParties();
  return parties.find(p => p.is_active) || parties[0] || null;
};

/**
 * 활성 파티의 영웅 ID 목록 조회
 */
export const getActivePartyHeroIds = async () => {
  const activeParty = await getActiveParty();
  return activeParty?.hero_ids || [];
};

/**
 * 활성 파티의 영웅 상세 정보 조회
 */
export const getActivePartyHeroes = async () => {
  const heroIds = await getActivePartyHeroIds();
  const heroes = [];

  for (const heroId of heroIds) {
    const hero = await getHero(heroId);
    if (hero) {
      heroes.push(hero);
    }
  }

  return heroes;
};

/**
 * 파티 슬롯 업데이트
 */
export const updateParty = async (slotNumber, updates) => {
  const userId = await getUserId();

  // 로컬 먼저 업데이트
  const parties = getLocalData(COLLECTION, userId) || [];
  const partyIndex = parties.findIndex(p => p.slot_number === slotNumber);

  if (partyIndex === -1) {
    return { success: false, error: 'Party slot not found' };
  }

  parties[partyIndex] = {
    ...parties[partyIndex],
    ...updates,
    updated_at: new Date().toISOString()
  };
  setLocalData(COLLECTION, parties, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, party: parties[partyIndex] };
  }

  try {
    const { data, error } = await supabase
      .from('parties')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('slot_number', slotNumber)
      .select()
      .single();

    if (error) {
      console.error('Failed to update party:', error);
      return { success: true, party: parties[partyIndex] };
    }

    // 로컬 동기화
    parties[partyIndex] = data;
    setLocalData(COLLECTION, parties, userId);

    return { success: true, party: data };
  } catch (error) {
    console.error('PartyService.updateParty error:', error);
    return { success: true, party: parties[partyIndex] };
  }
};

/**
 * 파티에 영웅 추가
 */
export const addHeroToParty = async (slotNumber, heroId) => {
  const party = await getParty(slotNumber);

  if (!party) {
    return { success: false, error: 'Party slot not found' };
  }

  if (party.hero_ids.length >= MAX_HEROES_PER_PARTY) {
    return { success: false, error: 'Party is full (max 4 heroes)' };
  }

  if (party.hero_ids.includes(heroId)) {
    return { success: false, error: 'Hero already in party' };
  }

  // 영웅 존재 여부 확인
  const hero = await getHero(heroId);
  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const newHeroIds = [...party.hero_ids, heroId];
  return await updateParty(slotNumber, { hero_ids: newHeroIds });
};

/**
 * 파티에서 영웅 제거
 */
export const removeHeroFromParty = async (slotNumber, heroId) => {
  const party = await getParty(slotNumber);

  if (!party) {
    return { success: false, error: 'Party slot not found' };
  }

  if (!party.hero_ids.includes(heroId)) {
    return { success: false, error: 'Hero not in party' };
  }

  const newHeroIds = party.hero_ids.filter(id => id !== heroId);
  return await updateParty(slotNumber, { hero_ids: newHeroIds });
};

/**
 * 파티 영웅 순서 변경 (드래그 앤 드롭 등)
 */
export const reorderPartyHeroes = async (slotNumber, newHeroIds) => {
  const party = await getParty(slotNumber);

  if (!party) {
    return { success: false, error: 'Party slot not found' };
  }

  if (newHeroIds.length > MAX_HEROES_PER_PARTY) {
    return { success: false, error: 'Too many heroes' };
  }

  // 기존 영웅들이 모두 포함되어 있는지 확인
  const existingSet = new Set(party.hero_ids);
  const newSet = new Set(newHeroIds);

  if (existingSet.size !== newSet.size ||
      ![...existingSet].every(id => newSet.has(id))) {
    return { success: false, error: 'Hero list mismatch' };
  }

  return await updateParty(slotNumber, { hero_ids: newHeroIds });
};

/**
 * 파티 영웅 전체 설정
 */
export const setPartyHeroes = async (slotNumber, heroIds) => {
  if (heroIds.length > MAX_HEROES_PER_PARTY) {
    return { success: false, error: 'Too many heroes (max 4)' };
  }

  // 중복 체크
  if (new Set(heroIds).size !== heroIds.length) {
    return { success: false, error: 'Duplicate heroes not allowed' };
  }

  // 모든 영웅 존재 여부 확인
  for (const heroId of heroIds) {
    const hero = await getHero(heroId);
    if (!hero) {
      return { success: false, error: `Hero ${heroId} not found` };
    }
  }

  return await updateParty(slotNumber, { hero_ids: heroIds });
};

/**
 * 파티 비우기
 */
export const clearParty = async (slotNumber) => {
  return await updateParty(slotNumber, { hero_ids: [] });
};

/**
 * 파티 이름 변경
 */
export const renameParty = async (slotNumber, newName) => {
  if (!newName || newName.trim().length === 0) {
    return { success: false, error: 'Party name cannot be empty' };
  }

  return await updateParty(slotNumber, { party_name: newName.trim() });
};

/**
 * 활성 파티 설정
 */
export const setActiveParty = async (slotNumber) => {
  const userId = await getUserId();
  const parties = await getParties();

  // 모든 파티 비활성화 후 선택된 파티만 활성화
  for (const party of parties) {
    if (party.is_active && party.slot_number !== slotNumber) {
      await updateParty(party.slot_number, { is_active: false });
    }
  }

  return await updateParty(slotNumber, { is_active: true });
};

/**
 * 영웅이 속한 파티 찾기
 */
export const findPartiesWithHero = async (heroId) => {
  const parties = await getParties();
  return parties.filter(p => p.hero_ids.includes(heroId));
};

/**
 * 모든 파티에서 특정 영웅 제거 (영웅 삭제 시)
 */
export const removeHeroFromAllParties = async (heroId) => {
  const partiesWithHero = await findPartiesWithHero(heroId);

  for (const party of partiesWithHero) {
    await removeHeroFromParty(party.slot_number, heroId);
  }

  return { success: true, affectedParties: partiesWithHero.length };
};

/**
 * 파티 복사
 */
export const copyParty = async (fromSlot, toSlot) => {
  const sourceParty = await getParty(fromSlot);

  if (!sourceParty) {
    return { success: false, error: 'Source party not found' };
  }

  return await updateParty(toSlot, {
    hero_ids: [...sourceParty.hero_ids],
    party_name: `${sourceParty.party_name} (Copy)`
  });
};

/**
 * 두 파티 교환
 */
export const swapParties = async (slot1, slot2) => {
  const party1 = await getParty(slot1);
  const party2 = await getParty(slot2);

  if (!party1 || !party2) {
    return { success: false, error: 'Party not found' };
  }

  // 영웅 목록과 이름 교환
  await updateParty(slot1, {
    hero_ids: party2.hero_ids,
    party_name: party2.party_name
  });

  await updateParty(slot2, {
    hero_ids: party1.hero_ids,
    party_name: party1.party_name
  });

  return { success: true };
};

/**
 * 파티 전투력 계산 (영웅 스탯 기반)
 */
export const getPartyPower = async (slotNumber) => {
  const party = await getParty(slotNumber);

  if (!party) {
    return 0;
  }

  let totalPower = 0;

  for (const heroId of party.hero_ids) {
    const hero = await getHero(heroId);
    if (hero) {
      // 간단한 전투력 공식: (레벨 * 10) + (성급 * 100)
      const heroPower = (hero.level * 10) + (hero.stars * 100);
      totalPower += heroPower;
    }
  }

  return totalPower;
};

// 서비스 객체로 내보내기
const PartyService = {
  getParties,
  getParty,
  getActiveParty,
  getActivePartyHeroIds,
  getActivePartyHeroes,
  updateParty,
  addHeroToParty,
  removeHeroFromParty,
  reorderPartyHeroes,
  setPartyHeroes,
  clearParty,
  renameParty,
  setActiveParty,
  findPartiesWithHero,
  removeHeroFromAllParties,
  copyParty,
  swapParties,
  getPartyPower
};

export default PartyService;
