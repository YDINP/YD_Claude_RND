/**
 * JSON Schema Validator
 * COMPAT-1.5: 빌드 타임 + 런타임 데이터 검증
 */
import Ajv from 'ajv';
import GameLogger from '../utils/GameLogger.js';

// Schema imports
import characterSchema from './character.schema.json';
import enemySchema from './enemy.schema.json';
import equipmentSchema from './equipment.schema.json';
import synergySchema from './synergy.schema.json';

// Data imports
import charactersData from '../data/characters.json';
import enemiesData from '../data/enemies.json';
import equipmentData from '../data/equipment.json';
import synergiesData from '../data/synergies.json';

// AJV 인스턴스 생성
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false
});

// 스키마 컴파일
const validateCharacters = ajv.compile(characterSchema);
const validateEnemies = ajv.compile(enemySchema);
const validateEquipment = ajv.compile(equipmentSchema);
const validateSynergies = ajv.compile(synergySchema);

/**
 * 검증 결과 로깅 헬퍼
 * @param {string} dataType - 데이터 타입 (characters, enemies, equipment, synergies)
 * @param {boolean} valid - 검증 결과
 * @param {Array} errors - AJV 에러 배열
 */
function logValidationResult(dataType, valid, errors) {
  if (valid) {
    GameLogger.log('SCHEMA', `✓ ${dataType}.json 검증 성공`);
  } else {
    GameLogger.warn('SCHEMA', `✗ ${dataType}.json 검증 실패:`);
    errors.forEach(err => {
      const path = err.instancePath || 'root';
      const message = err.message;
      const params = JSON.stringify(err.params);
      console.warn(`  - ${path}: ${message} ${params}`);
    });
  }
  return valid;
}

/**
 * Characters.json 검증
 * @returns {boolean} 검증 성공 여부
 */
export function validateCharactersData() {
  const valid = validateCharacters(charactersData);
  return logValidationResult('characters', valid, validateCharacters.errors || []);
}

/**
 * Enemies.json 검증
 * @returns {boolean} 검증 성공 여부
 */
export function validateEnemiesData() {
  const valid = validateEnemies(enemiesData);
  return logValidationResult('enemies', valid, validateEnemies.errors || []);
}

/**
 * Equipment.json 검증
 * @returns {boolean} 검증 성공 여부
 */
export function validateEquipmentData() {
  const valid = validateEquipment(equipmentData);
  return logValidationResult('equipment', valid, validateEquipment.errors || []);
}

/**
 * Synergies.json 검증
 * @returns {boolean} 검증 성공 여부
 */
export function validateSynergiesData() {
  const valid = validateSynergies(synergiesData);
  return logValidationResult('synergies', valid, validateSynergies.errors || []);
}

/**
 * 모든 게임 데이터 검증 (개발 모드 전용)
 * @returns {Object} { success: boolean, results: Object }
 */
export function validateAllGameData() {
  GameLogger.log('SCHEMA', '=== 게임 데이터 스키마 검증 시작 ===');

  const results = {
    characters: validateCharactersData(),
    enemies: validateEnemiesData(),
    equipment: validateEquipmentData(),
    synergies: validateSynergiesData()
  };

  const allValid = Object.values(results).every(v => v === true);
  const failedCount = Object.values(results).filter(v => !v).length;

  if (allValid) {
    GameLogger.log('SCHEMA', '✓ 모든 데이터 검증 성공!');
  } else {
    GameLogger.warn('SCHEMA', `✗ ${failedCount}개 데이터 검증 실패`);
  }

  return { success: allValid, results };
}

export default {
  validateCharacters: validateCharactersData,
  validateEnemies: validateEnemiesData,
  validateEquipment: validateEquipmentData,
  validateSynergies: validateSynergiesData,
  validateAll: validateAllGameData
};
