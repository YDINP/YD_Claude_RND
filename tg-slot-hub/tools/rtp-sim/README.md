# @tgslot/rtp-sim

`math.json`의 RTP·적중률·최대 배수를 측정하는 CLI, 그리고 CI 게이트 테스트.

```bash
pnpm --filter @tgslot/rtp-sim sim classic-777 --exact
pnpm --filter @tgslot/rtp-sim sim games/classic-777/math.json --bet 100 --spins 1000000 --seed 42
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--bet` | 100 | 총 베팅액. 라인 수로 나누어떨어져야 한다 |
| `--spins` | 1,000,000 | 몬테카를로 스핀 수 |
| `--seed` | 42 | 시드. 같은 시드는 같은 결과 |
| `--exact` | off | 전수 조사만 하고 몬테카를로는 건너뛴다 |

대상은 게임 id / 게임 폴더 / `math.json` 경로 아무거나 받는다.
`pnpm --filter`로 실행돼 cwd가 패키지 폴더여도 워크스페이스 루트 기준으로 다시 찾는다.

## 게이트 테스트

```bash
pnpm --filter @tgslot/rtp-sim test
```

`src/games.test.ts`가 `games/*`를 스캔한다(`_`로 시작하는 폴더 제외). 등록 절차는 없다.
폴더만 만들면 검사 대상이 되고, 다음을 모두 통과해야 한다.

- `math.json`이 **존재하고** 스키마를 통과
- `math.json`의 `id`가 폴더 이름과 일치
- **모든** `betLevels`에서 전수 조사 RTP가 `rtpTarget` ± 0.5%p 안
- 적중률 10~60%, 최대 배수 100x 이상
- `manifest.json`이 **존재하고** `math.json`의 id·reels·rows·라인 수·betLevels·rtpTarget·volatility와 일치

`math.json`이나 `manifest.json`이 없는 폴더는 조용히 건너뛰지 않고 **실패한다**.
팩 하나가 깨져도 다른 팩의 테스트는 그대로 돈다. 실패는 자기 `it` 안에 갇힌다.

Phase 5 양산의 안전장치다.
