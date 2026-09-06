/**
 * 프롬프트 파일 스키마는 게임 팩 계약의 일부라 `@tgslot/game-sdk`가 단일 출처로 갖고 있다.
 * 이 모듈은 그것을 그대로 재수출하고, **생성기에만 필요한 프롬프트 조립**을 얹는다.
 */
export {
  ASSET_KINDS,
  ASSET_SIZES,
  PromptAssetSchema,
  PromptsFileError,
  PromptsFileSchema,
  parsePromptsFile,
  type AssetKind,
  type AssetSize,
  type PromptAsset,
  type PromptsFile,
} from '@tgslot/game-sdk'

import type { PromptAsset, PromptsFile } from '@tgslot/game-sdk'

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
