import { GameMathSchema } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { GameManifestSchema } from './manifest.js'
import type { GameManifest } from './manifest.js'
import { PromptsFileSchema, findDuplicateAssetId } from './prompts.js'
import type { PromptsFile } from './prompts.js'
import { ArtFxFileSchema, ThemeFileSchema, emptyTheme } from './theme.js'
import type { FxMap, ThemeFile } from './theme.js'

/**
 * 게임 팩 1개의 파일 계약. **여기가 팩이 무엇으로 이루어지는지에 대한 유일한 정의다.**
 *
 * | 파일 | 필수 | 담당 | 스키마 |
 * |---|---|---|---|
 * | `manifest.json` | 필수 | 로비 표시용 메타데이터 | `GameManifestSchema` |
 * | `math.json` | 필수 | 수학 모델 (엔진의 유일한 입력) | `GameMathSchema` (`@tgslot/slot-engine`) |
 * | `theme/theme.json` | 선택 | 아트 경로·팔레트·연출 (생성물) | `ThemeFileSchema` |
 * | `art/prompts.json` | 선택 | 아트 생성 프롬프트 (원본) | `PromptsFileSchema` |
 * | `art/fx.json` | 선택 | 심볼 승리 연출 (원본) | `ArtFxFileSchema` |
 *
 * "생성물"은 `tools/theme-gen`이 쓰고, "원본"은 사람이 쓴다. 원본이 있으면 생성물을 언제든
 * 다시 만들 수 있어야 한다 — `theme.json`의 `fx`가 `art/fx.json`에서 병합되는 이유다.
 */
export const PACK_FILES = {
  manifest: 'manifest.json',
  math: 'math.json',
  theme: 'theme/theme.json',
  prompts: 'art/prompts.json',
  fx: 'art/fx.json',
} as const

export type PackFileKey = keyof typeof PACK_FILES

/** 반드시 있어야 하는 파일. 나머지는 없으면 기본값으로 채운다. */
export const REQUIRED_PACK_FILES: readonly PackFileKey[] = ['manifest', 'math']

/**
 * 팩 폴더 하나를 읽는 최소 인터페이스. 디스크·메모리·zip 무엇이든 이걸 구현하면 된다.
 * 경로는 전부 **팩 폴더 기준 상대 경로**이고 구분자는 `/`다 (Windows에서도).
 */
export interface PackSource {
  /** 파일 내용. 없으면 undefined. 읽기에 실패하면 던져도 된다 — 호출 측이 문제로 기록한다. */
  readText(path: string): string | undefined
  /** 팩 폴더 아래 모든 파일의 상대 경로. 고아 파일 검사에만 쓴다. */
  list(): string[]
  /**
   * 버전 관리가 **추적 중인** 파일의 상대 경로. 추적 여부를 알 수 없으면 undefined를 준다
   * (git이 없는 환경, 저장소 밖 임시 폴더 등) — 그러면 검사기가 추적 검사만 조용히 건너뛴다.
   *
   * 디스크에 있는 것과 커밋에 들어가는 것은 다르다. untracked 자산을 가리키는 `theme.json`을
   * 커밋하면 배포본에는 파일이 없고 렌더러는 조용히 폴백해서 아무도 모르게 연출이 사라진다.
   */
  listTracked?(): string[] | undefined
}

/** 메모리 맵으로 만드는 `PackSource`. 테스트가 디스크 없이 팩을 조립할 때 쓴다. */
export function createMemorySource(files: Readonly<Record<string, string>>, tracked?: readonly string[]): PackSource {
  const source: PackSource = {
    readText: (path) => files[path],
    list: () => Object.keys(files).sort(),
  }
  // tracked를 주지 않으면 listTracked 자체를 달지 않는다 — "추적 정보 없음"과 "아무것도 추적 안 됨"은 다르다.
  if (tracked !== undefined) source.listTracked = (): string[] => [...tracked]
  return source
}

/**
 * 검증까지 끝난 팩 1개.
 *
 * 없을 수 있는 파일은 **널 오브젝트**로 채운다 (`theme`는 빈 테마, `fx`는 빈 맵).
 * 소비자가 "아트가 있나?"를 매번 분기하지 않게 하려는 것이다.
 */
export interface GamePack {
  id: string
  manifest: GameManifest
  math: GameMath
  /** `theme/theme.json`. 파일이 없으면 `emptyTheme()`. */
  theme: ThemeFile
  /** 파일이 실제로 있었는지. 검사기가 "아트 없음"과 "아트 깨짐"을 구분하는 데 쓴다. */
  hasTheme: boolean
  /** `art/prompts.json`. 없으면 null. */
  prompts: PromptsFile | null
  /** `art/fx.json`의 fx. 없으면 `theme.json`의 fx, 그것도 없으면 빈 맵. */
  fx: FxMap
  /** `art/fx.json`이 실제로 있었는지. 연출 원본이 있는 팩과 없는 팩을 가른다. */
  hasFxSource: boolean
  /**
   * 검증 **전**의 fx 맵 원본. 스키마가 조용히 버린 필드까지 남아 있어서 오타 검사에 쓴다.
   * `art/fx.json`이 있으면 그쪽 `fx`, 없으면 `theme.json`의 `fx`.
   */
  rawFx: unknown
  /** 검증을 통과한 `math.json` 원본. API가 그대로 돌려준다. */
  rawMath: unknown
}

export type ProblemLevel = 'error' | 'warn'

/** 팩 검사가 찾아낸 문제 1개. 한 줄로 출력할 수 있게 파일·필드를 분리해 둔다. */
export interface PackProblem {
  level: ProblemLevel
  /** 팩 폴더 기준 상대 경로. 팩 전체 문제면 빈 문자열. */
  file: string
  /** 점 표기 필드 경로. 파일 전체 문제면 빈 문자열. */
  field: string
  message: string
}

export interface PackInspection {
  id: string
  /** 스키마를 전부 통과했을 때만 채워진다. 하나라도 깨졌으면 null. */
  pack: GamePack | null
  problems: PackProblem[]
}

export class GamePackError extends Error {
  override name = 'GamePackError'
  constructor(
    message: string,
    readonly problems: readonly PackProblem[],
  ) {
    super(message)
  }
}

export function hasErrors(problems: readonly PackProblem[]): boolean {
  return problems.some((problem) => problem.level === 'error')
}

/** `<id> <파일> <필드> — <메시지>` 한 줄. 필드나 파일이 없으면 그 자리를 비운다. */
export function formatProblem(id: string, problem: PackProblem): string {
  const where = [problem.file, problem.field].filter((part) => part !== '').join(' ')
  const tag = problem.level === 'error' ? 'ERROR' : 'WARN '
  return `${tag} ${id}${where === '' ? '' : ` ${where}`} — ${problem.message}`
}

/** 문제 1개를 만든다. 검사기들이 공유하는 유일한 생성자다. */
export function packProblem(level: ProblemLevel, file: string, field: string, message: string): PackProblem {
  return { level, file, field, message }
}

const problem = packProblem

/** zod 이슈를 팩 문제로. 이슈 경로가 그대로 필드 경로가 된다. */
function issuesToProblems(file: string, issues: readonly { path: PropertyKey[]; message: string }[]): PackProblem[] {
  return issues.map((issue) => problem('error', file, issue.path.map(String).join('.'), issue.message))
}

interface ReadResult {
  json: unknown
  problem?: PackProblem
}

/** 파일 하나를 읽어 JSON으로 판다. 없으면 `json: undefined`, 깨졌으면 문제를 함께 돌려준다. */
function readJsonFile(source: PackSource, file: string): ReadResult {
  let text: string | undefined
  try {
    text = source.readText(file)
  } catch (error) {
    return { json: undefined, problem: problem('error', file, '', `읽을 수 없다: ${errorMessage(error)}`) }
  }
  if (text === undefined) return { json: undefined }
  try {
    return { json: JSON.parse(text) as unknown }
  } catch (error) {
    return { json: undefined, problem: problem('error', file, '', `JSON 파싱 실패: ${errorMessage(error)}`) }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** safeParse 결과에서 성공한 값만. 실패했거나 파일이 없었으면 null. */
function successData<T>(parsed: { success: boolean; data?: T } | null): T | null {
  return parsed !== null && parsed.success && parsed.data !== undefined ? parsed.data : null
}

/** JSON 원본에서 키 하나를 꺼낸다. 객체가 아니면 undefined. */
function fieldOf(json: unknown, key: string): unknown {
  return typeof json === 'object' && json !== null ? (json as Record<string, unknown>)[key] : undefined
}

/**
 * 팩을 읽고 **스키마만** 검증한다. 던지지 않고 문제를 전부 모아 돌려준다.
 * 파일 간 참조 무결성(자산 존재 여부·고아 파일 등)은 `validateGamePack`이 이어서 본다.
 */
export function inspectGamePack(source: PackSource, id: string): PackInspection {
  const problems: PackProblem[] = []
  const add = (found: PackProblem | undefined): void => {
    if (found !== undefined) problems.push(found)
  }

  const manifestRead = readJsonFile(source, PACK_FILES.manifest)
  add(manifestRead.problem)
  const mathRead = readJsonFile(source, PACK_FILES.math)
  add(mathRead.problem)
  const themeRead = readJsonFile(source, PACK_FILES.theme)
  add(themeRead.problem)
  const promptsRead = readJsonFile(source, PACK_FILES.prompts)
  add(promptsRead.problem)
  const fxRead = readJsonFile(source, PACK_FILES.fx)
  add(fxRead.problem)

  for (const key of REQUIRED_PACK_FILES) {
    const read = key === 'manifest' ? manifestRead : mathRead
    if (read.json === undefined && read.problem === undefined) {
      problems.push(problem('error', PACK_FILES[key], '', '파일이 없다'))
    }
  }

  const manifestParsed = manifestRead.json === undefined ? null : GameManifestSchema.safeParse(manifestRead.json)
  if (manifestParsed !== null && !manifestParsed.success) {
    problems.push(...issuesToProblems(PACK_FILES.manifest, manifestParsed.error.issues))
  }

  const mathParsed = mathRead.json === undefined ? null : GameMathSchema.safeParse(mathRead.json)
  if (mathParsed !== null && !mathParsed.success) {
    problems.push(...issuesToProblems(PACK_FILES.math, mathParsed.error.issues))
  }

  const themeParsed = themeRead.json === undefined ? null : ThemeFileSchema.safeParse(themeRead.json)
  if (themeParsed !== null && !themeParsed.success) {
    problems.push(...issuesToProblems(PACK_FILES.theme, themeParsed.error.issues))
  }

  const promptsParsed = promptsRead.json === undefined ? null : PromptsFileSchema.safeParse(promptsRead.json)
  if (promptsParsed !== null && !promptsParsed.success) {
    problems.push(...issuesToProblems(PACK_FILES.prompts, promptsParsed.error.issues))
  } else if (promptsParsed !== null) {
    const duplicate = findDuplicateAssetId(promptsParsed.data.assets)
    if (duplicate !== undefined) {
      problems.push(problem('error', PACK_FILES.prompts, 'assets', `asset id가 중복된다: ${duplicate}`))
    }
  }

  const fxParsed = fxRead.json === undefined ? null : ArtFxFileSchema.safeParse(fxRead.json)
  if (fxParsed !== null && !fxParsed.success) {
    problems.push(...issuesToProblems(PACK_FILES.fx, fxParsed.error.issues))
  }

  // 읽기·파싱·스키마 중 하나라도 깨졌으면 팩을 조립하지 않는다.
  // 깨진 파일을 "없는 파일"로 넘기면 기본값이 조용히 들어차 문제가 가려진다.
  if (hasErrors(problems) || manifestParsed?.success !== true || mathParsed?.success !== true) {
    return { id, pack: null, problems }
  }

  // 위 가드를 지났으므로 남은 safeParse 결과는 전부 성공이다. 값만 꺼낸다.
  const themeData = successData(themeParsed)
  const promptsData = successData(promptsParsed)
  const fxData = successData(fxParsed)

  const theme = themeData ?? emptyTheme()
  const pack: GamePack = {
    id,
    manifest: manifestParsed.data,
    math: mathParsed.data,
    theme,
    hasTheme: themeData !== null,
    prompts: promptsData,
    fx: fxData === null ? (theme.fx ?? {}) : fxData.fx,
    hasFxSource: fxData !== null,
    rawFx: fieldOf(fxData === null ? themeRead.json : fxRead.json, 'fx'),
    rawMath: mathRead.json,
  }
  return { id, pack, problems }
}
