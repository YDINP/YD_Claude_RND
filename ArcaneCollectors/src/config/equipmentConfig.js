/**
 * equipmentConfig - 장비 상수 (Phaser 비의존)
 *
 * gameConfig.js는 Phaser와 전 Scene을 import하므로 브라우저 환경에서만 평가된다.
 * EquipmentSystem은 전투력 계산(ProgressionSystem)의 의존 대상이 되었으므로
 * 순수 상수만 이 모듈로 분리해 Phaser 의존성이 전파되지 않게 한다.
 * gameConfig.js는 하위 호환을 위해 이 값들을 그대로 re-export 한다.
 */

/** 장비 슬롯 정의 */
export const EQUIPMENT_SLOTS = {
  weapon: { name: '무기', icon: 'weapon' },
  armor: { name: '방어구', icon: 'armor' },
  accessory: { name: '악세서리', icon: 'accessory' },
  relic: { name: '유물', icon: 'relic' }
};

/** 장비 등급별 스탯 배율 */
export const EQUIPMENT_RARITY = {
  N: { name: 'N', color: 0x9CA3AF, multiplier: 1.0 },
  R: { name: 'R', color: 0x3B82F6, multiplier: 1.2 },
  SR: { name: 'SR', color: 0xA855F7, multiplier: 1.5 },
  SSR: { name: 'SSR', color: 0xF59E0B, multiplier: 2.0 }
};
