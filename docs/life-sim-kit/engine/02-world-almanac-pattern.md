# 가상 세계 통계 연감 설계 패턴

> 출처: [design 01 §4~6, §14] 생성 모델·확률 정합, [design 00 §4~5] 통계 기관·신뢰구간
> 패턴: «불일치 방지» + «데이터 주도 저작» 원칙

---

## 0. 핵심 아이디어

**문제**: 시뮬 결과와 세계 통계가 어긋나면 게임이 깨진다.  
**해결**: 세계 통계 = 엔진의 **출력**, 저작은 «원인 변수»만 정한다.

```
저작(사람)        컴파일(AI)        실행
──────────       ─────────        ──────
원인변수 6개  →  생성모델(식)  →  파생지표·e0·사인분포
climate=3,      (빌드타임)       → almanac.json
security=4,                       → 세계 데이터
wealth=2, ...                     → engine 입력
```

---

## 1. 원인 변수 (저작 입력)

### 1.1 6개 원인 변수

각 지역마다 **단 하나의 소스 파일**:

```yaml
# regions/my-region.yaml
id: my_region
name: 내 지역
lifescape: agrarian  # 7가지 생활권(곡창·초원·습지·변경·해안·광산·학술)

# 원인 변수 6개 (척도 1~5)
climate: 3           # 기후: 온화~혹독
security: 4          # 치안: 좋음~나쁨
wealth: 2            # 부: 빈곤~풍요
monsters: 2          # 마물 위협
medicine: 3          # 의료 발달
plague: 2            # 역병 빈도

# 세부 보정 (선택)
terrain_mods:
  wetland: 0.6       # 습지 질병 배수
  famine_mult: 2.0   # 기근 배수
  accident: 0.0002   # 일상사고 기저율

# 보정 계수 (지역 고유)
calibration: 1.00    # 최종 조정값

# 서사 필드 (화면에 노출)
description: "..."
notable_cause: disease  # 주요 사인
notable_rate: "26명 중 1명"
```

### 1.2 원인 변수 해석

| 변수 | 1 | 2 | 3 | 4 | 5 | 예시 |
|------|---|---|---|---|---|-----|
| climate | 온화 | 좋음 | 중간 | 혹독 | 극악 | 1=에멘, 5=북방 |
| security | 안전 | 양호 | 보통 | 위험 | 무법지 | 1=에멘, 5=바르가초원 |
| wealth | 풍요 | 부유 | 중산 | 빈곤 | 극빈 | 1=아주르, 5=그림모어 |
| monsters | 없음 | 드묾 | 보통 | 많음 | 극성 | 1=아스테라, 5=북방 경계 |
| medicine | 최고 | 뛰어남 | 보통 | 낮음 | 없음 | 1=아스테라, 5=바르가 |
| plague | 없음 | 드묾 | 보통 | 자주 | 항상 | 1=실바레스, 5=그림모어 |

---

## 2. 이중 시간축 해저드 모델

### 2.1 핵심 식

```
μ(x) = A_env · H_env + B · e^{G·x/k} · H_ind
```

| 기호 | 뜻 | 범위 | 원천 |
|------|----|----|------|
| `x` | 실제 나이(년) | 0~ | 시뮬 시간 |
| `k` | 종족 척도 | 0.7~8.7 | 종족표 |
| `s = x/k` | 척도 나이(생애 단위) | 0~119 | 장수 상한 |
| `A_env` | 환경 배경 위험 | 0~0.025/년 | 원인변수 6개 → 생성모델 |
| `B·e^{G·s}` | 노화 지수 | B=2.2×10⁻⁵, G=0.10 | 전종족 공통(잠금) |
| `H_env` | 환경 해저드(binary) | 0 또는 1 | 질병·폭력·마물·사고 등 |
| `H_ind` | 개인 위험(binary) | 0 또는 1 | 신분·직업·선택 |

### 2.2 3개 성분으로 분해

```typescript
function tickHazard(S: Life, rng: RNG): number {
  const s = S.s  // 척도 나이
  const x = S.x  // 실제 나이
  const k = raceScale[S.race]
  
  // ① 유년 초과 (척도 축) — 어린 시절에만
  const h_child = (s < 15) 
    ? childExcess[floor(s)] * cf(region)
    : 0
  
  // ② 노화 (척도 축) — 모든 종족 공통 곡선
  const h_aging = B * exp(G * (s + 0.5))
  
  // ③ 환경 (실제 축) — 오래 노출될수록 누적
  const h_env = k * (
    diseaseHazard(region) * W['disease'][band(s)]
    + violenceHazard(region) * W['violence'][band(s)]
    + ... // 7개 성분
  )
  
  return (h_child + h_aging * h_sex + h_env) * cal(region)
}

// 틱 사망 확률
const q = 1 - exp(-tickHazard(S, rng))
```

### 2.3 환경 해저드 성분 (각 1년)

```
disease = 0.0005 · e^{0.45(3−medicine)} · (1 + 0.40(plague−1)) · (1 + wetland)
violence = 0.0003 · e^{0.70(3−security)}
monster = 0.00008 · e^{0.95(monster−1)}
accident = region.accident_base
occupational = region.occupational_base
war = 0  # 또는 «세계 사건»에서 전달
famine = 0.0002 · e^{0.50(3−wealth)} · (1 + 0.25(climate−3)) · famine_mult
```

모든 성분 × `calibration[region]`

### 2.4 무엇이 이점인가?

| 관점 | 일반 모델 | 이중 축 |
|------|---------|--------|
| 장수 종족 노화 | 구간별 수동 보정 | `e^{G·s}` 하나 |
| 환경 차이 표현 | 종족별 e0 다름 | 나이 기반 환경 노출 |
| «엘프는 북방에서 못 산다» | 데이터 입력 | 식에서 자동 도출 |
| 사인 분포 | e0와 별개 | 해저드 성분에 비례 |

---

## 3. 신뢰 구간 (기록 없는 지역용)

### 3.1 데이터 품질 5단계

```yaml
# regions/my-region.yaml
data_quality:
  level: "B"  # A(높음) / B(양호) / C(중간) / D(낮음) / S(매우높음)
  description: "10년 주기 인구조사 기반"

# B 등급: 신뢰구간 ±15%
# D 등급(기록없음): 신뢰구간 ±30%
```

### 3.2 신뢰구간 표기

세계 안 기관이 공식 발표하듯이 표시:

```
루멘 왕립 서기국:
  "인간 기대수명 66세"

아주르 상인조합(추정):
  "오크 기대수명 38세 (추정 31–45세)"
                              ^ 신뢰구간
```

### 3.3 구간 계산식

```typescript
function confidenceInterval(estimate: number, dataQuality: string): [min, max] {
  const margins = {
    'S': 0.08,   // ±8%
    'A': 0.10,   // ±10%
    'B': 0.15,   // ±15%
    'C': 0.22,   // ±22%
    'D': 0.30,   // ±30%
  }
  const margin = margins[dataQuality] ?? 0.15
  return [
    estimate * (1 - margin),
    estimate * (1 + margin)
  ]
}
```

---

## 4. 자기 일관성 검사 (CI)

### 4.1 매 빌드 검증

```
1️⃣ 인구 보존 법칙
   대륙 인구 ≈ 출생 × 평균 기대수명
   실제: (168,000명/년) × (70.4년 평균) ≈ 1,183만

2️⃣ 분포 합 100%
   Σ 지역별 출생비중 = 100%
   Σ 종족별 출생비중 = 100%
   Σ 신분별 비중 = 100%

3️⃣ 시뮬 vs 연감 일치
   sim_e0[race][region] ≈ almanac_e0[race][region] ± 2%
   
4️⃣ 사인 분포 일치
   sim_cause[cause] ≈ almanac_cause[cause] ± 15%
   (사건 분포가 더 불안정이므로 한계 넓음)

5️⃣ 칸 당 사건 밀도
   모든 종족 간 0.95~1.05배 (균등 페이싱)
```

### 4.2 자동 실행

```bash
# 빌드 시 매번 실행
pnpm build:almanac
# → generated/almanac-report.json
#   오류 시 빌드 중단
```

### 4.3 리포트 샘플

```json
{
  "status": "PASS",
  "timestamp": "2026-10-16T10:30:00Z",
  "checks": [
    {
      "name": "Population conservation",
      "expected": 11830000,
      "actual": 11820000,
      "delta_pct": -0.08,
      "pass": true
    },
    {
      "name": "Race e0 diff (elf/silvares)",
      "expected": 566.0,
      "actual": 565.8,
      "delta_pct": -0.04,
      "pass": true
    }
  ]
}
```

---

## 5. 집단 축이 운명이 아니라 환경으로 분해되는 원칙

### 5.1 문제: 인종주의 오독

원작에서:
- 오크 e0 = 38세 (평균)
- → 오독: "오크는 수명이 짧다"(생물학적 운명)

우리의 해결:

```
오크 e0 = 38세 ← 왜?
  ├─ 척도 나이화: k = 0.7
  │  (다른 종족보다 노화가 빠르지만, 이것만으로는 38세가 아님)
  └─ 환경: 바르가 초원 고위험
     ├─ 의료 1 (없음) → disease × e^{1.75}
     ├─ 치안 1 (매우 위험) → violence × e^{1.4}
     ├─ 마물 3 (많음) → monster × e^{1.6}
     └─ 결과: 환경만 인간보다 3배 위험

↓ 대조군
  아주르 오크: e0 = 49세 (같은 종족, 다른 지역)
  → 같은 종족, 다른 환경 = 다른 기대수명
```

### 5.2 신고서 «환경 분해 패널»

모든 사망 기록에 노출:

```
「북방 경계령의 인간 병사로 태어나, 34세에 마물 습격으로 떠났습니다.

북방의 기대수명은 31세입니다.
같은 종족(인간) 대륙 평균은 60세입니다.
차이 −29년은:
  · 환경 위험 (마물/전쟁/의료부족) −20년
  · 지역 신분(병사, q3) −5년
  · 그 밖 −4년

당신은 어느 왕국의 누구로 태어날까?」
```

### 5.3 구현: 환경 분해 계산

```typescript
function breakdownEnvironment(region: string, race: string): Breakdown {
  const baseline = 77.7 * raceScale[race]  // 환경 0, 유년초과 0
  const actual = e0[race][region]
  
  const childExcessLoss = calculateChild(region, race)
  const environmentLoss = calculateEnvironment(region, race)
  const agingLoss = calculateAging(race)  // 모두 같음
  
  return {
    baseline,
    childExcess: -childExcessLoss,
    environment: -environmentLoss,
    aging: -agingLoss,
    actual: baseline - childExcessLoss - environmentLoss - agingLoss,
  }
}
```

---

## 6. 확률 피치 정합

### 6.1 «백만 명 중 한 명» 정확하게 만들기

**피치**: 사용자가 보는 한 줄
> 용사는 백만 명 중 한 명입니다.

**시스템**: 게임 내 확률 수치
```
성흔 확률 = 0.00033% = 300,000명 중 1명
등극률 = 30%
실제 용사 = 0.00033% × 30% = 0.000099% ≈ 백만 명 중 1명
```

**정합 방법**:

```yaml
# content/omens/omen-table.yaml
- id: hero_mark
  probability: 0.000033    # 0.00033% 정확하게
  description: "용사의 성흔"
  badge: "30만 명 중 1명"
```

```typescript
// tools/schema/omen.schema.ts
const HERO_MARK_PROB = 0.000033
const ASCENSION_RATE = 0.30
const EXPECTED_HERO_PROB = HERO_MARK_PROB * ASCENSION_RATE
assert(
  abs(EXPECTED_HERO_PROB - 1e-6) < 1e-8,
  `성흔×등극 = 1e-6 검증 실패: ${EXPECTED_HERO_PROB}`
)
```

### 6.2 공유 카드 피치

```
③ 각성하지 못한 재능
┌─────────────────────────┐
│ 바르가 초원의 오크로 태어났습니다.
│ 마나 적성은 상위 0.4%였지만
│ 마탑 시험관은 끝내 오지 않았고,
│ 29세에 마나병으로 떠났습니다.
│
│ 이런 재능을 가진 아이의 절반은
│ 아무도 모른 채 떠납니다.
│
│ 너는 어느 왕국의 누구로 태어날까?
└─────────────────────────┘
```

←  "절반"은 마나병 사망 비율 = 50% (설정값)

---

## 7. 컨셉 슬롯

### 7.1 «컨셉 슬롯» 목록

| 슬롯 | 무명전 예시 | 새 컨셉 자리 |
|------|-----------|-----------|
| **생활권** | 곡창/초원/습지/변경/해안/광산/학술 | {새로운 7가지 생활권} |
| **원인변수 6개** | climate/security/wealth/monsters/medicine/plague | {6가지 환경 지표} |
| **종족** | 인간/오크/하플링/드워프/용인/엘프 | {새 종족 6~10종} |
| **신분 계층** | q1~q5 (농노~귀족) | {새로운 신분 구조} |
| **지역** | 루멘·바르가·카르둠 등 10곳 | {지역 맞춤 이름·문화} |
| **사인 카탈로그** | 늪열·기근·마물습격 등 37종 | {적절한 사인 37~50종} |
| **직업 연감** | 농부·광부·마법사 등 15개 | {직업 비중 및 위험} |
| **고유 시스템** | 마나/징조/전쟁/연감 | {3~5개 고유 시스템} |

### 7.2 «컨셉 적응 체크» (설계/01 참고)

```
새 컨셉에서:
- 원인 변수 6개를 정했는가?
- 지역별 calibration 값을 산출했는가?
- 사인 37종을 {지역 × 단계}에 맞춰 분배했는가?
- 신뢰구간 논리(기록있음/없음)가 서사에 맞는가?
```

---

## 8. 체크리스트: 연감 배포 전

```
[] 모든 지역의 data_quality 정의
[] confidenceInterval 계산 검증
[] 자기일관성 CI 전체 통과 (5개 항목 모두)
[] 사인 분포 ±15% 이내
[] 공유 카드 문구의 수치 정합(스크립트로 자동 검사)
[] 신고서 환경 분해 패널 계산 검증
[] 종족별 생활권 분배 (출생 지역이 문화적으로 일관됨)
```

