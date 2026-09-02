import { pp } from './stats.js'
import type {
  AuditResult,
  ContributionRow,
  CountContributionRow,
  HistogramRow,
  LineContributionRow,
} from './types.js'

const OK = '✅'
const NG = '❌'

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
  const { game, exact, mc, agreement, ruin, jackpot } = result
  const title = game.nameKo ?? game.nameEn ?? game.id
  const passed = result.gates.filter((gate) => gate.pass).length
  const allPass = passed === result.gates.length

  const sections: string[] = []

  sections.push(
    `# RTP 검수 리포트 — ${title} (\`${game.id}\`)`,
    '',
    `- 생성 시각: ${result.generatedAt}`,
    `- 검수 베팅액: ${num(result.options.totalBet)} 코인 (라인당 ${num(exact.betPerLine)})`,
    `- 몬테카를로: ${num(result.options.spins)} 스핀, 시드 \`${result.options.seed}\``,
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
        ['페이라인', `${game.lines}개`],
        ['베팅 레벨', game.betLevels.map(num).join(', ')],
        ['스트립 길이', `${game.stripLengths.join(' x ')} (조합 ${num(exact.combos)})`],
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

  sections.push(
    '## 2. 전수 조사 (exact)',
    '',
    `모든 정지 위치 조합 ${num(exact.combos)}개를 남김없이 계산한 값이다. 표본 오차가 없다.`,
    '',
    table(
      ['지표', '값'],
      [
        ['RTP', `${pct(exact.rtp)} (목표 대비 ${pp(exact.rtp - game.rtpTarget)})`],
        ['적중률', pct(exact.hitRate)],
        ['최대 배수', `${exact.maxWinMultiplier.toFixed(2)}x`],
        ['승리 조합 수', `${num(exact.winCombos)} / ${num(exact.combos)}`],
      ],
    ),
    '',
    '### 베팅 레벨별',
    '',
    table(
      ['총 베팅액', '라인당', 'RTP', '목표 대비', '적중률', '최대 배수', '판정'],
      result.betLevels.map((row) => [
        num(row.totalBet),
        num(row.betPerLine),
        pct(row.rtp),
        pp(row.delta),
        pct(row.hitRate, 3),
        `${row.maxWinMultiplier.toFixed(2)}x`,
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
    '전수 조사에서 나온 승리 라인 하나하나를 지급 근거(심볼·그룹·라인·매치 개수)로 귀속시킨 것이다.',
    '기여의 총합은 전체 RTP와 정확히 같다.',
    '',
    '### 심볼별',
    '',
    contributionTable(exact.symbols, '심볼'),
    '',
    '### 그룹별',
    '',
    contributionTable(exact.groups, '그룹'),
    '',
    '### 페이라인별',
    '',
    lineTable(exact.lines),
    '',
    '### 매치 개수별',
    '',
    countTable(exact.counts),
    '',
  )

  sections.push('## 5. 배수 분포', '', histogramTable(exact.histogram, exact.rtp), '')

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
