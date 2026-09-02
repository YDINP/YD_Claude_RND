/**
 * `games/<id>/{manifest,math}.json`을 빌드 타임에 전부 끌어온다.
 * 서버도 fetch도 없이 브라우저에서 전부 도는 것이 이 앱의 전제다.
 */
import { parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { readManifestExtras } from '@tgslot/rtp-sim/audit'
import type { ManifestExtras } from '@tgslot/rtp-sim/audit'

const modules = import.meta.glob('../../../games/*/{manifest,math}.json', { eager: true }) as Record<
  string,
  { default: unknown }
>

export interface GamePack {
  id: string
  label: string
  math: GameMath
  /** manifest.json 원본. 스키마 밖 필드(jackpotContribution 등)를 봐야 해서 파싱하지 않고 그대로 둔다. */
  manifestJson: unknown
  extras: ManifestExtras | null
}

export interface GamePackError {
  id: string
  message: string
}

export interface GameCatalog {
  packs: GamePack[]
  errors: GamePackError[]
}

const FILE_PATTERN = /games\/([^/]+)\/(manifest|math)\.json$/

/** `_template`처럼 `_`로 시작하는 폴더는 스캐폴드라 건너뛴다 (api/hub와 같은 규칙). */
export function isScaffoldId(id: string): boolean {
  return id.startsWith('_')
}

function collect(): Map<string, { manifest?: unknown; math?: unknown }> {
  const byId = new Map<string, { manifest?: unknown; math?: unknown }>()
  for (const [path, module] of Object.entries(modules)) {
    const matched = FILE_PATTERN.exec(path)
    if (matched === null) continue
    const id = matched[1]
    const kind = matched[2]
    if (id === undefined || kind === undefined || isScaffoldId(id)) continue
    const entry = byId.get(id) ?? {}
    if (kind === 'manifest') entry.manifest = module.default
    else entry.math = module.default
    byId.set(id, entry)
  }
  return byId
}

/**
 * 게임 팩 목록. math.json이 스키마를 통과하지 못한 팩은 목록에서 빼고 이유를 따로 모은다.
 * 팩 하나가 깨져도 앱 전체가 죽지 않아야 한다.
 */
export function loadGameCatalog(): GameCatalog {
  const packs: GamePack[] = []
  const errors: GamePackError[] = []

  for (const [id, entry] of [...collect().entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (entry.math === undefined) {
      errors.push({ id, message: 'math.json이 없다' })
      continue
    }
    try {
      const math = parseGameMath(entry.math)
      const extras = readManifestExtras(entry.manifest ?? null)
      packs.push({
        id,
        label: extras?.nameKo ?? extras?.nameEn ?? id,
        math,
        manifestJson: entry.manifest ?? null,
        extras,
      })
    } catch (error) {
      errors.push({ id, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return { packs, errors }
}

/** 검수 기본 베팅액. 100이 있으면 100, 없으면 첫 레벨. CLI의 `pickBet`과 같은 규칙. */
export function defaultBet(math: GameMath): number {
  if (math.betLevels.includes(100)) return 100
  return math.betLevels[0] ?? 1
}
