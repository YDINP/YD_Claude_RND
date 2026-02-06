# 부록 A~B: 사양 불일치 결정 + 변경이력
> 원본: PRD_Unified_v5.md 부록 (lines 2089-end)

## 부록 A: PRD 버전 간 사양 불일치 — 최종 결정 (v5.1 확정)

> 아래 항목들은 PRD v1~v4 문서 간 상충했던 사양입니다. **코드 분석 근거**와 **게임 디자인 원칙**에 기반하여 최종 결정되었습니다.

### A-1. 에너지 최대치 → `100 + (레벨 × 2)`
- **PRD v1~v2**: 최대 50 고정
- **PRD v3~v4**: `100 + (레벨 × 2)`
- **코드**: `ENERGY.BASE_MAX = 100`, `ENERGY.PER_LEVEL = 2` / `GAME_CONSTANTS.baseMaxEnergy = 100`
- **결정 근거**: 코드에 이미 구현 완료. 레벨링 보상감과 장기 플레이 유인력 확보. 50은 MVP 시절 잔재.
- **영향 TASK**: C-4 (EnergySystem 통합)

### A-2. 스테이지 에너지 비용 → 타입별 고정 (NORMAL:6, ELITE:12, BOSS:20)
- **PRD v1~v2**: `챕터×2 + 스테이지번호` (가변)
- **PRD v3~v4**: 일반:6, 엘리트:12, 보스:20
- **코드**: `STAGE_ENERGY_COST = { NORMAL: 6, ELITE: 12, BOSS: 20 }`
- **결정 근거**: 타입별 고정이 UX 예측가능성 높음. 챕터 진행 시 에너지 부담 비선형 급증 방지.
- **영향 TASK**: C-4, A-2 (스테이지 전투 진입)

### A-3. 데미지 공식 → `ATK × 배율 × (1 - DEF/1000)` (최소 10%)
- **PRD v1~v2**: `ATK × 배율 - DEF × 0.5` (감산형)
- **PRD v3~v4**: `ATK × 배율 × (1 - DEF/1000)` (배율형)
- **코드**: BattleSystem.calculateDamage()에 배율형 구현, `defReduction = min(0.9, DEF/1000)`
- **⚠️ 추가 발견**: BattleScene.js의 자체 데미지 로직은 `1 - DEF/(DEF+200)` 사용 → **BattleSystem과 불일치!**
  - BattleSystem: `1 - DEF/1000` (선형 감소, 최소 10%)
  - BattleScene 자동전투: `1 - DEF/(DEF+200)` (비선형, 최소 없음)
  - BattleScene 수동스킬: `1 - DEF/(DEF+200)` + 크리티컬 25% 고정
- **결정**: `ATK × 배율 × (1 - DEF/1000, min 10%)` 통일 — BattleScene의 자체 로직 삭제, BattleSystem으로 일원화
- **결정 근거**: 배율형이 DEF 스케일링에 안정적. DEF+200 공식은 의도치 않은 비선형 스케일링 발생.
- **영향 TASK**: A-1 (BattleSystem ↔ BattleScene 연결) — 데미지 공식 통일 포함

### A-4. 장비 강화 → +15 상한, 실패률 있음
- **PRD v1~v2**: +15, 성공률 감소형
- **PRD v3~v4**: +20, 실패 없음
- **코드**: `MAX_ENHANCE_LEVEL = 15`, `successRate = max(0.3, 1.0 - level × 0.05)`
- **결정 근거**: +15+실패가 이미 구현. 실패 시스템이 전략적 깊이 제공. +20 무실패는 콘텐츠 소진 가속화.
- **영향 TASK**: E-7 (장비 데이터 확장)

### A-5. Mystic 성격 → 모든 대상에 +10% (1.1x)
- **PRD v1~v2**: ×1.0 (완전 중립)
- **PRD v3~v4**: +10% 고정 보너스
- **코드**: `PERSONALITY_DAMAGE.MYSTIC_BONUS = 1.1`, `PERSONALITIES.mystic.specialEffect: '모든 성격에 +10% 데미지'`
- **결정 근거**: 3곳(constants.js, gameConfig.js, SynergySystem.js)에서 일관적으로 +10% 구현. 가위바위보 상성에서 제외되는 대신 범용 보너스.
- **영향 TASK**: A-1, A-3 (PersonalitySystem 전투 연동)

### A-6. 별 평가 → 3단계 복합 기준 (HP잔존율 + 턴 제한)
- **PRD v1~v2**: 전원생존 + 10턴 이내 = 3성
- **PRD v3~v4**: 파티 손상도 ≤ 10% = 3성
- **코드**: `const newStars = 3; // TODO: Calculate based on performance` → **미구현**
- **결정**: 두 버전의 장점 통합
  - ★★★: 파티 총HP ≥ 70% + 턴 제한 이내 클리어
  - ★★: 파티 총HP ≥ 30% + 클리어
  - ★: 클리어 (조건 불문)
- **결정 근거**: HP 기준이 직관적, 턴 제한이 전략적 긴장감 부여. 모바일 RPG 표준 3단계.
- **영향 TASK**: A-1 (전투 결과 계산), F-3 (StageSelectScene 별 표시)

### A-7. 하단 네비게이션 → 홈/모험/소환/영웅/더보기 (5탭)
- **PRD v1~v2**: 모험/소환/영웅/상점/메뉴 (5탭)
- **PRD v3~v4**: 홈/모험/가방/소환/더보기 (5탭)
- **코드**: 모험/소환/영웅/메뉴 (**4탭만 구현**)
- **결정**: `홈 | 모험 | 소환 | 영웅 | 더보기`
  - 홈: MainMenuScene (메인 대시보드)
  - 모험: StageSelectScene
  - 소환: GachaScene
  - 영웅: HeroListScene
  - 더보기: 설정/상점/퀘스트/가방 서브메뉴
- **결정 근거**: 모바일 RPG 표준 5탭. '홈' 복귀 필수. '더보기'로 확장성 확보.
- **영향 TASK**: B-1 (UI 공통 컴포넌트), F-1 (MainMenuScene 검증)

### A-8. 교단-분위기 보너스 → 9조합 ×1.15 확정 (9교단 × 9분위기 매트릭스)
- **PRD v1~v2**: 미정의
- **PRD v3~v4**: 5조합 정의 (발할라+Brave, 타카마가하라+Mystic, 올림푸스+Cunning, 아스가르드+Calm, 요미+Wild)
- **PRD v5.3**: 9조합으로 확장 (9교단 × 9분위기 1:1 매핑)
  - 발할라(valhalla) + 열혈(brave)
  - 올림푸스(olympus) + 냉철(cunning)
  - 타카마가하라(takamagahara) + 신비(mystic)
  - 아스가르드(asgard) + 고요(calm)
  - 요미(yomi) + 광폭(wild)
  - 타르타로스(tartarus) + 격렬(fierce)
  - 아발론(avalon) + 의연(stoic)
  - 헬하임(helheim) + 헌신(devoted)
  - 곤륜(kunlun) + 고결(noble)
- **코드 불일치 3건** (v5.2까지):
  1. `constants.js`: 정확한 교단명, 1:1 매핑 ×1.15 — **정본(Canon)**
  2. `PersonalitySystem.js`: **잘못된 교단명** (SHADOW/FLAME/FROST/NATURE/VOID 사용) → ✅ v5.3에서 수정 완료
  3. `personalities.json`: 교단당 최적 분위기 **2개**, 스탯 보너스 구조 다름 → ✅ v5.3에서 constants.js 기준 통일
- **결정**: `constants.js` 기준 9조합 ×1.15 확정. MoodSystem 교단명 수정 완료, moods.json 1:1 매핑으로 통일 완료.
- **영향 TASK**: A-3 (MoodSystem 통합 ✅ 완료), C-1 (synergies.json 데이터 보강), C-2 (moods.json 재구성 ✅ 완료)

## 부록 B: 버전 변경 이력 요약

| 항목 | v1 (MVP) | v2 | v3 | v4 (최종) |
|------|----------|----|----|-----------|
| 파티 인원 | 5명 | 5명 | 5명 | **4명** |
| 속성 체계 | Fire/Water/Wind/Light/Dark | 동일 | 동일+교단 | **분위기(Mood) 5종** (v5.2) |
| 저장 방식 | LocalStorage | 동일 | 동일 | **Supabase+localStorage** |
| 해상도 | 미지정 | 480×854 | 480×854 | **720×1280** |
| 에너지 시스템 | 없음 | 없음 | 없음 | **신규** |
| 소탕 기능 | 없음 | 없음 | 없음 | **신규** |
| 장비 슬롯 | 3개 | 3개 | **4개(+유물)** | 4개 |
| 전투 방식 | 자동전투 | 턴제 자동 | **카드덱 스킬** | 카드덱 유지 |
| 스테이지 | 1챕터 10스테이지 | 동일 | 미변경 | **5챕터 25스테이지** |
| 상성 배율 | 미지정 | ±25% | ±25% | **±20%(분위기)** |

### 부록 B-2: v5.2 변경 사항 요약

| 변경 항목 | v5.0~v5.1 | **v5.2** |
|----------|-----------|----------|
| 특성 시스템 명칭 | 성격(Personality) | **분위기(Mood)** |
| 코드 필드명 | `personality` | **`mood`** |
| 한글명 | 용감/교활/침착/야성/신비 | **열혈/냉철/고요/광폭/신비** |
| 속성(Element) | 코드에 잔존 (119개 참조) | **완전 삭제** |
| Mystic 배율 | ×1.0 (중립) | **×1.1 (+10%)** |
| 별 평가 | 미구현 (TODO) | **3단계 HP+턴 복합기준** |
| 하단 네비 | 4탭 | **5탭 (홈/모험/소환/영웅/더보기)** |
| 시너지 스킬 | 없음 | **패시브/액티브/궁극기 3종** |
| 팀 문서화 | 없음 | **8팀 각 writer 에이전트 배정** |
| Git Worktree | 5워커 기반 | **8팀 기반 + mood-migration 전용** |
| 캐릭터 밸런스 | 미분석 | **39명 분석 + 5명 재배정 + 12명 추가 계획** |

### 부록 B-3: v5.3 변경 사항 요약 (2026-02-07)

| 변경 항목 | v5.2 | **v5.3 (현재)** |
|----------|------|----------------|
| 분위기(Mood) 종류 | 5종 (brave/cunning/calm/wild/mystic) | **9종** (fierce/stoic/devoted/noble 추가) |
| 교단(Cult) 개수 | 5개 (valhalla/olympus/takamagahara/asgard/yomi) | **9개** (tartarus/avalon/helheim/kunlun 추가) |
| 캐릭터 총원 | 39명 | **91명** (52명 신규 추가, 17명 mood 재분배) |
| 상성 구조 | 순환형 (brave→cunning→calm→wild→brave) | **매트릭스형** (각 분위기 2강 2약) |
| 교단-분위기 보너스 | 5조합 ×1.15 | **9조합 ×1.15** (9교단 × 9분위기 1:1 매핑) |
| 캐릭터 디자인 필드 | design 없음 | **design 15필드** (일러스트 컨셉, 컬러 팔레트, 스킬 이펙트 등) |
| 보이스 라인 | 없음 | **voiceLines** 상세화 (소환/승리/패배/대기 등) |
| 캐릭터 디자인 PRD | 없음 | **14_CHARACTER_DESIGN.md** 신규 생성 |
| PersonalitySystem | 활성 | **MoodSystem**으로 전환 완료 ✅ |
| Element 필드 | 440개 참조 잔존 | **완전 삭제 완료** ✅ |
