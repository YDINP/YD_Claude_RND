import { z } from 'zod'

export const ASSET_KINDS = ['symbol', 'frame', 'bg', 'thumb'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/** gpt-image-1이 지원하는 정사각/세로/가로 세 크기만 허용한다. */
export const ASSET_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const
export type AssetSize = (typeof ASSET_SIZES)[number]

export const PromptAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(ASSET_KINDS),
  prompt: z.string().min(1),
  size: z.enum(ASSET_SIZES),
  /** 생성 시 투명 배경을 요구할지. 기본 false. */
  transparent: z.boolean().optional().default(false),
  /** 게임 폴더 기준 상대 출력 경로. 예: `theme/symbols/seven.webp`. */
  out: z.string().min(1),
  /** 최종 출력 한 변(px, symbol) 또는 폭(px, frame/bg/thumb). */
  outSize: z.number().int().positive(),
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
 * stylePrefix와 asset별 prompt를 합친 최종 생성 프롬프트.
 * asset.prompt가 이미 stylePrefix(trim, 대소문자 구분 비교)로 시작하면 다시 붙이지 않는다.
 * 작가가 프롬프트 안에 스타일 문구를 직접 넣어둔 경우 중복 방지용이다.
 */
export function resolveAssetPrompt(file: PromptsFile, asset: PromptAsset): string {
  const prefix = file.stylePrefix.trim()
  const prompt = asset.prompt.trim()
  if (prompt.startsWith(prefix)) return prompt
  return `${prefix}, ${prompt}`
}
