/**
 * 말판 보너스 테스트 픽스처 — 실제 한복 야시장 math.json을 그대로 읽고, 시드 RNG로 진짜 말판 피처를 만든다.
 * 화면 로직이 서버가 보내는 것과 같은 모양의 데이터로 검증되도록 손으로 던지기 목록을 쓰지 않는다.
 */
import { createSeededRng, parseGameMath, playBoard, type BoardBonusConfig, type GameMath } from '@tgslot/slot-engine'
import type { BoardBonusFeature } from '@tgslot/shared'
import hanbokRaw from '../../../../games/hanbok-night-market/math.json'

export const hanbokMath: GameMath = parseGameMath(hanbokRaw)

export function hanbokBoardConfig(): BoardBonusConfig {
  const config = hanbokMath.boardBonus
  if (config === undefined) throw new Error('한복 야시장 math에 말판이 없다')
  return config
}

/** 시드로 말판 한 판을 돌린다. `playBoard`가 던진 기록을 그대로 피처 모양으로 돌려준다. */
export function makeBoardFeature(seed: string, totalBet = 100): BoardBonusFeature {
  const feature = playBoard(hanbokBoardConfig(), totalBet, createSeededRng(seed), Number.MAX_SAFE_INTEGER)
  return feature as unknown as BoardBonusFeature
}

/** 조건에 맞는 말판이 나올 때까지 시드를 바꿔 찾는다(테스트가 «갈림길에 멈춘 판» 같은 사례를 얻는 용도). */
export function findBoardFeature(predicate: (feature: BoardBonusFeature) => boolean, limit = 4000): BoardBonusFeature {
  for (let i = 0; i < limit; i += 1) {
    const feature = makeBoardFeature(`hanbok-fixture-${i}`)
    if (predicate(feature)) return feature
  }
  throw new Error('조건에 맞는 말판을 찾지 못했다')
}
