# Sprint 2 Wave 2 수동 테스트 시나리오

> **테스트 대상**: Sprint 2 Wave 2에서 구현된 6개 워크트리 (19개 태스크)
> **테스트 환경**: `http://localhost:3001` (Vite dev server)
> **브랜치**: `arcane/integration`
> **선행 조건**: `npm run dev` 실행 후 브라우저 접속
> **작성일**: 2026-02-09

---

## 테스트 준비 (공통)

### 디버그 모드 활성화
DEV 모드에서는 자동 활성화됩니다. 만약 비활성 상태라면:
```js
// F12 → Console 탭에서:
import('/src/systems/DebugManager.js').then(m => m.DebugManager.setDebugMode(true))
```

### 치트 명령어 (debug.xxx)
```js
debug.help()                    // 전체 명령어 목록
debug.maxResources()            // 골드/젬/소환권 MAX
debug.unlockAllCharacters()     // 91명 전체 해금
debug.clearAllStages()          // 전 스테이지 3성 클리어
debug.refillEnergy()            // 에너지 충전
debug.giveAllEquipment()        // 모든 장비 지급
debug.setInvincible(true)       // 무적 모드
debug.setOneHitKill(true)       // 원킬 모드
debug.freeGacha(true)           // 무료 가챠
```

### ESC 키 치트 패널
어떤 씬에서든 **ESC** 키를 누르면 GUI 치트 패널이 열립니다.

### 치트코드 (문자열 입력)
```js
debug.processCheatCode('GOLDRAIN')    // 골드 999,999
debug.processCheatCode('GODMODE')     // 무적
debug.processCheatCode('FORCESSR')    // 다음 가챠 SSR 확정
debug.processCheatCode('GEARUP')      // 전 장비 지급
```

---

## W1: 호환성 / 스키마 (COMPAT-1.3 + COMPAT-1.5)

### TC-W2-01: ownedHeroes 스키마 통일 (COMPAT-1.3)
**목적**: 영웅 데이터에 `equipment`, `constellation`, `acquiredAt` 필드가 존재하는지 확인
**단계**:
1. 게임 시작 → 메인메뉴
2. 콘솔: `debug.unlockAllCharacters()`
3. 영웅 목록(🦸) 진입 → 아무 영웅 선택 → 상세 화면
4. 콘솔에서 세이브 데이터 확인:
   ```js
   const save = JSON.parse(localStorage.getItem('arcane_collectors_save'))
   const firstHero = Object.values(save.characters)[0]
   console.log('equipment:', firstHero.equipment)
   console.log('constellation:', firstHero.constellation)
   console.log('acquiredAt:', firstHero.acquiredAt)
   ```

**기대 결과**:
- [ ] `equipment` 필드 존재 (`{ weapon: null, armor: null, accessory: null }` 또는 장착된 장비 ID)
- [ ] `constellation` 필드 존재 (숫자, 기본 0)
- [ ] `acquiredAt` 필드 존재 (타임스탬프)
- [ ] 콘솔에 에러 없음

### TC-W2-02: 레거시 세이브 마이그레이션 (COMPAT-1.3)
**목적**: 이전 형식 세이브 데이터가 자동 마이그레이션되는지 확인
**단계**:
1. 콘솔에서 레거시 형식 세이브 데이터 주입:
   ```js
   const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}')
   save.characters = save.characters || {}
   save.characters['char_001'] = { id: 'char_001', level: 5, rarity: 3 }  // 레거시: equipment/constellation 없음
   localStorage.setItem('arcane_collectors_save', JSON.stringify(save))
   ```
2. 페이지 새로고침 (F5)
3. 영웅 목록 진입 → char_001 선택
4. 세이브 데이터 다시 확인

**기대 결과**:
- [ ] 영웅 목록에서 char_001 정상 표시 (에러 없음)
- [ ] 마이그레이션 후 `equipment`, `constellation`, `acquiredAt` 필드 자동 추가됨
- [ ] 콘솔에 `[SaveManager]` 마이그레이션 로그 출력

### TC-W2-03: JSON Schema 빌드타임 검증 (COMPAT-1.5)
**목적**: `npm run validate:data` 명령으로 JSON 데이터 무결성 검증이 동작하는지 확인
**단계**:
1. 터미널에서 실행:
   ```bash
   cd D:/park/YD_Claude_RND-integration/ArcaneCollectors
   npm run validate:data
   ```
2. 출력 확인

**기대 결과**:
- [ ] 모든 스키마 검증 PASS (characters, enemies, equipment, synergies)
- [ ] `All game data validation passed!` 메시지 출력
- [ ] Exit code 0

---

## W2: TypeScript / 패턴 (TSO-4 + PAT-2 + PAT-4)

### TC-W2-04: data/index.ts TypeScript 전환 (TSO-4)
**목적**: data/index.ts가 TypeScript로 전환되어 타입 안전성이 보장되는지 확인
**단계**:
1. 터미널에서 타입체크 실행:
   ```bash
   npm run typecheck
   ```
2. `src/data/index.ts` 관련 타입 에러 확인

**기대 결과**:
- [ ] `data/index.ts` 관련 타입 에러 0개
- [ ] `getCharacter()`, `getEnemy()`, `getAllCharacters()` 등 반환 타입 정상

### TC-W2-05: HeroFactory 정규화 (PAT-4)
**목적**: HeroFactory.normalize()가 불완전한 데이터를 올바르게 정규화하는지 확인
**단계**:
1. 콘솔에서 직접 테스트:
   ```js
   import('/src/systems/HeroFactory.ts').then(m => {
     const result = m.HeroFactory.normalize({ id: 'char_001', level: 3 })
     console.log('Normalized:', result)
     console.log('Has stats:', !!result?.stats)
     console.log('Has equipment:', !!result?.equipment)
     console.log('Has skills:', Array.isArray(result?.skills))
   })
   ```
2. 결과 확인

**기대 결과**:
- [ ] `stats` 객체 존재 (hp, atk, def, spd)
- [ ] `equipment` 객체 존재 (weapon, armor, accessory)
- [ ] `skills` 배열 존재
- [ ] `rarityKey` 문자열 존재 (R/SR/SSR)
- [ ] `instanceId`, `characterId` 존재

### TC-W2-06: BattlePhaseManager 상태 전이 (PAT-2)
**목적**: 전투 페이즈가 올바른 순서로 전이되는지 확인
**단계**:
1. 파티 편성 (최소 1명) → 콘솔: `debug.unlockAllCharacters()`
2. 스테이지 선택 → 전투 진입
3. 콘솔에서 전투 로그 관찰:
   ```
   [Battle] Phase: INIT → TURN_START → ACTION_SELECT → ...
   ```
4. 전투 종료까지 관전

**기대 결과**:
- [ ] 페이즈 전이 순서가 논리적 (INIT→TURN_START→ACTION→EXECUTE→RESULT)
- [ ] 잘못된 전이 시도 시 경고 로그 (허용되지 않은 전이)
- [ ] 전투 종료 시 BATTLE_END 페이즈 도달

---

## W3: UI/UX (UIX-2.2.1 + UIX-2.3.1 + UIX-2.6.1)

### TC-W2-07: RadarChart 스탯 표시 (UIX-2.2.1)
**목적**: HeroDetailScene에서 4축 레이더 차트가 정상 렌더링되는지 확인
**단계**:
1. 콘솔: `debug.unlockAllCharacters()`
2. 메인메뉴 → 영웅(🦸) 클릭
3. 영웅 목록에서 아무 영웅 선택 (탭하여 상세 진입)
4. 스크롤하여 스탯 영역 확인

**기대 결과**:
- [ ] 4축 레이더 차트 표시 (HP / ATK / DEF / SPD)
- [ ] 각 축의 값이 캐릭터 스탯에 비례
- [ ] 차트 형태가 다이아몬드/다각형 (직선 연결)
- [ ] 차트 내부 반투명 채우기 존재
- [ ] 에러 없음

### TC-W2-08: EnhancedHPBar 전투 표시 (UIX-2.3.1)
**목적**: 전투 중 그라데이션 HP바가 정상 작동하는지 확인
**단계**:
1. 파티 편성 → 스테이지 진입
2. 전투 중 아군/적군 HP바 관찰
3. 데미지를 받으면 HP바 변화 확인
4. 힐 스킬 사용 시 회복 애니메이션 확인

**기대 결과**:
- [ ] HP바가 그라데이션 표시 (녹→노→빨)
- [ ] HP 감소 시 부드러운 애니메이션
- [ ] HP 바 위에 숫자 표시 (현재HP/최대HP)
- [ ] 버프 아이콘이 HP바 근처에 표시 (버프 활성 시)

### TC-W2-09: VirtualCardPool 스크롤 성능 (UIX-2.6.1)
**목적**: HeroListScene에서 대량 카드가 오브젝트 풀로 최적화되는지 확인
**단계**:
1. 콘솔: `debug.unlockAllCharacters()` (91명 전체 해금)
2. 영웅 목록 진입
3. 빠르게 위/아래 스크롤 수행 (터치 또는 마우스 휠)
4. 프레임 드롭 확인 (F12 → Performance 탭)

**기대 결과**:
- [ ] 91명 모두 목록에 표시됨
- [ ] 스크롤 시 끊김 없이 부드러움
- [ ] 화면 밖 카드가 자동 회수/재활용 (콘솔 로그에서 pool 활동 확인 가능)
- [ ] 메모리 급증 없음

---

## W4: VFX 파티클 (VFX-2.2 + VFX-2.3 + VFX-2.4)

### TC-W2-10: 분위기(Mood) 공격 이펙트 (VFX-2.2)
**목적**: 9가지 분위기별 고유 공격 파티클이 출력되는지 확인
**단계**:
1. 콘솔: `debug.unlockAllCharacters()` & `debug.maxResources()`
2. 다양한 분위기의 영웅으로 파티 편성:
   - brave / fierce / wild / calm / stoic / devoted / cunning / noble / mystic
3. 스테이지 진입 → 각 영웅의 공격 턴 관찰
4. 서로 다른 파티클 색상/형태 확인

**기대 결과**:
- [ ] 각 분위기별 색상이 구분됨 (예: brave=빨강, calm=파랑, mystic=보라)
- [ ] 공격 시 파티클이 공격자→대상 방향으로 이동
- [ ] 파티클이 일정 시간 후 사라짐 (메모리 누수 없음)
- [ ] 콘솔에 `[ParticleManager]` 관련 에러 없음

### TC-W2-11: 분위기 상성 이펙트 (VFX-2.3)
**목적**: 상성 유리/불리 시 시각적 표시가 나타나는지 확인
**단계**:
1. 콘솔: `debug.setMoodAdvantage(true)` (항상 상성 유리)
2. 스테이지 진입 → 공격 시 "유리!" 또는 특수 이펙트 확인
3. 콘솔: `debug.setMoodAdvantage(false)` 후 정상 상성 확인
4. 상성 불리 상황에서 "불리!" 표시 확인

**기대 결과**:
- [ ] 상성 유리 시 초록색/강조 이펙트 또는 텍스트 표시
- [ ] 상성 불리 시 빨간색/경고 이펙트 또는 텍스트 표시
- [ ] 중립 시 특별한 표시 없음
- [ ] `debug.viewMoodMatchup('brave', 'calm')` 으로 상성 배율 확인 가능

### TC-W2-12: 크리티컬/미스/버프/힐 이펙트 (VFX-2.4)
**목적**: 다양한 전투 이벤트에 고유 파티클이 출력되는지 확인
**단계**:
1. 파티 편성 → 스테이지 진입
2. 여러 턴 전투를 관전하면서 아래 이벤트 발생 확인:
   - **크리티컬 히트**: 큰 데미지 + 특수 이펙트
   - **미스**: 빗나감 텍스트
   - **힐**: 회복 시 녹색 파티클
   - **버프**: 버프 적용 시 상승 이펙트
   - **방어**: 방어 시 실드 이펙트

**기대 결과**:
- [ ] 크리티컬: 확대된 데미지 텍스트 + 강조 이펙트
- [ ] 미스: "MISS" 텍스트 표시
- [ ] 힐: 녹색 파티클 상승
- [ ] 버프: 아이콘 또는 상승 이펙트
- [ ] 각 이펙트가 중첩되어도 에러 없음

---

## W5: QA 테스트 (QAT-T3 + LOG)

### TC-W2-13: 유닛 테스트 전체 통과 확인
**목적**: 337개 유닛 테스트가 전부 통과하는지 확인
**단계**:
1. 터미널에서 실행:
   ```bash
   cd D:/park/YD_Claude_RND-integration/ArcaneCollectors
   npm test
   ```

**기대 결과**:
- [ ] 337/337 테스트 통과 (Tests: 337 passed)
- [ ] 실패 테스트 0개
- [ ] 새로 추가된 테스트 파일 확인:
  - `tests/systems/SaveManager.test.js` (19 tests)
  - `tests/systems/EnergySystem.test.js` (17 tests)
  - `tests/systems/SynergySystem.test.js` (16 tests)
  - `tests/systems/EquipmentSystem.test.js` (19 tests)
  - `tests/utils/errorPatterns.test.js` (12 tests)

### TC-W2-14: 스키마 검증 + 빌드 통합 테스트
**목적**: prebuild 스크립트(스키마 검증)가 빌드 파이프라인에 통합되었는지 확인
**단계**:
1. 터미널에서 빌드 실행:
   ```bash
   npm run build
   ```
2. 빌드 전 스키마 검증이 자동 실행되는지 확인

**기대 결과**:
- [ ] `prebuild` 스크립트가 자동 실행됨 (빌드 전 validate:data)
- [ ] 스키마 검증 통과 메시지 출력
- [ ] 빌드 성공 (dist/ 폴더 생성)

---

## W6: 연출 시퀀스 (VFX-1.3 + VFX-1.4 + VFX-4.2)

### TC-W2-15: 가챠 연출 (VFX-1.3)
**목적**: 소환 연출에 파티클 이펙트가 적용되었는지 확인
**단계**:
1. 콘솔: `debug.maxResources()` & `debug.freeGacha(true)`
2. 하단 네비 → 소환(🎲) 탭 클릭
3. 단일 소환 실행 → 연출 관찰
4. 10연 소환 실행 → 연출 관찰
5. SSR 확정: `debug.processCheatCode('FORCESSR')` 후 소환

**기대 결과**:
- [ ] 소환 시 카드 등장 애니메이션
- [ ] R/SR/SSR 등급별 이펙트 차이 (SSR이 가장 화려)
- [ ] 10연 소환 시 순차 카드 공개
- [ ] 연출 후 캐릭터가 보유 목록에 추가됨
- [ ] 에러 없음

### TC-W2-16: 전투 결과 연출 (VFX-1.4)
**목적**: 전투 승리/패배 시 결과 화면 연출이 적용되었는지 확인
**단계**:
1. 파티 편성 → 스테이지 진입
2. **승리 테스트**: `debug.setOneHitKill(true)` 후 전투 → 빠른 승리
3. 결과 화면의 이펙트 관찰 (경험치/골드 획득 애니메이션)
4. **패배 테스트**: `debug.setOneHitKill(false)`, 빈 파티 or 고난이도 진입
5. 패배 결과 화면 확인

**기대 결과**:
- [ ] 승리: "Victory!" 텍스트 + 축하 이펙트
- [ ] 경험치 바 채워지는 애니메이션
- [ ] 골드 획득 숫자 카운트업 애니메이션
- [ ] 패배: "Defeat" 텍스트 + 어두운 연출
- [ ] 결과 화면에서 메인으로/재도전 버튼 동작

### TC-W2-17: BottomNav 탭 전환 애니메이션 (VFX-4.2)
**목적**: 하단 네비게이션 탭 전환 시 언더라인 슬라이드 애니메이션 확인
**단계**:
1. 메인메뉴에서 하단 네비 확인 (홈/모험/가방/소환/더보기)
2. 각 탭을 순서대로 클릭
3. 언더라인(또는 선택 표시)이 슬라이드하면서 이동하는지 관찰
4. 빠르게 연속 클릭 시 애니메이션 겹침 여부 확인

**기대 결과**:
- [ ] 탭 전환 시 언더라인이 부드럽게 슬라이드 이동
- [ ] 활성 탭 색상/아이콘 변경
- [ ] 빠른 연속 클릭 시 깨지지 않음
- [ ] 씬 전환이 정상 동작 (각 탭이 올바른 씬으로 이동)

---

## 통합 시나리오: 전체 플로우 테스트

### TC-W2-18: 신규 유저 풀 플로우
**목적**: 처음부터 끝까지 전체 게임 흐름을 검증
**단계**:
1. 콘솔: `debug.resetAllData()` → 페이지 새로고침
2. 게임 시작 (BootScene → PreloadScene → LoginScene → MainMenuScene)
3. 영웅 목록 확인 (초기 캐릭터 존재 여부)
4. 스테이지 선택 → 1-1 전투 진입 → 전투 완료
5. 전투 결과 확인 (경험치/골드 획득)
6. 가챠 시도 (보석 사용)
7. 새 영웅 획득 시 영웅 상세 → RadarChart 확인
8. 영웅 장비 장착 시도

**기대 결과**:
- [ ] 전체 흐름에서 에러 없이 진행
- [ ] 각 씬 전환이 매끄러움
- [ ] 데이터가 정상 저장/로드됨

### TC-W2-19: 올인원 치트 풀 테스트
**목적**: 치트 시스템을 활용한 전체 기능 빠른 검증
**단계**:
1. ESC 키 → 치트 패널 열기
2. "리소스 MAX" 클릭
3. "전캐릭 해금" 클릭
4. "전스테이지 클리어" 클릭
5. ESC → 치트 패널 닫기
6. 영웅 목록 → 91명 확인 → 아무나 상세 보기 (RadarChart)
7. 파티 편성 → 다양한 분위기 영웅 배치
8. 고난이도 스테이지 진입 → 전투 관전 (이펙트 확인)
9. 가챠 (무료가챠 ON) → 연출 확인
10. 인벤토리 → 장비 확인
11. 퀘스트 → 일일퀘스트 확인
12. 무한탑 진입

**기대 결과**:
- [ ] ESC 치트 패널 정상 동작
- [ ] 모든 씬 전환에서 에러 없음
- [ ] 91명 영웅 목록 스크롤 부드러움
- [ ] 전투 이펙트 (Mood 파티클, 크리티컬, 상성) 정상
- [ ] 가챠 연출 정상
- [ ] 전체 기능 접근 가능

---

## 씬별 접근 경로 요약

| 씬 | 접근 경로 | 핵심 테스트 포인트 |
|----|----------|------------------|
| MainMenuScene | 게임 시작 (자동) | 리소스 표시, 콘텐츠 버튼, BottomNav |
| HeroListScene | 메인 → 영웅(🦸) | VirtualCardPool, 스크롤 성능, 91명 표시 |
| HeroDetailScene | 영웅 목록 → 탭 | RadarChart, 스탯, 장비 슬롯, COMPAT-1.3 |
| PartyEditScene | 메인 → 파티편성(👥) | 드래그 편성, 시너지 표시 |
| StageSelectScene | BottomNav → 모험(⚔️) | 챕터/스테이지 목록, 별 표시 |
| BattleScene | 스테이지 선택 → 전투 | EnhancedHPBar, ParticleManager, BattlePhase |
| BattleResultScene | 전투 완료 후 (자동) | 승리/패배 연출, 보상 표시 |
| GachaScene | BottomNav → 소환(🎲) | 소환 연출, R/SR/SSR 이펙트, 천장 |
| InventoryScene | 메인 → 가방(📦) 또는 BottomNav | 장비 목록, 강화 |
| QuestScene | 메인 → 퀘스트(📜) | 일일/주간 퀘스트, 보상 수령 |
| TowerScene | 메인 → 무한탑(🗼) | 층 표시, 전투 진입 |
| SettingsScene | 메인 → 설정(⚙️) 또는 BottomNav(더보기) | 옵션, 세이브 관리 |

---

## 디버그 명령어 빠른 참조 (G-1 ~ G-10)

| 카테고리 | 명령어 | 설명 |
|----------|--------|------|
| **G-1 리소스** | `debug.addGold(n)` | 골드 추가 |
| | `debug.addGems(n)` | 젬 추가 |
| | `debug.maxResources()` | 전체 MAX |
| **G-1 캐릭터** | `debug.unlockAllCharacters()` | 91명 해금 |
| | `debug.setCharacterLevel(id, lv)` | 레벨 설정 |
| | `debug.setCharacterStars(id, n)` | 성급 설정 |
| **G-2 진행도** | `debug.clearAllStages()` | 전 스테이지 3성 |
| | `debug.skipToChapter(n)` | n챕터 스킵 |
| **G-3 에너지** | `debug.refillEnergy()` | 에너지 충전 |
| | `debug.setInfiniteEnergy(true)` | 무한 에너지 |
| **G-4 가챠** | `debug.freeGacha(true)` | 무료 소환 |
| | `debug.setNextPullRarity('SSR')` | 등급 확정 |
| | `debug.setPityCounter(89)` | 천장 89로 |
| | `debug.simulateGacha(100)` | 100회 시뮬 |
| **G-5 장비** | `debug.giveAllEquipment()` | 전 장비 지급 |
| | `debug.setEnhanceAlwaysSuccess(true)` | 강화 100% |
| **G-6 탑** | `debug.clearAllTowerFloors()` | 전층 클리어 |
| | `debug.setTowerFloor(n)` | 층 이동 |
| **G-7 퀘스트** | `debug.completeAllDailyQuests()` | 일퀘 완료 |
| | `debug.claimAllQuestRewards()` | 보상 수령 |
| **G-8 세이브** | `debug.exportSave()` | JSON 다운로드 |
| | `debug.resetAllData()` | 전체 초기화 |
| | `debug.createBackup('name')` | 백업 생성 |
| **G-9 분위기** | `debug.setMoodAdvantage(true)` | 항상 유리 |
| | `debug.viewMoodMatchup(a, b)` | 상성 확인 |
| | `debug.viewActiveSynergies(ids)` | 시너지 확인 |
| **G-10 UI** | ESC 키 | 치트 패널 토글 |
| | `debug.help()` | 전체 명령어 표 |

---

## 치트코드 전체 목록 (25종)

```
debug.processCheatCode('코드') 로 실행

리소스:    GOLDRAIN / GEMSTORM / SUMMONALL
전투:      GODMODE / ONEPUNCH / SPEEDUP
진행도:    UNLOCKALL / CLEARALL
에너지:    FULLCHARGE / INFINERGY / SPEEDREGEN
가챠:      FREEPULL / PITY89 / FORCEPICKUP / FORCESSR
장비:      GEARUP / ENHANCE100
탑:        TOWERMAX / TOWERRESET
소탕/퀘:   SWEEPMAX / QUESTDONE
세이브:    SAVEEXPORT / BACKUP / RESETALL
분위기:    MOODPLUS / AUTOPARTY
```
