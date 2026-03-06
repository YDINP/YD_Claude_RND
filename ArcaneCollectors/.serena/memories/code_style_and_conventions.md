# ArcaneCollectors - 코드 스타일 및 컨벤션

## 언어 및 모듈
- **JavaScript (ES Modules)** - `type: "module"` in package.json
- 모든 import/export는 ES Module 문법 사용
- 파일 확장자 `.js`를 import 시 명시적으로 포함

## 네이밍 규칙
- **파일명**: PascalCase (클래스 파일: `GachaSystem.js`, `BootScene.js`)
- **JSON 데이터 파일**: camelCase (`characters.json`, `banners.json`)
- **상수 파일**: camelCase (`constants.js`, `gameConfig.js`)
- **클래스명**: PascalCase (`SaveManager`, `BattleScene`, `Button`)
- **메서드/함수명**: camelCase (`calculatePower`, `getCharacter`)
- **상수 객체**: UPPER_SNAKE_CASE (`GAME_CONSTANTS`, `COLORS`, `LAYOUT`)
- **상수 객체 속성**: camelCase 또는 lowerCase (`maxPartySize`, `bgDark`)
- **이벤트 키**: UPPER_SNAKE_CASE (`BATTLE_START`, `HERO_ACQUIRED`)

## 코드 구조 패턴
- **Scene**: `Phaser.Scene`을 extends, constructor에서 `super({ key: 'SceneName' })` 호출
- **System**: 일반 class, 싱글톤 인스턴스를 export하는 패턴 사용
- **Service**: 개별 함수를 named export + 객체로 default export (모듈 패턴)
- **Component**: `Phaser.GameObjects.Container`를 extends
- **Data Index**: 개별 JSON import 후 접근 함수를 named/default export

## JSDoc 주석
- 공개 함수에 JSDoc 형식 주석 사용
- 한국어 설명 포함 (`@param`, `@returns` 태그 사용)
- 파일 상단에 모듈 설명 주석 블록

## 구분자
- 섹션 구분: `// ============================================` 패턴 사용
- 섹션 제목: `// Section Name` 또는 `// ==================== Section ====================`

## 들여쓰기
- 2 spaces (대부분의 파일)

## 한국어 사용
- 주석: 한국어
- 게임 내 텍스트/데이터: 한국어 (`name: '용감'`, `description: '용맹한 전사들의 낙원'`)
- 변수/함수/클래스명: 영어

## Barrel Export 패턴
- `index.js` 파일로 디렉토리별 export 관리
- `systems/index.js`, `components/index.js`, `data/index.js`

## 주의사항
- `gameConfig.js`와 `constants.js` 모두 게임 상수를 정의 (일부 중복 존재)
- `gameConfig.js`는 Phaser 설정 + 고수준 상수
- `constants.js`는 세부 게임 밸런스 상수
- Legacy 호환성 alias가 일부 존재 (예: `COLORS.rarityN`, `ELEMENTS`)
- 린터/포매터 설정 없음 (eslint, prettier 미사용)
