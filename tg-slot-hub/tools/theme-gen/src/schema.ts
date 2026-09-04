import { isAbsolute } from 'node:path'
import { z } from 'zod'

export const ASSET_KINDS = ['symbol', 'frame', 'bg', 'thumb', 'sheet'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/**
 * gpt-image-1이 지원하는 정사각/세로/가로 세 크기에 더해, sprite sheet 콘택트시트용 정사각
 * `1536x1536`을 허용한다. gpt-image-1(openai) 자체는 1536x1536을 지원하지 않으니 그 크기는
 * codex/comfy로만 쓸 것 — openai로 요청하면 API가 그 자리에서 거부한다.
 */
export const ASSET_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1536x1536'] as const
export type AssetSize = (typeof ASSET_SIZES)[number]

const SheetGridSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
})

/** 절대 경로거나 `..` 세그먼트로 게임 폴더 밖을 가리키면 안전하지 않다고 본다. */
function isUnsafeOutPath(out: string): boolean {
  if (isAbsolute(out)) return true
  return out.split(/[\\/]+/).some((segment) => segment === '..')
}

export const PromptAssetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(ASSET_KINDS),
    prompt: z.string().min(1),
    size: z.enum(ASSET_SIZES),
    /** 생성 시 투명 배경을 요구할지. 기본 false. */
    transparent: z.boolean().optional().default(false),
    /** 게임 폴더 기준 상대 출력 경로. 예: `theme/symbols/seven.webp`. */
    out: z.string().min(1),
    /** 최종 출력 한 변(px, symbol) 또는 폭(px, frame/bg/thumb/sheet). */
    outSize: z.number().int().positive(),
    /** `kind: "sheet"` 전용: 이 애니메이션이 어느 심볼용인지. */
    symbol: z.string().min(1).optional(),
    /** `kind: "sheet"` 전용: 콘택트시트 격자(가로x세로 칸 수). */
    grid: SheetGridSchema.optional(),
    /** `kind: "sheet"` 전용: 재생 fps. */
    fps: z.number().int().positive().optional(),
    /**
     * codex 프로바이더 전용 타임아웃(ms) 오버라이드. 기본은 kind별 기본값
     * (`sheet`는 `DEFAULT_CODEX_SHEET_TIMEOUT_MS`, 그 외는 `DEFAULT_CODEX_TIMEOUT_MS`)이다.
     */
    timeoutMs: z.number().int().positive().optional(),
  })
  .superRefine((asset, ctx) => {
    if (isUnsafeOutPath(asset.out)) {
      ctx.addIssue({ code: 'custom', message: `out은 게임 폴더 밖을 가리킬 수 없다(절대경로/'..' 금지): ${asset.out}`, path: ['out'] })
    }

    if (asset.kind !== 'sheet') return
    if (asset.symbol === undefined) ctx.addIssue({ code: 'custom', message: 'kind가 sheet면 symbol이 필요하다', path: ['symbol'] })
    if (asset.grid === undefined) ctx.addIssue({ code: 'custom', message: 'kind가 sheet면 grid(cols/rows)가 필요하다', path: ['grid'] })
    if (asset.fps === undefined) ctx.addIssue({ code: 'custom', message: 'kind가 sheet면 fps가 필요하다', path: ['fps'] })
    if (!asset.out.toLowerCase().endsWith('.webp')) {
      ctx.addIssue({
        code: 'custom',
        message: `kind가 sheet면 out은 .webp로 끝나야 한다 (JSON 사이드카가 같은 이름·폴더에 .json으로 쓰인다): ${asset.out}`,
        path: ['out'],
      })
    }
  })
export type PromptAsset = z.infer<typeof PromptAssetSchema>

/**
 * `games/<id>/art/prompts.json`의 스키마.
 * `stylePrefix`는 모든 asset의 프롬프트 앞에 공통으로 붙는다.
 */
export const PromptsFileSchema = z.object({
  game: z.string().min(1),
  concept: z.string().min(1),
  stylePrefix: z.string().min(1),
  negative: z.string().min(1),
  assets: z.array(PromptAssetSchema).min(1),
})
export type PromptsFile = z.infer<typeof PromptsFileSchema>

export class PromptsFileError extends Error {
  override name = 'PromptsFileError'
}

/** prompts.json(JSON 파싱된 값)을 검증한다. asset id 중복도 여기서 잡는다. */
export function parsePromptsFile(json: unknown): PromptsFile {
  const parsed = PromptsFileSchema.safeParse(json)
  if (!parsed.success) {
    throw new PromptsFileError(
      `prompts.json 검증 실패: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
    )
  }

  const seen = new Set<string>()
  for (const asset of parsed.data.assets) {
    if (seen.has(asset.id)) throw new PromptsFileError(`asset id가 중복된다: ${asset.id}`)
    seen.add(asset.id)
  }

  return parsed.data
}

/**
 * `kind: "sheet"` 전용: 애니메이션 지시문. `{cols}x{rows}` 격자에 같은 물체의 프레임을
 * 채우게 강제해 슬라이싱 후에도 프레임끼리 안 흔들리게 한다. `loopDescription`은 asset.prompt
 * 본문을 그대로 재사용한다 — prompts.json에 별도 필드가 없어서 asset이 이미 서술한 "무엇을
 * 반복하는가"가 가장 자연스러운 소스이기 때문이다.
 */
function buildSheetInstruction(asset: PromptAsset, loopDescription: string): string {
  const grid = asset.grid
  if (grid === undefined) return ''
  const count = grid.cols * grid.rows
  return (
    `Render exactly ${grid.cols}×${grid.rows} equal cells in a grid, each cell one animation frame of the SAME object, ` +
    `identical camera/scale/position, frame N shows the pose at time N/${count} of a ${loopDescription}; ` +
    `no borders, no labels, transparent background.`
  )
}

/**
 * stylePrefix와 asset별 prompt를 합친 최종 생성 프롬프트.
 * asset.prompt가 이미 stylePrefix(trim, 대소문자 구분 비교)로 시작하면 다시 붙이지 않는다.
 * 작가가 프롬프트 안에 스타일 문구를 직접 넣어둔 경우 중복 방지용이다.
 * `kind: "sheet"`는 끝에 격자 지시문을 추가로 붙인다.
 */
export function resolveAssetPrompt(file: PromptsFile, asset: PromptAsset): string {
  const prefix = file.stylePrefix.trim()
  const prompt = asset.prompt.trim()
  const base = prompt.startsWith(prefix) ? prompt : `${prefix}, ${prompt}`

  if (asset.kind !== 'sheet') return base

  const sheetInstruction = buildSheetInstruction(asset, prompt)
  return sheetInstruction === '' ? base : `${base} ${sheetInstruction}`
}
