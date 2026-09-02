import type { ExactRtpReport, GameMath, SimulationReport } from '@tgslot/slot-engine'

export const TOP_BUCKETS = 10

export function pct(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(0)}ms`
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(22)}${value}`
}

export function formatHeader(math: GameMath, totalBet: number): string {
  const lines = [
    `게임: ${math.id}  (${math.reels}x${math.rows}, ${math.paylines.length} lines, ${math.volatility})`,
    row('총 베팅액', `${totalBet} coins (라인당 ${totalBet / math.paylines.length})`),
    row('목표 RTP', pct(math.rtpTarget)),
    row('스트립 길이', math.strips.map((strip) => strip.length).join(' x ')),
  ]
  return lines.join('\n')
}

/** manifest에서 온 허브 기여분. 기본 게임 RTP 위에 얹어 체감 RTP를 만든다. */
export interface JackpotInfo {
  contribution: number
  totalTarget?: number | undefined
}

export function formatExact(report: ExactRtpReport, target: number, jackpot?: JackpotInfo): string {
  const delta = report.rtp - target
  const method = report.method === 'enumerate' ? '전수 조사' : '해석적 계산'
  const lines = [
    `RTP 계산: ${method} (조합 ${report.combos.toLocaleString('en-US')}개)`,
    row('RTP (기본 게임)', `${pct(report.rtp)}  (목표 대비 ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(3)}%p)`),
  ]
  if (jackpot !== undefined) {
    const total = report.rtp + jackpot.contribution
    lines.push(row('+ 허브 잭팟 기여', pct(jackpot.contribution)))
    const goal = jackpot.totalTarget === undefined ? '' : `  (목표 ${pct(jackpot.totalTarget)})`
    lines.push(row('= 체감 총 RTP', `${pct(total)}${goal}`))
  }

  const { breakdown } = report
  const share = (value: number): string =>
    report.rtp === 0 ? '-' : `${((value / report.rtp) * 100).toFixed(1)}%`
  lines.push(
    '',
    '  RTP 구성',
    row('  페이라인', `${pct(breakdown.lines)}  (${share(breakdown.lines)})`),
    row('  스캐터', `${pct(breakdown.scatter)}  (${share(breakdown.scatter)})`),
    row('  프리스핀', `${pct(breakdown.freeSpins)}  (${share(breakdown.freeSpins)})`),
  )
  if (report.triggerProbability > 0) {
    lines.push(row('  프리스핀 진입 확률', `${(report.triggerProbability * 100).toFixed(4)}%  (약 ${Math.round(1 / report.triggerProbability)}스핀에 1회)`))
  }

  const note = report.distributionIsExact ? '' : ' (표본 추정)'
  lines.push(
    '',
    `  기본 게임 분포${note}`,
    row('  적중률', pct(report.hitRate)),
    row('  최대 배수', `${report.maxWinMultiplier.toFixed(2)}x`),
  )

  if (report.winDistribution.length > 0) {
    lines.push(
      '',
      `  RTP 기여 상위 ${TOP_BUCKETS} 구간`,
      `  ${'배수'.padEnd(12)}${'확률'.padEnd(12)}${'RTP 기여'.padEnd(12)}조합`,
    )
    const top = [...report.winDistribution].sort((a, b) => b.rtpShare - a.rtpShare).slice(0, TOP_BUCKETS)
    for (const bucket of top) {
      lines.push(
        `  ${`${bucket.multiplier.toFixed(2)}x`.padEnd(12)}${pct(bucket.probability).padEnd(12)}${pct(bucket.rtpShare).padEnd(12)}${bucket.combos.toLocaleString('en-US')}`,
      )
    }
  }
  return lines.join('\n')
}

export function formatSimulation(report: SimulationReport, totalBet: number, target: number): string {
  const delta = report.rtp - target
  const lines = [
    '몬테카를로 (simulate)',
    row('유료 스핀 수', report.spins.toLocaleString('en-US')),
    row('RTP', `${pct(report.rtp)}  (목표 대비 ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(3)}%p)`),
    row('적중률', `${pct(report.hitRate)} (기본 게임)`),
    row('표준편차', `${report.stdDev.toFixed(3)} (라운드 배수 기준)`),
    row('최대 승리', `${report.maxWin.toLocaleString('en-US')} coins (${(report.maxWin / totalBet).toFixed(2)}x)`),
  ]
  if (report.triggerRate > 0) {
    lines.push(
      row('프리스핀 진입', `${(report.triggerRate * 100).toFixed(4)}%`),
      row('프리스핀 실행', `유료 스핀당 ${(report.freeSpinsPlayed / report.spins).toFixed(4)}회`),
    )
  }
  lines.push(row('소요 시간', ms(report.elapsedMs)))
  return lines.join('\n')
}
