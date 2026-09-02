import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GameManifestSchema, toGameSummary } from '@tgslot/game-sdk'
import type { GameManifest } from '@tgslot/game-sdk'
import { parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import type { GameSummary } from '@tgslot/shared'

const WORKSPACE_MARKER = 'pnpm-workspace.yaml'
const GAMES_DIRNAME = 'games'
const MANIFEST_FILE = 'manifest.json'
const MATH_FILE = 'math.json'

/** 디스크에서 읽어 검증까지 끝낸 게임 팩 1개. */
export interface GamePack {
  id: string
  manifest: GameManifest
  math: GameMath
  /** 검증을 통과한 math.json 원본. `GET /games/:id/math`가 그대로 돌려준다. */
  rawMath: unknown
  summary: GameSummary
}

/** 이 모듈이 있는 디렉터리. tsx(src/)로 돌든 tsup 번들(dist/)로 돌든 실제 위치를 가리킨다. */
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

/**
 * games 디렉터리를 찾는다.
 *
 * 1. `GAMES_DIR` 환경변수가 있으면 무조건 그것을 쓴다 (배포 환경 탈출구).
 * 2. 없으면 이 모듈 위치에서 위로 올라가며 `pnpm-workspace.yaml`이 있는 폴더의 `games/`를 찾고,
 *    그것도 없으면 `games/` 하위 폴더를 가진 첫 조상을 쓴다.
 *
 * `src/games/packs.ts`(tsx)와 `dist/index.js`(번들) 양쪽 모두에서 같은 경로로 수렴한다.
 */
export function resolveGamesDir(env: NodeJS.ProcessEnv = process.env, startDir: string = moduleDir()): string {
  const override = env.GAMES_DIR
  if (override) return resolve(override)

  let current = resolve(startDir)
  let fallback: string | null = null
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return join(current, GAMES_DIRNAME)
    const candidate = join(current, GAMES_DIRNAME)
    if (fallback === null && existsSync(candidate) && statSync(candidate).isDirectory()) {
      fallback = candidate
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  if (fallback !== null) return fallback
  throw new Error(`[games] games 디렉터리를 찾지 못했다. GAMES_DIR로 지정할 것 (시작 위치: ${startDir})`)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

/** `_`로 시작하는 폴더(_template)는 스캐폴드이므로 제외한다. */
function listPackDirs(gamesDir: string): string[] {
  if (!existsSync(gamesDir)) return []
  return readdirSync(gamesDir)
    .filter((name) => !name.startsWith('_'))
    .map((name) => join(gamesDir, name))
    .filter((dir) => statSync(dir).isDirectory())
    .sort()
}

/**
 * manifest.json이 있는 폴더인지. **아트만 있는 폴더와 진짜 게임 팩을 가르는 기준**이다.
 * 아트 파이프라인이 `games/<id>/art`와 `theme`를 수학 팩보다 며칠 먼저 만들기 때문에
 * 이 구분이 없으면 아트 생성만으로 서버 부팅과 테스트가 통째로 막힌다.
 */
function hasManifest(dir: string): boolean {
  return existsSync(join(dir, MANIFEST_FILE))
}

/**
 * 게임 팩 1개를 읽고 검증한다.
 * manifest.id === math.id === 폴더 이름이 아니면 던진다.
 * 부팅 시점에 터지는 편이 잘못된 팩으로 스핀을 받는 것보다 낫다.
 */
export function loadGamePack(dir: string): GamePack {
  const id = basename(dir)
  const manifestPath = join(dir, MANIFEST_FILE)
  const mathPath = join(dir, MATH_FILE)

  if (!existsSync(manifestPath)) throw new Error(`[games] ${id}: ${MANIFEST_FILE}이 없다`)
  if (!existsSync(mathPath)) throw new Error(`[games] ${id}: ${MATH_FILE}이 없다`)

  const manifest = GameManifestSchema.parse(readJson(manifestPath))
  const rawMath = readJson(mathPath)
  const math = parseGameMath(rawMath)

  if (manifest.id !== id) throw new Error(`[games] ${id}: manifest.id(${manifest.id})가 폴더 이름과 다르다`)
  if (math.id !== id) throw new Error(`[games] ${id}: math.id(${math.id})가 폴더 이름과 다르다`)

  return { id, manifest, math, rawMath, summary: toGameSummary(manifest) }
}

/**
 * games 디렉터리 전체를 읽는다.
 *
 * - `manifest.json`이 **아예 없는** 폴더는 아직 게임이 아니라고 보고 경고만 남기고 건너뛴다
 *   (아트가 먼저 생성된 폴더). 이것 때문에 부팅이나 테스트가 막히면 안 된다.
 * - `manifest.json`은 있는데 `math.json`이 없거나 깨졌으면 **던진다.** 만들다 만 팩을 로비에
 *   올리는 것이 조용히 빠뜨리는 것보다 위험하다.
 */
export function loadGamePacks(gamesDir: string = resolveGamesDir()): GamePack[] {
  const packs: GamePack[] = []
  for (const dir of listPackDirs(gamesDir)) {
    if (!hasManifest(dir)) {
      console.warn(`[games] skipping incomplete pack ${basename(dir)}`)
      continue
    }
    packs.push(loadGamePack(dir))
  }
  return packs
}
