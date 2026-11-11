# live 6팩 회귀 기준점 (E0)

기준 커밋: `bb0ac97` 엔진(연쇄·클러스터 작업 착수 전). 계획: `docs/PLAN_candy-cluster-pop.md` §2 E0.

## 1. 골든 해시

- 테스트: `packages/slot-engine/src/golden.test.ts`, 기준값 `src/__golden__/hashes.json`
- 팩마다 시드 `golden-<id>`, 베팅액 `betLevels[0]`, 유료 2,000라운드(프리스핀은 끝까지)
- `JSON.stringify(SpinResult[])`의 sha256. 엔진을 고친 뒤에도 6/6 같아야 한다
- 의도한 변경일 때만 `UPDATE_GOLDEN=1 pnpm exec vitest run src/golden.test.ts`로 다시 쓴다

## 2. 2M 시뮬레이션 (seed 42)

`pnpm --filter @tgslot/rtp-sim sim <id> --spins 2000000 --seed 42` (총 베팅 100, 기본 게임 RTP, σ는 라운드 배수 기준).

| 팩 | RTP | 적중률 | σ | 최대 승리 | 프리스핀 진입 |
|---|---:|---:|---:|---:|---:|
| astral-clocktower | 94.334% | 29.057% | 4.580 | 353.90x | 0.4799% |
| classic-777 | 94.361% | 41.639% | 3.193 | 131.60x | — |
| fruit-fiesta | 94.843% | 30.527% | 4.629 | 325.10x | 1.7304% |
| royal-diamond-777 | 94.396% | 35.041% | 3.160 | 243.80x | 1.0646% |
| sheriff-sixgun | 94.548% | 31.963% | 4.830 | 473.70x | 1.8076% |
| shiba-shrine | 94.593% | 35.337% | 4.399 | 325.56x | 2.2720% |

엔진 변경 뒤 같은 명령으로 위 수치가 소수점까지 같아야 한다(G1 "live 2M 수치 동일").
