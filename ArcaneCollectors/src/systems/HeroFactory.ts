/**
 * HeroFactory - Factory Pattern for Hero Creation
 * normalizeHero() 기능을 Factory로 격상
 */

import type { Character, OwnedHero, NormalizedHero, CharacterStats } from '../types';
import { getCharacter } from '../data/index.js';
import { getRarityKey, getRarityStars } from '../utils/rarityUtils.js';

const DEFAULT_STATS: CharacterStats = { hp: 100, atk: 10, def: 10, spd: 10 };

/**
 * 영웅 생성 및 정규화를 담당하는 Factory 클래스
 */
export class HeroFactory {
  /**
   * 캐릭터 데이터로부터 영웅 인스턴스 생성
   * @param charData - characters.json의 Character 데이터
   * @param options - 추가 옵션 (레벨, 경험치 등)
   * @returns 정규화된 영웅 객체
   */
  static createFromCharacterData(
    charData: Character,
    options?: Partial<OwnedHero>
  ): NormalizedHero {
    const rarity = options?.rarity ?? charData.rarity;
    const rarityKey = getRarityKey(rarity);

    return {
      // 식별자
      id: charData.id,
      instanceId: options?.instanceId || charData.id,
      characterId: charData.id,

      // 기본 정보
      name: options?.name || charData.name,
      rarity: rarity,
      rarityKey: rarityKey,
      stars: options?.stars || getRarityStars(rarity),
      cult: options?.cult || charData.cult,
      class: options?.class || charData.class,
      mood: options?.mood || charData.mood,
      description: options?.description || charData.description,

      // 상태
      level: options?.level || 1,
      exp: options?.exp || 0,

      // 스탯
      stats: options?.stats || { ...charData.stats },
      growthStats: charData.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 },

      // 스킬
      skills: options?.skills || charData.skills || [],
      skillLevels: options?.skillLevels || [1, 1, 1],

      // 장비
      equipped: options?.equipped ?? null,

      // 진화
      evolutionCount: options?.evolutionCount || 0
    };
  }

  /**
   * 세이브 데이터로부터 영웅 복원
   * @param saveData - 저장된 영웅 데이터
   * @returns 정규화된 영웅 객체
   */
  static createFromSaveData(saveData: any): NormalizedHero | null {
    if (!saveData) return null;

    const heroId = saveData.id || saveData.characterId;
    if (!heroId) return null;

    const base = getCharacter(heroId);
    if (!base) return null;

    return HeroFactory.createFromCharacterData(base, saveData);
  }

  /**
   * 시작 캐릭터 생성 (초기 파티용)
   * @param characterId - 캐릭터 ID
   * @returns 정규화된 영웅 객체
   */
  static createStarter(characterId: string): NormalizedHero | null {
    const charData = getCharacter(characterId);
    if (!charData) return null;

    return HeroFactory.createFromCharacterData(charData, {
      level: 1,
      exp: 0,
      evolutionCount: 0
    });
  }

  /**
   * 불완전한 영웅 데이터를 정규화 (레거시 normalizeHero 대체)
   * @param hero - 불완전할 수 있는 영웅 데이터
   * @returns 정규화된 영웅 객체
   */
  static normalize(hero: Partial<OwnedHero> | null | undefined): NormalizedHero | null {
    if (!hero) return null;

    const heroId = hero.id || hero.characterId;
    if (!heroId) return null;

    const base = getCharacter(heroId);

    // 캐릭터 데이터가 없으면 기본값으로 생성
    if (!base) {
      console.warn(`[HeroFactory] Character not found: ${heroId}, using defaults`);
      const rarity = (hero.rarity ?? 1) as any;
      const rarityKey = getRarityKey(rarity);

      return {
        id: heroId,
        instanceId: hero.instanceId || heroId,
        characterId: heroId,
        name: hero.name || '???',
        rarity: rarity,
        rarityKey: rarityKey,
        stars: hero.stars || getRarityStars(rarity),
        cult: hero.cult || 'olympus',
        class: hero.class || 'warrior',
        mood: hero.mood || 'brave',
        description: hero.description || '',
        level: hero.level || 1,
        exp: hero.exp || 0,
        stats: hero.stats || { ...DEFAULT_STATS },
        growthStats: { hp: 0, atk: 0, def: 0, spd: 0 },
        skills: hero.skills || [],
        skillLevels: hero.skillLevels || [1, 1, 1],
        equipped: hero.equipped || null,
        evolutionCount: hero.evolutionCount || 0
      };
    }

    // 캐릭터 데이터가 있으면 Factory로 생성
    return HeroFactory.createFromCharacterData(base, hero);
  }

  /**
   * 영웅 배열 전체를 정규화
   * @param heroes - 불완전한 영웅 배열
   * @returns 정규화된 영웅 배열 (null 필터링)
   */
  static normalizeAll(heroes: Array<Partial<OwnedHero>> | null | undefined): NormalizedHero[] {
    if (!Array.isArray(heroes)) return [];
    return heroes.map(h => HeroFactory.normalize(h)).filter((h): h is NormalizedHero => h !== null);
  }

  /**
   * 가챠 결과로 영웅 생성
   * @param characterId - 뽑은 캐릭터 ID
   * @param rarity - 확정된 등급 (가챠 결과)
   * @returns 정규화된 영웅 객체
   */
  static createFromGacha(characterId: string, rarity: number): NormalizedHero | null {
    const charData = getCharacter(characterId);
    if (!charData) return null;

    return HeroFactory.createFromCharacterData(charData, {
      instanceId: `${characterId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rarity: rarity as any,
      level: 1,
      exp: 0,
      evolutionCount: 0
    });
  }
}
