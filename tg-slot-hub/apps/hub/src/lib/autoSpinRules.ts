/**
 * 오토스핀 책임 규칙 — 손실 한도·큰 당첨 멈춤 판정과 시트 선택값 기억. 전부 순수(스토리지 접근만 try/catch).
 * 서버 규칙이 아니라 사용자가 스스로 거는 안전장치라 클라이언트가 판정한다.
 */

/** 오토스핀이 스스로 멈춘 이유 — 토스트 문구를 고른다. 횟수 소진·잔액 부족은 지금 동작 그대로라 여기 없다. */
/** `lossLimitStart`는 멈춘 것이 아니라 첫 판부터 한도를 넘어 아예 시작하지 못한 경우다. */
export type AutoSpinStopReason = 'lossLimit' | 'lossLimitStart' | 'bigWin' | 'breakReminder'

export const AUTO_SPIN_LOSS_LIMITS = [0.25, 0.5, null] as const
export type AutoSpinLossLimit = (typeof AUTO_SPIN_LOSS_LIMITS)[number]
export const DEFAULT_LOSS_LIMIT: AutoSpinLossLimit = 0.5
export const DEFAULT_AUTO_SPIN_COUNT = 25

/** 시작 잔액 기준으로 «여기까지 잃을 수 있다»는 금액. 제한 없음이면 null. */
export function lossLimitAmount(startCoins: number, lossLimit: number | null): number | null {
  if (lossLimit === null) return null
  return Math.floor(startCoins * lossLimit)
}

/**
 * 다음 «유료» 판을 걸기 직전 판정 — 지금까지 잃은 돈 + 다음 베팅이 한도를 넘으면 멈춘다(넘기 전에 멈춘다).
 * 손실은 지갑 차이가 아니라 오토를 켠 뒤의 «게임 손익»(`net`, 당첨+잭팟−베팅, 더블업 증감 포함)으로 잰다 —
 * 지갑 차이로 재면 레벨업 보너스가 손실을 깎고, 더블업에 걸린(지갑 밖) 금액이 손실을 부풀린다.
 * 손익이 양수(이긴 상태)면 그만큼 여유가 생긴다.
 */
export function exceedsLossLimit(input: {
  startCoins: number
  net: number
  nextBet: number
  lossLimit: number | null
}): boolean {
  const limit = lossLimitAmount(input.startCoins, input.lossLimit)
  if (limit === null) return false
  return -input.net + input.nextBet > limit
}

export interface AutoSpinPrefs {
  count: number
  lossLimit: AutoSpinLossLimit
  stopOnBigWin: boolean
}

export const DEFAULT_AUTO_SPIN_PREFS: AutoSpinPrefs = {
  count: DEFAULT_AUTO_SPIN_COUNT,
  lossLimit: DEFAULT_LOSS_LIMIT,
  stopOnBigWin: false,
}

export const AUTO_SPIN_PREFS_KEY = 'tgslot.autospin.v1'

const VALID_COUNTS = [10, 25, 50, 100, null] as const // null = 무제한(JSON에 Infinity가 없어서)

export function readAutoSpinPrefs(): AutoSpinPrefs {
  try {
    const raw = localStorage.getItem(AUTO_SPIN_PREFS_KEY)
    if (raw === null) return DEFAULT_AUTO_SPIN_PREFS
    const parsed = JSON.parse(raw) as { count?: unknown; lossLimit?: unknown; stopOnBigWin?: unknown }
    const count =
      parsed.count === null
        ? Infinity
        : typeof parsed.count === 'number' && (VALID_COUNTS as readonly (number | null)[]).includes(parsed.count)
          ? parsed.count
          : DEFAULT_AUTO_SPIN_COUNT
    const lossLimit: AutoSpinLossLimit =
      parsed.lossLimit === null
        ? null
        : parsed.lossLimit === 0.25 || parsed.lossLimit === 0.5
          ? parsed.lossLimit
          : DEFAULT_LOSS_LIMIT
    return { count, lossLimit, stopOnBigWin: parsed.stopOnBigWin === true }
  } catch {
    return DEFAULT_AUTO_SPIN_PREFS
  }
}

export function writeAutoSpinPrefs(prefs: AutoSpinPrefs): void {
  try {
    localStorage.setItem(
      AUTO_SPIN_PREFS_KEY,
      JSON.stringify({
        count: Number.isFinite(prefs.count) ? prefs.count : null,
        lossLimit: prefs.lossLimit,
        stopOnBigWin: prefs.stopOnBigWin,
      }),
    )
  } catch {
    /* 저장 불가 — 다음에도 기본값으로 시작할 뿐이다 */
  }
}
