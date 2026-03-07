import { describe, it, expect, beforeAll } from "vitest";
import cultMaterialsData from "../../src/data/cult-materials.json";
import { AwakeningSystem, AWAKENING_REQUIREMENTS } from "../../src/systems/AwakeningSystem.js";

const VALID_CULTS = ["prism_stars", "neon_crow", "ink_cyclone", "stella_club", "card_cartel", "buddy_garden", "glitch_paradise", "cafe_encore", "lunatic_circus", "iron_beat"];
const SSR_CULTS = ["prism_stars", "neon_crow", "stella_club", "lunatic_circus"];
const SR_CULTS = ["ink_cyclone", "card_cartel", "buddy_garden", "glitch_paradise", "iron_beat"];
const R_CULTS = ["cafe_encore"];
const VALID_DROP_SOURCES = ["stage", "event", "trial", "reward", "dungeon", "raid", "shop", "gacha"];

describe("cult-materials.json - TC-M01~M05: File Structure", () => {
  it("TC-M01: materials key exists", () => {
    expect(cultMaterialsData).toHaveProperty("materials");
    expect(typeof cultMaterialsData.materials).toBe("object");
  });

  it("TC-M02: all 10 cults are present", () => {
    const keys = Object.keys(cultMaterialsData.materials);
    expect(keys).toHaveLength(10);
    VALID_CULTS.forEach(cultId => {
      expect(cultMaterialsData.materials).toHaveProperty(cultId);
    });
  });

  it("TC-M03: cult_imprint_stone top-level entry exists", () => {
    expect(cultMaterialsData).toHaveProperty("cult_imprint_stone");
    const stone = cultMaterialsData.cult_imprint_stone;
    expect(stone.id).toBe("cult_imprint_stone");
    expect(Array.isArray(stone.applicableCults)).toBe(true);
    SSR_CULTS.forEach(c => expect(stone.applicableCults).toContain(c));
  });

  it("TC-M04: _meta block present with version", () => {
    expect(cultMaterialsData).toHaveProperty("_meta");
    expect(cultMaterialsData._meta).toHaveProperty("version");
    expect(cultMaterialsData._meta.totalMaterials).toBe(10);
  });

  it("TC-M05: _meta rarity counts are correct", () => {
    const m = cultMaterialsData._meta;
    expect(m.ssrMaterials).toBe(4);
    expect(m.srMaterials).toBe(5);
    expect(m.rMaterials).toBe(1);
  });
});

describe("cult-materials.json - TC-M06~M10: Schema Field Validation", () => {
  const requiredFields = ["id", "cultId", "nameKr", "nameEn", "icon", "description", "requiredCount", "rarity", "dropSources"];

  it("TC-M06: all cults have required fields", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      requiredFields.forEach(field => {
        expect(mat, cultId + " missing " + field).toHaveProperty(field);
      });
    });
  });

  it("TC-M07: cultId field matches key", () => {
    VALID_CULTS.forEach(cultId => {
      expect(cultMaterialsData.materials[cultId].cultId).toBe(cultId);
    });
  });

  it("TC-M08: id field follows material_cultId format", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.id).toBe("material_" + cultId);
    });
  });

  it("TC-M09: dropSources are valid enum values", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(Array.isArray(mat.dropSources)).toBe(true);
      expect(mat.dropSources.length).toBeGreaterThan(0);
      mat.dropSources.forEach(src => {
        expect(VALID_DROP_SOURCES, cultId + ": invalid source " + src).toContain(src);
      });
    });
  });

  it("TC-M10: icon field is non-empty string", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(typeof mat.icon).toBe("string");
      expect(mat.icon.length).toBeGreaterThan(0);
    });
  });
});

describe("cult-materials.json - TC-M11~M13: GDD Compliance", () => {
  it("TC-M11: nameKr matches AWAKENING_REQUIREMENTS.materialName", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      const req = AWAKENING_REQUIREMENTS[cultId];
      expect(mat.nameKr).toBe(req.materialName);
    });
  });

  it("TC-M12: requiredCount matches AWAKENING_REQUIREMENTS.materialCount", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      const req = AWAKENING_REQUIREMENTS[cultId];
      expect(mat.requiredCount).toBe(req.materialCount);
    });
  });

  it("TC-M13: rarity matches AWAKENING_REQUIREMENTS.rarity", () => {
    VALID_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      const req = AWAKENING_REQUIREMENTS[cultId];
      expect(mat.rarity).toBe(req.rarity);
    });
  });
});

describe("cult-materials.json - TC-M14~M19: Rarity Consistency", () => {
  it("TC-M14: SSR cults have rarity SSR and requiredCount 30", () => {
    SSR_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.rarity).toBe("SSR");
      expect(mat.requiredCount).toBe(30);
    });
  });

  it("TC-M15: SR cults have rarity SR and requiredCount 25", () => {
    SR_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.rarity).toBe("SR");
      expect(mat.requiredCount).toBe(25);
    });
  });

  it("TC-M16: R cults have rarity R and requiredCount 20", () => {
    R_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.rarity).toBe("R");
      expect(mat.requiredCount).toBe(20);
    });
  });

  it("TC-M17: SSR cults have imprintStone true", () => {
    SSR_CULTS.forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.imprintStone).toBe(true);
    });
  });

  it("TC-M18: non-SSR cults do not have imprintStone true", () => {
    [...SR_CULTS, ...R_CULTS].forEach(cultId => {
      const mat = cultMaterialsData.materials[cultId];
      expect(mat.imprintStone).not.toBe(true);
    });
  });

  it("TC-M19: cult_imprint_stone requiredCount is 1", () => {
    expect(cultMaterialsData.cult_imprint_stone.requiredCount).toBe(1);
    expect(cultMaterialsData.cult_imprint_stone.rarity).toBe("SSR");
  });
});

describe("AwakeningSystem.getMaterialInfo - TC-M20~M25: Integration", () => {
  let system;
  beforeAll(() => {
    system = new AwakeningSystem(null);
  });

  it("TC-M20: getMaterialInfo returns object for valid cultId", () => {
    const result = system.getMaterialInfo("prism_stars");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  it("TC-M21: getMaterialInfo prism_stars returns correct data", () => {
    const result = system.getMaterialInfo("prism_stars");
    expect(result.nameKr).toBe(AWAKENING_REQUIREMENTS.prism_stars.materialName);
    expect(result.requiredCount).toBe(30);
    expect(result.rarity).toBe("SSR");
    expect(result.imprintStone).toBe(true);
  });

  it("TC-M22: getMaterialInfo cafe_encore returns correct data", () => {
    const result = system.getMaterialInfo("cafe_encore");
    expect(result.nameKr).toBe(AWAKENING_REQUIREMENTS.cafe_encore.materialName);
    expect(result.requiredCount).toBe(20);
    expect(result.rarity).toBe("R");
  });

  it("TC-M23: getMaterialInfo returns null for invalid cultId", () => {
    expect(system.getMaterialInfo("invalid_cult")).toBeNull();
    expect(system.getMaterialInfo("")).toBeNull();
    expect(system.getMaterialInfo(null)).toBeNull();
    expect(system.getMaterialInfo(undefined)).toBeNull();
  });

  it("TC-M24: getMaterialInfo all 10 cults return non-null", () => {
    VALID_CULTS.forEach(cultId => {
      const result = system.getMaterialInfo(cultId);
      expect(result, "getMaterialInfo(" + cultId + ") should not be null").not.toBeNull();
    });
  });

  it("TC-M25: getMaterialInfo nameKr consistent with AWAKENING_REQUIREMENTS.materialName", () => {
    VALID_CULTS.forEach(cultId => {
      const result = system.getMaterialInfo(cultId);
      const expected = AWAKENING_REQUIREMENTS[cultId].materialName;
      expect(result.nameKr).toBe(expected);
    });
  });
});
