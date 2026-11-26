/**
 * 무대 룰렛 효과음 싱크. `rouletteCues.ts`가 알리는 «무슨 일이 일어났나»를 `idol` 프리셋 소리로 옮긴다.
 * 소리 재료(손뼉·브라스·킥·코인 차임)는 `audio.ts`에 있다 — 여기서는 사건과 소리를 잇기만 한다.
 */
import type { RouletteCue, RouletteCueSink } from './rouletteCues'
import {
  playFeature,
  playRouletteLand,
  playRouletteLight,
  playRouletteSummary,
  playRouletteTick,
  playRouletteZoom,
  playUiSound,
} from './audio'

export const idolRouletteSink: RouletteCueSink = (cue: RouletteCue) => {
  switch (cue.kind) {
    case 'entry':
      // 진입은 이 프리셋의 피처 소리(손뼉 롤 + 상승 스윕 + 코드 스탭)다.
      playFeature()
      break
    case 'light':
      playRouletteLight(cue.index)
      break
    case 'tick':
      playRouletteTick(cue.speed)
      break
    case 'land':
      playRouletteLand(cue.result, cue.lit)
      break
    case 'zoom':
      playRouletteZoom()
      break
    case 'summary':
      playRouletteSummary(cue.big)
      break
    case 'exit':
      playUiSound('close')
      break
  }
}
