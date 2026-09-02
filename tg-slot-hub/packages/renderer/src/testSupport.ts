import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'

/**
 * 테스트 전용. `games/<id>/` 아래 파일의 절대 경로.
 * vitest는 패키지 루트를 cwd로 잡으므로 두 단계 올라가면 모노레포 루트다.
 * (jsdom 환경의 `import.meta.url`은 파일 URL이 아니라서 쓸 수 없다.)
 */
export function gamePackPath(gameId: string, file: string): string {
  return resolve(process.cwd(), '..', '..', 'games', gameId, file)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

/** 실제 게임 팩의 math.json. 픽스처가 아니라 배포되는 데이터로 검증한다. */
export function loadGameMath(gameId: string): GameMath {
  return parseGameMath(readJson(gamePackPath(gameId, 'math.json')))
}

/** 실제 게임 팩의 theme.json 원본(검증 전). */
export function loadThemeJson(gameId: string): unknown {
  return readJson(gamePackPath(gameId, 'theme/theme.json'))
}
