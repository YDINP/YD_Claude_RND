import { describe, expect, it } from 'vitest'
import {
  checkTransitionClip,
  findHolds,
  formatTransitionClipReport,
  NotAnimatedWebpError,
  parseAnimatedWebp,
} from './transitionClipCheck.js'
import { TRANSITION_CLIP_HEIGHT, TRANSITION_CLIP_WIDTH } from './constants.js'

/** RIFF 청크 하나를 만든다. 페이로드는 짝수 바이트로 패딩된다. */
function chunk(id: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.write(id, 0, 'ascii')
  header.writeUInt32LE(payload.length, 4)
  const pad = payload.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0)
  return Buffer.concat([header, payload, pad])
}

function vp8xChunk(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  payload.writeUInt8(0b0000_0010, 0) // 애니메이션 플래그
  payload.writeUIntLE(width - 1, 4, 3)
  payload.writeUIntLE(height - 1, 7, 3)
  return chunk('VP8X', payload)
}

function animChunk(loopCount: number): Buffer {
  const payload = Buffer.alloc(6)
  payload.writeUInt32LE(0, 0) // 배경색
  payload.writeUInt16LE(loopCount, 4)
  return chunk('ANIM', payload)
}

function anmfChunk(durationMs: number): Buffer {
  // 실제 프레임 데이터는 파싱하지 않으므로 헤더 16바이트만 있으면 된다.
  const payload = Buffer.alloc(16)
  payload.writeUIntLE(durationMs, 12, 3)
  return chunk('ANMF', payload)
}

interface BuildOptions {
  width?: number
  height?: number
  loopCount?: number
  frameDurationsMs?: number[]
  /** 파서가 모르는 청크를 만나도 건너뛰는지 보려고 끼워 넣는다. */
  withUnknownChunk?: boolean
  omitAnim?: boolean
}

function buildWebp(options: BuildOptions = {}): Buffer {
  const width = options.width ?? TRANSITION_CLIP_WIDTH
  const height = options.height ?? TRANSITION_CLIP_HEIGHT
  const loopCount = options.loopCount ?? 1
  // 기본값: 16fps 규격 그대로 62.5ms를 오가며 정확히 3000ms를 채운다.
  const frames = options.frameDurationsMs ?? Array.from({ length: 48 }, (_, i) => (i % 2 === 0 ? 63 : 62))

  const parts = [vp8xChunk(width, height)]
  if (!options.omitAnim) parts.push(animChunk(loopCount))
  if (options.withUnknownChunk === true) parts.push(chunk('EXIF', Buffer.from('무시해도 되는 청크', 'utf8')))
  for (const durationMs of frames) parts.push(anmfChunk(durationMs))

  const body = Buffer.concat(parts)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(4 + body.length, 4)
  riff.write('WEBP', 8, 'ascii')
  return Buffer.concat([riff, body])
}

describe('parseAnimatedWebp', () => {
  it('캔버스 크기·루프·프레임 지속시간을 읽는다', () => {
    const info = parseAnimatedWebp(buildWebp({ frameDurationsMs: [100, 200, 300] }))
    expect(info.width).toBe(TRANSITION_CLIP_WIDTH)
    expect(info.height).toBe(TRANSITION_CLIP_HEIGHT)
    expect(info.loopCount).toBe(1)
    expect(info.frameDurationsMs).toEqual([100, 200, 300])
  })

  it('모르는 청크는 길이만 보고 건너뛴다', () => {
    const info = parseAnimatedWebp(buildWebp({ withUnknownChunk: true, frameDurationsMs: [50, 50] }))
    expect(info.frameDurationsMs).toEqual([50, 50])
  })

  it('ANIM이 없으면 loopCount는 null이다', () => {
    expect(parseAnimatedWebp(buildWebp({ omitAnim: true })).loopCount).toBeNull()
  })

  it('RIFF/WEBP가 아니면 거부한다', () => {
    expect(() => parseAnimatedWebp(Buffer.from('이건 webp가 아니다', 'utf8'))).toThrow(NotAnimatedWebpError)
  })

  it('ANMF가 하나도 없으면 정지 WebP로 보고 거부한다', () => {
    expect(() => parseAnimatedWebp(buildWebp({ frameDurationsMs: [] }))).toThrow(NotAnimatedWebpError)
  })

  it('청크 길이가 파일을 벗어나면 잘린 파일로 보고 거부한다', () => {
    const truncated = buildWebp()
    // 첫 청크(VP8X)의 길이를 파일 크기보다 크게 바꾼다.
    truncated.writeUInt32LE(0xff_ff_ff, 16)
    expect(() => parseAnimatedWebp(truncated)).toThrow(NotAnimatedWebpError)
  })
})

describe('findHolds', () => {
  it('상한을 넘는 프레임만 시작 시각과 함께 모은다', () => {
    expect(findHolds([100, 500, 100, 300], 200)).toEqual([
      { atMs: 100, durationMs: 500 },
      { atMs: 700, durationMs: 300 },
    ])
  })

  it('상한과 같은 값은 정지가 아니다', () => {
    expect(findHolds([200, 200], 200)).toEqual([])
  })
})

describe('checkTransitionClip', () => {
  it('계약을 지킨 클립은 문제가 없다', () => {
    const report = checkTransitionClip(buildWebp())
    expect(report.problems).toEqual([])
    expect(report.totalDurationMs).toBe(3000)
    expect(report.frameCount).toBe(48)
  })

  it('해상도가 다르면 잡는다', () => {
    const report = checkTransitionClip(buildWebp({ width: 540, height: 960 }))
    expect(report.problems).toContainEqual(expect.stringContaining('540x960'))
  })

  it('무한 반복(loop=0)을 잡는다 — 커튼이 안 걷힌다', () => {
    const report = checkTransitionClip(buildWebp({ loopCount: 0 }))
    expect(report.problems).toContainEqual(expect.stringContaining('무한 반복'))
  })

  it('프레임 하나가 모자란 2.94초 클립을 잡는다', () => {
    // 실제로 concat + 배속으로 만들다 프레임 양자화 때문에 나왔던 값이다.
    const report = checkTransitionClip(buildWebp({ frameDurationsMs: Array.from({ length: 47 }, () => 62.55 | 0) }))
    expect(report.totalDurationMs).toBe(47 * 62)
    expect(report.problems).toContainEqual(expect.stringContaining('길이가'))
  })

  // 아래 세 케이스가 «정지 총량 비율»이라는 판정 기준의 근거다.
  // 실측: 재컷 전 shiba 35.0% / 36.7% (실패), 재컷 후 10.4% / 12.5% (통과), royal 6.2% (통과).

  it('재컷 전 shiba(정지 1050ms = 35%)를 실패로 잡는다', () => {
    // 진입 클립 끝의 450ms + 600ms. 3초 중 1.05초가 단색으로 멈춰 있었다.
    const frames = [...Array.from({ length: 31 }, () => 63), 450, 600]
    const report = checkTransitionClip(buildWebp({ frameDurationsMs: frames }))
    expect(report.holdMs).toBe(1050)
    expect(report.holdRatio).toBeCloseTo(0.35, 2)
    expect(report.problems).toContainEqual(expect.stringContaining('35.0%'))
    expect(report.maxFrameDurationMs).toBe(600)
  })

  it('재컷 후 shiba(정지 375ms = 12.5%)는 통과시킨다 — 복귀 머리는 정지가 정상이다', () => {
    // 스왑을 가려야 하는 복귀 클립의 머리라 이 정지는 기능상 필요하다.
    const frames = [125, 375, ...Array.from({ length: 40 }, () => 62.5)]
    const report = checkTransitionClip(buildWebp({ frameDurationsMs: frames.map((value) => Math.round(value)) }))
    expect(report.holds).toEqual([{ atMs: 125, durationMs: 375 }])
    expect(report.holdRatio).toBeCloseTo(0.125, 2)
    expect(report.problems).toEqual([])
  })

  it('royal의 187ms 한 칸은 정지로 세지도 않는다', () => {
    const frames = [187, ...Array.from({ length: 45 }, () => 62), 35]
    const report = checkTransitionClip(buildWebp({ frameDurationsMs: frames }))
    expect(report.holds).toEqual([])
    expect(report.holdRatio).toBe(0)
    expect(report.problems).toEqual([])
  })

  it('정지 판정 기준을 옵션으로 조일 수 있다', () => {
    const frames = [187, ...Array.from({ length: 45 }, () => 62), 35]
    const report = checkTransitionClip(buildWebp({ frameDurationsMs: frames }), {
      holdFrameMs: 100,
      maxHoldRatio: 0.01,
    })
    expect(report.problems).toContainEqual(expect.stringContaining('0.00s에서 187ms'))
  })
})

describe('formatTransitionClipReport', () => {
  it('통과는 OK로, 실패는 FAIL로 시작한다', () => {
    const good = formatTransitionClipReport('a/fs-enter.webp', checkTransitionClip(buildWebp()))
    expect(good).toMatch(/^OK {2}/)
    expect(good).toContain('정지 0.0%')
    const bad = checkTransitionClip(buildWebp({ loopCount: 0 }))
    expect(formatTransitionClipReport('a/fs-exit.webp', bad)).toMatch(/^FAIL/)
  })
})
