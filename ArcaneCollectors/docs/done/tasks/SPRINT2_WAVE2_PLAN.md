# Sprint 2 Wave 2 계획

> **작성일**: 2026-02-09
> **선행**: Sprint 2 Wave 1 완료 (254 tests pass, build SUCCESS)
> **브랜치**: `arcane/integration` → 각 워크트리 태스크 브랜치

---

## Wave 1 완료 요약

| W | 완료 태스크 | 핵심 변경 |
|---|-----------|---------|
| W1 | COMPAT-1.2 | baseStats→stats 통일 (enemies.json + 소비자 10파일) |
| W2 | TSO-3.1 + PAT-1.1 | JS→TS 9파일 + 커맨드 패턴 + 버프 만료 + Cult 9종 |
| W3 | UIX-4.2.1 + UIX-2.1 | null방어 13곳 + Z-Index + EnergyBar + Badge + Modal |
| W4 | VFX-2.1 | SkillAnimationManager + ParticleManager 확장 + async/await |
| W5 | QAT-T2-1~3 | 유닛 테스트 70개 (Mood+Gacha+Battle) → 총 254개 |
| W6 | RES-ABS-4 + RES-PH1 | 레이지 로딩 3씬 + emoji→renderIcon + PreloadScene 분할 |

---

## Wave 2 태스크 배정

### W1: 호환성 · 스키마 (PRD 15) — `arcane/w1-backend`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **COMPAT-1.3** | ownedHeroes 스키마 통일 | M | COMPAT-1.2 ✅ |
| **COMPAT-1.5** | JSON Schema 검증 도구 도입 (ajv) | M | COMPAT-1.1,1.2 ✅ |

**COMPAT-1.3 세부**:
- GachaScene ↔ SaveManager 간 ownedHero 데이터 형식 표준화
- `normalizeHero()` 함수 강화 (constellation, equipment, acquiredAt 필드)
- SaveManager의 save/load 스키마 일관성 확보
- 기존 저장 데이터 마이그레이션 핸들링

**COMPAT-1.5 세부**:
- `src/schemas/` 디렉토리 생성
- characters.json, enemies.json, items.json, synergies.json 등 JSON Schema 정의
- 빌드 타임 + 개발 모드 런타임 검증 스크립트

---

### W2: TypeScript · 패턴 (PRD 19) — `arcane/w2-data`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **TSO-4** | data/index.ts 전환 | M | TSO-3.1 ✅ |
| **PAT-2** | State Pattern — BattlePhase 열거형 | M | TSO-2.1 ✅ |
| **PAT-4** | Factory Pattern — HeroFactory 구현 | M | TSO-2.1 ✅ |

**TSO-4 세부**:
- `data/index.js` → `data/index.ts` 전환
- JSON import 타입 연결 (Character[], Enemy[], Equipment[])
- `normalizeHero()` 반환 타입 `OwnedHero` 명시
- 모든 헬퍼 함수 파라미터/반환 타입 추가

**PAT-2 세부**:
```typescript
enum BattlePhase {
  INITIALIZING, PLAYER_INPUT, TARGETING,
  EXECUTING, ANIMATING, RESOLVING,
  WAVE_TRANSITION, BATTLE_END
}
```
- BattleScene 내부 상태 전환 명확화
- 상태별 허용 액션 제한 (잘못된 상태에서 입력 방지)

**PAT-4 세부**:
```typescript
class HeroFactory {
  static createFromCharacterData(charData): OwnedHero;
  static createFromSaveData(saveData): OwnedHero;
  static createStarter(): OwnedHero;
}
```
- `normalizeHero()` 기능을 Factory로 격상
- GachaScene, BattleScene, BootScene에서 사용

---

### W3: UI/UX 씬별 개선 (PRD 17) — `arcane/w3-ui`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **UIX-2.2.1** | HeroList 그리드 레이아웃 최적화 | M | UIX-3.1.1 ✅ |
| **UIX-2.3.1** | HeroDetail 스탯 레이더 차트 | H | - |
| **UIX-2.6.1** | BattleScene HP 바 고도화 | M | - |

**UIX-2.2.1 세부**:
- 카드 크기 100x140 → 110x150 조정
- 카드 간격 표준화 (10px)
- 스크롤 성능 최적화 (재사용 풀 기법)
- 다중 필터 (교단+클래스+분위기) 기초

**UIX-2.3.1 세부**:
- HP/ATK/DEF/SPD 레이더 차트 (Phaser Graphics API)
- 장비 착용 시 스탯 변화 미리보기 (오버레이)
- 동일 등급 평균치 비교선

**UIX-2.6.1 세부**:
- HP 바 그라데이션 (초록→노랑→빨강)
- 데미지/힐 시 HP 바 애니메이션 (즉시 감소 + 후행 감소)
- 스킬 게이지 바 추가 표시
- 버프/디버프 아이콘 표시 영역

---

### W4: VFX 전투 이펙트 (PRD 16) — `arcane/w4-system`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **VFX-2.2** | 분위기별 전투 파티클 9종 | H | VFX-2.1 ✅ |
| **VFX-2.3** | 상성 표시 이펙트 | M | VFX-2.1 ✅ |
| **VFX-2.4** | 크리티컬/미스/힐 특수 이펙트 | M | VFX-2.1 ✅ |

**VFX-2.2 세부**:
| 분위기 | 색상 | 공격 파티클 | 히트 이펙트 |
|--------|------|-----------|-----------|
| brave | #FF4444 | 불꽃 파편 상승 | 폭발 원형파 |
| fierce | #FF8800 | 번개 지그재그 | 전기 스파크 |
| wild | #44CC44 | 바람 나선형 | 회오리 |
| calm | #4488FF | 물방울 부유 | 파문 원형 |
| stoic | #888888 | 바위 파편 낙하 | 방패 섬광 |
| devoted | #FF88CC | 하트 부유 상승 | 빛줄기 수렴 |
| cunning | #AA44FF | 연기 확산 | 독안개 |
| noble | #FFD700 | 빛줄기 방사 | 후광 |
| mystic | #CC88FF | 마법진 회전 | 룬 문자 부유 |

**VFX-2.3 세부**:
| 상성 | 텍스트 | 색상 | 추가 이펙트 |
|------|--------|------|-----------|
| 유리(×1.2) | "▲" + 1.3x | #FFD700 | 별 파티클 3개 |
| 불리(×0.8) | "▼" + 0.8x | #4488FF | 방어 아이콘 깜빡 |
| 중립(×1.0) | 기본 | #FFFFFF | 없음 |

**VFX-2.4 세부**:
- 크리티컬: "CRITICAL!" 텍스트 (scale 1.5→1.0) + 화면 shake
- 미스: "MISS" 회색 텍스트 페이드아웃
- 힐: "+" 녹색 숫자 + 반짝임 파티클
- 버프: 파란 ↑ 아이콘 / 디버프: 보라 ↓ 아이콘
- 방어: 반투명 방패 flash

---

### W5: QA 추가 테스트 (PRD 20) — `arcane/w5-config`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **QAT-T3-1** | SaveManager 유닛 테스트 | M | QAT-FW ✅ |
| **QAT-T3-2** | EnergySystem 유닛 테스트 | S | QAT-FW ✅ |
| **QAT-T3-3** | SynergySystem 유닛 테스트 | M | QAT-FW ✅ |
| **QAT-T3-4** | EquipmentSystem 유닛 테스트 | M | QAT-FW ✅ |
| **QAT-LOG-1** | 에러 패턴 자동 탐지 | S | QAT-T2 ✅ |

**QAT-T3-1 세부** (SaveManager):
- save/load 기본 동작 (localStorage mock)
- 데이터 무결성 (저장→로드 일치)
- 마이그레이션 핸들링 (구버전 세이브)
- 에러 처리 (localStorage 꽉 참, 손상 데이터)

**QAT-T3-2 세부** (EnergySystem):
- consume/recharge 기본 동작
- 시간 경과에 따른 자동 회복
- 최대값 제한
- 에지 케이스 (음수, overflow)

**QAT-T3-3 세부** (SynergySystem):
- calculatePartySynergies() 정상 동작
- 교단/분위기/역할/특수 시너지 계산
- 빈 파티, 1인 파티 처리
- 시너지 버프 값 정확성

**QAT-T3-4 세부** (EquipmentSystem):
- equip/unequip 기본 동작
- 장비 스탯 적용 정확성
- 이미 장착된 장비 교체
- 빈 슬롯 처리

**QAT-LOG-1 세부**:
- ERROR_PATTERNS 사전 정의 (TypeError, ReferenceError, NaN, undefined)
- GameLogger 확장: error 레벨 로그 자동 수집
- 테스트에서 에러 패턴 감지 유틸리티

---

### W6: 연출 시퀀스 + 에셋 구조 (PRD 16+18) — `arcane/w6-content`

| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| **VFX-1.3** | 전투 돌입 연출 시퀀스 | M | VFX-1.1 ✅ |
| **VFX-1.4** | 가챠 진입 연출 시퀀스 | M | VFX-1.1 ✅ |
| **VFX-4.2** | 탭/카테고리 전환 애니메이션 | S | VFX-4.1 ✅ |

**VFX-1.3 세부** (전투 돌입):
```
1. [0~300ms]  화면 어두워짐 (alpha overlay 0→0.8)
2. [300~500ms] "BATTLE START" 텍스트 좌→중앙 슬라이드
3. [500~800ms] 텍스트 유지 + 배경 진동 (shake 2px)
4. [800~900ms] 흰색 플래시 (flash 100ms)
5. [900~1200ms] 전투 씬 fadeIn
```

**VFX-1.4 세부** (가챠 진입):
```
1. [0~200ms]  화면 어두워짐
2. [200~500ms] 중앙에 마법진 원형 확대 (scale 0→1)
3. [500~700ms] 마법진 회전 + 빛 파티클
4. [700~800ms] 밝은 플래시
5. [800~1100ms] 가챠 씬 fadeIn
```

**VFX-4.2 세부**:
- 탭 전환 시 콘텐츠 슬라이드 인/아웃 (200ms)
- 카테고리 필터 변경 시 카드 페이드 인 (150ms)
- 활성 탭 밑줄 슬라이드 애니메이션

---

## 실행 계획

### 파이프라인 순서 (워크트리별)
```
Step 0+1: Explore + Refine (haiku) — 코드베이스 탐색 + 의존성 확인
Step 2:   Architect (opus) — 구현 설계서 작성
Step 3:   Executor (sonnet, bypassPermissions) — 구현 + 커밋
Step 4:   Code Review (sonnet) — APPROVE/CHANGES_REQUESTED
Step 5:   QA Test (sonnet) — 빌드 + 테스트 검증
```

### 예상 커밋 수 (워크트리별)
| W | 태스크 수 | 예상 커밋 | 변경 파일 수 |
|---|----------|---------|-----------|
| W1 | 2 | 3~4 | 8~12 |
| W2 | 3 | 4~5 | 10~15 |
| W3 | 3 | 4~6 | 6~10 |
| W4 | 3 | 4~5 | 5~8 |
| W5 | 5 | 5~6 | 5~8 (테스트 파일) |
| W6 | 3 | 3~4 | 5~8 |
| **합계** | **19** | **23~30** | **39~61** |

### 머지 순서 (충돌 최소화)
1. **W5** (테스트만 — 충돌 가능성 0)
2. **W1** (스키마/데이터 — 기반 변경)
3. **W2** (TS 전환 — W1 스키마 반영)
4. **W3** (UI — 씬 파일 수정)
5. **W6** (연출 — 씬 전환 수정)
6. **W4** (VFX — BattleScene 이펙트, 최대 충돌 가능)

### 워크트리 동기화 (중요!)
각 워크트리는 머지 전 `arcane/integration` 최신을 rebase/merge:
```bash
cd /path/to/w{N}
git fetch origin arcane/integration
git merge arcane/integration
```

---

## 검증 기준

### 빌드
- [ ] `npm run build` 에러 0
- [ ] 번들 크기 500KB 이하 (index.js)

### 테스트
- [ ] `npx vitest run` — 기존 254 + 신규 ~80 = **330+ 테스트 전부 PASS**

### 기능
- [ ] 전체 게임 플로우 정상 (신규 시작 → 가챠 → 전투 → 메인)
- [ ] 9종 분위기별 파티클 구분 가능
- [ ] 상성 이펙트 시각적 구분 가능
- [ ] BattleScene HP 바 그라데이션 + 애니메이션
- [ ] HeroDetail 레이더 차트 표시
- [ ] 전투/가챠 진입 연출 재생
