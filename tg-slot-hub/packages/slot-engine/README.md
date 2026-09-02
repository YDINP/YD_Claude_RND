# @tgslot/slot-engine

순수 수학 엔진. DOM도 네트워크도 쓰지 않으며 서버와 클라이언트가 같은 코드를 공유한다.

```ts
import { parseGameMath, spin, evaluate, computeExactRtp, createSeededRng } from '@tgslot/slot-engine'
import { createCryptoRng } from '@tgslot/slot-engine/crypto-rng' // 서버 전용
```

| export | 하는 일 |
|---|---|
| `parseGameMath(json)` | `math.json` 검증. 스트립·페이라인·페이테이블 정합성까지 확인 |
| `spin(math, bet, rng)` | 스핀 1회. 같은 시드 → 같은 결과. **베팅 레벨을 강제한다** |
| `assertBetLevel(math, totalBet)` | 총 베팅액이 `betLevels`에 있는 값인지 확인 |
| `evaluate(grid, math, betPerLine)` | 화면 심볼 → 승리 라인. 렌더러가 연출용으로 재계산할 때 |
| `getBetPerLine(math, totalBet)` | 총 베팅액 ÷ 라인 수 |
| `computeExactRtp(math, totalBet)` | 전 조합 전수 조사. 3릴 모델의 **정확한** RTP |
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
- 와일드는 스캐터와 다른 와일드를 대체하지 않는다. 스캐터는 페이라인 페이테이블을 가질 수 없다.
- **지급액은 항상 정수 코인이다.** 스키마가 모든 `betLevels`에 대해
  `라인당 베팅액 x 배수`가 정수임을 강제한다. 코드의 `Math.round`는 부동소수 안전망일 뿐이며,
  라운딩이 RTP를 위로 밀어 올리는 일은 일어나지 않는다.
- `grid`는 `grid[row][reel]` 순서이고 `positions`는 `[reel, row]` 좌표다.
- `Math.random`은 쓰지 않는다.

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
