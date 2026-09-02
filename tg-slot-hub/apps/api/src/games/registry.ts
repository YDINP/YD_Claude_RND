import { GameSummarySchema } from '@tgslot/shared'
import type { GameSummary } from '@tgslot/shared'

const rawGames: GameSummary[] = [
  {
    id: 'classic-777',
    name: { en: 'Classic 777', ko: '클래식 777' },
    thumbnail: '/games/classic-777/thumb.svg',
    status: 'live',
    reels: 3,
    rows: 3,
    lines: 5,
    minBet: 10,
    maxBet: 500,
    sort: 0,
  },
  {
    id: 'fruit-fiesta',
    name: { en: 'Fruit Fiesta', ko: '프루트 피에스타' },
    thumbnail: '/games/fruit-fiesta/thumb.webp',
    status: 'soon',
    reels: 5,
    rows: 3,
    lines: 20,
    minBet: 10,
    maxBet: 500,
    sort: 1,
  },
]

/** 모듈 로드 시점에 스키마로 검증해 manifest 오타를 빌드 타임이 아니라 즉시 잡는다. */
export const GAMES: GameSummary[] = rawGames.map((game) => GameSummarySchema.parse(game))

export function listVisibleGames(): GameSummary[] {
  return GAMES.filter((game) => game.status !== 'hidden').sort((a, b) => a.sort - b.sort)
}
