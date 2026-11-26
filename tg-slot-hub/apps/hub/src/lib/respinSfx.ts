/**
 * 코인 리스핀 이벤트 → 효과음. 렌더러 이벤트 하나가 어떤 소리를 부르는지가 전부 이 한 파일에 있다.
 *
 * 소리 자체(합성 레시피)는 `audioDeepsea.ts`가 만들고 `audio.ts`가 내보낸다. 여기서는 «언제 어느 소리를»만 정한다 —
 * 그래서 소리를 갈아 끼워도 화면 쪽 배선은 그대로다. 고정음은 라운드 안에서 고정마다 반음씩 올라간다(진행감, 최대 12단).
 */
import type { RendererEvent, WinTier } from '@tgslot/renderer'
import type { NamedTier } from '../components/game/winTiers'
import {
  playCoinLand,
  playCoinPin,
  playCounterReset,
  playFeature,
  playLastRespin,
  playReelStop,
  playRespinSonar,
  playRollupEnd,
  playRollupTick,
  playSettleTick,
  playTentacleWrap,
  playTopTreasure,
  playTreasure,
  playWin,
} from './audio'
import { DEEPSEA_PIN_STEPS } from './audioDeepsea'

/** 이번 라운드에서 지금까지 고정된 코인 수. 고정음의 높이가 이 수를 따른다. */
let pinCount = 0
/** 미뤄 둔 소리(둘째 고정음·보물 등장음). 게임을 나가거나 라운드를 새로 시작하면 취소한다. */
const pending = new Set<ReturnType<typeof setTimeout>>()

function later(ms: number, play: () => void): void {
  const handle = setTimeout(() => {
    pending.delete(handle)
    play()
  }, ms)
  pending.add(handle)
}

/** 고정음 높이 단계의 상한(반음 12단 = 한 옥타브). */
export const RESPIN_PIN_STEPS = DEEPSEA_PIN_STEPS

/** 같은 순간에 두 코인이 붙을 때 둘째 고정음을 미루는 시간(ms). 겹쳐 울리지 않게 한다. */
const SECOND_PIN_DELAY_MS = 90
/** 보물 코인이 붙을 때 고정음 뒤에 종 화음을 얹는 시간(ms). «보물 등장» 박자. */
const TREASURE_PIN_DELAY_MS = 140

/** 라운드가 새로 시작될 때 부른다(진입 펄스 또는 새 스핀). */
export function resetRespinSfx(): void {
  pinCount = 0
  for (const handle of pending) clearTimeout(handle)
  pending.clear()
  stopCelebrationTicks()
  celebrationTier = null
  celebrationSounded = false
}

// ── 정산 뒤 빅윈 축하 ─────────────────────────────────────
// 일반 판의 큰 당첨 소리는 렌더러의 winTotal에서 난다. 코인 리스핀은 그 이벤트 없이 곧장 빅윈 오버레이가 뜨므로
// 오버레이의 롤업 박자(굴리기 시작 → 앉음)에 맞춰 같은 소리(큰 당첨 → 롤업 틱 → 마감음)를 여기서 낸다.

/** 축하 등급 → 효과음 등급. 문턱(베팅의 10·20·50·100배)이 같다. */
export const CELEBRATION_SOUND_TIER: Readonly<Record<NamedTier, Exclude<WinTier, 'none'>>> = {
  surge: 'big',
  blast: 'mega',
  storm: 'epic',
  cataclysm: 'max',
}

/** 롤업 틱 간격(ms). `playRollupTick`이 60ms 안의 재호출을 버리므로 그 박자에 맞춘다. */
const CELEBRATION_TICK_MS = 60

let celebrationTicker: ReturnType<typeof setInterval> | null = null
/** 지금 굴리는 축하의 소리 등급. 마감음을 낸 뒤에는 null — 앉음이 두 번 와도 마감음은 한 번이다. */
let celebrationTier: Exclude<WinTier, 'none'> | null = null
/** 이번 라운드에 축하 소리를 이미 냈나. 복귀 뒤 라인 당첨 롤업이 큰 당첨 소리를 다시 내지 않게 한다. */
let celebrationSounded = false

function stopCelebrationTicks(): void {
  if (celebrationTicker !== null) clearInterval(celebrationTicker)
  celebrationTicker = null
}

/** 빅윈 오버레이의 롤업 박자에 맞춰 소리를 낸다. `rolling`은 큰 당첨 + 틱, `settled`(건너뛰기 포함)는 마감음. */
export function playRespinCelebration(phase: 'rolling' | 'settled', tier: NamedTier, rollupMs: number): void {
  if (phase === 'rolling') {
    stopCelebrationTicks()
    const soundTier = CELEBRATION_SOUND_TIER[tier]
    celebrationTier = soundTier
    celebrationSounded = true
    playWin(soundTier, rollupMs)
    const start = performance.now()
    const span = Math.max(1, rollupMs)
    celebrationTicker = setInterval(() => {
      const progress = (performance.now() - start) / span
      if (progress >= 1) stopCelebrationTicks()
      else playRollupTick(progress)
    }, CELEBRATION_TICK_MS)
    return
  }
  stopCelebrationTicks()
  if (celebrationTier === null) return
  playRollupEnd(celebrationTier)
  celebrationTier = null
}

/** 오버레이가 굴리는 도중 닫히거나 화면을 떠날 때 — 틱만 멈춘다(마감음은 내지 않는다). */
export function stopRespinCelebration(): void {
  stopCelebrationTicks()
  celebrationTier = null
}

/** 이번 라운드에 정산 뒤 축하 소리를 이미 냈나. */
export function respinCelebrationSounded(): boolean {
  return celebrationSounded
}

/** 고정음이 이번에 올라갈 단계. 라운드 안에서 0부터 늘어 상한에 멈춘다. */
export function nextPinStep(): number {
  const step = Math.min(pinCount, RESPIN_PIN_STEPS)
  pinCount += 1
  return step
}

/** 코인 리스핀에 맞는 효과음을 낸다. 코인 리스핀과 상관없는 이벤트는 무시한다. */
export function playRespinEventSound(event: RendererEvent): void {
  switch (event.type) {
    case 'respinPulse':
      if (event.index === 0) resetRespinSfx()
      playCoinLand(event.index)
      return
    case 'respinStart':
      playFeature()
      return
    case 'respinStep':
      if (event.phase === 'start') {
        playRespinSonar()
        if (event.last) playLastRespin()
      } else if (event.phase === 'land') {
        if (event.newCoins.length === 0) playReelStop(2)
      } else if (event.phase === 'pin') {
        playCoinPin(nextPinStep())
        if (event.newCoins.length > 1) later(SECOND_PIN_DELAY_MS, () => playCoinPin(nextPinStep()))
        const treasure = event.newCoins.find((coin) => coin.kind === 'treasure')
        if (treasure !== undefined) later(TREASURE_PIN_DELAY_MS, () => playTreasure(treasure.tier ?? 'small'))
      } else if (event.newCoins.length > 0) {
        // 새 코인이 붙으면 남은 횟수는 언제나 처음 값으로 돌아간다(이미 가득이어도 «다시 찼다»를 들려준다).
        playCounterReset()
      }
      return
    case 'columnWrap':
      playTentacleWrap(event.phase)
      return
    case 'respinCollect':
      if (event.cell.kind === 'treasure') playTreasure(event.cell.tier ?? 'small')
      else playSettleTick(event.total <= 1 ? 1 : event.index / (event.total - 1))
      return
    case 'respinTop':
      if (event.phase === 'start') playTopTreasure()
      return
    default:
  }
}
