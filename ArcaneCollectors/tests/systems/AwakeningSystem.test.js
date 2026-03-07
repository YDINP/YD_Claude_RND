/**
 * AwakeningSystem.test.js
 * 교단 각성 시스템 유닛 테스트 — 20개 이상
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AwakeningSystem,
  AWAKENING_REQUIREMENTS,
  AWAKENING_STAGES,
  AWAKENING_STAGE_NAMES,
  awakeningSystem
} from '../../src/systems/AwakeningSystem.js';

// ============================================
// 목(Mock) SaveManager
// ============================================
function createMockSaveManager(heroDataMap = {}, awakeningDataMap = {}) {
  const awakeningStore = { ...awakeningDataMap };

  return {
    getHeroData: vi.fn((heroId) => heroDataMap[heroId] ?? null),
    getAwakeningData: vi.fn((heroId, cultId) => {
      const key = `${heroId}:${cultId}`;
      return awakeningStore[key] ?? null;
    }),
    setAwakeningData: vi.fn((heroId, cultId, data) => {
      const key = `${heroId}:${cultId}`;
      awakeningStore[key] = { ...data };
    }),
    updateHeroCult: vi.fn(),
    _store: awakeningStore
  };
}

// ============================================
// 테스트 스위트
// ============================================
describe('AwakeningSystem', () => {

  // ────────────────────────────────────────
  // 상수 검증
  // ────────────────────────────────────────
  describe('상수 — AWAKENING_REQUIREMENTS', () => {
    it('TC-01: 10개 교단 요구사항이 모두 정의되어 있어야 한다', () => {
      const expectedCults = [
        'prism_stars', 'neon_crow', 'ink_cyclone', 'stella_club', 'card_cartel',
        'buddy_garden', 'glitch_paradise', 'cafe_encore', 'lunatic_circus', 'iron_beat'
      ];
      expect(Object.keys(AWAKENING_REQUIREMENTS)).toEqual(expectedCults);
    });

    it('TC-02: SSR 교단(prism_stars)은 친밀도 30, 소재 30, 시련 3성을 요구해야 한다', () => {
      const req = AWAKENING_REQUIREMENTS.prism_stars;
      expect(req.affinityLevel).toBe(30);
      expect(req.materialCount).toBe(30);
      expect(req.trialStars).toBe(3);
      expect(req.rarity).toBe('SSR');
    });

    it('TC-03: SR 교단(iron_beat)은 친밀도 25, 소재 25, 시련 2성을 요구해야 한다', () => {
      const req = AWAKENING_REQUIREMENTS.iron_beat;
      expect(req.affinityLevel).toBe(25);
      expect(req.materialCount).toBe(25);
      expect(req.trialStars).toBe(2);
      expect(req.rarity).toBe('SR');
    });

    it('TC-04: R 교단(cafe_encore)은 친밀도 20, 소재 20, 시련 1성을 요구해야 한다', () => {
      const req = AWAKENING_REQUIREMENTS.cafe_encore;
      expect(req.affinityLevel).toBe(20);
      expect(req.materialCount).toBe(20);
      expect(req.trialStars).toBe(1);
      expect(req.rarity).toBe('R');
    });

    it('TC-05: AWAKENING_STAGES는 0~5 단계가 올바르게 정의되어야 한다', () => {
      expect(AWAKENING_STAGES.WANDERER).toBe(0);
      expect(AWAKENING_STAGES.INTEREST).toBe(1);
      expect(AWAKENING_STAGES.INITIATION).toBe(2);
      expect(AWAKENING_STAGES.TRAINING).toBe(3);
      expect(AWAKENING_STAGES.OATH).toBe(4);
      expect(AWAKENING_STAGES.AWAKENED).toBe(5);
    });
  });

  // ────────────────────────────────────────
  // isWanderer()
  // ────────────────────────────────────────
  describe('isWanderer()', () => {
    it('TC-06: cult가 null인 영웅은 방랑자여야 한다', () => {
      const save = createMockSaveManager({ hero_1: { cult: null } });
      const sys = new AwakeningSystem(save);
      expect(sys.isWanderer('hero_1')).toBe(true);
    });

    it('TC-07: cult가 설정된 영웅은 방랑자가 아니어야 한다', () => {
      const save = createMockSaveManager({ hero_2: { cult: 'prism_stars' } });
      const sys = new AwakeningSystem(save);
      expect(sys.isWanderer('hero_2')).toBe(false);
    });

    it('TC-08: heroId가 null이면 방랑자로 취급해야 한다', () => {
      const sys = new AwakeningSystem();
      expect(sys.isWanderer(null)).toBe(true);
    });

    it('TC-09: 데이터가 없는 영웅(신규)은 방랑자여야 한다', () => {
      const save = createMockSaveManager({});
      const sys = new AwakeningSystem(save);
      expect(sys.isWanderer('unknown_hero')).toBe(true);
    });
  });

  // ────────────────────────────────────────
  // checkAffinityCondition()
  // ────────────────────────────────────────
  describe('checkAffinityCondition()', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-10: 친밀도가 요구치 미만이면 false를 반환해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 10);
      expect(sys.checkAffinityCondition('hero_1', 'cafe_encore')).toBe(false);
    });

    it('TC-11: 친밀도가 정확히 요구치와 같으면 true를 반환해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      expect(sys.checkAffinityCondition('hero_1', 'cafe_encore')).toBe(true);
    });

    it('TC-12: 유효하지 않은 cultId로 호출하면 false를 반환해야 한다', () => {
      expect(sys.checkAffinityCondition('hero_1', 'olympus')).toBe(false);
    });

    it('TC-13: heroId가 없으면 false를 반환해야 한다', () => {
      expect(sys.checkAffinityCondition(null, 'cafe_encore')).toBe(false);
    });
  });

  // ────────────────────────────────────────
  // checkMaterialCondition()
  // ────────────────────────────────────────
  describe('checkMaterialCondition()', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-14: 소재 충족 시 fulfilled: true를 반환해야 한다', () => {
      sys.addMaterials('hero_1', 'ink_cyclone', 25);
      const result = sys.checkMaterialCondition('hero_1', 'ink_cyclone');
      expect(result.fulfilled).toBe(true);
      expect(result.current).toBe(25);
      expect(result.required).toBe(25);
    });

    it('TC-15: 소재 부족 시 fulfilled: false를 반환해야 한다', () => {
      sys.addMaterials('hero_1', 'ink_cyclone', 10);
      const result = sys.checkMaterialCondition('hero_1', 'ink_cyclone');
      expect(result.fulfilled).toBe(false);
      expect(result.current).toBe(10);
    });

    it('TC-16: 유효하지 않은 cultId면 current/required 0, fulfilled: false를 반환해야 한다', () => {
      const result = sys.checkMaterialCondition('hero_1', 'tartarus');
      expect(result).toEqual({ current: 0, required: 0, fulfilled: false });
    });
  });

  // ────────────────────────────────────────
  // checkTrialCondition()
  // ────────────────────────────────────────
  describe('checkTrialCondition()', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-17: 시련 달성 별이 요구치 이상이면 true를 반환해야 한다', () => {
      sys.recordTrialResult('hero_1', 'cafe_encore', 1);
      expect(sys.checkTrialCondition('hero_1', 'cafe_encore')).toBe(true);
    });

    it('TC-18: 시련 달성 별이 요구치 미만이면 false를 반환해야 한다', () => {
      sys.recordTrialResult('hero_1', 'prism_stars', 2);
      // prism_stars는 3성 필요
      expect(sys.checkTrialCondition('hero_1', 'prism_stars')).toBe(false);
    });

    it('TC-19: recordTrialResult는 최고 별수만 저장해야 한다 (퇴보 불가)', () => {
      sys.recordTrialResult('hero_1', 'neon_crow', 3);
      sys.recordTrialResult('hero_1', 'neon_crow', 1); // 낮은 값 시도
      const data = sys._loadData('hero_1', 'neon_crow');
      expect(data.trialStars).toBe(3);
    });
  });

  // ────────────────────────────────────────
  // getAwakeningProgress()
  // ────────────────────────────────────────
  describe('getAwakeningProgress()', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-20: 초기 상태는 stage 0 (방랑자)여야 한다', () => {
      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.WANDERER);
    });

    it('TC-21: 친밀도 50% 달성 시 stage 1 (관심)이어야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 10); // 20 요구 중 10 = 50%
      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.INTEREST);
    });

    it('TC-22: 친밀도 100% 달성 시 stage 2 (입문)이어야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.INITIATION);
    });

    it('TC-23: 소재 50% 달성 시 stage 3 (수련)이어야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addMaterials('hero_1', 'cafe_encore', 10); // 20 중 10 = 50%
      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.TRAINING);
    });

    it('TC-24: 모든 조건 충족 시 stage 4 (서약)이어야 한다 (각성 실행 전)', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addMaterials('hero_1', 'cafe_encore', 20);
      sys.recordTrialResult('hero_1', 'cafe_encore', 1);
      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.OATH);
    });

    it('TC-25: 유효하지 않은 cultId는 stage 0을 반환해야 한다', () => {
      const progress = sys.getAwakeningProgress('hero_1', 'valhalla');
      expect(progress.stage).toBe(AWAKENING_STAGES.WANDERER);
    });
  });

  // ────────────────────────────────────────
  // executeAwakening()
  // ────────────────────────────────────────
  describe('executeAwakening()', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-26: 조건 미충족 시 success: false를 반환해야 한다', () => {
      const result = sys.executeAwakening('hero_1', 'cafe_encore');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('TC-27: 모든 조건 충족 시 success: true를 반환해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addMaterials('hero_1', 'cafe_encore', 20);
      sys.recordTrialResult('hero_1', 'cafe_encore', 1);
      const result = sys.executeAwakening('hero_1', 'cafe_encore');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('TC-28: 각성 완료 후 재시도하면 success: false를 반환해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addMaterials('hero_1', 'cafe_encore', 20);
      sys.recordTrialResult('hero_1', 'cafe_encore', 1);
      sys.executeAwakening('hero_1', 'cafe_encore');

      const result = sys.executeAwakening('hero_1', 'cafe_encore');
      expect(result.success).toBe(false);
    });

    it('TC-29: 각성 완료 후 stage는 5 (각성 완료)여야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addMaterials('hero_1', 'cafe_encore', 20);
      sys.recordTrialResult('hero_1', 'cafe_encore', 1);
      sys.executeAwakening('hero_1', 'cafe_encore');

      const progress = sys.getAwakeningProgress('hero_1', 'cafe_encore');
      expect(progress.stage).toBe(AWAKENING_STAGES.AWAKENED);
    });

    it('TC-30: 각성 성공 시 saveManager.updateHeroCult가 호출되어야 한다', () => {
      const save = createMockSaveManager({ hero_1: { cult: null } });
      const sysWithSave = new AwakeningSystem(save);
      sysWithSave.addAffinity('hero_1', 'cafe_encore', 20);
      sysWithSave.addMaterials('hero_1', 'cafe_encore', 20);
      sysWithSave.recordTrialResult('hero_1', 'cafe_encore', 1);
      sysWithSave.executeAwakening('hero_1', 'cafe_encore');

      expect(save.updateHeroCult).toHaveBeenCalledWith('hero_1', 'cafe_encore');
    });

    it('TC-31: 유효하지 않은 cultId로 각성 시도 시 error 메시지가 있어야 한다', () => {
      const result = sys.executeAwakening('hero_1', 'olympus');
      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은 교단');
    });

    it('TC-32: heroId 없이 호출 시 error 메시지가 있어야 한다', () => {
      const result = sys.executeAwakening(null, 'cafe_encore');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ────────────────────────────────────────
  // 캐시 및 싱글톤
  // ────────────────────────────────────────
  describe('캐시 관리', () => {
    it('TC-33: clearCache() 호출 후 데이터가 초기화되어야 한다', () => {
      const sys = new AwakeningSystem();
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.clearCache();
      // 캐시 초기화 후 재조회 시 0이어야 함
      const data = sys._loadData('hero_1', 'cafe_encore');
      expect(data.affinity).toBe(0);
    });

    it('TC-34: clearHeroCache()는 특정 영웅 캐시만 초기화해야 한다', () => {
      const sys = new AwakeningSystem();
      sys.addAffinity('hero_1', 'cafe_encore', 20);
      sys.addAffinity('hero_2', 'iron_beat', 15);
      sys.clearHeroCache('hero_1');

      const hero1Data = sys._loadData('hero_1', 'cafe_encore');
      const hero2Data = sys._loadData('hero_2', 'iron_beat');
      expect(hero1Data.affinity).toBe(0);
      expect(hero2Data.affinity).toBe(15);
    });

    it('TC-35: 내보낸 싱글톤 awakeningSystem이 AwakeningSystem 인스턴스여야 한다', () => {
      expect(awakeningSystem).toBeInstanceOf(AwakeningSystem);
    });
  });

  // ────────────────────────────────────────
  // addMaterials / addAffinity 범위 제한
  // ────────────────────────────────────────
  describe('진행도 갱신 — 범위 제한', () => {
    let sys;

    beforeEach(() => {
      sys = new AwakeningSystem();
    });

    it('TC-36: addAffinity는 요구치 초과 누적을 방지해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 100); // 요구치는 20
      const data = sys._loadData('hero_1', 'cafe_encore');
      expect(data.affinity).toBe(20);
    });

    it('TC-37: addMaterials는 요구치 초과 누적을 방지해야 한다', () => {
      sys.addMaterials('hero_1', 'cafe_encore', 100); // 요구치는 20
      const data = sys._loadData('hero_1', 'cafe_encore');
      expect(data.materials).toBe(20);
    });

    it('TC-38: addAffinity에 음수나 0을 넣으면 무시해야 한다', () => {
      sys.addAffinity('hero_1', 'cafe_encore', 10);
      sys.addAffinity('hero_1', 'cafe_encore', 0);
      sys.addAffinity('hero_1', 'cafe_encore', -5);
      const data = sys._loadData('hero_1', 'cafe_encore');
      expect(data.affinity).toBe(10);
    });

    it('TC-39: recordTrialResult에 범위 밖 별(0, 4)을 넣으면 무시해야 한다', () => {
      sys.recordTrialResult('hero_1', 'cafe_encore', 0);
      sys.recordTrialResult('hero_1', 'cafe_encore', 4);
      const data = sys._loadData('hero_1', 'cafe_encore');
      expect(data.trialStars).toBe(0);
    });
  });
});
