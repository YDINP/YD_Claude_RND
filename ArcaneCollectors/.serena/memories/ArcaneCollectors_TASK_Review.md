# ArcaneCollectors TASK 문서 검토 보고서

## 검토 대상
- D:\park\YD_Claude_RND-integration\ArcaneCollectors\docs\prd\05_TASKS_AB.md
- D:\park\YD_Claude_RND-integration\ArcaneCollectors\docs\prd\06_TASKS_CD.md
- D:\park\YD_Claude_RND-integration\ArcaneCollectors\docs\prd\07_TASKS_EF.md
- D:\park\YD_Claude_RND-integration\ArcaneCollectors\docs\prd\08_TASKS_GH.md

## 검토 일시: 2026-02-07

---

## [05_TASKS_AB.md] 검토 결과

### ✅ 정상 항목
- 팀별 추론 프로토콜이 체계적으로 정의됨
- TASK 간 의존성이 명확하게 표시됨
- 유저 상호작용 체인이 구체적으로 기술됨

### ❌ 문제점

**[HIGH] A-2 제목 (line 39): 구용어 "PersonalitySystem" 사용**
- 위치: `#### A-2: PersonalitySystem → BattleScene 완전 연결`
- 문제: v5.2에서 "personality"→"mood"로 변경되었으므로 시스템명도 `MoodSystem`이어야 함
- 코드 참조(line 47~50): PersonalitySystem 호출 명시
- 수정: `#### A-2: MoodSystem → BattleScene 완전 연결`
  - A-2.1: BattleScene에 MoodSystem import
  - A-2.2: MoodSystem.getMatchupMultiplier(attacker, defender) 호출

**[MEDIUM] A-2.5 (line 56): 용어 혼용**
- 현재: `A-2.5: 턴 오더 바에 성격 아이콘 표시`
- 수정: `A-2.5: 턴 오더 바에 분위기(mood) 아이콘 표시`

**[LOW] A-2.3 (line 54): Mystic 역할 모호**
- 현재: `- Mystic: 중립 흰색 표시`
- 확인 필요: Mystic이 실제로 상성 시스템에서 중립 역할인지, 아니면 다른 분위기와 상성 관계가 있는지

**[LOW] A-2 추론 체크리스트 (line 58~62): 완료 여부 불명확**
- [x] 항목들이 "결정"만 되고 실제 구현 여부 불명확
- 개선: "구현 완료" vs "결정만 됨" 명시

---

## [06_TASKS_CD.md] 검토 결과

### ✅ 정상 항목
- Element→Mood 마이그레이션이 명시적으로 계획됨
- GachaSystem 연동이 상세하게 기술됨
- 추론 체크리스트가 실용적임

### ❌ 문제점

**[HIGH] C-1 제목 (line 6): 용어 불완전**
- 현재: `#### C-1: data/index.js Element→Mood 전면 마이그레이션`
- 문제: "Element→Mood"만 언급되지만 C-1.5에서 "Element/Personality 함수 완전 삭제" 명시
- 수정: `#### C-1: data/index.js Element/Personality→Mood 전면 마이그레이션 (v5.2 업데이트)`

**[MEDIUM] C-7 위치 (line 101): TASK 소관 불명확**
- 현재: `#### C-7: DebugManager 통합 (TEAM G 협업)`
- 문제: DebugManager는 TEAM G의 소관이므로 이 항목이 TEAM C TASK에 왜 있는지 불명확
- 개선: 08_TASKS_GH.md의 G-1 또는 다른 위치로 이동 검토, 또는 협업 관계 명확화

**[LOW] C-2.9 (line 32): 인터페이스 미정의**
- 현재: `C-2.9: SaveManager에 saveGachaInfo() 메서드 추가`
- 개선: 함수 시그니처 명시
  - `saveGachaInfo(pityCount, lastPullTimestamp, bannerId)`

---

## [07_TASKS_EF.md] 검토 결과

### ✅ 정상 항목
- E-1~E-10: 캐릭터 데이터 확장 계획이 체계적
- F-6 (HeroDetailScene): 실제 코드 문제 3건을 정확히 지적 (C7, H7, H8)
- 추론 체크리스트들이 개발자 관점에서 실용적

### ❌ 문제점

**[HIGH] E-1.1 (line 8): 구용어 "personality" 사용**
- 현재: `E-1.1: 39명 캐릭터 필수 필드 완전성 검증 (..., rarity, personality, cult, ...)`
- 수정: `E-1.1: 39명 캐릭터 필수 필드 완전성 검증 (..., rarity, mood, cult, ...) ← personality→mood 마이그레이션 완료`

**[HIGH] E-2 제목 (line 18): 캐릭터 수 오류**
- 현재: `#### E-2: 누락 캐릭터 데이터 설계 (42명)`
- 현재 사양: 91명 = 39명(기존) + 52명(추가)
- 수정: `#### E-2: 누락 캐릭터 데이터 설계 (52명)`

**[HIGH] E-2.5 (line 25): 분위기 종류 불일치**
- 현재: `E-2.5: 성격(brave/cunning/calm/wild/mystic) 균등 분포` ← 5종만 나열
- 문제: 현재 사양은 9종 분위기
- 수정: `E-2.5: 분위기(brave/cunning/calm/wild/mystic/devoted/fierce/stoic/playful) 균등 분포` 또는 정확한 9종 목록

**[MEDIUM] E-4.4 (line 42): 용어 혼용**
- 현재: `E-4.4: 성격별 특화 스킬 효과`
- 수정: `E-4.4: 분위기(mood)별 특화 스킬 효과`

**[HIGH] E-7.2 (line 66): 시너지 조합 계산 오류**
- 현재: `E-7.2: 성격 시너지 10개로 확장 (5C2 = 10개 조합)`
- 문제: 5종이 아니라 9종 분위기라면 9C2 = 36개 조합
- 수정 옵션:
  - 옵션A: `E-7.2: 분위기 시너지 36개로 확장 (9C2 = 36개 조합)`
  - 옵션B: 대표 조합만 선택하기 (예: 10~15개 주요 조합)

**[LOW] E-9 제목 (line 78): N등급 수량 불일치**
- E-2.2: `N등급 캐릭터 15명 추가`
- E-9: `#### E-9: N등급 캐릭터 설계 (16명)`
- 수정: 15명과 16명 통일

**[HIGH] E-6.6 (line 61): 마이그레이션 상태 불명확**
- 현재: `E-6.6: 적 mood 분위기 부여 (enemies.json element→mood 마이그레이션, 상성 시스템 활용)`
- 문제: 이미 완료된 마이그레이션인지, 앞으로 해야 할 작업인지 불명확
- 확인 필요: 현재 enemies.json 상태 검토

---

## [08_TASKS_GH.md] 검토 결과

### ✅ 정상 항목
- G-1에서 require()→import() ES Modules 마이그레이션 명시 (중요)
- G-2에서 stages.json 5챕터×5스테이지 연동 명확
- H-2에서 91명 캐릭터 이미지 에셋 계획 체계적

### ❌ 문제점

**[MEDIUM] G-9 API 명명 (line 103~104): 구용어 사용**
- 현재:
  ```javascript
  static setPersonalityAdvantage(enabled)
  static viewPersonalityMatchup(a, b)
  ```
- 수정:
  ```javascript
  static setMoodAdvantage(enabled)
  static viewMoodMatchup(a, b)
  ```

**[LOW] H-2.2 (line 145): 교단 비주얼 가이드 불완전**
- 현재: `H-2.2: 교단별 비주얼 가이드 (olympus: 그리스/금색, takamagahara: 벚꽃, valhalla: 바이킹 등)`
- 문제: 9교단 중 3개만 예시, 나머지 6개(asgard, babylon, pantheon, jade_empire, underworld, celestial) 누락
- 수정: 9교단 전체 비주얼 가이드 작성

---

## 종합 요약

### 심각도별 분류

#### HIGH (즉시 수정 필수) - 6건
1. 05_TASKS_AB.md, A-2: `PersonalitySystem` → `MoodSystem` 변경
2. 06_TASKS_CD.md, C-1: 제목 "Element/Personality→Mood" 명시
3. 07_TASKS_EF.md, E-1.1: 필드명 `personality` → `mood`
4. 07_TASKS_EF.md, E-2: 제목 "42명" → "52명"
5. 07_TASKS_EF.md, E-2.5: 5종 → 9종 분위기 업데이트
6. 07_TASKS_EF.md, E-7.2: 10개 조합 → 36개 조합 또는 대표 조합 선정

#### MEDIUM (개발 전 검토) - 4건
1. 05_TASKS_AB.md, A-2.5: 용어 "성격" → "분위기(mood)" 통일
2. 06_TASKS_CD.md, C-7: DebugManager TASK 위치 재검토
3. 07_TASKS_EF.md, E-4.4: 용어 "성격" → "분위기(mood)"
4. 08_TASKS_GH.md, G-9: API 명명 `setPersonalityAdvantage` → `setMoodAdvantage`

#### LOW (개선 권장) - 4건
1. 05_TASKS_AB.md, A-2.3: Mystic 역할 명확화
2. 06_TASKS_CD.md, C-2.9: `saveGachaInfo()` 시그니처 명시
3. 07_TASKS_EF.md, E-9: N등급 15명 vs 16명 통일
4. 08_TASKS_GH.md, H-2.2: 9교단 비주얼 가이드 작성

### 모호한 요구사항 (추가 확인 필요)
1. **E-6.6**: enemies.json의 mood 마이그레이션 완료 여부
2. **A-2 체크리스트**: [x] 항목들이 구현 완료인지 결정만 된 것인지
3. **E-7.2**: 36개 전체 시너지를 만들 것인지, 대표 조합만 선택할 것인지

### ✅ 우수 사례
- **F-6 (HeroDetailScene)**: 실제 코드 문제 C7, H7, H8을 정확히 발견하고 수정 방향 제시
  - C7: SaveManager 미호출로 인한 데이터 손실
  - H7: Dead Import (EquipmentSystem, ProgressionSystem)
  - H8: 빈 슬롯 클릭 시 UI 미구현
