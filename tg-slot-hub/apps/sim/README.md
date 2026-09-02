# @tgslot/sim

`math.json`의 RTP를 눈으로 뜯어보는 검수 시뮬레이터. 서버 없이 브라우저에서 전부 돈다.

```bash
pnpm --filter @tgslot/sim dev     # http://localhost:5180
pnpm --filter @tgslot/sim test
pnpm --filter @tgslot/sim build
```

## 무엇을 보여 주나

| 영역 | 내용 |
|---|---|
| KPI 타일 | 전수 조사 RTP, 몬테카를로 RTP ± 95% CI, 적중률, 최대 배수, 표준편차, 잭팟 포함 총 RTP |
| 게이트 판정 | CLI 리포트와 **같은 판정 목록**. 둘 다 `@tgslot/rtp-sim/audit`을 쓴다 |
| 차트 | 배수 분포 히스토그램(확률은 로그 축), 심볼별·라인별 RTP 기여, 몬테카를로 수렴 곡선 |
| 표 | 베팅 레벨별 전수 조사, 심볼·그룹·라인·매치 개수별 기여, 배수 분포, 파산 확률 |
| 샘플 스핀 | 시드로 뽑은 20회 + "스핀 1회". 격자와 승리 라인을 그대로 찍는다. 연출은 없다 |

"검수 결과 내보내기"는 CLI가 만드는 것과 **같은 마크다운**을 내려받는다
(`buildAuditMarkdown` 하나를 공유한다).

## 어떻게 도나

- 게임 팩은 `import.meta.glob('../../../games/*/{manifest,math}.json', { eager: true })`으로
  빌드 타임에 번들에 들어간다. `_`로 시작하는 폴더(`_template`)는 제외한다.
  fetch도 dev 미들웨어도 쓰지 않으므로 `pnpm build` 결과를 정적 호스팅에 그냥 올려도 된다.
- **전수 조사**는 메인 스레드에서 돈다. 3릴 모델은 조합이 3만 개 수준이라 순식간이다.
- **몬테카를로와 파산 시뮬**은 Web Worker(`src/lib/mc.worker.ts`)에서 돈다.
  100만 스핀을 메인 스레드에서 돌리면 UI가 통째로 멎기 때문이다.
  워커는 1%마다 누적 RTP를 보내고, 그 값이 진행률 표시와 수렴 곡선이 된다.
  워커는 **메시지를 받아야** 일을 시작한다. 만들어 놓고 `postMessage`를 빼먹으면
  아무 에러 없이 0%에 멈춘 것처럼 보인다. 그 회귀는 `src/lib/mcClient.test.ts`가 막는다.
- 워커가 로드에 실패하거나(`onerror`) 메시지 복제에 실패하면(`onmessageerror`)
  왼쪽 패널에 빨간 경고로 이유가 뜨고 콘솔에도 남는다. 조용히 멎지 않는다.
- `src/lib/workerPurity.test.ts`가 워커의 import 그래프에 `node:*`가 끼는 것을 막는다.
  (`@tgslot/slot-engine/crypto-rng`는 `node:crypto`를 쓰는 서버 전용 서브패스다.)
- 계산은 하나도 여기 없다. 전부 `@tgslot/rtp-sim/audit`(과 그 아래 `@tgslot/slot-engine`)에 있다.
  이 앱은 그리기만 한다. 그래서 CLI 리포트와 GUI 숫자가 어긋날 수 없다.

## 게임을 바꾸면

게임이나 베팅 레벨을 바꾸는 순간 이전 측정값은 버린다.
다른 조건의 숫자가 화면에 남아 있는 것이 가장 위험하기 때문이다.

## 차트

차트 라이브러리를 쓰지 않는다. 전부 인라인 SVG(`src/components/BarChart.tsx`,
`ConvergenceChart.tsx`)다. 막대 몇 개와 폴리라인 하나에 번들 수백 KB를 얹을 이유가 없다.
