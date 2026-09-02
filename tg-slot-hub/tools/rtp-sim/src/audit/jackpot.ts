import type { JackpotAccounting, ManifestExtras } from './types.js'

/** 잭팟 총 RTP 판정 허용 오차 (±0.5%p). */
export const JACKPOT_TOLERANCE = 0.005

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * manifest.json에서 검수에 필요한 필드만 방어적으로 읽는다.
 * `jackpotContribution`과 `rtpTotalTarget`은 game-sdk 스키마에 아직 없는 선택 필드라
 * `parseGameManifest`를 거치면 잘려나간다. 그래서 원본 JSON을 직접 본다.
 */
export function readManifestExtras(json: unknown): ManifestExtras | null {
  if (typeof json !== 'object' || json === null) return null
  const source = json as Record<string, unknown>
  const name = source['name']
  const features = source['features']
  return {
    jackpotContribution: readNumber(source, 'jackpotContribution'),
    rtpTotalTarget: readNumber(source, 'rtpTotalTarget'),
    nameKo:
      typeof name === 'object' && name !== null ? readString(name as Record<string, unknown>, 'ko') : undefined,
    nameEn:
      typeof name === 'object' && name !== null ? readString(name as Record<string, unknown>, 'en') : undefined,
    version: readString(source, 'version'),
    status: readString(source, 'status'),
    features: Array.isArray(features) ? features.filter((f): f is string => typeof f === 'string') : undefined,
  }
}

/**
 * 기본 게임 RTP + 잭팟 기여분 = 총 RTP.
 * `jackpotContribution`이 없으면 잭팟 회계 자체가 없는 게임이므로 null을 준다.
 */
export function jackpotAccounting(baseRtp: number, extras: ManifestExtras | null): JackpotAccounting | null {
  const contribution = extras?.jackpotContribution
  if (contribution === undefined) return null
  const totalRtp = baseRtp + contribution
  const target = extras?.rtpTotalTarget ?? null
  const delta = target === null ? null : totalRtp - target
  return {
    baseRtp,
    contribution,
    totalRtp,
    target,
    delta,
    pass: delta === null ? null : Math.abs(delta) <= JACKPOT_TOLERANCE,
  }
}
