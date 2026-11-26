/**
 * 브라우저 체험판 서버. apps/api의 Hono 앱을 **그대로** 브라우저 안에서 띄운다.
 *
 * - 게임 팩: 빌드할 때 games/<id>의 json을 묶어 넣고 game-sdk 스키마 검증(inspectGamePack)을 거친다.
 * - 저장소: in-memory 레포를 localStorage에 통째로 스냅숏해 새로고침해도 코인이 남는다.
 * - 로그인: 텔레그램 밖이므로 dev mock 로그인만 연다. 결과 강제(debug spin)는 열지 않는다.
 * 실제 돈은 오가지 않는다. 가상 코인만 쓴다.
 */
import { createApp } from '../../../api/src/app'
import { MemoryRepos } from '../../../api/src/repos/memory'
import { createGameRegistry } from '../../../api/src/games/registry'
import type { GamePack } from '../../../api/src/games/packs'
import type { ApiConfig } from '../../../api/src/config'
import { createMemorySource, inspectGamePack, toGameSummary } from '@tgslot/game-sdk'

const STORAGE_KEY = 'tgslot.demo.state.v1'
const DEMO_ORIGIN = 'https://demo.local'

const rawFiles = import.meta.glob<string>(
  [
    '../../../../games/*/manifest.json',
    '../../../../games/*/math.json',
    '../../../../games/*/theme/theme.json',
    '../../../../games/*/art/fx.json',
    '../../../../games/*/art/prompts.json',
  ],
  { eager: true, query: '?raw', import: 'default' },
)

function loadPacks(): GamePack[] {
  const byGame = new Map<string, Record<string, string>>()
  for (const [path, text] of Object.entries(rawFiles)) {
    const m = /games\/([^/]+)\/(.+)$/.exec(path)
    if (!m) continue
    const id = m[1]!
    const file = m[2]!
    if (id.startsWith('_')) continue
    const files = byGame.get(id) ?? {}
    files[file] = text
    byGame.set(id, files)
  }
  const packs: GamePack[] = []
  for (const [id, files] of byGame) {
    if (!files['manifest.json'] || !files['math.json']) continue
    const { pack, problems } = inspectGamePack(createMemorySource(files), id)
    if (!pack) {
      console.warn(`[demo] 게임 팩 ${id} 건너뜀`, problems)
      continue
    }
    packs.push({ ...pack, summary: toGameSummary(pack.manifest) })
  }
  return packs
}

// ---- 스냅숏: Map·Set·Date를 보존하는 JSON ----
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key]
  if (raw instanceof Date) return { __d: raw.toISOString() }
  if (raw instanceof Map) return { __m: [...raw.entries()] }
  if (raw instanceof Set) return { __s: [...raw.values()] }
  return value
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('__d' in v) return new Date(v.__d as string)
    if ('__m' in v) return new Map(v.__m as [unknown, unknown][])
    if ('__s' in v) return new Set(v.__s as unknown[])
  }
  return value
}

/** 레포 내부 필드 중 시계는 함수라 저장하지 않는다. */
const SKIP_FIELDS = new Set(['clock'])

function createRepos(): MemoryRepos {
  const repos = new MemoryRepos()
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const state = JSON.parse(saved, reviver) as Record<string, unknown>
      const target = repos as unknown as Record<string, unknown>
      for (const [k, v] of Object.entries(state)) {
        if (k in target && !SKIP_FIELDS.has(k)) target[k] = v
      }
    }
  } catch (err) {
    console.warn('[demo] 저장된 체험판 기록을 읽지 못해 새로 시작한다', err)
  }
  return repos
}

function saveRepos(repos: MemoryRepos): void {
  try {
    const state: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(repos)) if (!SKIP_FIELDS.has(k)) state[k] = v
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state, replacer))
  } catch {
    /* 저장 불가 환경(프라이빗 모드 등) — 이번 방문 동안만 유지 */
  }
}

const config: ApiConfig = {
  telegramBotToken: 'demo',
  // 체험판 토큰은 이 브라우저 안에서만 오간다. 지킬 자산(실제 돈·다른 유저)이 없다.
  jwtSecret: 'tgslot-browser-demo-secret-not-for-production',
  port: 0,
  allowDevAuth: true,
  allowDebugSpin: false,
  corsOrigin: '*',
  spinLockTimeoutMs: 10_000,
}

const repos = createRepos()
const app = createApp({ config, repos, games: createGameRegistry(loadPacks()) })

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** sdk/api.ts가 체험판 빌드에서 fetch 대신 부른다. */
export async function demoFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await app.fetch(new Request(`${DEMO_ORIGIN}${path}`, init))
  if (init?.method && init.method !== 'GET') {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveRepos(repos), 200)
  }
  return res
}
