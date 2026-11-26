import type { GameMath } from '@tgslot/slot-engine'

/**
 * 코인 리스핀 팩의 첫 화면 정지 위치. 코인 얼굴 금액은 서버 `coinBoard`가 있어야 그려지므로,
 * 스핀 전 첫 화면에 코인이 보이면 금액 없는 빈 금화가 된다. 그래서 릴마다 보이는 칸에 코인이 없는
 * 첫 정지 위치를 고른다(없으면 0). 코인 리스핀이 없는 팩은 `null` — 기존 기본값(전부 0)을 그대로 쓴다.
 */
export function coinFreeInitialStops(math: Pick<GameMath, 'strips' | 'rows' | 'coinRespin'>): number[] | null {
  const coin = math.coinRespin?.symbol
  if (coin === undefined) return null
  return math.strips.map((strip) => {
    for (let stop = 0; stop < strip.length; stop += 1) {
      let clear = true
      for (let row = 0; row < math.rows; row += 1) {
        if (strip[(stop + row) % strip.length] === coin) {
          clear = false
          break
        }
      }
      if (clear) return stop
    }
    return 0
  })
}
