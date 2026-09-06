import { z } from 'zod'

/**
 * `games/<id>/art/prompts.json`의 스키마 — 아트 생성 계약의 단일 출처.
 * `tools/theme-gen`이 이걸 읽어 이미지를 만들고, 팩 검사기가 같은 스키마로 참조 무결성을 본다.
 *
 * `node:path`를 쓰지 않는다. 이 패키지는 브라우저에서도 import될 수 있어야 해서
 * 절대경로 판정을 정규식으로 직접 한다.
 */

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

/** POSIX(`/foo`)와 Windows(`C:\foo`, `\\server\share`) 절대 경로를 모두 잡는다. */
function isAbsolutePath(path: string): boolean {
  return /^(?:[/\\]|[a-zA-Z]:[/\\])/.test(path)
}

/** 절대 경로거나 `..` 세그먼트로 게임 폴더 밖을 가리키면 안전하지 않다고 본다. */
function isUnsafeOutPath(out: string): boolean {
  if (isAbsolutePath(out)) return true
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

/** asset id가 중복되면 그 id를 돌려준다. 없으면 undefined. */
export function findDuplicateAssetId(assets: readonly PromptAsset[]): string | undefined {
  const seen = new Set<string>()
  for (const asset of assets) {
    if (seen.has(asset.id)) return asset.id
    seen.add(asset.id)
  }
  return undefined
}

/** prompts.json(JSON 파싱된 값)을 검증한다. asset id 중복도 여기서 잡는다. */
export function parsePromptsFile(json: unknown): PromptsFile {
  const parsed = PromptsFileSchema.safeParse(json)
  if (!parsed.success) {
    throw new PromptsFileError(
      `prompts.json 검증 실패: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
    )
  }

  const duplicate = findDuplicateAssetId(parsed.data.assets)
  if (duplicate !== undefined) throw new PromptsFileError(`asset id가 중복된다: ${duplicate}`)

  return parsed.data
}
