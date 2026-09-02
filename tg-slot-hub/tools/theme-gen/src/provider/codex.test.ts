import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCodexInstruction,
  checkCodexAvailable,
  createCodexProvider,
  resolveCodexBinary,
  type SpawnedProcessLike,
  type SpawnFn,
} from './codex.js'

class FakeChild extends EventEmitter implements SpawnedProcessLike {
  stdin = { write: vi.fn(), end: vi.fn() }
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
}

/** cwd에 out.png를 쓰고 close(exitCode)를 emit하는 정상 종료 fake. */
function fakeSpawnHappy(pngBuffer: Buffer, exitCode = 0): SpawnFn {
  return (_command, _args, options) => {
    const child = new FakeChild()
    queueMicrotask(() => {
      writeFileSync(join(options.cwd, 'out.png'), pngBuffer)
      child.emit('close', exitCode)
    })
    return child
  }
}

/** out.png 없이 stderr만 흘리고 실패 코드로 종료하는 fake. */
function fakeSpawnNoOutput(stderrText: string, exitCode = 1): SpawnFn {
  return () => {
    const child = new FakeChild()
    queueMicrotask(() => {
      child.stderr.emit('data', Buffer.from(stderrText))
      child.emit('close', exitCode)
    })
    return child
  }
}

/** 절대 close를 emit하지 않는 fake. 타임아웃 경로를 태우는 용도. */
function fakeSpawnHang(): SpawnFn {
  return () => new FakeChild()
}

async function opaquePng(width = 20, height = 20): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer()
}

async function transparentPng(width = 20, height = 20): Promise<Buffer> {
  const redSquare = await sharp({ create: { width: 6, height: 6, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } })
    .png()
    .toBuffer()
  return sharp({ create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } })
    .composite([{ input: redSquare, left: 7, top: 7 }])
    .png()
    .toBuffer()
}

let tmpBase: string

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'theme-gen-codex-test-'))
})

afterEach(() => {
  rmSync(tmpBase, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('buildCodexInstruction', () => {
  it('투명 배경 요청 문구와 필수 요소를 모두 포함한다', () => {
    const instruction = buildCodexInstruction(512, 512, true, 'a red seven')
    expect(instruction).toContain('image_gen__imagegen')
    expect(instruction).toContain('out.png')
    expect(instruction).toContain('Size: 512x512 pixels.')
    expect(instruction).toContain('Background must be fully transparent (PNG alpha).')
    expect(instruction).toContain('Image description: a red seven.')
    expect(instruction).toContain('single word DONE')
  })

  it('불투명 요청은 다른 배경 문구를 쓰고 transparent 언급이 없다', () => {
    const instruction = buildCodexInstruction(1536, 1024, false, 'a dark backdrop')
    expect(instruction).toContain('Size: 1536x1024 pixels.')
    expect(instruction).toContain('Opaque full-bleed image.')
    expect(instruction).not.toContain('transparent')
  })

  it('스냅샷: 표준 심볼 지시문 (투명, 1024x1024)', () => {
    expect(buildCodexInstruction(1024, 1024, true, 'a glossy red seven with gold trim')).toMatchSnapshot()
  })

  it('스냅샷: 표준 배경 지시문 (불투명, 1536x1024)', () => {
    expect(buildCodexInstruction(1536, 1024, false, 'a dark velvet casino backdrop')).toMatchSnapshot()
  })
})

describe('resolveCodexBinary', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('win32에서는 codex.cmd를 쓴다', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    expect(resolveCodexBinary()).toBe('codex.cmd')
  })

  it('그 외 플랫폼에서는 codex를 쓴다', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(resolveCodexBinary()).toBe('codex')
  })
})

describe('createCodexProvider', () => {
  it('happy path: out.png를 읽어 버퍼로 돌려주고 성공하면 임시 폴더를 지운다', async () => {
    const png = await opaquePng()
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(png), tmpDirBase: tmpBase, timeoutMs: 5000 })

    const result = await provider.generate({ id: 'seven', prompt: 'a red seven', negative: 'n', size: '1024x1024', transparent: false })

    expect(provider.name).toBe('codex')
    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(readdirSync(tmpBase)).toEqual([])
  })

  it('PROMPT를 CLI 인자가 아니라 stdin으로 넘긴다 (Windows shell 인자 쪼개짐 회피)', async () => {
    let capturedArgs: string[] = []
    let capturedStdio: unknown
    let capturedStdin = ''
    const spawnImpl: SpawnFn = (_command, args, options) => {
      capturedArgs = args
      capturedStdio = options.stdio
      const child = new FakeChild()
      child.stdin.write = vi.fn((chunk: string) => {
        capturedStdin += chunk
        return true
      })
      queueMicrotask(async () => {
        writeFileSync(join(options.cwd, 'out.png'), await opaquePng())
        child.emit('close', 0)
      })
      return child
    }
    const provider = createCodexProvider({ spawnImpl, tmpDirBase: tmpBase, timeoutMs: 5000 })

    await provider.generate({ id: 'seven', prompt: 'a red seven, 10% padding & (parens)', negative: 'n', size: '1024x1024', transparent: true })

    expect(capturedArgs).toEqual(['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-o', 'last.txt'])
    expect(capturedArgs.join(' ')).not.toContain('a red seven')
    expect(capturedStdio).toEqual(['pipe', 'pipe', 'pipe'])
    expect(capturedStdin).toContain('a red seven, 10% padding & (parens)')
  })

  it('out.png가 없으면 stderr 꼬리를 포함한 에러를 던지고 임시 폴더를 남긴다', async () => {
    const provider = createCodexProvider({ spawnImpl: fakeSpawnNoOutput('boom: something failed', 1), tmpDirBase: tmpBase, timeoutMs: 5000 })

    await expect(
      provider.generate({ id: 'bell', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/boom: something failed/)
    expect(readdirSync(tmpBase).length).toBe(1)
  })

  it('시간 초과되면 kill을 호출하고 에러를 던진다', async () => {
    let spawned: FakeChild | undefined
    const spawnImpl: SpawnFn = (command, args, options) => {
      spawned = new FakeChild()
      void command
      void args
      void options
      return spawned
    }
    const provider = createCodexProvider({ spawnImpl, tmpDirBase: tmpBase, timeoutMs: 30 })

    await expect(
      provider.generate({ id: 'wild', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/시간 초과/)
    expect(spawned?.kill).toHaveBeenCalledTimes(1)
  })

  it('spawn 자체가 실패하면(codex 미설치 등) 에러를 던지고 임시 폴더를 남긴다', async () => {
    const spawnImpl: SpawnFn = () => {
      throw new Error('ENOENT: codex not found')
    }
    const provider = createCodexProvider({ spawnImpl, tmpDirBase: tmpBase, timeoutMs: 2000 })

    await expect(
      provider.generate({ id: 'blank', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/ENOENT/)
    expect(readdirSync(tmpBase).length).toBe(1)
  })

  it('transparent 요청인데 알파가 아예 없으면 폴백 크로마키를 적용한다', async () => {
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(await opaquePng()), tmpDirBase: tmpBase, timeoutMs: 5000 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await provider.generate({ id: 'bar1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: true })
    const meta = await sharp(result.buffer).metadata()

    expect(meta.hasAlpha).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('transparent 요청이고 이미 코너가 투명하면 폴백을 건너뛴다', async () => {
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(await transparentPng()), tmpDirBase: tmpBase, timeoutMs: 5000 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.generate({ id: 'bar2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: true })

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('transparent가 아니면 알파를 확인하지 않는다 (폴백 없음)', async () => {
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(await opaquePng()), tmpDirBase: tmpBase, timeoutMs: 5000 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.generate({ id: 'bar3', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('checkCodexAvailable', () => {
  it("available: '1'이면 spawn 없이 즉시 true를 반환한다", async () => {
    const spawnImpl = vi.fn() as unknown as SpawnFn
    await expect(checkCodexAvailable({ available: '1', spawnImpl })).resolves.toBe(true)
    expect(spawnImpl).not.toHaveBeenCalled()
  })

  it('exit 0이면 true다', async () => {
    const spawnImpl: SpawnFn = () => {
      const child = new FakeChild()
      queueMicrotask(() => child.emit('close', 0))
      return child
    }
    await expect(checkCodexAvailable({ spawnImpl, timeoutMs: 2000 })).resolves.toBe(true)
  })

  it('exit 1이면 false다 (로그인 안 됨)', async () => {
    const spawnImpl: SpawnFn = () => {
      const child = new FakeChild()
      queueMicrotask(() => child.emit('close', 1))
      return child
    }
    await expect(checkCodexAvailable({ spawnImpl, timeoutMs: 2000 })).resolves.toBe(false)
  })

  it('시간 초과면 false다', async () => {
    await expect(checkCodexAvailable({ spawnImpl: fakeSpawnHang(), timeoutMs: 30 })).resolves.toBe(false)
  })

  it('spawn 자체가 실패해도(codex가 PATH에 없음) false다', async () => {
    const spawnImpl: SpawnFn = () => {
      throw new Error('ENOENT')
    }
    await expect(checkCodexAvailable({ spawnImpl, timeoutMs: 2000 })).resolves.toBe(false)
  })
})
