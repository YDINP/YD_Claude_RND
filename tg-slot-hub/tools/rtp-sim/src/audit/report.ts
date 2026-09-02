import { pp } from './stats.js'
import type {
  AuditResult,
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

function countTable(rows: CountContributionRow[]): string {
  return table(
    ['매치 개수', 'RTP 기여', '전체 대비', '지급 라인 수', '지급 코인'],
    rows.map((row) => [`${row.count}개 연속`, pct(row.rtp), pct(row.share, 2), num(row.hits), num(row.win)]),
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

/** 검수 결과를 한국어 마크다운 리포트로. CLI의 `--out` 파일과 GUI의 내보내기가 같은 함수를 쓴다. */
export function buildAuditMarkdown(result: AuditResult): string {
  const { game, distribution: dist, features, mc, agreement, ruin, jackpot } = result
  const title = game.nameKo ?? game.nameEn ?? game.id
  const passed = result.gates.filter((gate) => gate.pass).length
  const allPass = passed === result.gates.length

  const sections: string[] = []

  sections.push(
    `# RTP 검수 리포트 — ${title} (\`${game.id}\`)`,
    '',
    `- 생성 시각: ${result.generatedAt}`,
    `- 검수 베팅액: ${num(result.options.totalBet)} 코인 (라인당 ${num(dist.betPerLine)})`,
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
    dist.estimated
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
        ['  └ 프리스핀', pct(dist.breakdown.freeSpins)],
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
      ['총 베팅액', '라인당', 'RTP', '목표 대비', '95% CI', '적중률', '최대 배수', '방법', '판정'],
      result.betLevels.map((row) => [
        num(row.totalBet),
        num(row.betPerLine),
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
        ['프리스핀 트리거율', pct(mc.triggerRate)],
        ['돌아간 프리스핀', num(mc.freeSpinsPlayed)],
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
      ? `표본 기여 합계 ${pct(dist.contributionTotal)} vs 정확한 RTP ${pct(dist.rtp)} (차이 ${pp(dist.contributionTotal - dist.rtp)}).`
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
    dist.isWays ? '### 웨이즈 수 분포' : '### 페이라인별',
    '',
    dist.isWays
      ? `이 게임은 페이라인이 없다. 인접 릴의 심볼 개수를 곱해 경로 수를 세고, 웨이당 베팅액(총 베팅액 / ${num(
          dist.totalBet / dist.betPerLine,
        )})에 배수를 곱해 지급한다.`
      : '',
    dist.isWays ? '' : lineTable(dist.lines),
    dist.isWays ? waysTable(dist.ways) : '',
    '',
    '### 매치 개수별',
    '',
    countTable(dist.counts),
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

  if (features !== null) {
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
