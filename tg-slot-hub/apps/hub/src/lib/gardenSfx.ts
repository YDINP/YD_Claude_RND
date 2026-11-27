/**
 * 정원 이벤트 → 효과음. 렌더러 이벤트 하나가 어떤 소리를 부르는지가 전부 이 한 파일에 있다.
 *
 * 소리 자체(합성 레시피)는 `audioGarden.ts`의 `garden` 프리셋이 만든다. 여기서는 «언제 어느 소리를»만 정한다:
 * 팝은 단계마다 음계가 한 칸씩 오르고, 성장은 윈드차임 상행 + 흙 터짐, 개화는 하프 글리산도(배율이 클수록 높고 길다), 햇살은 패드 + 트릴이다.
 */
import type { RendererEvent } from '@tgslot/renderer'
import { playGardenDrop, playGardenGrow, playGardenPop, playGardenSun, playSeedBloom } from './audio'
import { bloomTierOf } from './audioGarden'

/** 소리를 낼 필요가 있는 정원 이벤트인가. */
export function gardenSoundFor(event: RendererEvent): 'pop' | 'drop' | 'grow' | 'bloom' | 'sun' | null {
  if (event.type === 'gardenStep') {
    if (event.phase === 'start') return event.stepWin > 0 ? 'pop' : null
    return event.stepWin > 0 ? 'drop' : null
  }
  if (event.type === 'gardenGrow') return event.phase === 'start' ? 'grow' : null
  if (event.type === 'seedBloom') return 'bloom'
  if (event.type === 'gardenSun') return event.phase === 'start' ? 'sun' : null
  return null
}

/** 이벤트에 맞는 소리를 낸다. 소리가 없는 이벤트면 아무 일도 없다. 부른 소리 종류를 돌려준다(테스트용). */
export function playGardenEventSound(event: RendererEvent): ReturnType<typeof gardenSoundFor> {
  const kind = gardenSoundFor(event)
  if (kind === null) return null
  if (kind === 'pop' && event.type === 'gardenStep') playGardenPop(event.index)
  else if (kind === 'drop') playGardenDrop()
  else if (kind === 'grow' && event.type === 'gardenGrow') playGardenGrow(event.size, event.newCells)
  else if (kind === 'bloom' && event.type === 'seedBloom') playSeedBloom(bloomTierOf(Math.max(1, ...event.multipliers)))
  else if (kind === 'sun' && event.type === 'gardenSun') playGardenSun(event.grown)
  return kind
}
