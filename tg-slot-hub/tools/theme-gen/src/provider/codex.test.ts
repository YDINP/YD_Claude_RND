import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CODEX_SHEET_TIMEOUT_MS, DEFAULT_CODEX_TIMEOUT_MS } from '../constants.js'
import {
  buildCodexInstruction,
  checkCodexAvailable,
  createCodexProvider,
  defaultTimeoutForKind,
  resolveCodexBinary,
  resolveGeneratedImagesDirs,
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

/**
 * cwd에 out.png를 (동기로, spawn 시점에) 써 두고서도 절대 close를 emit하지 않는 fake.
 * "codex가 파일은 다 썼는데 이후 검증 단계에서 안 끝난다" 시나리오(타임아웃 회수·조기 종료) 재현용.
 */
function fakeSpawnHangWithOutput(pngBuffer: Buffer): SpawnFn {
  return (_command, _args, options) => {
    const child = new FakeChild()
    writeFileSync(join(options.cwd, 'out.png'), pngBuffer)
    return child
  }
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

/** `path`의 mtime을 `ms`(epoch ms)로 강제 설정한다 — 회수 후보의 신선도/순서를 결정적으로 만들기 위함. */
function setMtime(path: string, ms: number): void {
  const date = new Date(ms)
  utimesSync(path, date, date)
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

  it('spawn 자체가 실패하면(codex 미설치 등) 2번 재시도한 뒤 에러를 던지고 임시 폴더를 남긴다', async () => {
    const spawnImpl = vi.fn(() => {
      throw new Error('ENOENT: codex not found')
    })
    const sleep = vi.fn(async () => {})
    const provider = createCodexProvider({ spawnImpl, tmpDirBase: tmpBase, timeoutMs: 2000, sleep })

    await expect(
      provider.generate({ id: 'blank', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/ENOENT/)
    // 재시도 2회 = 총 시도 3회 (다른 프로바이더와 동일한 RETRY_COUNT 정책).
    expect(spawnImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(readdirSync(tmpBase).length).toBe(1)
  })

  it('시간 초과는 재시도하지 않는다(정확히 1번만 실행)', async () => {
    const spawnImpl = vi.fn((): FakeChild => new FakeChild())
    const sleep = vi.fn(async () => {})
    const provider = createCodexProvider({ spawnImpl: spawnImpl as unknown as SpawnFn, tmpDirBase: tmpBase, timeoutMs: 20, sleep })

    await expect(
      provider.generate({ id: 'wild2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/시간 초과/)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
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

  it('타임아웃돼도 out.png가 유효하면 버리지 않고 회수해서 성공 처리한다(재시도 없음)', async () => {
    const png = await opaquePng()
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnHangWithOutput(png),
      tmpDirBase: tmpBase,
      timeoutMs: 50,
      earlyExitOnOutput: false,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await provider.generate({ id: 'salvage1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('시간 초과했지만 out.png가 있어 회수한다'))).toBe(true)
    // 회수(성공 처리)했으니 다른 성공 케이스와 마찬가지로 임시 폴더를 지운다.
    expect(readdirSync(tmpBase)).toEqual([])
    warnSpy.mockRestore()
  })

  it('타임아웃인데 out.png가 비어 있으면(0바이트) 회수하지 않고 기존처럼 실패한다', async () => {
    const spawnImpl: SpawnFn = (_command, _args, options) => {
      const child = new FakeChild()
      writeFileSync(join(options.cwd, 'out.png'), Buffer.alloc(0))
      return child
    }
    const provider = createCodexProvider({ spawnImpl, tmpDirBase: tmpBase, timeoutMs: 30, earlyExitOnOutput: false })

    await expect(
      provider.generate({ id: 'salvage2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/시간 초과/)
    // 실패했으니(회수 못 했으니) 진단용으로 임시 폴더를 남긴다.
    expect(readdirSync(tmpBase).length).toBe(1)
  })

  it('out.png 크기가 두 번 연속 안 변하면(≈안정) 타임아웃 전에 조기 종료한다', async () => {
    const png = await opaquePng()
    let spawnedChild: FakeChild | undefined
    const spawnImpl: SpawnFn = (_command, _args, options) => {
      spawnedChild = new FakeChild()
      writeFileSync(join(options.cwd, 'out.png'), png)
      return spawnedChild
    }
    const provider = createCodexProvider({
      spawnImpl,
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      earlyExitOnOutput: true,
      earlyExitPollIntervalMs: 15,
      earlyExitStableChecks: 2,
    })

    const startedAt = Date.now()
    const result = await provider.generate({ id: 'early1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })
    const elapsedMs = Date.now() - startedAt

    expect(result.buffer.length).toBeGreaterThan(0)
    // 5000ms 전체 타임아웃을 기다리지 않고 폴링 주기(15ms) x 2회 정도로 훨씬 빨리 끝나야 한다.
    expect(elapsedMs).toBeLessThan(1000)
    expect(spawnedChild?.kill).toHaveBeenCalled()
  })

  it('earlyExitOnOutput=false면 조기 종료 폴링 타이머를 만들지 않는다', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const callsBefore = setIntervalSpy.mock.calls.length
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnHappy(await opaquePng()),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      earlyExitOnOutput: false,
    })

    await provider.generate({ id: 'noearly1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(setIntervalSpy.mock.calls.length).toBe(callsBefore)
    setIntervalSpy.mockRestore()
  })

  it('earlyExitOnOutput 기본값(true)이면 조기 종료 폴링 타이머를 만든다', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(await opaquePng()), tmpDirBase: tmpBase, timeoutMs: 5000 })

    await provider.generate({ id: 'early2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(0)
    setIntervalSpy.mockRestore()
  })

  it('임시 폴더 정리가 EPERM으로 실패해도 이미 성공한 생성은 여전히 성공 처리되고 경고만 남는다', async () => {
    const png = await opaquePng()
    const rmSyncImpl = vi.fn(() => {
      const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException
      err.code = 'EPERM'
      throw err
    })
    const sleep = vi.fn(async () => {})
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(png), tmpDirBase: tmpBase, timeoutMs: 5000, rmSyncImpl, sleep })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await provider.generate({ id: 'cleanup1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('임시 폴더 정리 실패(무시)') && String(call[0]).includes('EPERM'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('임시 폴더 정리는 EPERM/EBUSY 등에서 최대 3번(150ms 간격 상당)까지 재시도한 뒤 포기하고 던지지 않는다', async () => {
    const png = await opaquePng()
    const rmSyncImpl = vi.fn(() => {
      const err = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException
      err.code = 'EBUSY'
      throw err
    })
    const sleep = vi.fn(async () => {})
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(png), tmpDirBase: tmpBase, timeoutMs: 5000, rmSyncImpl, sleep })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.generate({ id: 'cleanup2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(rmSyncImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(150)
    warnSpy.mockRestore()
  })

  it('재시도 불가능한 에러(예: 권한 계열이 아닌 코드)는 재시도 없이 즉시 경고 후 넘어간다', async () => {
    const png = await opaquePng()
    const rmSyncImpl = vi.fn(() => {
      const err = new Error('EIO: i/o error') as NodeJS.ErrnoException
      err.code = 'EIO'
      throw err
    })
    const sleep = vi.fn(async () => {})
    const provider = createCodexProvider({ spawnImpl: fakeSpawnHappy(png), tmpDirBase: tmpBase, timeoutMs: 5000, rmSyncImpl, sleep })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.generate({ id: 'cleanup3', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(rmSyncImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('asset의 GenerateOptions.timeoutMs가 kind 기본값·provider 기본값보다 우선한다', async () => {
    const spawnImpl = vi.fn((): FakeChild => new FakeChild())
    const provider = createCodexProvider({ spawnImpl: spawnImpl as unknown as SpawnFn, tmpDirBase: tmpBase, earlyExitOnOutput: false })

    await expect(
      provider.generate({
        id: 'sheetOverride',
        prompt: 'p',
        negative: 'n',
        size: '1536x1536',
        transparent: false,
        kind: 'sheet',
        timeoutMs: 25,
      }),
    ).rejects.toThrow(/시간 초과됐다 \(25ms\)/)
  })
})

describe('createCodexProvider: out.png 누락 시 generated_images 폴더 회수', () => {
  let genRoot: string

  beforeEach(() => {
    genRoot = join(tmpBase, 'generated_images_root')
    mkdirSync(genRoot, { recursive: true })
  })

  it('out.png가 없어도(exit 1) 시작 시각 이후 생성된 이미지가 있으면 회수해서 성공 처리한다', async () => {
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [genRoot],
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 실행 시작 '이후'에 만들어진 것처럼 보이도록, 조금 미래 시각으로 mtime을 찍는다.
    const uuidDir = join(genRoot, 'a1b2c3')
    mkdirSync(uuidDir, { recursive: true })
    const freshPath = join(uuidDir, 'exec-fresh.png')
    writeFileSync(freshPath, await opaquePng())
    setMtime(freshPath, Date.now() + 2000)

    const result = await provider.generate({ id: 'genimg1', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('생성 이미지 폴더에서 회수한다') && String(call[0]).includes(freshPath))).toBe(
      true,
    )
    // 회수(성공 처리)했으니 codex 임시 폴더는 지운다.
    expect(readdirSync(tmpBase).filter((name) => name !== 'generated_images_root').length).toBe(0)
    warnSpy.mockRestore()
  })

  it('generated_images에 있는 파일이 전부 실행 시작 이전 것이면 회수하지 않고 기존처럼 실패한다', async () => {
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [genRoot],
    })

    const uuidDir = join(genRoot, 'old-uuid')
    mkdirSync(uuidDir, { recursive: true })
    const stalePath = join(uuidDir, 'exec-stale.png')
    writeFileSync(stalePath, await opaquePng())
    setMtime(stalePath, Date.now() - 10 * 60 * 1000) // 10분 전 — 이번 실행보다 훨씬 이전

    await expect(
      provider.generate({ id: 'genimg2', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/out\.png를 만들지 않았다/)
  })

  it('후보가 여러 개면 가장 최신(mtime) 파일을 고른다', async () => {
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [genRoot],
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const base = Date.now()

    const olderDir = join(genRoot, 'uuid-older')
    mkdirSync(olderDir, { recursive: true })
    const olderPath = join(olderDir, 'exec-older.png')
    writeFileSync(olderPath, await opaquePng())
    setMtime(olderPath, base)

    const newerDir = join(genRoot, 'uuid-newer')
    mkdirSync(newerDir, { recursive: true })
    const newerPath = join(newerDir, 'exec-newer.png')
    writeFileSync(newerPath, await opaquePng())
    setMtime(newerPath, base + 3000)

    await provider.generate({ id: 'genimg3', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes(newerPath))).toBe(true)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes(olderPath))).toBe(false)
    warnSpy.mockRestore()
  })

  it('가장 최신 후보가 손상/0바이트면 건너뛰고 그다음(유효한) 후보로 회수한다', async () => {
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [genRoot],
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const base = Date.now()

    const validDir = join(genRoot, 'uuid-valid')
    mkdirSync(validDir, { recursive: true })
    const validPath = join(validDir, 'exec-valid.png')
    writeFileSync(validPath, await opaquePng())
    setMtime(validPath, base)

    const corruptDir = join(genRoot, 'uuid-corrupt')
    mkdirSync(corruptDir, { recursive: true })
    const corruptPath = join(corruptDir, 'exec-corrupt.png')
    writeFileSync(corruptPath, Buffer.alloc(0)) // 0바이트 — sharp 디코드 불가
    setMtime(corruptPath, base + 3000) // 가장 최신이지만 무효

    const result = await provider.generate({ id: 'genimg4', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(result.buffer.length).toBeGreaterThan(0)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes(validPath))).toBe(true)
    warnSpy.mockRestore()
  })

  it('유효한 후보가 전혀 없으면(모두 손상되었거나 없음) 회수하지 못하고 기존처럼 실패한다', async () => {
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [genRoot],
    })

    const corruptDir = join(genRoot, 'uuid-onlybad')
    mkdirSync(corruptDir, { recursive: true })
    const corruptPath = join(corruptDir, 'exec-corrupt.png')
    writeFileSync(corruptPath, Buffer.alloc(0))
    setMtime(corruptPath, Date.now() + 2000)

    await expect(
      provider.generate({ id: 'genimg5', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/out\.png를 만들지 않았다/)
  })

  it('타임아웃 회수(out.png)도 실패하면 generated_images로 한 번 더 폴백한다', async () => {
    const spawnImpl: SpawnFn = () => new FakeChild() // out.png도 안 쓰고 절대 close도 emit하지 않는다
    const provider = createCodexProvider({
      spawnImpl,
      tmpDirBase: tmpBase,
      timeoutMs: 30,
      earlyExitOnOutput: false,
      generatedImageRoots: [genRoot],
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const uuidDir = join(genRoot, 'uuid-timeout')
    mkdirSync(uuidDir, { recursive: true })
    const freshPath = join(uuidDir, 'exec-timeout.png')
    writeFileSync(freshPath, await opaquePng())
    setMtime(freshPath, Date.now() + 2000)

    const result = await provider.generate({ id: 'genimg6', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })

    expect(result.buffer.length).toBeGreaterThan(0)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('생성 이미지 폴더에서 회수한다') && String(call[0]).includes(freshPath))).toBe(
      true,
    )
    warnSpy.mockRestore()
  })

  it('generated_images 루트를 읽을 수 없어도(스캔 실패) 크래시하지 않고 기존처럼 실패로 처리한다', async () => {
    // 디렉터리 대신 파일을 루트로 줘서 readdirSync가 ENOTDIR로 실패하는 상황을 재현한다
    // (Windows에서는 소유자 자신에 대한 디렉터리 읽기 권한을 chmod로 안정적으로 제거할 수 없어,
    // "스캔 자체가 실패하는" 상황을 이 방식으로 결정적으로 만든다).
    const unreadableRoot = join(tmpBase, 'not-a-directory')
    writeFileSync(unreadableRoot, 'not a directory')
    const provider = createCodexProvider({
      spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1),
      tmpDirBase: tmpBase,
      timeoutMs: 5000,
      generatedImageRoots: [unreadableRoot],
    })

    await expect(
      provider.generate({ id: 'genimg-unreadable', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/out\.png를 만들지 않았다/)
  })

  it('CODEX_GENERATED_IMAGES_DIR 환경변수로도 루트를 지정할 수 있다(옵션 없이)', async () => {
    // 자동 탐색이 실제 사용자 APPDATA/홈을 스캔하지 않도록, 무해한 빈 폴더로 바꿔치기해 둔다.
    const originalAppData = process.env.APPDATA
    const originalEnvDir = process.env.CODEX_GENERATED_IMAGES_DIR
    const fakeAppData = join(tmpBase, 'fake-appdata-empty')
    mkdirSync(fakeAppData, { recursive: true })
    process.env.APPDATA = fakeAppData
    process.env.CODEX_GENERATED_IMAGES_DIR = genRoot

    const uuidDir = join(genRoot, 'uuid-env')
    mkdirSync(uuidDir, { recursive: true })
    const freshPath = join(uuidDir, 'exec-env.png')
    writeFileSync(freshPath, await opaquePng())
    setMtime(freshPath, Date.now() + 2000)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // generatedImageRoots 옵션을 전혀 주지 않아도 env가 resolveGeneratedImagesDirs 안에서 읽힌다.
      const providerWithEnv = createCodexProvider({ spawnImpl: fakeSpawnNoOutput('boom: no out.png', 1), tmpDirBase: tmpBase, timeoutMs: 5000 })
      const result = await providerWithEnv.generate({ id: 'genimg7', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })
      expect(result.buffer.length).toBeGreaterThan(0)
      expect(warnSpy.mock.calls.some((call) => String(call[0]).includes(freshPath))).toBe(true)
    } finally {
      warnSpy.mockRestore()
      if (originalAppData === undefined) delete process.env.APPDATA
      else process.env.APPDATA = originalAppData
      if (originalEnvDir === undefined) delete process.env.CODEX_GENERATED_IMAGES_DIR
      else process.env.CODEX_GENERATED_IMAGES_DIR = originalEnvDir
    }
  })
})

describe('resolveGeneratedImagesDirs', () => {
  it('option.generatedImageRoots를 그대로(중복 제거해서) 돌려준다', () => {
    expect(resolveGeneratedImagesDirs({ generatedImageRoots: ['/a', '/b', '/a'] })).toEqual(['/a', '/b'])
  })

  it('CODEX_GENERATED_IMAGES_DIR 환경변수를 경로 구분자로 나눠 돌려준다', () => {
    const delimiter = process.platform === 'win32' ? ';' : ':'
    const roots = resolveGeneratedImagesDirs({ env: { CODEX_GENERATED_IMAGES_DIR: `/root/a${delimiter}/root/b` } })
    expect(roots).toEqual(['/root/a', '/root/b'])
  })

  it('option과 env를 둘 다 주면 합쳐서(중복 제거) 돌려준다', () => {
    const roots = resolveGeneratedImagesDirs({ generatedImageRoots: ['/opt/root'], env: { CODEX_GENERATED_IMAGES_DIR: '/opt/root' } })
    expect(roots).toEqual(['/opt/root'])
  })

  it('option/env가 둘 다 없으면 %APPDATA%/orca/codex-accounts/*/home/generated_images를 계정별로 자동 탐색한다', () => {
    const fakeHome = join(tmpBase, 'fake-home')
    const appData = join(fakeHome, 'AppData', 'Roaming')
    const accountsRoot = join(appData, 'orca', 'codex-accounts')

    const accountWithImages = join(accountsRoot, 'account-1', 'home', 'generated_images')
    mkdirSync(accountWithImages, { recursive: true })
    // account-2는 home/generated_images가 없는 계정 — 후보에서 빠져야 한다.
    mkdirSync(join(accountsRoot, 'account-2', 'home'), { recursive: true })

    const roots = resolveGeneratedImagesDirs({ env: { APPDATA: appData }, homedirImpl: () => fakeHome })

    expect(roots).toEqual([accountWithImages])
  })

  it('~/.codex/generated_images가 있으면 자동 탐색 결과에 포함한다', () => {
    const fakeHome = join(tmpBase, 'fake-home2')
    const dotCodexDir = join(fakeHome, '.codex', 'generated_images')
    mkdirSync(dotCodexDir, { recursive: true })

    const roots = resolveGeneratedImagesDirs({ env: { APPDATA: join(fakeHome, 'AppData', 'Roaming') }, homedirImpl: () => fakeHome })

    expect(roots).toEqual([dotCodexDir])
  })

  it('아무 후보도 없으면 빈 배열을 돌려준다', () => {
    const fakeHome = join(tmpBase, 'fake-home3')
    const roots = resolveGeneratedImagesDirs({ env: { APPDATA: join(fakeHome, 'AppData', 'Roaming') }, homedirImpl: () => fakeHome })
    expect(roots).toEqual([])
  })
})

describe('defaultTimeoutForKind', () => {
  it('kind가 sheet면 DEFAULT_CODEX_SHEET_TIMEOUT_MS를 쓴다', () => {
    expect(defaultTimeoutForKind('sheet')).toBe(DEFAULT_CODEX_SHEET_TIMEOUT_MS)
  })

  it('그 외 kind(또는 미지정)는 DEFAULT_CODEX_TIMEOUT_MS를 쓴다', () => {
    expect(defaultTimeoutForKind('symbol')).toBe(DEFAULT_CODEX_TIMEOUT_MS)
    expect(defaultTimeoutForKind('frame')).toBe(DEFAULT_CODEX_TIMEOUT_MS)
    expect(defaultTimeoutForKind(undefined)).toBe(DEFAULT_CODEX_TIMEOUT_MS)
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
