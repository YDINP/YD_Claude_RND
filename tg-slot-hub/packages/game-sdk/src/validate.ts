import { PACK_FILES, hasErrors, formatProblem, inspectGamePack, packProblem, GamePackError } from './pack.js'
import type { GamePack, PackProblem, PackSource, ProblemLevel } from './pack.js'
import { FX_DEFAULT_KEY, FX_EFFECT_FIELDS, sheetAtlasPath, themeAssetRefs } from './theme.js'

/**
 * 팩 하나의 **파일 사이 관계**를 검사한다. 스키마 검사는 `inspectGamePack`이 이미 끝냈다.
 *
 * 검사는 두 단계로 나뉜다 ({@link ValidateOptions.stage}) — **누가 이 검사 결과를 필요로 하는가**가
 * 기준이다.
 *
 * | 단계 | 보는 것 | 쓰는 곳 |
 * |---|---|---|
 * | `serving` (팩을 **돌리는** 쪽) | 폴더명 = manifest.id = math.id, manifest ↔ math 합의, 런타임이 실제로 받아가는 자산(썸네일·심볼·시트·배경·프레임·전환 클립)이 실제로 있는가 | API 부팅 등 — 서버가 판을 돌리는 데 필요한 것만 본다 |
 * | `authoring` (팩을 **만드는** 쪽, 기본값) | `serving`의 전부 + git 추적 여부, 128px 썸네일, `art/fx.json`↔`theme.json.fx` 드리프트, fx 필드 오타, prompts.json과 math/theme의 정합성, 고아 파일 | `pnpm pack:check` — 저작 파이프라인 위생까지 전수 검사 |
 *
 * `authoring`이 `serving`을 그대로 포함하는 상위 집합이다. 아직 다 그리지 않은 팩(아트 파이프라인이
 * 수학 팩보다 늦게 도는 것은 정상이다)이 저작 단계 검사에는 걸려도, 서버 부팅까지 막아서는 안 된다는
 * 것이 이 구분의 이유다.
 */

export type ValidateStage = 'authoring' | 'serving'

export interface ValidateOptions {
  /**
   * prompts.json에는 있는데 아직 파일이 없는 자산의 등급. 기본 `warn` —
   * 아트 파이프라인이 수학 팩보다 늦게 도는 것이 정상이라 실패로 보지 않는다.
   */
  ungeneratedAssets?: ProblemLevel
  /** 고아 파일 검사를 켤지. 기본 true. `stage: 'serving'`이면 애초에 보지 않는다. */
  orphans?: boolean
  /** 검사 단계. 기본 `authoring` (기존 호출자와 동일하게 전수 검사). */
  stage?: ValidateStage
}

/** 팩 폴더 기준 상대 경로를 정규화한다. `.`/`..`를 접고 구분자를 `/`로 통일한다. */
export function normalizePackPath(path: string): string {
  const out: string[] = []
  for (const segment of path.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

/** `theme/theme.json` 기준 상대 경로 -> 팩 폴더 기준 상대 경로. */
export function resolveThemePath(path: string): string {
  return normalizePackPath(`theme/${path}`)
}

/** 팩 안에서 검사할 수 없는 경로(절대 URL·루트 절대 경로·data URI)인가. */
function isExternalPath(path: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(path)
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index + 1)
}

/**
 * `manifest.thumbnail`(`/games/<id>/<경로>`)에서 팩 폴더 기준 상대 경로를 뽑는다.
 * 규약을 벗어난 URL이면 undefined — 팩 안에서 검사할 수 없다는 뜻이다.
 */
export function thumbnailPackPath(thumbnail: string, id: string): string | undefined {
  const prefix = `/games/${id}/`
  if (!thumbnail.startsWith(prefix)) return undefined
  return normalizePackPath(thumbnail.slice(prefix.length))
}

/** 사람이 관리하고 아무도 참조하지 않아도 되는 파일. */
const DOC_FILES = new Set(['README.md', 'CHECKLIST.md', 'HOWTO.md'])
/** 프로바이더 원본 보관 폴더. 재처리(`--reprocess`)가 읽으므로 고아가 아니고, 일부러 gitignore된다. */
const RAW_DIR_PREFIX = 'art/raw/'
/** 일부러 버전 관리에서 빼는 경로. 추적 검사에서 제외한다 (`.gitignore`가 팩마다 `art/raw/`를 뺀다). */
const UNTRACKED_BY_DESIGN_PREFIXES: readonly string[] = [RAW_DIR_PREFIX]

export function validateGamePack(pack: GamePack, source: PackSource, options: ValidateOptions = {}): PackProblem[] {
  const ungenerated = options.ungeneratedAssets ?? 'warn'
  const stage = options.stage ?? 'authoring'
  const isAuthoring = stage === 'authoring'
  const problems: PackProblem[] = []
  const add = (level: ProblemLevel, file: string, field: string, message: string): void => {
    problems.push(packProblem(level, file, field, message))
  }

  const files = new Set(source.list().map(normalizePackPath))
  /** 무언가가 참조하는 파일. 남은 것이 고아다. */
  const referenced = new Set<string>([...Object.values(PACK_FILES), ...DOC_FILES])

  /** 참조를 등록하고 파일이 있는지 본다. 팩 밖 경로는 등록만 하고 넘어간다. */
  const requireFile = (level: ProblemLevel, file: string, field: string, path: string, label: string): boolean => {
    if (isExternalPath(path)) {
      add('warn', file, field, `${label} 경로가 팩 밖이라 검사할 수 없다: ${path}`)
      return true
    }
    referenced.add(path)
    if (files.has(path)) return true
    add(level, file, field, `${label} 파일이 없다: ${path}`)
    return false
  }

  // serving: 폴더명=manifest.id=math.id, manifest↔math 합의, 런타임 자산 존재까지만 본다.
  checkIdentity(pack, add, stage)
  checkManifestMathAgreement(pack, add)

  // 런타임이 실제로 받아가는 자산. 존재 검사와 추적 검사가 **같은 목록**을 본다.
  const runtime = runtimeAssets(pack, ungenerated)
  for (const asset of runtime) {
    requireFile(asset.level, asset.file, asset.field, asset.path, asset.label)
  }

  if (pack.hasTheme) {
    checkThemeSymbols(pack, add)
  } else if (isAuthoring) {
    add('warn', PACK_FILES.theme, '', '테마가 없다. 아트를 아직 생성하지 않은 팩이다')
  }

  // authoring 전용: 저작 파이프라인 위생. 팩을 돌리는 데는 필요 없다.
  if (isAuthoring) {
    checkTracked(runtime, source, files, add)
    if (pack.hasTheme) {
      checkSymbolThumbnails(pack, requireFile)
      checkFxSource(pack, add)
    }
    checkFxMap(pack, add)
    checkPrompts(pack, ungenerated, add, requireFile)

    if (options.orphans !== false) {
      for (const file of [...files].sort()) {
        if (referenced.has(file)) continue
        if (file.startsWith(RAW_DIR_PREFIX)) continue
        add('warn', file, '', '아무도 참조하지 않는 파일이다')
      }
    }
  }

  return problems
}

type Add = (level: ProblemLevel, file: string, field: string, message: string) => void
type RequireFile = (level: ProblemLevel, file: string, field: string, path: string, label: string) => boolean

/**
 * 폴더 이름 = manifest.id = math.id. 하나라도 어긋나면 로더가 엉뚱한 팩을 집는다.
 * prompts.json과의 동일성은 저작 도구(prompts.json 자체)의 정합성 문제라 `authoring`에서만 본다.
 */
function checkIdentity(pack: GamePack, add: Add, stage: ValidateStage): void {
  if (pack.manifest.id !== pack.id) {
    add('error', PACK_FILES.manifest, 'id', `폴더 이름(${pack.id})과 다르다: ${pack.manifest.id}`)
  }
  if (pack.math.id !== pack.id) {
    add('error', PACK_FILES.math, 'id', `폴더 이름(${pack.id})과 다르다: ${pack.math.id}`)
  }
  if (stage === 'authoring' && pack.prompts !== null && pack.prompts.game !== pack.id) {
    add('error', PACK_FILES.prompts, 'game', `폴더 이름(${pack.id})과 다르다: ${pack.prompts.game}`)
  }
}

/** manifest는 로비 표시용 요약이다. math와 어긋나면 로비가 거짓말을 한다. */
function checkManifestMathAgreement(pack: GamePack, add: Add): void {
  const { manifest, math } = pack
  const file = PACK_FILES.manifest
  if (manifest.reels !== math.reels) add('error', file, 'reels', `math.json(${math.reels})과 다르다: ${manifest.reels}`)
  if (manifest.rows !== math.rows) add('error', file, 'rows', `math.json(${math.rows})과 다르다: ${manifest.rows}`)

  const mathLines = math.payModel === 'ways' ? (math.ways?.base ?? 0) : math.paylines.length
  if (manifest.lines !== mathLines) {
    const label = math.payModel === 'ways' ? 'ways.base' : 'paylines 개수'
    add('error', file, 'lines', `math.json의 ${label}(${mathLines})과 다르다: ${manifest.lines}`)
  }

  const same = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((value, index) => value === b[index])
  if (!same(manifest.betLevels, math.betLevels)) {
    add('error', file, 'betLevels', `math.json(${math.betLevels.join(',')})과 다르다: ${manifest.betLevels.join(',')}`)
  }
  if (manifest.rtpTarget !== math.rtpTarget) {
    add('error', file, 'rtpTarget', `math.json(${math.rtpTarget})과 다르다: ${manifest.rtpTarget}`)
  }
  if (manifest.volatility !== math.volatility) {
    add('error', file, 'volatility', `math.json(${math.volatility})과 다르다: ${manifest.volatility}`)
  }

  const total = manifest.rtpTotalTarget
  const contribution = manifest.jackpotContribution
  if (total !== undefined && contribution !== undefined) {
    const expected = manifest.rtpTarget + contribution
    if (Math.abs(total - expected) > 1e-9) {
      add('warn', file, 'rtpTotalTarget', `rtpTarget + jackpotContribution(${expected})과 다르다: ${total}`)
    }
  }
}

/** 런타임이 실제로 받아가는 자산 1개. 존재 검사와 추적 검사가 이 목록을 공유한다. */
interface RuntimeAsset {
  /** 이 참조가 적힌 파일. */
  file: string
  field: string
  /** 팩 폴더 기준 상대 경로. 팩 밖 경로면 원본 그대로. */
  path: string
  label: string
  /** 없을 때의 등급. 아직 생성 안 된 것이 정상인 자산은 경고다. */
  level: ProblemLevel
}

/**
 * 로비와 렌더러가 실제로 내려받는 자산 전부 — manifest의 썸네일 + theme.json이 가리키는 모든 것
 * (심볼·배경·프레임·시트 사이드카와 아틀라스·전환 클립·효과음).
 *
 * `themeAssetRefs`가 유일한 열거 지점이라, `ThemeFileSchema`에 경로 필드가 늘어도
 * 존재 검사와 git 추적 검사 중 한쪽만 빠지는 일이 생기지 않는다.
 */
function runtimeAssets(pack: GamePack, ungenerated: ProblemLevel): RuntimeAsset[] {
  const assets: RuntimeAsset[] = []

  const thumbPath = thumbnailPackPath(pack.manifest.thumbnail, pack.id)
  if (thumbPath !== undefined) {
    // prompts.json이 만들기로 되어 있는 파일이면 "아직 안 만든 것"이지 "깨진 참조"가 아니다.
    const pending = pack.prompts?.assets.some((asset) => normalizePackPath(asset.out) === thumbPath) === true
    assets.push({
      file: PACK_FILES.manifest,
      field: 'thumbnail',
      path: thumbPath,
      label: '썸네일',
      level: pending ? ungenerated : 'error',
    })
  }

  if (!pack.hasTheme) return assets

  for (const ref of themeAssetRefs(pack.theme)) {
    const external = isExternalPath(ref.path)
    const path = external ? ref.path : resolveThemePath(ref.path)
    assets.push({ file: PACK_FILES.theme, field: ref.field, path, label: '자산', level: 'error' })
    if (ref.kind === 'sheet' && !external) {
      assets.push({
        file: PACK_FILES.theme,
        field: ref.field,
        path: sheetAtlasPath(path),
        label: '시트 아틀라스',
        level: 'error',
      })
    }
  }
  return assets
}

/**
 * 참조된 자산이 **버전 관리에 들어가 있는지**. 디스크에 있는 것만으로는 부족하다 —
 * untracked 파일을 가리키는 `theme.json`을 커밋하면 배포본에는 그 파일이 없고,
 * 렌더러는 에러 없이 폴백해서 연출만 조용히 사라진다.
 *
 * 추적 정보를 알 수 없는 환경(git 없음, 저장소 밖 임시 폴더, 메모리 픽스처)에서는
 * 이 검사만 건너뛰고 나머지는 그대로 돈다.
 */
function checkTracked(assets: readonly RuntimeAsset[], source: PackSource, files: ReadonlySet<string>, add: Add): void {
  const tracked = source.listTracked?.()
  if (tracked === undefined) return
  const trackedSet = new Set(tracked.map(normalizePackPath))

  const reported = new Set<string>()
  for (const asset of assets) {
    if (isExternalPath(asset.path)) continue
    if (UNTRACKED_BY_DESIGN_PREFIXES.some((prefix) => asset.path.startsWith(prefix))) continue
    // 파일 자체가 없으면 이미 다른 문제로 잡혔다. 같은 자산에 두 줄을 찍지 않는다.
    if (!files.has(asset.path) || trackedSet.has(asset.path)) continue
    if (reported.has(asset.path)) continue
    reported.add(asset.path)
    add('error', asset.file, asset.field, `${asset.label}이 git에 추적되지 않는다. 커밋하면 배포본에서 사라진다: ${asset.path}`)
  }
}

/** theme-gen이 심볼마다 함께 만드는 128px 썸네일. 렌더러가 직접 받지는 않지만 고아도 아니다. */
function checkSymbolThumbnails(pack: GamePack, requireFile: RequireFile): void {
  for (const [id, path] of Object.entries(pack.theme.symbols)) {
    if (isExternalPath(path)) continue
    requireFile('warn', PACK_FILES.theme, `symbols.${id}`, `${dirOf(resolveThemePath(path))}${id}@128.webp`, '128px 썸네일')
  }
}

/** math의 심볼과 theme의 심볼·연출·시트가 서로 맞는지. */
function checkThemeSymbols(pack: GamePack, add: Add): void {
  const mathSymbols = new Set(pack.math.symbols.map((symbol) => symbol.id))

  for (const symbol of pack.math.symbols) {
    if (pack.theme.symbols[symbol.id] === undefined) {
      add('error', PACK_FILES.theme, `symbols.${symbol.id}`, `math.json의 심볼인데 이미지가 없다`)
    }
  }
  for (const id of Object.keys(pack.theme.symbols)) {
    if (!mathSymbols.has(id)) {
      add('warn', PACK_FILES.theme, `symbols.${id}`, 'math.json에 없는 심볼이다')
    }
  }
  for (const id of Object.keys(pack.theme.sheets ?? {})) {
    if (!mathSymbols.has(id)) add('warn', PACK_FILES.theme, `sheets.${id}`, 'math.json에 없는 심볼이다')
  }
}

/**
 * fx 맵 키는 심볼 id이거나 `default`여야 하고, 효과 필드는 스키마가 아는 것이어야 한다.
 *
 * **검증 전 원본**(`pack.rawFx`)을 본다. `FxEffectSchema`가 모르는 필드를 조용히 버리기 때문에
 * 파싱된 값을 보면 오타를 영영 못 잡는다.
 */
function checkFxMap(pack: GamePack, add: Add): void {
  const file = pack.hasFxSource ? PACK_FILES.fx : PACK_FILES.theme
  const raw = pack.rawFx
  if (typeof raw !== 'object' || raw === null) return

  const mathSymbols = new Set(pack.math.symbols.map((symbol) => symbol.id))
  const known = new Set(FX_EFFECT_FIELDS)
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (id !== FX_DEFAULT_KEY && !mathSymbols.has(id)) {
      add('warn', file, `fx.${id}`, `math.json에 없는 심볼이다 (\`${FX_DEFAULT_KEY}\`가 아니면 심볼 id여야 한다)`)
    }
    const win = typeof entry === 'object' && entry !== null ? (entry as { win?: unknown }).win : undefined
    if (!Array.isArray(win)) continue
    win.forEach((effect, index) => {
      if (typeof effect !== 'object' || effect === null) return
      for (const key of Object.keys(effect as Record<string, unknown>)) {
        if (known.has(key)) continue
        add('warn', file, `fx.${id}.win.${index}.${key}`, '스키마에 없는 필드다. 파싱 때 조용히 버려진다')
      }
    })
  }
}

/**
 * 연출 원본(`art/fx.json`)과 생성물(`theme.json.fx`)이 어긋났는지.
 * 원본이 없으면 theme.json을 손으로 고치는 수밖에 없어 재생성 때 날아갈 위험이 있다.
 */
function checkFxSource(pack: GamePack, add: Add): void {
  const themeFx = pack.theme.fx
  if (!pack.hasFxSource) {
    if (themeFx !== undefined) {
      add('warn', PACK_FILES.fx, '', `연출 원본이 없다. theme.json의 fx를 ${PACK_FILES.fx}로 옮길 것`)
    }
    return
  }
  if (themeFx === undefined) {
    add('warn', PACK_FILES.theme, 'fx', `${PACK_FILES.fx}에 연출이 있는데 반영되지 않았다. theme-gen을 다시 돌릴 것`)
    return
  }
  if (JSON.stringify(pack.fx) !== JSON.stringify(themeFx)) {
    add('warn', PACK_FILES.theme, 'fx', `${PACK_FILES.fx}와 내용이 다르다. theme-gen을 다시 돌릴 것`)
  }
}

/** prompts.json의 asset이 math·theme과 맞는지, 출력 파일이 이미 생성됐는지. */
function checkPrompts(pack: GamePack, ungenerated: ProblemLevel, add: Add, requireFile: RequireFile): void {
  const prompts = pack.prompts
  if (prompts === null) {
    add('warn', PACK_FILES.prompts, '', '아트 프롬프트가 없다. 아트를 다시 만들 수 없는 팩이다')
    return
  }
  const mathSymbols = new Set(pack.math.symbols.map((symbol) => symbol.id))

  prompts.assets.forEach((asset, index) => {
    const field = `assets.${index}(${asset.id})`
    if (asset.kind === 'symbol' && !mathSymbols.has(asset.id)) {
      add('error', PACK_FILES.prompts, `${field}.id`, 'math.json에 없는 심볼이다')
    }
    if (asset.kind === 'sheet' && asset.symbol !== undefined && !mathSymbols.has(asset.symbol)) {
      add('error', PACK_FILES.prompts, `${field}.symbol`, `math.json에 없는 심볼이다: ${asset.symbol}`)
    }

    const out = normalizePackPath(asset.out)
    requireFile(ungenerated, PACK_FILES.prompts, `${field}.out`, out, '생성 결과')
    if (asset.kind === 'symbol') {
      requireFile(ungenerated, PACK_FILES.prompts, `${field}.out`, `${dirOf(out)}${asset.id}@128.webp`, '128px 썸네일')
    }
    if (asset.kind === 'sheet') {
      requireFile(ungenerated, PACK_FILES.prompts, `${field}.out`, out.replace(/\.webp$/i, '.json'), '시트 사이드카 JSON')
    }
  })

  for (const symbol of pack.math.symbols) {
    if (prompts.assets.some((asset) => asset.kind === 'symbol' && asset.id === symbol.id)) continue
    add('warn', PACK_FILES.prompts, 'assets', `math.json의 심볼 ${symbol.id}를 그리는 asset이 없다`)
  }
}

/**
 * 팩을 읽고 스키마 + 참조 무결성까지 전부 검증한다. `error`가 하나라도 있으면 던진다.
 * 서버 부팅처럼 "깨진 팩으로는 아예 못 뜨게" 하고 싶은 자리에서 쓴다.
 */
export function parseGamePack(source: PackSource, id: string, options: ValidateOptions = {}): GamePack {
  const inspection = inspectGamePack(source, id)
  const problems = [...inspection.problems]
  if (inspection.pack !== null) problems.push(...validateGamePack(inspection.pack, source, options))

  if (inspection.pack === null || hasErrors(problems)) {
    const lines = problems.filter((found) => found.level === 'error').map((found) => formatProblem(id, found))
    throw new GamePackError(`게임 팩 검증 실패: ${id}\n${lines.join('\n')}`, problems)
  }
  return inspection.pack
}

/** 스키마 + 참조 무결성 검사를 한 번에. CLI와 테스트가 쓰는 진입점이다. */
export function checkGamePack(source: PackSource, id: string, options: ValidateOptions = {}): PackProblem[] {
  const inspection = inspectGamePack(source, id)
  if (inspection.pack === null) return inspection.problems
  return [...inspection.problems, ...validateGamePack(inspection.pack, source, options)]
}
