import { describe, expect, it } from 'vitest'
import { formatAssetLog, redact } from './log.js'

describe('redact', () => {
  it('OpenAI 스타일 키를 가린다', () => {
    expect(redact('Authorization: Bearer sk-abcdEFGH12345678')).not.toContain('sk-abcdEFGH12345678')
    expect(redact('sk-abcdEFGH12345678')).toBe('[REDACTED]')
  })

  it('Gemini 스타일 키를 가린다', () => {
    expect(redact('key=AIzaSyD1234567890abcdefg')).toContain('[REDACTED]')
    expect(redact('AIzaSyD1234567890abcdefg')).not.toContain('AIzaSyD1234567890abcdefg')
  })

  it('URL 쿼리의 key= 파라미터를 가린다', () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=SECRET123456'
    expect(redact(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=[REDACTED]')
  })

  it('민감하지 않은 텍스트는 그대로 둔다', () => {
    expect(redact('hello world, status 500')).toBe('hello world, status 500')
  })
})

describe('formatAssetLog', () => {
  it('id/provider/ms/bytes를 모두 포함한다', () => {
    const line = formatAssetLog({ id: 'seven', provider: 'openai', ms: 1234.6, bytes: 98765 })
    expect(line).toContain('id=seven')
    expect(line).toContain('provider=openai')
    expect(line).toContain('ms=1235')
    expect(line).toContain('bytes=98765')
  })
})
