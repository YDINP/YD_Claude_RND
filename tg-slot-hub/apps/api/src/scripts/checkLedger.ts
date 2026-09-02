/**
 * 원장 불변식 검사 잡 (계획서 §5).
 *
 * 모든 유저에 대해 `SUM(ledger.delta) == wallets.<currency>` 인지 확인하고,
 * 어긋난 유저가 하나라도 있으면 목록을 출력하고 exit 1로 끝난다.
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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[check:ledger] DATABASE_URL is required')
    process.exit(2)
  }

  const sql = postgres(databaseUrl, { prepare: false })
  try {
    const mismatches = await findLedgerMismatches(sql)

    if (mismatches.length === 0) {
      console.log(JSON.stringify({ evt: 'ledger_check', ok: true, mismatches: 0 }))
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
    console.error(JSON.stringify({ evt: 'ledger_check', ok: false, mismatches: mismatches.length }))
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// 이 파일이 직접 실행됐을 때만 돈다. 테스트에서 findLedgerMismatches만 import할 수 있게 한다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  await main()
}
