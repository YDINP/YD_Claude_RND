/**
 * 원장 불변식 검사 잡 (계획서 §5).
 *
 * 두 가지를 본다.
 *  1. 잔액 대조 — 모든 유저에 대해 `SUM(ledger.delta) == wallets.<currency>`
 *  2. 중복 지급 — 같은 `(reason, ref_id)`로 두 번 이상 찍힌 항목
 *
 * 둘 중 하나라도 걸리면 목록을 출력하고 exit 1로 끝난다.
 * 크론/Render Cron Job이 시간마다 돌리는 것을 전제로 만든 CLI다.
 *
 *   pnpm --filter @tgslot/api check:ledger     # tsx (개발)
 *   node dist/scripts/checkLedger.js           # 빌드 산출물 (배포)
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

interface Mismatch {
  userId: string
  currency: string
  walletBalance: number
  ledgerSum: number
}

interface DuplicateRef {
  userId: string
  reason: string
  refId: string
  entries: number
}

/** 로그가 터지지 않게 이만큼만 찍고 나머지는 개수로만 알린다. */
const DUPLICATE_LOG_LIMIT = 50

/** 지갑 잔액과 원장 합을 통화별로 맞춰 본다. 지갑 행이 없거나 원장이 비어 있어도 0으로 비교된다. */
export async function findLedgerMismatches(sql: postgres.Sql): Promise<Mismatch[]> {
  const rows = await sql<
    { user_id: string; currency: string; wallet_balance: string; ledger_sum: string }[]
  >`
    with balances as (
      select w.user_id, 'coins' as currency, w.coins as wallet_balance from wallets w
      union all
      select w.user_id, 'gems' as currency, w.gems as wallet_balance from wallets w
    ),
    sums as (
      select l.user_id, l.currency, sum(l.delta) as ledger_sum
      from ledger l
      group by l.user_id, l.currency
    )
    select
      b.user_id,
      b.currency,
      b.wallet_balance,
      coalesce(s.ledger_sum, 0) as ledger_sum
    from balances b
    left join sums s on s.user_id = b.user_id and s.currency = b.currency
    where b.wallet_balance <> coalesce(s.ledger_sum, 0)
    order by b.user_id, b.currency
  `

  return rows.map((row) => ({
    userId: row.user_id,
    currency: row.currency,
    walletBalance: Number(row.wallet_balance),
    ledgerSum: Number(row.ledger_sum),
  }))
}

/**
 * 같은 `(reason, ref_id)`로 두 번 이상 찍힌 항목을 찾는다.
 *
 * 잔액 대조만으로는 이 계열을 **절대** 잡을 수 없다. 같은 지급이 두 번 일어나면 지갑과 원장이
 * 함께 늘어나 합은 계속 맞기 때문이다. 실제로 memory 레포의 무한 코인 버그(거부된 스핀이
 * 더블업 에스크로를 반복 환급)는 합 검사를 완벽히 통과하면서 `gamble_collect` 행만
 * 같은 refId로 쌓았다.
 *
 * refId를 붙이는 사유는 전부 "사건 하나 = 행 하나"라 유일해야 한다.
 *   spin_bet / spin_win / jackpot_win / level_up -> refId = roundId
 *   gamble_escrow                                -> refId = `${roundId}:g0:escrow`
 *   gamble_collect                               -> refId = `${roundId}:g${step}`
 *
 * 반대로 정상적으로 반복되는 사유(signup_bonus, daily_bonus, timed_bonus, rescue_bonus,
 * mission_reward)는 refId를 아예 남기지 않는다. 그래서 사유 이름을 하드코딩해 예외 목록을
 * 만들 필요가 없다 — `ref_id is null`인 행만 빼면 오탐이 사라지고, 새 사유가 생겨도
 * "refId를 남기면 유일해야 한다"는 규칙이 그대로 적용된다.
 */
export async function findDuplicateRefs(sql: postgres.Sql): Promise<DuplicateRef[]> {
  const rows = await sql<{ user_id: string; reason: string; ref_id: string; entries: string }[]>`
    select l.user_id, l.reason, l.ref_id, count(*) as entries
    from ledger l
    where l.ref_id is not null
    group by l.user_id, l.reason, l.ref_id
    having count(*) > 1
    order by count(*) desc, l.user_id, l.reason, l.ref_id
  `

  return rows.map((row) => ({
    userId: row.user_id,
    reason: row.reason,
    refId: row.ref_id,
    entries: Number(row.entries),
  }))
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[check:ledger] DATABASE_URL is required')
    process.exit(2)
  }

  const sql = postgres(databaseUrl, { prepare: false })
  try {
    // 두 검사는 서로 못 보는 영역을 덮는다. 하나가 걸려도 다른 하나를 건너뛰지 않는다.
    const mismatches = await findLedgerMismatches(sql)
    const duplicates = await findDuplicateRefs(sql)

    if (mismatches.length === 0 && duplicates.length === 0) {
      console.log(JSON.stringify({ evt: 'ledger_check', ok: true, mismatches: 0, duplicateRefs: 0 }))
      return
    }

    for (const row of mismatches) {
      console.error(
        JSON.stringify({
          evt: 'ledger_mismatch',
          userId: row.userId,
          currency: row.currency,
          wallet: row.walletBalance,
          ledger: row.ledgerSum,
          diff: row.walletBalance - row.ledgerSum,
        })
      )
    }
    for (const row of duplicates.slice(0, DUPLICATE_LOG_LIMIT)) {
      console.error(
        JSON.stringify({
          evt: 'ledger_duplicate_ref',
          userId: row.userId,
          reason: row.reason,
          refId: row.refId,
          entries: row.entries,
        })
      )
    }
    console.error(
      JSON.stringify({
        evt: 'ledger_check',
        ok: false,
        mismatches: mismatches.length,
        duplicateRefs: duplicates.length,
      })
    )
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// 이 파일이 직접 실행됐을 때만 돈다. 테스트에서 findLedgerMismatches만 import할 수 있게 한다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  await main()
}
