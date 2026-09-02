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

## 검수 리포트 (audit)

```bash
pnpm --filter @tgslot/rtp-sim run audit classic-777
pnpm --filter @tgslot/rtp-sim run audit games/classic-777 --spins 2000000 --seed 42 --out docs/RTP_AUDIT_classic-777.md
```

`run`을 빼면 안 된다. `pnpm audit`은 pnpm 내장 취약점 스캔 명령이라 우리 스크립트 대신 그쪽이 실행된다.

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--spins` | 2,000,000 | 몬테카를로 스핀 수 |
| `--seed` | 42 | 시드 |
| `--bet` | 100 | 검수 베팅액. `betLevels`에 100이 없으면 첫 레벨 |
| `--out` | `docs/RTP_AUDIT_<id>.md` | 리포트 경로 (워크스페이스 루트 기준) |
| `--stdout` | off | 파일 대신 표준출력 |

한국어 마크다운으로 다음을 낸다.

- 맨 위에 게이트 판정 요약 (통과/실패 목록). 하나라도 실패하면 종료 코드 1
- 게임 요약, 전수 조사 RTP·적중률·최대 배수, 베팅 레벨별 표
- 몬테카를로 RTP와 95% 신뢰구간(RTP ± 1.96·σ/√n), 전수 조사와의 차이 판정(3·SE)
- 심볼별·그룹별·라인별·매치 개수별 RTP 기여 (합계는 전체 RTP와 정확히 일치)
- 배수 분포 히스토그램, 변동성과 파산 확률, 잭팟 회계

계산은 전부 `src/audit/`에 있다. 그 폴더는 `node:*`를 쓰지 않아 브라우저에서도 돌고,
`@tgslot/rtp-sim/audit` 서브패스로 나가 [`apps/sim`](../../apps/sim/README.md) GUI가 같은 함수를 쓴다.
