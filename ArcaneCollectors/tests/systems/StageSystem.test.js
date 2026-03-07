/**
 * StageSystem.test.js
 * Unit tests for StageSystem - Stage-Cult Integration
 * 15+ tests (TASK-E)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock stages.json
vi.mock("../../src/data/stages.json", () => ({
  default: {
    chapters: [
      {
        id: "chapter_1",
        name: "Test Chapter 1",
        nameEn: "Test Chapter 1",
        description: "Test",
        lore: "Test lore",
        stages: [
          { id: "1-1", name: "Stage 1-1", nameEn: "Stage 1-1", recommendedPower: 100, energyCost: 6,
            story_intro: "intro", story_clear: "clear",
            enemies: [{ id: "enemy_goblin", level: 1 }],
            rewards: { gold: 100, exp: 50, items: [] },
            drops: [], firstClearRewards: { gems: 30 },
            recommendedCult: "nature", cultBonus: { hp: 0.03, spd: 0.02 } },
          { id: "1-2", name: "Stage 1-2", nameEn: "Stage 1-2", recommendedPower: 150, energyCost: 6,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 120, exp: 60, items: [] },
            drops: [], firstClearRewards: { gems: 30 },
            recommendedCult: "nature", cultBonus: { hp: 0.03, spd: 0.02 } },
          { id: "1-3", name: "Stage 1-3 Elite", nameEn: "Stage 1-3 Elite",
            recommendedPower: 200, energyCost: 12, isElite: true,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 150, exp: 75, items: [] },
            drops: [], firstClearRewards: { gems: 30 },
            recommendedCult: "nature", cultBonus: { hp: 0.03, spd: 0.02 } },
          { id: "1-4", name: "Stage 1-4", nameEn: "Stage 1-4",
            recommendedPower: 500, energyCost: 6,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 300, exp: 150, items: [] },
            drops: [], firstClearRewards: { gems: 50 },
            recommendedCult: "nature", cultBonus: { hp: 0.03, spd: 0.02 } },
          { id: "1-5", name: "Stage 1-5 Boss", nameEn: "Stage 1-5 Boss",
            recommendedPower: 800, energyCost: 20, isBoss: true,
            story_intro: "intro", story_clear: "clear",
            enemies: [{ id: "enemy_boss_forest", level: 10 }],
            rewards: { gold: 500, exp: 250, items: [] },
            drops: [], firstClearRewards: { gems: 100 },
            recommendedCult: "nature", cultBonus: { hp: 0.05, spd: 0.03 } },
        ],
      },
      {
        id: "chapter_2",
        name: "Test Chapter 2",
        nameEn: "Test Chapter 2",
        description: "Test",
        lore: "Test lore",
        stages: [
          { id: "2-1", name: "Stage 2-1", nameEn: "Stage 2-1",
            recommendedPower: 1000, energyCost: 6,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 200, exp: 100, items: [] },
            drops: [], firstClearRewards: { gems: 30 },
            recommendedCult: "valhalla", cultBonus: { atk: 0.04, def: 0.02 } },
          { id: "2-5", name: "Stage 2-5 Boss", nameEn: "Stage 2-5 Boss",
            recommendedPower: 2000, energyCost: 20, isBoss: true,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 800, exp: 400, items: [] },
            drops: [], firstClearRewards: { gems: 100 },
            recommendedCult: "valhalla", cultBonus: { atk: 0.07, def: 0.04 } },
        ],
      },
      {
        id: "chapter_9",
        name: "Test Chapter 9",
        nameEn: "Final Balance",
        description: "Test",
        lore: "Test lore",
        stages: [
          { id: "9-5", name: "Heart of the Rift", nameEn: "Heart of the Rift",
            recommendedPower: 20000, energyCost: 20, isBoss: true,
            story_intro: "intro", story_clear: "clear", enemies: [],
            rewards: { gold: 15000, exp: 7500, items: [] },
            drops: [], firstClearRewards: { gems: 300 },
            recommendedCult: "balance", cultBonus: { atk: 0.12, def: 0.12 } },
        ],
      },
    ],
  },
}));

import { StageSystem } from "../../src/systems/StageSystem.js";

describe("StageSystem", () => {
  beforeEach(() => { StageSystem._reset(); });

  describe("getStageById()", () => {
    it("returns stage for valid ID", () => {
      const s = StageSystem.getStageById("1-1");
      expect(s).not.toBeNull();
      expect(s.id).toBe("1-1");
      expect(s.recommendedCult).toBe("nature");
    });
    it("returns null for non-existent ID", () => {
      expect(StageSystem.getStageById("99-99")).toBeNull();
    });
    it("includes chapterId in result", () => {
      expect(StageSystem.getStageById("2-1").chapterId).toBe("chapter_2");
    });
    it("boss stage has higher cultBonus", () => {
      const s = StageSystem.getStageById("1-5");
      expect(s.cultBonus).toEqual({ hp: 0.05, spd: 0.03 });
    });
  });

  describe("getChapterById()", () => {
    it("returns chapter for valid chapter ID", () => {
      const c = StageSystem.getChapterById("chapter_1");
      expect(c).not.toBeNull();
      expect(c.id).toBe("chapter_1");
    });
    it("returns null for non-existent chapter ID", () => {
      expect(StageSystem.getChapterById("chapter_99")).toBeNull();
    });
    it("chapter contains stages array", () => {
      const c = StageSystem.getChapterById("chapter_1");
      expect(Array.isArray(c.stages)).toBe(true);
      expect(c.stages.length).toBeGreaterThan(0);
    });
  });

  describe("calculateCultBonus()", () => {
    it("bonusApplied=false when party has no cult heroes", () => {
      const r = StageSystem.calculateCultBonus("1-1", []);
      expect(r.bonusApplied).toBe(false);
      expect(r.multiplier).toBe(1.0);
    });
    it("bonusApplied=true when party has matching cult hero", () => {
      const r = StageSystem.calculateCultBonus("1-1", [{ id: "h1", cultId: "nature" }]);
      expect(r.bonusApplied).toBe(true);
      expect(r.cultId).toBe("nature");
    });
    it("bonusApplied=false when party cult does not match", () => {
      const r = StageSystem.calculateCultBonus("1-1", [{ id: "h1", cultId: "valhalla" }]);
      expect(r.bonusApplied).toBe(false);
    });
    it("multiplier caps at 3 with 4 matching heroes", () => {
      const party = [{id:"h1",cultId:"nature"},{id:"h2",cultId:"nature"},{id:"h3",cultId:"nature"},{id:"h4",cultId:"nature"}];
      expect(StageSystem.calculateCultBonus("1-1", party).multiplier).toBe(3);
    });
    it("returns correct bonus object from stage data", () => {
      const r = StageSystem.calculateCultBonus("1-1", [{ id: "h1", cultId: "nature" }]);
      expect(r.bonus).toEqual({ hp: 0.03, spd: 0.02 });
    });
    it("returns empty bonus for non-existent stage", () => {
      const r = StageSystem.calculateCultBonus("99-99", []);
      expect(r.bonus).toEqual({});
    });
    it("boss stage has higher cultBonus than normal (nature)", () => {
      const party = [{ id: "h1", cultId: "nature" }];
      const nr = StageSystem.calculateCultBonus("1-1", party);
      const br = StageSystem.calculateCultBonus("1-5", party);
      expect(br.bonus.hp).toBeGreaterThan(nr.bonus.hp);
    });
  });

  describe("getActiveBonusForStage()", () => {
    it("matched=true for correct cult", () => {
      const r = StageSystem.getActiveBonusForStage("1-1", "nature");
      expect(r.matched).toBe(true);
      expect(r.bonus).toEqual({ hp: 0.03, spd: 0.02 });
    });
    it("matched=false for wrong cult", () => {
      const r = StageSystem.getActiveBonusForStage("1-1", "valhalla");
      expect(r.matched).toBe(false);
      expect(r.bonus).toEqual({});
    });
    it("matched=false for non-existent stage", () => {
      expect(StageSystem.getActiveBonusForStage("99-1", "nature").matched).toBe(false);
    });
    it("chapter 2 valhalla cult matches correctly", () => {
      const r = StageSystem.getActiveBonusForStage("2-1", "valhalla");
      expect(r.matched).toBe(true);
      expect(r.bonus).toEqual({ atk: 0.04, def: 0.02 });
    });
  });

  describe("isBossStage() / isEliteStage()", () => {
    it("identifies boss stage correctly", () => {
      expect(StageSystem.isBossStage("1-5")).toBe(true);
    });
    it("non-boss stage returns false", () => {
      expect(StageSystem.isBossStage("1-1")).toBe(false);
    });
    it("identifies elite stage correctly", () => {
      expect(StageSystem.isEliteStage("1-3")).toBe(true);
    });
    it("non-elite stage returns false", () => {
      expect(StageSystem.isEliteStage("1-1")).toBe(false);
    });
    it("non-existent stage returns false for isBossStage", () => {
      expect(StageSystem.isBossStage("99-99")).toBe(false);
    });
  });

  describe("getUnlockedStages()", () => {
    it("first stage always unlocked", () => {
      const u = StageSystem.getUnlockedStages("chapter_1", new Set());
      expect(u.length).toBeGreaterThanOrEqual(1);
      expect(u[0].id).toBe("1-1");
    });
    it("1-2 unlocks after clearing 1-1", () => {
      const u = StageSystem.getUnlockedStages("chapter_1", new Set(["1-1"]));
      expect(u.map(s=>s.id)).toContain("1-2");
    });
    it("returns empty for non-existent chapter", () => {
      expect(StageSystem.getUnlockedStages("chapter_99", new Set())).toEqual([]);
    });
  });

  describe("getChaptersByCult()", () => {
    it("returns chapters with nature cult", () => {
      const cs = StageSystem.getChaptersByCult("nature");
      expect(cs.length).toBeGreaterThan(0);
      expect(cs[0].id).toBe("chapter_1");
    });
    it("returns empty for unknown cult", () => {
      expect(StageSystem.getChaptersByCult("unknown_cult")).toEqual([]);
    });
  });

  describe("getAllChapters()", () => {
    it("returns all chapters array", () => {
      const cs = StageSystem.getAllChapters();
      expect(Array.isArray(cs)).toBe(true);
      expect(cs.length).toBeGreaterThan(0);
    });
  });

  describe("chapter 9 final boss - balance cult", () => {
    it("9-5 is boss stage with balance cult and max bonus", () => {
      const s = StageSystem.getStageById("9-5");
      expect(s).not.toBeNull();
      expect(s.isBoss).toBe(true);
      expect(s.recommendedCult).toBe("balance");
      expect(s.cultBonus).toEqual({ atk: 0.12, def: 0.12 });
    });
    it("balance cult hero activates bonus on 9-5", () => {
      const party = [{ id: "hero_balance", cultId: "balance" }];
      const r = StageSystem.calculateCultBonus("9-5", party);
      expect(r.bonusApplied).toBe(true);
      expect(r.bonus.atk).toBe(0.12);
      expect(r.bonus.def).toBe(0.12);
    });
  });
});
