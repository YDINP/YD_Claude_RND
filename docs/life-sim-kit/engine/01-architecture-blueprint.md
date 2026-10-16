# 인생 시뮬레이션 엔진 — 아키텍처 청사진

> 출처: [design 04 §0~3] 기술 아키텍처, [design 02 §0] 핵심 결정, [design 01 §0] 데이터 설계
> 컨셉: 재사용 가능한 «인생 시뮬 엔진» 스택. 판타지 고유 요소는 **«컨셉 슬롯»**으로 표기.

---

## 0. 스택 결정과 근거

### 0.1 채택 기술

| 영역 | 선택 | 버전(고정) | 근거 | 컨셉 슬롯 |
|------|------|----------|------|---------|
| 빌드 | Vite | 6.x | 빠른 HMR, Worker·청크 분할, PWA 생태계 | (없음) |
| 언어 | TypeScript strict | 5.x | 50개+ 상태 변수를 타입으로 강제, any 금지 | (없음) |
| UI | Preact + @preact/signals | 10.x / 1.x | 화면 5~8개 상태 머신에 가벼움, 선택적 갱신 | 화면 레이아웃·스타일 |
| 스타일 | CSS Modules + CSS 변수 토큰 | – | 런타임 0, 다크 모드 토큰만 교체 | 토큰·컬러 팔레트 |
| 콘텐츠 | YAML DSL → 빌드 타임 컴파일 | yaml 패키지 | 사람·AI 공동 저작 가능, 주석 지원, 조건식 AST 검사 | 콘텐츠 스키마·조건식 |
| 검증 | zod(**빌드만**) | 3.x | 스키마 = 타입 단일 출처, 런타임 번들 제외 | (없음) |
| 테스트 | Vitest + fast-check | 3.x / 3.x | Node Worker 병렬, 속성 기반 테스트, 통계 검증 N=10,000 | 테스트 목표값 |
| 메모리 | 링버퍼 + 타입 배열 델타 + 재사용 풀 | – | 4명 동시 + 만 생 시뮬에서 할당 최소화 | (없음) |
| RNG | xoshiro128\*\* + splitmix32 | – | 크로스 플랫폼 결정론, 키 단위 하위 스트림 | (없음) |
| 배포 | Cloudflare Pages + Workers(2차) | – | 무료 대역폭, 정적 MVP, 서버 최소화 | (없음) |

### 0.2 번들 예산 (CI가 강제)

```
app 초기        ≤ 90KB (Preact + 핵심 화면 + 엔진 코어)
engine 실행부   ≤ 45KB (시뮬 + DSL + 생명표)
data.core       ≤ 60KB (세계 원인 변수 + 파생 지표 + 사인 가중표)
content.lang    ≤ 160KB (결정 + 사건 + UI 문자열, 지연 로드)
폰트            ≤ 180KB (사용 글리프 서브셋)
```

---

## 1. 디렉터리 구조

```
{project}/
├─ content/                       # ★ 저작 원본 (사람·AI)
│  ├─ almanac/
│  │  ├─ regions/*.yaml           # «지역 원인 변수» 슬롯
│  │  │  └─ structure: {climate, security, wealth, monsters, medicine, plague, 
│  │  │              terrain_mods, calibration}
│  │  ├─ races.yaml               # «종족 표» 슬롯: k, adultAge, birth%, fertility, manaRates
│  │  ├─ {domain}-events.yaml     # «세계 스케줄» 슬롯: 전쟁·기근·역병·마물 등
│  │  ├─ eras.yaml                # «시대 변이» 슬롯
│  │  ├─ statuses.yaml            # «신분 계층» 슬롯: q1~q5, Gini 곡선
│  │  ├─ occupations.yaml         # «직업 분포» 슬롯 + 소득·위험·경로
│  │  └─ causes.yaml              # «사인 카탈로그» 슬롯 + 7×7 가중표
│  ├─ cards/                      # «결정 카드» 슬롯 (파일 1 = 주제 1)
│  ├─ events/                     # «사건 테이블» 슬롯
│  ├─ legends/                    # «설화·역사» 슬롯 (2차)
│  ├─ omens/                      # «탄생 징조·날씨» 슬롯
│  ├─ retrospect/                 # «회고 질문» 슬롯
│  └─ i18n/{lang}/
│     └─ ui.yaml
├─ tools/                         # 빌드 타임 전용
│  ├─ schema/                     # zod 스키마 (타입 단일 출처)
│  ├─ dsl/                        # 조건식 Pratt 파서 → AST
│  ├─ almanac/                    # «생성 모델» 슬롯: 원인변수 → 파생지표
│  ├─ compile-content.ts          # YAML → 검증 → generated/*.json
│  └─ lab-cli.ts                  # 헤드리스 대량 시뮬 (`pnpm lab --n 10000`)
├─ src/
│  ├─ engine/                     # ★ 순수 시뮬 (DOM·Date·Math.random 금지)
│  │  ├─ rng/
│  │  │  └─ index.ts              # xoshiro128**, splitmix32, 키 스트림
│  │  ├─ math/
│  │  │  └─ index.ts              # invNorm, 로그정규, 포아송, 반올림
│  │  ├─ time/
│  │  │  └─ index.ts              # 틱 시계, «정규화 단계» 경계
│  │  ├─ mortality/
│  │  │  └─ index.ts              # «해저드 모델» 슬롯: 노화 · 환경 · 유년초과
│  │  ├─ birth/
│  │  │  └─ index.ts              # «출생 추첨» 파이프라인
│  │  ├─ stats/
│  │  │  └─ index.ts              # 4스탯 + «고유 시스템» 슬롯
│  │  ├─ schedule/
│  │  │  └─ index.ts              # planTick 순수 함수, 예약 큐
│  │  ├─ decisions/
│  │  │  └─ index.ts              # 카드 엔진 (조건 평가·효과 적용)
│  │  ├─ systems/                 # 하위 시스템(네임스페이스별 상태)
│  │  │  ├─ career.ts
│  │  │  ├─ economy.ts
│  │  │  ├─ family.ts
│  │  │  ├─ {domain}.ts            # «고유 시스템» 슬롯 — 각 도메인 state + resolve()
│  │  │  └─ index.ts              # 하위 시스템 레지스트리
│  │  ├─ dsl/
│  │  │  └─ index.ts              # 런타임 AST 인터프리터
│  │  ├─ machine/
│  │  │  └─ index.ts              # ★ 생애 «상태 머신» + 커맨드·이벤트
│  │  ├─ record/
│  │  │  └─ index.ts              # «기록 형식» 슬롯: 타입배열 델타
│  │  ├─ companions/
│  │  │  └─ index.ts              # 동반자 사전 시뮬 (headless)
│  │  └─ index.ts                 # 공개 API (이것만 import 가능)
│  ├─ data/
│  │  └─ index.ts                 # 생성 데이터 로더, 체크섬
│  ├─ persist/
│  │  └─ index.ts                 # 저장 봉투·마이그레이션·어댑터
│  ├─ i18n/
│  │  └─ index.ts                 # L`…` 태그, 사전, 조사 헬퍼
│  ├─ workers/
│  │  └─ *.worker.ts              # companions / lab (엔진만 import)
│  ├─ app/
│  │  ├─ screens/                 # «화면» 슬롯
│  │  ├─ components/              # 공통 컴포넌트
│  │  ├─ bridge/                  # ★ rAF 루프, dt 시간 변환
│  │  └─ shell/                   # 화면 라우팅 상태 머신
│  └─ main.tsx
├─ generated/                     # 빌드 출력 (git 무시)
├─ tests/
│  ├─ unit/  determinism/  stats/ # Vitest 워크스페이스
│  ├─ fixtures/
│  ├─ golden/                     # 시드 20개 최종 해시
│  └─ e2e/                        # Playwright
└─ tsconfig.*.json                # engine: DOM 타입 없음, app: 전체
```

---

## 2. 모듈 경계와 의존 규칙

### 2.1 계층 구조

```
            ┌──────────── tools/ (빌드 전용)
            ▼
content/*.yaml → generated/*.json
                        │ fetch
                        ▼
    app/ ──► bridge ──► engine/index.ts ◄── workers/*.worker.ts
     │  │                  ▲   ▲
     │  └──► persist ──────┘   │ (엔진 타입만)
     │  └──► share ────────────┤ (사망 기록 타입만)
     │  └──► audio             │
     │  └──► i18n ◄────────────┘ (양방향 모름)
     └──► data(로더)
```

### 2.2 강제 규칙

| 규칙 | ESLint / TypeScript | 의미 |
|------|-------------------|------|
| `engine/**` → `app\|persist\|share\|audio\|i18n\|data` 금지 | dependency-cruiser | 엔진 = 외부 의존 0 |
| `engine/**` 안 `window\|document\|Date\|Math.random` 금지 | ESLint `no-restricted-globals` | 결정론 강제 |
| 바깥 → `engine/*/**` 직접 import 금지, `engine/index.ts`만 | dependency-cruiser | 공개 API 고정 |

### 2.3 모듈별 책임 — 사용자 코딩 규칙 적용 패턴 매핑

| 모듈 | 책임 | 추천 패턴 | 구현 제약 |
|------|------|----------|----------|
| **engine** | 결정론적 생애 시뮬 | ✓ State 클래스(생애 단계) ✓ Strategy(자동결정·배속) ✓ Command(입력) ✓ Observer(이벤트 버스) ✓ Factory + Registry(하위시스템·사건) ✓ Builder(카드 문구) | 상태는 클래스로, 계획은 순수함수(state, rng) → plan. 하위시스템은 interface Subsystem { resolve(state, plan) }. 과설계 금지(한 번만 쓰는 추상화 제거). |
| **mortality** | 해저드 모델 | ✓ 함수형(누적 확률 계산) | 생명표 LRU 캐시(state 불변). |
| **systems/{domain}** | 하위 시스템 | ✓ Namespace 상태 + resolve() 메서드 ✓ Repository 패턴(저장소) | 상태는 `S.{domain}: DomainState` 클래스. |
| **record** | 기록 저장 | ✓ Ring Buffer(최근 N틱) ✓ TypedArray 델타 압축 | 연 기록은 `Uint32Array` 고정 너비. |
| **rng** | 난수 생성 | ✓ 함수형 스트림 | 상태(시드) 불변, 새 시드 반환. |
| **bridge** | UI ↔ 엔진 | ✓ Adapter 패턴 ✓ Observer(signals) | DOM 접근, rAF 루프만 담당. |

---

## 3. 핵심 설계 결정

### 3.1 생애 상태 머신 (D3)

```
            createLife(seed)
                 │
                 ▼
          ┌─ Birth ──────────┐
          │  (추첨 완료)      │
          └────────┬─────────┘
                   │ Begin
                   ▼
   ┌──────────► Living ◄─────────────┐
   │  advance(dt) │ 큐 발화            │
   │             ▼                  │
   │      makeDecision(choice)      │
   │             │                  │
   │             ├─► Resolved ──────┴─► Living
   │             │
   │             └─► Rejected
   │
   └─ Dead ◄─ deathCheck() at endTick
```

**상태 전이 규칙**:
- 각 phase는 허용 커맨드 집합 정의
- 허용되지 않은 커맨드 → `Rejected` 이벤트 반환
- phase 변경은 엄격하게 순차적 (race condition 없음)

### 3.2 시간 모델: 정규화 틱 (D1, D5)

```typescript
// 종족마다 시간축 다름
const raceScale = {human: 1.0, elf: 8.7, dwarf: 3.2, ...}  // 출처: race 스키마
const k = raceScale[birth.race]

// 틱 = 척도 1년 = 실제 k년
S.tick       // 생애 해 번호 (0부터 시작)
S.x = tick * k + t * k   // 실제 나이(년, 소수)
S.s = tick + t           // 생애 나이(공통 척도)
```

**왜 정규화 틱인가?**
- 장수 종족도 **약 100칸 인생지도** (모든 종족)
- 환경 위험은 **실제 연수**로 쌓임 (장수 종족은 더 오래 노출)
- 결과: «변경에 사는 엘프는 오래 못 산다» 식에서 자동으로 나옴

### 3.3 정규화 단계 경계 (D2)

종족마다 다른 실제 나이 → 단일 척도로 통일

```typescript
// 모든 종족 공통 척도 경계 (s = 생애 나이)
infant:  s < 2
child:   2 ≤ s < 0.4*M
youth:   0.4*M ≤ s < M       // M = 성년
adult:   M ≤ s < M + 0.35*(55k - M)
prime:   ... 
elder:   ...
dusk:    s ≥ 75*k
```

**비교**: 오크(k=0.7)의 실제 성년은 12세지만, 척도로는 모든 종족이 같은 단계. 미성년 판정도 단일.

### 3.4 순수 계획 함수 (D3)

엔진의 핵심은 **상태 + 난수 → 계획** 순수 함수들:

```typescript
// 모두 부작용 없음
function planTick(S: Life, rng: RNG): Plan
function resolveYear(S: Life, plan: Plan, rng: RNG): void
function endTick(S: Life, w: FocusWeights): void
```

**이점:**
- 헤드리스 실행 가능 (Worker, CLI, 테스트)
- 같은 시드 + 같은 입력 = 같은 결과 (재현 가능)
- 동반자 4명을 메모리 안 진행 가능

### 3.5 커맨드 / 이벤트 아키텍처 (D3)

```typescript
// 입력: UI → 커맨드
type Command = 
  | { type: 'begin' }
  | { type: 'makeDecision', cardId: string, choice: number }
  | { type: 'setFocus', slot: number, focusId: string }
  | { type: 'pause' } | { type: 'resume' } | { type: 'setSpeed', speed: number }
  | { type: 'restart' }

life.dispatch(cmd)  // → state 변경 없음, 유효성 검사만

// 출력: 엔진 → 이벤트
type Event =
  | { kind: 'CardScheduled', id: string, title: string, choices: string[] }
  | { kind: 'LifeAdvanced', progress: number }  // 0~1
  | { kind: 'StageMilestone', stage: string }
  | { kind: 'Death', cause: string, record: DeathRecord }
  | { kind: 'Rejected', reason: string }
```

---

## 4. 데이터 파이프라인 (D6)

```
content/*.yaml
    ↓
[zod 검증 + 조건식 AST 파싱] (tools/)
    ↓
generated/*.json (해시·버전 붙음)
    ↓
[번들에 포함: core / lang별 content]
    ↓
런타임: DSL 인터프리터로 조건 평가 + 효과 적용 (engine/dsl)
```

**특징:**
- **빌드 타임 컴파일**: 런타임 `eval()` 없음
- **지표 조건**: `region.plague >= 4` 같은 식으로 조합 폭발 방지
- **AST 사전 파싱**: 성능 + 타입 안전
- **체크섬**: 데이터 버전 변경 감지

### 4.1 «콘텐츠 조건식» DSL

```yaml
# 예: cards/war-conscription.yaml
id: war-conscription
when:
  - "stage == adult"              # 단계 비교
  - "rng >= regionId.conscriptTriggerRate"   # 지표 조건
  - "q in regionId.conscript.statuses"       # 신분 조건
  - "!flags.served"               # 플래그
```

컴파일 결과 → JavaScript 클로저:
```typescript
const condition = (S, rng) => 
  S.stage === 'adult' && 
  rng < R.conscriptTriggerRate && 
  R.conscript.statuses.includes(S.q) && 
  !S.flags.served
```

---

## 5. 저장소 설계 (D7)

### 5.1 저장 봉투

```typescript
interface SaveEnvelope {
  v: number                    // 버전 (항상 증가)
  dataVer: string              // 세계 데이터 버전 (해시)
  payload: {
    seed: Uint8Array
    birthYear: number
    inputs: Command[]           // 재현용 입력 로그
    snapshot: LifeSnapshot      // 현재 상태 스냅샷 (복구용)
  }
}
```

### 5.2 마이그레이션 체인

```typescript
// v1 → v2 → v3 ...
const migrations: Record<number, (old: any) => any> = {
  2: (v1) => ({ ...v1, newField: defaultValue }),
  3: (v2) => ({ ...v2, renamedField: v2.oldName }),
}

function loadAndMigrate(loaded: SaveEnvelope): SaveEnvelope {
  let current = loaded
  for (let v = loaded.v; v < CURRENT_VERSION; v++) {
    current = migrations[v + 1](current)
  }
  return current
}
```

### 5.3 저장소 이원화

| 저장소 | 용도 | 용량 |
|--------|------|------|
| localStorage | 현재 진행 중인 삶(snapshot) + 설정 | 5~10MB |
| IndexedDB | 완료한 삶 기록(compressed) | 50MB+ |

---

## 6. 메모리 최적화 (D8)

### 6.1 «링버퍼» — 최근 N개 기록만

```typescript
class RingBuffer<T> {
  private buffer: T[]
  private head = 0
  private length = 0
  
  constructor(capacity: number) { this.buffer = new Array(capacity) }
  
  push(item: T) {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.buffer.length
  }
}

// 사용: 최근 100틱 기록만
const yearRecords = new RingBuffer<YearRecord>(100)
```

### 6.2 «타입 배열 델타» — 연 기록 압축

```typescript
// 각 틱의 스탯 변화를 Uint32Array로 저장
const yearDeltas = new Uint32Array(maxTicks * 4)  // vit, pe, lore, bond 델타
const recordTick = (S, tick) => {
  const idx = tick * 4
  yearDeltas[idx] = deltaVitality(S)
  yearDeltas[idx+1] = deltaSerenity(S)
  // ...
}
```

### 6.3 «객체 풀» — 재사용 객체 (카드, 사건)

```typescript
class CardPool {
  private free: Card[] = []
  
  acquire(): Card {
    return this.free.pop() ?? new Card()
  }
  
  release(card: Card) {
    card.reset()
    this.free.push(card)
  }
}
```

---

## 7. 테스트 전략 (D9)

### 7.1 3개 레이어

| 레이어 | 도구 | 목표 | 통과 기준 |
|--------|------|------|----------|
| **unit** | Vitest | 함수 단위(RNG, 해저드, 스탯) | 기본값 회귀 |
| **determinism** | Vitest Worker | 같은 시드 = 같은 결과(시드 20개) | 1틱마다 해시 비교 |
| **stats** | Vitest Worker (N=10,000) | 연감 수치(e0, 사인 비율 등) | CI 검사(오차 ±2%) |

### 7.2 통계 검증

```typescript
test('e0 matches almanac ±2%', () => {
  const simulated = runStatsTest({n: 10000, race: 'elf', region: 'silvares'})
  const expected = data.races.elf.regions.silvares.e0
  
  expect(simulated.e0).toBeWithinPercent(expected, 2)
})
```

### 7.3 메모리 검증

```bash
# 4명 동시 + 1만 생: 메모리 소비 ≤ 100MB
pnpm test:memory-smoke
```

---

## 8. 번들 최적화 (D1, D6)

### 8.1 청크 분할

```javascript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'engine': ['src/engine'],
          'data.core': ['src/data'], // 지연 로드
          'content.ko': ['generated/content-ko.json'], // 삶 진입 시
        }
      }
    }
  }
}
```

### 8.2 번들 예산 자동 검사

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./tests/bundle-budget.ts'],
  }
})

// bundle-budget.ts
function checkBudget() {
  const sizes = analyzeBundle()
  assert(sizes.app <= 90 * 1024, `app 초과: ${sizes.app}B`)
  assert(sizes.engine <= 45 * 1024, ...)
}
```

---

## 9. 비설계 결정: 사용자 객체지향 규칙 적용 방안

«객체지향 + 디자인 패턴 + 자료구조로 우아하게» 원칙을 각 모듈에 구체화:

### 9.1 상태 머신 모듈 (engine/machine)

```typescript
// ✓ State 패턴: 생애 단계별 클래스
abstract class LifePhase {
  abstract handle(cmd: Command): Result
}

class BirthPhase extends LifePhase {
  handle(cmd: Command) {
    if (cmd.type === 'begin') return new LivingPhase(...)
    return rejected('begin 만 가능')
  }
}

class LivingPhase extends LifePhase {
  // ...
}

// ✓ Strategy 패턴: 자동 결정
interface AutoChoiceStrategy {
  selectChoice(card: Card, policy: Policy): number
}

class RiskAverseStrategy implements AutoChoiceStrategy {
  selectChoice(card, policy) { return 0 }  // 첫 번째 선택
}
```

### 9.2 하위 시스템 (engine/systems/{domain})

```typescript
// ✓ Factory + Registry
class SubsystemFactory {
  private registry = new Map<string, SubsystemClass>()
  
  register(id: string, cls: SubsystemClass) {
    this.registry.set(id, cls)
  }
  
  create(id: string, context: Context): Subsystem {
    const cls = this.registry.get(id)
    return new cls(context)
  }
}

// ✓ Repository 패턴
interface SystemRepository {
  load(domainId: string): DomainState
  save(state: DomainState): void
}

class InMemoryRepository implements SystemRepository {
  private store = new Map<string, DomainState>()
}

// ✓ Template Method: 해저드 계산
abstract class HazardSystem {
  calculateTick(S: Life): void {
    const env = this.getEnvironmental(S)
    const personal = this.getPersonal(S)
    const aging = this.getAging(S)
    S.hz[this.id] = this.combine(env, personal, aging)
  }
  
  protected abstract getPersonal(S: Life): number
}
```

### 9.3 데이터 구조 (engine/record)

```typescript
// ✓ Ring Buffer: 최근 기록만
class YearRecordBuffer extends RingBuffer<YearRecord> {
  constructor() { super(100) }  // 최근 100년
}

// ✓ LRU 캐시: 생명표
class LifeTableCache implements ICache<string, LifeTable> {
  private lru = new Map<string, LifeTable>()
  private maxSize = 50
  
  get(key: string): LifeTable | undefined {
    const val = this.lru.get(key)
    if (val) {
      this.lru.delete(key)
      this.lru.set(key, val)  // 최근 사용으로 이동
    }
    return val
  }
}

// ✓ TypedArray: 델타 저장
class YearDeltaRecord {
  private deltas: Uint32Array  // 고정 너비, 압축
}
```

### 9.4 이벤트 버스 (engine/machine)

```typescript
// ✓ Observer 패턴 + 타입 안전
interface EventListener<E extends Event> {
  (event: E): void
}

class TypedEventBus {
  private listeners = new Map<string, Set<EventListener<any>>>()
  
  on<E extends Event>(eventType: E['kind'], listener: EventListener<E>) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
  }
  
  emit<E extends Event>(event: E) {
    this.listeners.get(event.kind)?.forEach(l => l(event))
  }
}
```

### 9.5 카드 빌더 (engine/decisions)

```typescript
// ✓ Builder 패턴: 카드 조립
class CardBuilder {
  private title = ''
  private descriptions: string[] = []
  private choices: Choice[] = []
  
  setTitle(title: string): this {
    this.title = title
    return this
  }
  
  addDescription(desc: string): this {
    this.descriptions.push(desc)
    return this
  }
  
  build(): Card {
    return new Card(this.title, this.descriptions, this.choices)
  }
}
```

### 9.6 금지 사항

```typescript
// ❌ 과설계: 한 번만 쓰는 추상화
interface ITooSpecific { }

// ❌ 깊은 상속 (3단계 이상)
class A extends B extends C extends D { }  // 금지

// ❌ 의미 없는 인터페이스
interface DataHolder { data: unknown }  // 지양

// ✓ 합성으로 대체
class Container {
  strategy: Strategy
  repository: Repository
}
```

---

## 10. 체크리스트: 새 컨셉으로 옮길 때

다음 섹션([design/01-concept-adaptation-guide.md](../design/01-concept-adaptation-guide.md))에서 상세 절차. 여기서는 청사진 단위로 준비할 항목:

- [ ] 컨셉 슬롯 매핑표 작성 (원작 ↔ 새 컨셉)
- [ ] 생성 모델 조정 (원인 변수, 파생 지표 식)
- [ ] 하위 시스템 추가 (고유 기계류)
- [ ] 카드 + 사건 DSL 스키마 검증
- [ ] 테스트 기준값 재계산 (통계 N=10,000)
- [ ] 번들 예산 재평가

