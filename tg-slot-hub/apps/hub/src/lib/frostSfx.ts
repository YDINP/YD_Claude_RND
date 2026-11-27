/**
 * 얼림 이벤트 → 효과음. 렌더러 이벤트 하나가 어떤 소리를 부르는지가 이 한 파일에 있다.
 *
 * 소리 자체(합성 레시피)는 `audioFrost.ts`가 만들고 `audio.ts`가 내보낸다. 여기서는 «언제 어느 소리를»만 정한다.
 * 새로 언 칸 «쩡»은 라운드 안에서 얼린 칸 수가 늘수록 반음씩 높아진다(3칸 → 19칸 = 16단).
 */
import type { RendererEvent } from '@tgslot/renderer'
import {
  playAuroraRise,
  playFrostBonus,
  playFrostGauge,
  playFrostLand,
  playFrostPalace,
  playFrostStart,
  playFrostThaw,
  playFrostTurn,
} from './audio'
import type { FrostBonusTier } from './audioFrost'

/** 얼음 보너스 공개 화음 등급: 총 베팅 배수(오로라 곱하기 전)가 4 미만 하 / 25 미만 중 / 이상 상. */
export function frostBonusTier(bonusMultiple: number): FrostBonusTier {
  if (bonusMultiple < 4) return 'low'
  if (bonusMultiple < 25) return 'mid'
  return 'high'
}

/** 눈금 통과음을 «쩡» 뒤로 미루는 시간(ms). 겹쳐 울리지 않게 한다. */
const GAUGE_DELAY_MS = 140
/** 곱셈식 공개 뒤 오로라 소리가 들어오는 시간(ms). 보너스 화음이 먼저 울린다. */
const AURORA_DELAY_MS = 380
/** 곱셈식 길이(ms, 보통 속도). 궁전·녹음 소리를 이 박자에 맞춘다. */
const FORMULA_MS = 900
const PALACE_MS = 900

const pending = new Set<ReturnType<typeof setTimeout>>()
let thawPlayed = false

function later(ms: number, play: () => void): void {
  const handle = setTimeout(() => {
    pending.delete(handle)
    play()
  }, ms)
  pending.add(handle)
}

/** 얼림이 새로 시작되거나 게임을 나갈 때 미뤄 둔 소리를 모두 취소한다. */
export function resetFrostSfx(): void {
  for (const handle of pending) clearTimeout(handle)
  pending.clear()
  thawPlayed = false
}

export function playFrostEventSound(event: RendererEvent): void {
  switch (event.type) {
    case 'frostStart':
      if (event.phase === 'start') resetFrostSfx()
      else playFrostStart()
      return
    case 'frostStep':
      if (event.phase === 'start') playFrostTurn()
      else if (event.phase === 'land') {
        if (event.newlyFrozen.length > 0) playFrostLand(event.count)
        if (event.crossed.length > 0) later(GAUGE_DELAY_MS, playFrostGauge)
      }
      return
    case 'frostEnd':
      if (event.phase === 'start') {
        thawPlayed = false
        if (!event.quiet) playFrostBonus(frostBonusTier(event.bonusMultiple))
        if (event.auroraUp) later(AURORA_DELAY_MS, playAuroraRise)
        if (event.palace) later(FORMULA_MS, playFrostPalace)
        later(FORMULA_MS + (event.palace ? PALACE_MS : event.auroraUp ? 300 : 0), () => {
          thawPlayed = true
          playFrostThaw()
        })
        return
      }
      // 압축·모션 축소로 박자가 어긋났으면 남은 소리를 접고 녹음만 낸다.
      for (const handle of pending) clearTimeout(handle)
      pending.clear()
      if (!thawPlayed) playFrostThaw()
      thawPlayed = false
      return
    default:
  }
}
