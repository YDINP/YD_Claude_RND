#!/usr/bin/env node
/**
 * Build-time JSON Schema Validation Script
 * COMPAT-1.5: 빌드 전 데이터 검증
 *
 * Usage: npm run validate:data
 */

import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 색상 출력 헬퍼
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// AJV 초기화
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false
});

// 스키마 및 데이터 로드
function loadJSON(relativePath) {
  const fullPath = join(rootDir, relativePath);
  try {
    const content = readFileSync(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log(colors.red, `✗ Failed to load ${relativePath}: ${err.message}`);
    process.exit(1);
  }
}

// 검증 실행
function validateData(schemaPath, dataPath, name) {
  log(colors.cyan, `\nValidating ${name}...`);

  const schema = loadJSON(schemaPath);
  const data = loadJSON(dataPath);

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    log(colors.green, `✓ ${name} validation passed`);
    return true;
  } else {
    log(colors.red, `✗ ${name} validation failed:`);
    validate.errors.forEach(err => {
      const path = err.instancePath || 'root';
      console.log(colors.yellow, `  - ${path}: ${err.message}`);
      if (err.params && Object.keys(err.params).length > 0) {
        console.log(colors.yellow, `    params: ${JSON.stringify(err.params)}`);
      }
    });
    return false;
  }
}

// 메인 실행
log(colors.cyan, '=== Game Data Schema Validation ===');

const validations = [
  {
    schema: 'src/schemas/character.schema.json',
    data: 'src/data/characters.json',
    name: 'Characters'
  },
  {
    schema: 'src/schemas/enemy.schema.json',
    data: 'src/data/enemies.json',
    name: 'Enemies'
  },
  {
    schema: 'src/schemas/equipment.schema.json',
    data: 'src/data/equipment.json',
    name: 'Equipment'
  },
  {
    schema: 'src/schemas/synergy.schema.json',
    data: 'src/data/synergies.json',
    name: 'Synergies'
  }
];

const results = validations.map(v => validateData(v.schema, v.data, v.name));
const allValid = results.every(r => r === true);
const failedCount = results.filter(r => !r).length;

log(colors.cyan, '\n=== Validation Summary ===');
if (allValid) {
  log(colors.green, '✓ All data files passed validation!');
  process.exit(0);
} else {
  log(colors.red, `✗ ${failedCount} file(s) failed validation`);
  process.exit(1);
}
