# @tgslot/slot-engine

순수 수학 엔진. DOM도 네트워크도 쓰지 않으며 서버와 클라이언트가 같은 코드를 공유한다.

```ts
import { parseGameMath, spin, evaluate, computeExactRtp, createSeededRng } from '@tgslot/slot-engine'
import { createCryptoRng } from '@tgslot/slot-engine/crypto-rng' // 서버 전용
```

| export | 하는 일 |
|---|---|
| `parseGameMath(json)` | `math.json` 검증. 스트립·페이라인·페이테이블 정합성까지 확인 |
| `spin(math, bet, rng, state?)` | 스핀 1회. 같은 시드 → 같은 결과. **베팅 레벨을 강제한다**. `state`가 있으면 프리스핀 |
| `assertBetLevel(math, totalBet)` | 총 베팅액이 `betLevels`에 있는 값인지 확인 |
| `evaluate(grid, math, betPerLine)` | 화면 심볼 → 승리 라인. 렌더러가 연출용으로 재계산할 때 |
| `getBetPerLine(math, totalBet)` | 총 베팅액 ÷ 라인 수 |
| `evaluateScatter(grid, math, totalBet)` | 화면 전체 스캐터를 세고 배당을 계산 |
| `computeExactRtp(math, totalBet, opts?)` | 정확한 RTP. 조합 수를 보고 전수 조사와 해석적 계산을 **자동으로 고른다** |
| `computeAnalyticRtp(math, totalBet)` | 전수 조사 없이 닫힌 식으로 구한 정확한 RTP |
| `simulate(math, totalBet, spins, rng)` | 몬테카를로. 큰 모델과 회귀 검증용 |
| `createSeededRng(seed)` | xoshiro128**. 결정론. 테스트·시뮬·provably fair |
| `createCryptoRng()` | `node:crypto` 원시 난수. 실제 스핀은 라운드마다 crypto로 만든 256비트 시드를 `createSeededRng(`${seed}:${nonce}`)`에 넣어 돌린다(provably fair). 이 함수는 검증이 필요 없는 호출자용 |

`createCryptoRng`는 브라우저 번들에 `node:crypto`가 딸려오지 않도록
`@tgslot/slot-engine/crypto-rng` 서브패스로만 노출한다.

## 규칙

- 배수의 기준은 **라인당 베팅액**이다. 총 베팅액은 `paylines.length`로 나누어떨어져야 한다.
- 승리는 왼쪽 릴부터 연속 매치만 인정한다. 라인당 한 번만 지급한다.
- **긴 연속이 이긴다.** 연속 길이 k에서는 k 이하 중 배당이 정의된 가장 긴 개수로 지급한다.
  스키마가 배수의 단조증가(짧은 연속이 긴 연속보다 많이 줄 수 없음)를 강제하므로
  이 규칙은 "가장 비싼 해석"과 항상 같은 결과를 낸다.
- **매치 개수 1**은 릴 0만 맞으면 지급한다는 뜻이다. 나머지 릴은 무엇이든 상관없다.
  클래식 슬롯의 "체리 1개" 배당이 이것이다.
- 와일드는 스캐터와 다른 와일드를 대체하지 않는다. 스캐터는 페이라인 페이테이블을 가질 수 없다.
- **지급액은 항상 정수 코인이다.** 스키마가 모든 `betLevels`에 대해
  `라인당 베팅액 x 배수`가 정수임을 강제한다. 코드의 `Math.round`는 부동소수 안전망일 뿐이며,
  라운딩이 RTP를 위로 밀어 올리는 일은 일어나지 않는다.
- `grid`는 `grid[row][reel]` 순서이고 `positions`는 `[reel, row]` 좌표다.
- `Math.random`은 쓰지 않는다.

## 심볼 그룹 (믹스 배당)

"아무 BAR 3개"처럼 종류가 섞여도 지급하는 배당은 `groups`로 만든다.

```json
"groups": {
  "anybar": { "name": { "en": "Any BAR", "ko": "아무 BAR" }, "members": ["bar1", "bar2", "bar3"] }
},
"paytable": { "bar1": { "3": 15 }, "anybar": { "3": 5 } }
```

- 그룹 연속은 왼쪽부터 **모든 심볼이 멤버인** 구간이다. 와일드는 멤버 하나라도 대체할 수 있으면 낀다.
- 라인당 지급은 여전히 한 번이다. 심볼 해석과 그룹 해석을 모두 따져 배수가 큰 쪽을 고른다.
- 배수가 같으면 **순수 심볼 해석이 이긴다**. 화면에 "Any BAR"보다 "Single BAR"가 뜨는 편이 자연스럽다.
- 그룹 지급이면 `WinLine.symbol`이 그룹 id가 되고 `WinLine.group`에도 같은 값이 들어간다.
  클라이언트는 `group`이 있는지로 라벨을 고르면 된다.
- 그룹 id는 심볼 id와 겹칠 수 없고, 멤버는 선언된 심볼이면서 최소 한 릴의 스트립에 있어야 한다.
  스캐터는 멤버가 될 수 없다.

## 기본 RTP와 체감 RTP

엔진이 재는 것은 **기본 게임 RTP**뿐이다. `math.rtpTarget`도 기본 게임의 목표값이다.

허브가 얹어 주는 잭팟처럼 수학 모델 밖에서 돌아오는 몫은 `computeExactRtp`에 잡히지 않는다.
그 값은 manifest의 `jackpotContribution`에 적고, 둘을 더한 것이 플레이어 체감 RTP(`rtpTotalTarget`)다.
페이테이블만으로 목표 체감 RTP를 맞추면 허브 기여분만큼 하우스 엣지가 사라진다.

## 스캐터와 프리스핀

```json
"scatter": {
  "symbol": "scatter",
  "pays": { "3": 2, "4": 10, "5": 50 },
  "freeSpins": { "trigger": 3, "count": 10, "multiplier": 2, "retrigger": true }
}
```

- 스캐터는 페이라인과 무관하게 **화면에 보이는 칸 전부**를 센다. 한 릴에 2개가 보이면 2개다.
- 배수의 기준이 **총 베팅액**이다. 페이테이블(라인당 베팅액)과 다르니 주의할 것.
- 와일드는 스캐터를 절대 대체하지 않는다. 스캐터는 페이라인 페이테이블을 가질 수 없다.
- `spin(math, bet, rng, state)`에 `state`를 주면 프리스핀으로 처리한다.
  승리에 `state.multiplier`가 곱해지고 `state.freeSpinsLeft`가 1 줄어든다.
  0이 되면 `nextState`가 없다. 리트리거가 켜져 있고 다시 트리거되면 `count`회가 더 붙는다.
- `wins[].win`, `lineWin`, `scatterWin`은 **배수를 곱하기 전** 값이다.
  `totalWin = (lineWin + scatterWin) x multiplier` 하나만 배수가 적용된 값이다.

## 해석적 RTP

5릴 게임은 정지 조합이 수억 개라 전수 조사가 불가능하다. 대신 닫힌 식으로 정확한 값을 구한다.
`computeExactRtp`가 조합 수를 보고 `MAX_ENUMERATION_COMBOS`(500만) 이하면 전수 조사를,
넘으면 `computeAnalyticRtp`를 쓴다. 결과의 `method`로 어느 경로였는지 알 수 있다.

**1. 페이라인.** 릴이 서로 독립이고 정지 위치가 균등하므로, 어떤 페이라인이든 릴 r에서 보는
심볼의 주변분포는 릴 r의 스트립 빈도와 같다. 기대값은 선형이라 라인끼리의 상관은 상관없다.
라인 수 x 라인당 베팅액 = 총 베팅액이므로, **라인 1개의 기대 배수가 곧 총 베팅액 기준 라인 RTP**다.
계산은 릴을 왼쪽부터 훑는 DFS다. 후보는 매치 집합에 없는 심볼을 만나면 죽고 그 시점의 연속 길이로
배당이 확정된다. 살아남은 후보가 없으면 남은 릴이 결과를 바꾸지 못하므로 거기서 가지를 자른다.

**2. 스캐터.** 릴 하나의 보이는 창(rows칸)에 스캐터가 k개 들어갈 확률은 스트립을 한 바퀴
훑으면 정확히 나온다. 릴이 독립이므로 화면 전체 개수 분포는 그 합성곱이다.

**3. 프리스핀.** 프리스핀은 유료 스핀과 같은 스트립을 돌리므로 한 회당 기대값이
`(라인 + 스캐터) x multiplier`다. 남은 것은 기대 횟수다. 부여된 스핀 1회가 스스로를 포함해
낳는 기대 스핀 수를 g라 하면, 그 스핀에서 확률 p로 count회가 더 부여되므로

```
g = 1 + p * count * g        =>   g = 1 / (1 - count * p)
기대 총 횟수 = count * g     =    count / (1 - count * p)
```

`count * p >= 1`이면 발산한다. 그런 모델은 만들면 안 되므로 예외로 막는다.
리트리거가 없으면 기대 횟수는 그냥 `count`다. 최종적으로

```
RTP = base + p * (count / (1 - count * p)) * multiplier * base       (base = 라인 + 스캐터)
```

`breakdown`에 이 세 조각이 그대로 들어가고 합이 `rtp`다.

**검증.** 3릴 + 스캐터 + 프리스핀 모델에서 전수 조사와 해석값이 소수점 12자리까지 일치하는지
테스트로 고정해 뒀다(`analytic.test.ts`). `fruit-fiesta`는 500만 라운드 몬테카를로와
0.07 표준오차 안에서 일치한다.

**한계.** 적중률·최대 배수·배수 분포는 라인끼리 상관이 있어 닫힌 식이 없다.
해석 모드에서는 그 셋만 고정 시드 몬테카를로로 추정하고 `distributionIsExact: false`로 표시한다.
`sampleSpins: 0`을 주면 표본을 뽑지 않고 RTP만 낸다.

## 베팅액 검사

`spin()`은 `assertBetLevel`로 총 베팅액이 `math.betLevels`에 선언된 값인지 확인한다.
클라이언트가 임의 금액을 보내 페이테이블의 빈틈을 노리는 것을 막는 서버 측 관문이다.

`computeExactRtp`와 `simulate`는 튜닝 편의를 위해 이 검사를 하지 않는다.
라인 수로 나누어떨어지는 값이면 무엇이든 받는다. 둘 다 실제 스핀 경로가 아니다.

## Provably fair

엔진은 `Rng` 인터페이스만 받는다. 같은 시드를 넣으면 같은 결과가 나오므로
라운드 전에 serverSeed 해시를 공개하고 라운드 후 seed를 공개하면 유저가 결과를 검증할 수 있다.

**시드와 시드 해시는 `SpinResult`에 넣지 않는다.** 그것은 API의 라운드 레코드(`rounds` 테이블)가
소유하는 정보이고 Phase 2에서 붙인다. 엔진은 난수의 출처를 알 필요가 없고,
`SpinResult`는 "이번 스핀에 무슨 일이 일어났는가"만 담는다.

`SpinResult.nextState`(`RoundState`)는 프리스핀 잔여 횟수처럼 다음 스핀으로 넘길 상태를 위한
자리다. Phase 1 엔진은 채우지 않는다.
