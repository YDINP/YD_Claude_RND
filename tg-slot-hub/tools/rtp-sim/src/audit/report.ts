import { pp, requiredAuditSpins, roundAuditSpins } from './stats.js'
import { rouletteSections } from './rouletteStats.js'
import { forgeSections } from './forgeStats.js'
import { gardenSections } from './gardenStats.js'
import { frostSections } from './frostStats.js'
import type {
  AuditResult,
  BoardReport,
  CascadeReport,
  CoinRespinReport,
  OrderReport,
  DistributionMethod,
  MutationStatRow,
  WaysContributionRow,
  ContributionRow,
  CountContributionRow,
  HistogramRow,
  LineContributionRow,
} from './types.js'

const OK = '✅'
const NG = '❌'
/** 표본에서 온 값이라는 표시. 전수 조사 값과 섞이지 않게 한다. */
const ESTIMATED = '_(표본 추정)_'

function methodLabel(method: DistributionMethod): string {
  if (method === 'enumerate') return '전수 조사'
  return method === 'analytic' ? '해석적 계산' : '몬테카를로'
}

/** 확률을 "N회에 1회" 꼴로. 0이면 '-'. */
function triggerOdds(probability: number): string {
  return probability <= 0 ? '-' : Math.round(1 / probability).toLocaleString('en-US')
}

function pct(value: number, digits = 4): string {
  return `${(value * 100).toFixed(digits)}%`
}

function num(value: number): string {
  return value.toLocaleString('en-US')
}

function table(header: string[], rows: string[][]): string {
  const separator = header.map(() => '---')
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function contributionTable(rows: ContributionRow[], keyHeader: string): string {
  if (rows.length === 0) return '_해당 없음._'
  return table(
    [keyHeader, '이름', 'RTP 기여', '전체 대비', '지급 라인 수', '지급 코인'],
    rows.map((row) => [
      `\`${row.key}\``,
      row.label,
      pct(row.rtp),
      pct(row.share, 2),
      num(row.hits),
      num(row.win),
    ]),
  )
}

function lineTable(rows: LineContributionRow[]): string {
  return table(
    ['라인', '패턴', 'RTP 기여', '전체 대비', '지급 라인 수'],
    rows.map((row) => [
      `#${row.line}`,
      `[${row.pattern.join(', ')}]`,
      pct(row.rtp),
      pct(row.share, 2),
      num(row.hits),
    ]),
  )
}

function waysTable(rows: WaysContributionRow[]): string {
  if (rows.length === 0) return '_해당 없음._'
  return table(
    ['경로 수', '방향', 'RTP 기여', '전체 대비', '지급 건수', '지급 코인'],
    rows.map((row) => [
      `${num(row.ways)} ways`,
      row.direction === 'ltr' ? '왼→오' : '오→왼',
      pct(row.rtp),
      pct(row.share, 2),
      num(row.hits),
      num(row.win),
    ]),
  )
}

function mutationTable(rows: MutationStatRow[]): string {
  if (rows.length === 0) return '_해당 없음._'
  return table(
    ['뮤테이션', '발동 스핀', '발동 빈도', '바뀐 칸', 'RTP 몫', '전체 대비'],
    rows.map((row) => [
      `\`${row.type}\``,
      num(row.spins),
      pct(row.frequency, 3),
      num(row.cellsChanged),
      pct(row.rtp),
      pct(row.share, 2),
    ]),
  )
}

function countTable(rows: CountContributionRow[], cluster = false): string {
  return table(
    [cluster ? '크기' : '매치 개수', 'RTP 기여', '전체 대비', cluster ? '지급 건수' : '지급 라인 수', '지급 코인'],
    rows.map((row) => [
      cluster ? `${row.count}칸` : `${row.count}개 연속`,
      pct(row.rtp),
      pct(row.share, 2),
      num(row.hits),
      num(row.win),
    ]),
  )
}

function histogramTable(rows: HistogramRow[], rtp: number): string {
  return table(
    ['배수 구간', '조합 수', '확률', 'RTP 기여', '전체 대비'],
    rows.map((row) => [
      row.label,
      num(row.combos),
      pct(row.probability),
      pct(row.rtpShare),
      rtp === 0 ? '-' : pct(row.rtpShare / rtp, 2),
    ]),
  )
}

function fixed(value: number, digits = 4): string {
  return value.toFixed(digits)
}

/** 연쇄 절. 깊이 분포·사다리 단계·클러스터 크기·캡. */
function cascadeSections(cascade: CascadeReport): string[] {
  const b = cascade.breakdown
  return [
    '## 5-3. 연쇄',
    '',
    '클러스터 배당은 **총 베팅액 기준**이다(총 베팅액 x 페이테이블 배수 x 그 단계의 사다리 배수).',
    `깊이는 한 스핀에서 지급된 연쇄 단계 수다. P(지속)은 유료 스핀의 단계 합산으로 (Σ깊이 − 첫 클러스터 스핀) / Σ깊이다. ${ESTIMATED}`,
    '',
    table(
      ['지표', '값'],
      [
        ['최초 클러스터율 (유료 스핀)', pct(cascade.firstClusterRate)],
        ['평균 연쇄 (첫 클러스터가 터진 스핀)', fixed(cascade.meanCascades)],
        ['P(지속)', fixed(cascade.continueProbability)],
        ['3연쇄 이상 (유료 스핀)', pct(cascade.depth3PlusRate)],
        [
          `maxCascades(${cascade.maxCascades}) 도달`,
          `${pct(cascade.maxCascadesHitRate, 6)} (${num(cascade.maxCascadesHits)}스핀)`,
        ],
        ['winCapped 도달', `${pct(cascade.winCappedRate, 6)} (${num(cascade.winCappedSpins)}스핀)`],
        ['캡 on/off 차 (잘린 지급)', `${pct(cascade.capLossRtp)} — 캡을 끄면 RTP가 대략 이만큼 오른다`],
        ['관측 스핀', `유료 ${num(cascade.paidSpins)} + 라운드 ${num(cascade.roundSpins)}`],
      ],
    ),
    '',
    '### 지급 출처',
    '',
    table(
      ['출처', 'RTP 몫'],
      [
        ['기본 클러스터 (lines)', pct(b.lines)],
        ['기본 스캐터 (scatter)', pct(b.scatter)],
        ['기본 게임 합', pct(b.base)],
        ['주문 카드 상품 (orderPrize)', pct(b.orderPrize)],
        ['라운드 클러스터 (roundClusters, 라운드 스캐터 포함)', pct(b.roundClusters)],
        ['라운드 합', pct(b.round)],
        ['합계 (표본)', pct(b.base + b.round)],
      ],
    ),
    '',
    '### 연쇄 깊이 분포',
    '',
    table(
      ['깊이', '유료 스핀', '유료 확률', '라운드 스핀'],
      cascade.depth.map((row) => [String(row.depth), num(row.base), pct(row.baseProbability), num(row.round)]),
    ),
    '',
    '### 사다리 단계별 지급',
    '',
    table(
      ['단계', '사다리 배수', '지급 클러스터 수', 'RTP 몫'],
      cascade.ladder.map((row) => [`#${row.index + 1}`, `x${row.multiplier}`, num(row.hits), pct(row.rtp)]),
    ),
    '',
    '### 클러스터 크기 분포',
    '',
    table(
      ['크기', '지급 클러스터 수', 'RTP 몫', '클러스터 지급 대비'],
      cascade.clusterSizes.map((row) => [`${row.size}칸`, num(row.hits), pct(row.rtp), pct(row.share, 2)]),
    ),
    '',
  ]
}

/** 코인 리스핀 절. 진입·리스핀 횟수·촉수 감기·보물·15칸·캡·지급 분해. */
function coinRespinSections(report: CoinRespinReport): string[] {
  const b = report.breakdown
  return [
    '## 5-3. 코인 리스핀',
    '',
    `코인 금액·보물은 **총 베팅액 배수**다. 리스핀은 트리거 스핀 하나에서 다 풀리므로 스핀 = 라운드다. 비율의 분모는 따로 적지 않으면 리스핀 라운드 수다. ${ESTIMATED}`,
    '',
    table(
      ['지표', '값'],
      [
        ['진입 (유료 스핀)', `1/${triggerOdds(report.entryRate)} (${pct(report.entryRate)}, ${num(report.rounds)}라운드) · 목표 1/${report.targetOdds}`],
        ['피처 평균 지급', `${fixed(report.meanFeatureMultiplier, 2)}x (σ ${fixed(report.featureSigma, 2)}x, 최대 ${fixed(report.maxFeatureMultiplier, 1)}x)`],
        ['평균 리스핀 / 최장', `${fixed(report.meanSteps, 2)}회 / ${report.maxSteps}회 (구조상 최대 ${report.structuralMaxSteps}, 위반 ${report.overSteps})`],
        [`hardCap(${report.hardCap}) 도달`, `${num(report.hardCapRounds)}라운드`],
        ['q x 빈칸 (정적)', fixed(report.growthBound, 4)],
        ['종료 코인 평균', fixed(report.meanFinalCoins, 2)],
        ['15칸 채움', pct(report.fullRate)],
        ['진입하자마자 촉수 감기', pct(report.entryWrapRate, 2)],
        ['리스핀 도중 촉수 감기 1회 이상', pct(report.midWrapRate, 2)],
        ['라운드당 감긴 줄', fixed(report.wrapsPerRound, 3)],
        ['보물 등장 (작은 / 중간 / 큰)', `${pct(report.tierRates.small, 2)} / ${pct(report.tierRates.medium, 2)} / ${pct(report.tierRates.large, 3)}`],
        ['winCapped 도달', `${num(report.winCappedRounds)}라운드 · 캡 on/off 차 ${pct(report.capLossRtp)}`],
        ['코인이 1개 이상 뜬 유료 스핀', pct(report.coinBoardRate, 2)],
        ['기대감(남은 릴 감속) 발생 (유료 스핀)', pct(report.anticipationRate, 2)],
      ],
    ),
    '',
    '### 지급 분해',
    '',
    table(
      ['출처', 'RTP 몫'],
      [
        ['라인 (트리거 스핀 포함)', pct(b.lines)],
        ['숫자 코인 (감기 전 금액)', pct(b.respinNumeric)],
        ['촉수 감기 보너스', pct(b.respinWrapBonus)],
        ['보물 코인', pct(b.respinTreasure)],
        ['최고 보물 (15칸)', pct(b.respinTop)],
        ['캡 손실', `−${pct(b.capLoss)}`],
        ['코인 리스핀 합', pct(b.respin)],
        ['합계 (표본)', pct(b.total)],
      ],
    ),
    '',
    '### 종료 코인 수 분포',
    '',
    table(
      ['코인', '라운드', '확률'],
      report.finalCoins.map((row) => [String(row.coins), num(row.rounds), pct(row.probability, 3)]),
    ),
    '',
    '### 리스핀 횟수 분포',
    '',
    table(
      ['리스핀', '라운드', '확률'],
      report.stepCounts.map((row) => [String(row.steps), num(row.rounds), pct(row.probability, 3)]),
    ),
    '',
    '### 라운드당 촉수 감기 수',
    '',
    table(
      ['감긴 줄', '라운드', '확률'],
      report.wrapCounts.map((row) => [String(row.wraps), num(row.rounds), pct(row.probability, 3)]),
    ),
    '',
  ]
}

/** 말판 절. 진입률·평균 지급·종료 사유·던지기 분포·갈림길률을 DP 정확값과 나란히. */
function boardSections(board: BoardReport): string[] {
  const b = board.breakdown
  return [
    '## 5-3. 말판 보너스',
    '',
    `말판 지급 = max(최소 지급, 바구니 x 배수), **총 베팅액 배수**다. «DP»는 엔진 \`boardExpectation\`의 정확값, «MC»는 이번 표본이다. ${ESTIMATED}`,
    '',
    table(
      ['지표', 'MC', 'DP'],
      [
        ['진입 (유료 스핀)', `1/${triggerOdds(board.entryRate)} (${num(board.boards)}판)`, '-'],
        ['평균 지급', `${fixed(board.meanPayout, 3)}x ± ${fixed(1.96 * board.stdErr, 3)}`, `${fixed(board.exactMean, 3)}x`],
        ['표준편차', fixed(board.sdPayout, 2), fixed(board.exactSd, 2)],
        ['최대 지급', `${board.maxPayout}x`, `${board.exactMax}x (maxWin ${board.maxWin}x)`],
        ['평균 던지기', fixed(board.meanThrows, 3), fixed(board.exactMeanThrows, 3)],
        ['최장 던지기', `${board.longestThrows}번 (위반 ${board.overMaxThrows})`, `maxThrows ${board.maxThrows}`],
        ['갈림길에 멈춤', pct(board.forkRate, 2), pct(board.exactForkRate, 2)],
        ['최소 지급 적용', pct(board.minPayoutRate, 2), pct(board.exactMinPayoutRate, 2)],
        ['winCapped 도달', `${num(board.winCappedSpins)}스핀`, '-'],
      ],
    ),
    '',
    '### 지급 출처',
    '',
    table(
      ['출처', 'RTP 몫'],
      [
        ['기본 라인 (lines)', pct(b.lines)],
        ['기본 스캐터 (scatter)', pct(b.scatter)],
        ['말판 (board)', pct(b.board)],
        ['합계 (표본)', pct(b.lines + b.scatter + b.board)],
      ],
    ),
    '',
    '### 종료 사유',
    '',
    table(
      ['사유', '판', 'MC', 'DP'],
      board.ends.map((row) => [
        row.end === 'goal' ? '결승 도착' : row.end === 'traps' ? '등불이 모두 꺼짐 (함정)' : '기회를 다 씀',
        num(row.count),
        pct(row.probability, 2),
        pct(row.exact, 2),
      ]),
    ),
    '',
    '### 던지기 수 분포',
    '',
    table(
      ['던지기', '판', 'MC', 'DP'],
      board.throws.map((row) => [String(row.throws), num(row.count), pct(row.probability, 2), pct(row.exact, 2)]),
    ),
    '',
    '### 끝 배수 분포',
    '',
    table(
      ['배수', '판', 'MC', 'DP'],
      board.multipliers.map((row) => [`x${row.multiplier}`, num(row.count), pct(row.probability, 2), pct(row.exact, 2)]),
    ),
    '',
    '### 지급 구간 (총 베팅 배수)',
    '',
    table(
      ['구간', '판', '비율'],
      board.payoutBuckets.map((row) => [row.label, num(row.count), pct(row.probability, 2)]),
    ),
    '',
  ]
}

/** 주문 카드 절. 등장률·완료율·라운드 길이·완료 장수. */
function orderSections(orders: OrderReport, breakdown: CascadeReport['breakdown']): string[] {
  return [
    '## 5-4. 주문 카드 라운드',
    '',
    `라운드 진입은 유료 스핀 기준이다. 완료율 = 완료 장수 / 등장 장수(실제로 판에 올라 플레이된 카드). ${ESTIMATED}`,
    '',
    table(
      ['지표', '값'],
      [
        ['라운드 진입률', `${pct(orders.entryRate)} (약 ${triggerOdds(orders.entryRate)}스핀에 1회)`],
        ['라운드 수', num(orders.rounds)],
        ['평균 라운드 길이', `${fixed(orders.meanLength, 3)}스핀`],
        ['최장 라운드', `${orders.maxLength}스핀 (허용 ${orders.longestAllowed}, 위반 ${num(orders.overLength)}건)`],
        ['라운드당 완료 장수', fixed(orders.cardsPerRound)],
        ['카드 완료율 (전체)', pct(orders.completionRate, 2)],
        ['상품 몫', pct(breakdown.orderPrize)],
        ['라운드 클러스터 몫', pct(breakdown.roundClusters)],
        ['라운드 몫', pct(breakdown.round)],
      ],
    ),
    '',
    '### 종류별 완료율',
    '',
    table(
      ['종류', '등장', '완료', '완료율'],
      orders.byKind.map((row) => ['`' + row.kind + '`', num(row.dealt), num(row.completed), pct(row.rate, 2)]),
    ),
    '',
    '### 카드별',
    '',
    table(
      ['id', '종류', 'target', '상품', '등장', '라운드당 등장', '완료', '완료율', '상품 RTP'],
      orders.byId.map((row) => [
        '`' + row.id + '`',
        row.kind,
        String(row.target),
        `${row.prize}x`,
        num(row.dealt),
        fixed(row.dealtPerRound, 3),
        num(row.completed),
        pct(row.rate, 2),
        pct(row.prizeRtp),
      ]),
    ),
    '',
    '### 라운드 길이 분포',
    '',
    table(
      ['길이', '라운드 수', '확률'],
      orders.lengths.map((row) => [`${row.length}스핀`, num(row.rounds), pct(row.probability, 3)]),
    ),
    '',
    '### 라운드당 완료 장수 분포',
    '',
    table(
      ['완료 장수', '라운드 수', '확률'],
      orders.completions.map((row) => [`${row.completed}장`, num(row.rounds), pct(row.probability, 3)]),
    ),
    '',
  ]
}

/** 검수 결과를 한국어 마크다운 리포트로. CLI의 `--out` 파일과 GUI의 내보내기가 같은 함수를 쓴다. */
export function buildAuditMarkdown(result: AuditResult): string {
  const { game, distribution: dist, features, mc, agreement, ruin, jackpot } = result
  const title = game.nameKo ?? game.nameEn ?? game.id
  const passed = result.gates.filter((gate) => gate.pass).length
  const allPass = passed === result.gates.length

  const sections: string[] = []
  /** 스캐터가 프리스핀이 아니라 말판 보너스를 여는 팩. 프리스핀 줄은 0뿐이라 오해만 부른다. */
  const boardOnly = dist.board !== undefined && mc.freeSpinsPlayed === 0 && (features === null || features.spinsPerTrigger === 0)

  sections.push(
    `# RTP 검수 리포트 — ${title} (\`${game.id}\`)`,
    '',
    `- 생성 시각: ${result.generatedAt}`,
    game.payModel === 'cluster' || game.payModel === 'anywhere'
      ? `- 검수 베팅액: ${num(result.options.totalBet)} 코인 (${game.payModel === 'anywhere' ? '위치 무관' : '클러스터'} 배당은 총 베팅액 기준)`
      : `- 검수 베팅액: ${num(result.options.totalBet)} 코인 (라인당 ${num(dist.betPerLine)})`,
    ...(result.options.shards === undefined
      ? []
      : [`- 시드 샤딩: 워커 ${result.options.shards}개, 샤드 i의 시드 \`${result.options.seed}:shard-i\`, 스핀은 균등 분할 후 합산`]),
    `- 몬테카를로: ${num(result.options.spins)} 스핀, 시드 \`${result.options.seed}\``,
    `- RTP 산출: **${methodLabel(dist.method)}**${
      dist.estimated
        ? ` — 분포·기여도는 ${num(dist.observations)} 스핀 표본 추정 (시드 \`${dist.sampleSeed ?? ''}\`)`
        : ' — 모든 조합을 남김없이 계산'
    }`,
    ...(dist.precision === null
      ? []
      : [
          `- RTP 정밀도: 표준오차 ${pp(dist.precision.stdErr)}, 95% CI ±${(dist.precision.ci95HalfWidth * 100).toFixed(3)}%p` +
            ` (${pct(dist.precision.ci95Low)} ~ ${pct(dist.precision.ci95High)}),` +
            ` ${num(dist.precision.spins)} 스핀, 시드 \`${dist.precision.seed}\``,
        ]),
    '',
    '## 게이트 판정 요약',
    '',
    `**${allPass ? `${OK} 전체 통과` : `${NG} ${result.gates.length - passed}개 항목 실패`}** (${passed}/${result.gates.length})`,
    '',
    table(
      ['판정', '항목', '측정값'],
      result.gates.map((gate) => [gate.pass ? OK : NG, gate.label, gate.detail]),
    ),
    '',
  )

  const groupLine =
    game.groups.length === 0
      ? '없음'
      : game.groups.map((group) => `${group.label}(\`${group.id}\`: ${group.symbols.join(', ')})`).join(' / ')

  sections.push(
    '## 1. 게임 요약',
    '',
    table(
      ['항목', '값'],
      [
        ['릴 x 행', `${game.reels} x ${game.rows}`],
        [
          '배당 모델',
          dist.isWays
            ? `ways (${num(dist.totalBet / dist.betPerLine)} 단위, 웨이당 베팅액 ${num(dist.betPerLine)})`
            : game.payModel === 'anywhere'
              ? 'anywhere (판 전체 같은 그림 개수, 배당 기준 = 총 베팅액)'
              : game.payModel === 'cluster'
              ? 'cluster (직교 인접 클러스터, 배당 기준 = 총 베팅액)'
              : `lines (${game.lines}개)`,
        ],
        ['베팅 레벨', game.betLevels.map(num).join(', ')],
        ['스트립 길이', `${game.stripLengths.join(' x ')} (조합 ${num(dist.combos)})`],
        ['심볼 수', `${game.symbolCount}개`],
        ['심볼 그룹', groupLine],
        ['변동성', game.volatility],
        ['목표 RTP (기본 게임)', pct(game.rtpTarget, 2)],
        [
          '잭팟 기여분',
          result.manifest?.jackpotContribution === undefined
            ? '없음'
            : pct(result.manifest.jackpotContribution, 2),
        ],
        [
          '목표 RTP (총합)',
          result.manifest?.rtpTotalTarget === undefined ? '없음' : pct(result.manifest.rtpTotalTarget, 2),
        ],
      ],
    ),
    '',
  )

  const estimatedNote = dist.estimated ? ` ${ESTIMATED}` : ''
  sections.push(
    `## 2. RTP 산출 — ${methodLabel(dist.method)}`,
    '',
    dist.method === 'monte-carlo'
      ? `닫힌 식이 없는 모델이라 RTP까지 표본으로 잰다. 정밀도(표준오차·95% CI·스핀 수·시드)를 함께 기록하고,` +
        ` 분포·기여도는 ${num(dist.observations)} 스핀 고정 시드 표본에서 낸다. 표본에서 온 값에는 ${ESTIMATED} 표시를 붙였다.`
      : dist.estimated
        ? `정지 조합이 ${num(dist.combos)}개라 전수 조사가 불가능하다. RTP는 닫힌 식으로 **정확히** 구하고,` +
        ` 적중률·최대 배수·배수 분포·기여도만 ${num(dist.observations)} 스핀 고정 시드 표본으로 추정한다.` +
        ` 표본에서 온 값에는 ${ESTIMATED} 표시를 붙였다.`
      : `모든 정지 위치 조합 ${num(dist.combos)}개를 남김없이 계산한 값이다. 표본 오차가 없다.`,
    '',
    table(
      ['지표', '값'],
      [
        [
          dist.method === 'monte-carlo' ? 'RTP (표본 추정)' : 'RTP (정확값)',
          `${pct(dist.rtp)} (목표 대비 ${pp(dist.rtp - game.rtpTarget)})`,
        ],
        ...(dist.precision === null
          ? []
          : ([
              ['  ├ 표준오차 (SE)', pp(dist.precision.stdErr)],
              [
                '  ├ 95% 신뢰구간',
                `±${(dist.precision.ci95HalfWidth * 100).toFixed(3)}%p (${pct(dist.precision.ci95Low)} ~ ${pct(dist.precision.ci95High)})`,
              ],
              ['  ├ 스핀 수', num(dist.precision.spins)],
              ['  └ 시드', `\`${dist.precision.seed}\``],
            ] as [string, string][])),
        ['  ├ 페이라인', pct(dist.breakdown.lines)],
        ['  ├ 스캐터', pct(dist.breakdown.scatter)],
        // 코인 리스핀 팩은 피처 몫이 프리스핀이 아니라 코인 리스핀이다(같은 칸에 담는다).
        [dist.coinRespin !== undefined ? '  └ 코인 리스핀' : dist.board !== undefined ? '  └ 피처 (말판)' : '  └ 프리스핀', pct(dist.breakdown.freeSpins)],
        ['적중률', `${pct(dist.hitRate)}${estimatedNote}`],
        ['최대 배수', `${dist.maxWinMultiplier.toFixed(2)}x${estimatedNote}`],
        [
          dist.estimated ? '승리 라운드 수' : '승리 조합 수',
          `${num(dist.winObservations)} / ${num(dist.observations)}${estimatedNote}`,
        ],
      ],
    ),
    '',
    '### 베팅 레벨별',
    '',
    table(
      ['총 베팅액', game.payModel === 'cluster' || game.payModel === 'anywhere' ? '배당 기준' : '라인당', 'RTP', '목표 대비', '95% CI', '적중률', '최대 배수', '방법', '판정'],
      result.betLevels.map((row) => [
        num(row.totalBet),
        game.payModel === 'cluster' || game.payModel === 'anywhere' ? '총 베팅액' : num(row.betPerLine),
        pct(row.rtp),
        pp(row.delta),
        row.ci95HalfWidth === null ? '-' : `±${(row.ci95HalfWidth * 100).toFixed(3)}%p`,
        row.hitRate === null ? '-' : pct(row.hitRate, 3),
        row.maxWinMultiplier === null ? '-' : `${row.maxWinMultiplier.toFixed(2)}x`,
        methodLabel(row.method),
        row.pass ? OK : NG,
      ]),
    ),
    '',
  )

  sections.push(
    '## 3. 몬테카를로 (simulate)',
    '',
    table(
      ['지표', '값'],
      [
        ['스핀 수', num(mc.spins)],
        ['시드', `\`${mc.seed}\``],
        ['RTP', pct(mc.rtp)],
        ['95% 신뢰구간', `${pct(agreement.ciLow)} ~ ${pct(agreement.ciHigh)} (± ${pp(agreement.halfWidth95)})`],
        ['표준편차 (배수)', mc.stdDev.toFixed(4)],
        ['표준오차', pp(agreement.standardError)],
        ['적중률', pct(mc.hitRate)],
        // 말판 팩(프리스핀 없음)은 «프리스핀 0%» 대신 말판 진입률을 적는다 — 0%가 «피처가 안 열린다»로 읽힌다.
        ...(boardOnly
          ? [['말판 진입률 (유료 스핀)', `${pct(dist.board?.entryRate ?? 0)} (약 1/${triggerOdds(dist.board?.entryRate ?? 0)}, 5-3 참고)`]]
          : [
              ['프리스핀 트리거율', pct(mc.triggerRate)],
              ['돌아간 프리스핀', num(mc.freeSpinsPlayed)],
            ]),
        ['최대 승리', `${num(mc.maxWin)} 코인 (${(mc.maxWin / mc.totalBet).toFixed(2)}x)`],
        ['소요 시간', `${(mc.elapsedMs / 1000).toFixed(2)}s`],
        [
          '전수 조사와의 차이',
          `${pp(agreement.diff)} (임계 ±${(agreement.threshold * 100).toFixed(3)}%p = 3 x SE) ${agreement.pass ? OK : NG}`,
        ],
      ],
    ),
    '',
    '신뢰구간은 RTP ± 1.96 x σ/√n으로 구했다. 판정은 전수 조사와의 차이가 3 표준오차 안인지로 한다.',
    '',
  )

  sections.push(
    '## 4. RTP 기여 분해',
    '',
    dist.estimated
      ? `표본 ${num(dist.observations)} 라운드에서 나온 승리를 지급 근거(심볼·그룹·라인·매치 개수)로 귀속시킨 것이다. ${ESTIMATED}`
      : '전수 조사에서 나온 승리 라인 하나하나를 지급 근거(심볼·그룹·라인·매치 개수)로 귀속시킨 것이다.',
    dist.estimated
      ? `표본 기여 합계 ${pct(dist.contributionTotal)} vs ${dist.method === 'monte-carlo' ? 'RTP(표본 추정)' : '정확한 RTP'} ${pct(dist.rtp)} (차이 ${pp(dist.contributionTotal - dist.rtp)}).`
      : '프리스핀 몫은 같은 스트립을 다시 돌리는 것이므로 기본 게임 기여에 비례 배분했다. 기여의 총합은 전체 RTP와 정확히 같다.',
    '',
    '### 심볼별',
    '',
    contributionTable(dist.symbols, '심볼'),
    '',
    '### 그룹별',
    '',
    contributionTable(dist.groups, '그룹'),
    '',
    game.payModel === 'cluster' || game.payModel === 'anywhere' ? '' : dist.isWays ? '### 웨이즈 수 분포' : '### 페이라인별',
    '',
    game.payModel !== 'cluster' && dist.isWays
      ? `이 게임은 페이라인이 없다. 인접 릴의 심볼 개수를 곱해 경로 수를 세고, 웨이당 베팅액(총 베팅액 / ${num(
          dist.totalBet / dist.betPerLine,
        )})에 배수를 곱해 지급한다.`
      : '',
    dist.isWays || game.payModel === 'cluster' || game.payModel === 'anywhere' ? '' : lineTable(dist.lines),
    dist.isWays ? waysTable(dist.ways) : '',
    '',
    game.payModel === 'anywhere' ? '### 판 전체 개수별 (스캐터는 개수)' : game.payModel === 'cluster' ? '### 클러스터 크기별 (스캐터는 개수)' : '### 매치 개수별',
    '',
    countTable(dist.counts, game.payModel === 'cluster' || game.payModel === 'anywhere'),
    '',
  )

  sections.push(
    '## 5. 배수 분포',
    '',
    dist.estimated
      ? `유료 스핀 ${num(dist.observations)}회의 라운드 배수 분포다 (프리스핀 누적 포함). ${ESTIMATED}`
      : '모든 조합의 배수 분포다.',
    '',
    histogramTable(dist.histogram, dist.rtp),
    '',
  )

  if (dist.mutations.length > 0) {
    sections.push(
      '## 5-2. 뮤테이션',
      '',
      '정지 그리드를 평가 직전에 바꾸는 단계다. 표본에서 실제로 발동한 것만 센다.',
      '한 스핀에 여러 종류가 겹칠 수 있어 RTP 몫의 합은 전체 RTP를 넘을 수 있다.',
      `발동 빈도의 분모는 관측 스핀(유료 + 프리스핀)이다. ${ESTIMATED}`,
      '',
      mutationTable(dist.mutations),
      '',
    )
  }

  if (features !== null && boardOnly) {
    sections.push(
      '## 5-1. 스캐터',
      '',
      '이 팩의 스캐터는 프리스핀이 아니라 **말판 보너스**를 연다(프리스핀 없음). 진입률·지급 분포는 5-3에 있다.',
      '',
      table(
        ['항목', '값'],
        [
          ['스캐터 심볼', `\`${features.scatterSymbol ?? '없음'}\``],
          ['스캐터 배당 몫', `${pct(features.scatterShare, 2)} of RTP`],
          // 분석 분포는 피처 몫을 프리스핀 칸에 모은다 — 이 팩에서는 그 칸이 곧 말판 몫이다.
          ['말판 몫 (분석 분포의 피처 칸)', `${pct(features.freeSpinsShare, 2)} of RTP`],
          ['말판 진입 (표본)', `1/${triggerOdds(dist.board?.entryRate ?? 0)}`],
        ],
      ),
      '',
    )
  } else if (features !== null && dist.frost !== undefined) {
    // 얼려 두기 프리스핀 팩은 진입·횟수가 `scatter.freeSpins`가 아니라 `frostRespin.freeSpins`에 있다 — 분석 값(0%)은 이 팩에 맞지 않아
    // 표본 실측만 싣는다. 자세한 분포는 5-3.
    const frost = dist.frost
    sections.push(
      '## 5-1. 스캐터와 프리스핀',
      '',
      '이 팩의 구슬은 **얼려 두기 프리스핀**을 연다. 진입·리트리거 값은 표본 실측이고, 얼림·보너스 분포는 5-3에 있다.',
      '',
      table(
        ['항목', '값'],
        [
          ['스캐터 심볼', `\`${features.scatterSymbol ?? '없음'}\``],
          ['프리스핀 진입 (표본)', `1/${triggerOdds(frost.entryRate)} (${pct(frost.entryRate)})`],
          ['리트리거 (라운드당, 표본)', frost.retriggerPerRound.toFixed(4)],
          ['스캐터 배당 몫', `${pct(features.scatterShare, 2)} of RTP`],
          ['프리스핀 몫', `${pct(features.freeSpinsShare, 2)} of RTP`],
          [
            '유료 스핀당 프리스핀',
            features.observedFreeSpinsPerPaidSpin === null
              ? '전수 조사 (표본 없음)'
              : features.observedFreeSpinsPerPaidSpin.toFixed(4),
          ],
          ['몬테카를로 프리스핀 수', num(mc.freeSpinsPlayed)],
        ],
      ),
      '',
    )
  } else if (features !== null) {
    sections.push(
      '## 5-1. 스캐터와 프리스핀',
      '',
      table(
        ['항목', '값'],
        [
          ['스캐터 심볼', `\`${features.scatterSymbol ?? '없음'}\``],
          ['프리스핀 트리거 확률', `${pct(features.triggerProbability)} (약 ${triggerOdds(features.triggerProbability)}스핀에 1회)`],
          ['트리거당 기대 프리스핀', `${features.spinsPerTrigger.toFixed(3)}회${features.retrigger ? ' (리트리거 포함)' : ''}`],
          ['프리스핀 배수', `${features.multiplier}x`],
          ['리트리거', features.retrigger ? '있음' : '없음'],
          ['스캐터 배당 몫', `${pct(features.scatterShare, 2)} of RTP`],
          ['프리스핀 몫', `${pct(features.freeSpinsShare, 2)} of RTP`],
          [
            '표본 관측 트리거율',
            features.observedTriggerRate === null ? '전수 조사 (표본 없음)' : pct(features.observedTriggerRate),
          ],
          [
            '유료 스핀당 프리스핀',
            features.observedFreeSpinsPerPaidSpin === null
              ? '전수 조사 (표본 없음)'
              : features.observedFreeSpinsPerPaidSpin.toFixed(4),
          ],
          ['몬테카를로 트리거율', pct(mc.triggerRate)],
          ['몬테카를로 프리스핀 수', num(mc.freeSpinsPlayed)],
          [
            '프리스핀 상한에 걸린 스핀',
            features.cappedSpins === null
              ? '전수 조사 (표본 없음)'
              : features.cappedSpins === 0
                ? '0회 (캡에 닿지 않았다)'
                : `${num(features.cappedSpins)}회, 잘린 프리스핀 ${num(features.cappedSpinsLost ?? 0)}회`,
          ],
        ],
      ),
      '',
    )
  }

  if (dist.coinRespin !== undefined) sections.push(...coinRespinSections(dist.coinRespin))

  if (dist.board !== undefined) sections.push(...boardSections(dist.board))

  if (dist.cascade !== undefined) {
    sections.push(...cascadeSections(dist.cascade))
    if (dist.cascade.orders !== null) sections.push(...orderSections(dist.cascade.orders, dist.cascade.breakdown))
  }
  if (dist.roulette !== undefined) sections.push(...rouletteSections(dist.roulette))
  if (dist.forge !== undefined) sections.push(...forgeSections(dist.forge))
  if (dist.garden !== undefined) sections.push(...gardenSections(dist.garden))
  if (dist.frost !== undefined) sections.push(...frostSections(dist.frost))

  if (dist.precision !== null) {
    const sigma = dist.precision.stdErr * Math.sqrt(dist.precision.spins)
    const needed = requiredAuditSpins(sigma)
    sections.push(
      '## 5-5. 정밀도와 필요 스핀 수',
      '',
      '`n* = ⌈(1.96·σ̂·1.1/0.002)²⌉` — 95% CI 반폭 0.2%p를 10% 여유로 맞추는 스핀 수다.',
      '',
      table(
        ['항목', '값'],
        [
          ['σ̂ (라운드 배수, 이번 측정)', fixed(sigma)],
          ['n*', num(needed)],
          ['n* 1천만 올림', num(roundAuditSpins(needed))],
          ['manifest.auditSpins', result.manifest?.auditSpins === undefined ? '미지정' : num(result.manifest.auditSpins)],
          ['실제 n', num(dist.precision.spins)],
        ],
      ),
      '',
    )
  }

  const ruinRows: string[][] = [
    ['표준편차 (배수)', `${mc.stdDev.toFixed(4)} — 스핀당 승리 배수의 표준편차`],
    ['시작 잔액', `${num(ruin.startBalanceMultiple)}x 베팅 (${num(ruin.startBalanceMultiple * mc.totalBet)} 코인)`],
    ['반복 횟수', `${num(ruin.trials)}회 x ${num(ruin.spins)} 스핀`],
    ['파산 횟수', `${num(ruin.ruined)} / ${num(ruin.trials)}`],
    ['파산 확률', pct(ruin.ruinRate, 2)],
    ['종료 잔액 중앙값', `${ruin.medianEndMultiple.toFixed(2)}x 베팅`],
    ['파산까지 평균 스핀', ruin.meanSpinsToRuin === null ? '파산 없음' : `${ruin.meanSpinsToRuin.toFixed(0)} 스핀`],
  ]

  sections.push(
    '## 6. 변동성',
    '',
    table(['지표', '값'], ruinRows),
    '',
    '파산은 "다음 스핀의 베팅액을 낼 수 없는 상태"로 정의한다.',
    '',
  )

  if (jackpot !== null) {
    sections.push(
      '## 7. 잭팟 회계',
      '',
      table(
        ['항목', '값'],
        [
          ['기본 게임 RTP', pct(jackpot.baseRtp)],
          ['잭팟 기여분', pct(jackpot.contribution)],
          ['총 RTP', pct(jackpot.totalRtp)],
          ['목표 총 RTP', jackpot.target === null ? '미지정' : pct(jackpot.target)],
          [
            '판정',
            jackpot.delta === null ? '목표 미지정' : `${pp(jackpot.delta)} ${jackpot.pass === true ? OK : NG}`,
          ],
        ],
      ),
      '',
    )
  }

  sections.push(
    '---',
    '',
    '_이 리포트는 `pnpm --filter @tgslot/rtp-sim run audit`(또는 시뮬레이터 GUI의 "검수 결과 내보내기")가 생성했다._',
    '',
  )

  return sections.join('\n')
}
