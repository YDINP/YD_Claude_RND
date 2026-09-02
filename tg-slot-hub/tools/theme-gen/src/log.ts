/**
 * 로그에 API 키가 그대로 찍히는 것을 막는다.
 * OpenAI(`sk-...`), Gemini(`AIza...`) 키 패턴과 `?key=...` 쿼리 파라미터를 가린다.
 */
export function redact(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
}

export interface AssetLogEntry {
  id: string
  provider: string
  ms: number
  bytes: number
}

export function formatAssetLog(entry: AssetLogEntry): string {
  return `[theme-gen] id=${entry.id} provider=${entry.provider} ms=${Math.round(entry.ms)} bytes=${entry.bytes}`
}

export function logAsset(entry: AssetLogEntry): void {
  console.log(formatAssetLog(entry))
}

export function logError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[theme-gen] ${redact(message)}`)
}

export function logWarn(message: string): void {
  console.warn(`[theme-gen] ${redact(message)}`)
}

export function logInfo(message: string): void {
  console.log(`[theme-gen] ${redact(message)}`)
}
