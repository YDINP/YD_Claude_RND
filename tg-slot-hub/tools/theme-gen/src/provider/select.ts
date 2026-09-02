import { DEFAULT_COMFY_URL } from '../constants.js'
import { isProviderName, type ProviderName } from './types.js'

export interface SelectProviderEnv {
  THEME_GEN_PROVIDER?: string
  OPENAI_API_KEY?: string
  GEMINI_API_KEY?: string
  COMFY_URL?: string
}

export type CheckComfyFn = (url: string) => Promise<boolean>
export type CheckCodexFn = () => Promise<boolean>

export class ProviderSelectionError extends Error {
  override name = 'ProviderSelectionError'
}

/**
 * 프로바이더 자동 선택 순서:
 * 1) `explicit`(--provider 플래그)  2) `THEME_GEN_PROVIDER` 환경변수
 * 3) `OPENAI_API_KEY` 존재 → openai  4) `GEMINI_API_KEY` 존재 → gemini
 * 5) codex 로그인이 확인되면 → codex  6) ComfyUI 서버가 응답하면 → comfy
 * 7) 전부 실패하면 네 가지 중 하나를 설정하라는 에러
 */
export async function selectProviderName(
  explicit: string | undefined,
  env: SelectProviderEnv,
  checkCodex: CheckCodexFn,
  checkComfy: CheckComfyFn,
): Promise<ProviderName> {
  const candidate = explicit ?? env.THEME_GEN_PROVIDER
  if (candidate !== undefined) {
    if (!isProviderName(candidate)) {
      throw new ProviderSelectionError(`알 수 없는 --provider 값: ${candidate} (openai | gemini | comfy | codex 중 하나)`)
    }
    return candidate
  }

  if (env.OPENAI_API_KEY !== undefined && env.OPENAI_API_KEY !== '') return 'openai'
  if (env.GEMINI_API_KEY !== undefined && env.GEMINI_API_KEY !== '') return 'gemini'

  if (await checkCodex()) return 'codex'

  const comfyUrl = env.COMFY_URL ?? DEFAULT_COMFY_URL
  if (await checkComfy(comfyUrl)) return 'comfy'

  throw new ProviderSelectionError(
    [
      '이미지 생성 프로바이더를 찾지 못했다. 다음 중 하나를 설정할 것:',
      '  1) OPENAI_API_KEY 환경변수 (openai, gpt-image-1)',
      '  2) GEMINI_API_KEY 환경변수 (gemini, gemini-2.5-flash-image)',
      '  3) codex CLI 로그인 (codex login, `codex login status`로 확인)',
      `  4) ComfyUI 서버 실행 (기본 ${DEFAULT_COMFY_URL}, COMFY_URL 환경변수로 변경 가능)`,
    ].join('\n'),
  )
}

export async function checkComfyAvailable(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/system_stats`)
    return response.ok
  } catch {
    return false
  }
}
