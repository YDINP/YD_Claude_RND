import { describe, expect, it, vi, afterEach } from 'vitest'
import { loadConfig } from './config.js'

/** 필수 값만 채운 최소 환경. 각 테스트가 필요한 것만 얹는다. */
function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    TELEGRAM_BOT_TOKEN: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    ...overrides,
  }
}

/** 프로덕션 부팅에 필요한 값이 전부 갖춰진 환경. */
function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://mini.example.com',
    DATABASE_URL: 'postgres://user:pw@db.example.com:5432/app',
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('개발 플래그는 두 개로 갈라져 있다', () => {
  it('mock 로그인만 켜도 결과 강제는 열리지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = loadConfig(baseEnv({ API_ALLOW_DEV_AUTH: 'true' }))

    expect(config.allowDevAuth).toBe(true)
    // 핵심: 하나를 켜려다 다른 하나가 딸려 오면 안 된다.
    expect(config.allowDebugSpin).toBe(false)
  })

  it('결과 강제만 켜도 mock 로그인은 열리지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = loadConfig(baseEnv({ API_ALLOW_DEBUG_SPIN: 'true' }))

    expect(config.allowDebugSpin).toBe(true)
    expect(config.allowDevAuth).toBe(false)
  })

  it('아무것도 안 주면 둘 다 꺼진 채로 뜬다', () => {
    const config = loadConfig(baseEnv())

    expect(config.allowDevAuth).toBe(false)
    expect(config.allowDebugSpin).toBe(false)
  })

  it("'true'가 아닌 값은 켜진 것으로 치지 않는다", () => {
    const config = loadConfig(baseEnv({ API_ALLOW_DEV_AUTH: '1', API_ALLOW_DEBUG_SPIN: 'TRUE' }))

    expect(config.allowDevAuth).toBe(false)
    expect(config.allowDebugSpin).toBe(false)
  })

  it('합쳐져 있던 옛 플래그가 남아 있으면 조용히 무시하지 않고 부팅을 막는다', () => {
    // 무시하면 "아직 켜져 있다"고 착각한 채 배포된다. 반대로 지웠는데 실제로는 다른 쪽이
    // 열려 있는 상황도 생긴다. 그래서 이름이 보이면 즉시 실패시킨다.
    expect(() => loadConfig(baseEnv({ API_ALLOW_DEV_MOCK: 'true' }))).toThrow(/API_ALLOW_DEV_MOCK/)
    // 값이 'false'여도 마찬가지다 — 남아 있다는 사실 자체가 설정이 낡았다는 뜻이다.
    expect(() => loadConfig(baseEnv({ API_ALLOW_DEV_MOCK: 'false' }))).toThrow(/API_ALLOW_DEV_MOCK/)
  })
})

describe('프로덕션에서는 경고가 아니라 부팅 거부다', () => {
  it('mock 로그인이 켜져 있으면 뜨지 않는다', () => {
    expect(() => loadConfig(productionEnv({ API_ALLOW_DEV_AUTH: 'true' }))).toThrow(/API_ALLOW_DEV_AUTH/)
  })

  it('결과 강제가 켜져 있으면 뜨지 않는다', () => {
    expect(() => loadConfig(productionEnv({ API_ALLOW_DEBUG_SPIN: 'true' }))).toThrow(/API_ALLOW_DEBUG_SPIN/)
  })

  it('CORS_ORIGIN을 빠뜨리면 전면 개방으로 폴백하지 않고 뜨지 않는다', () => {
    const env = productionEnv()
    delete env.CORS_ORIGIN

    expect(() => loadConfig(env)).toThrow(/CORS_ORIGIN/)
  })

  it('DATABASE_URL이 없으면 in-memory 레포로 폴백하지 않고 뜨지 않는다', () => {
    // in-memory 레포 + 인스턴스 다중화는 상태도 갈라지고 인프로세스 스핀 락도 무력해진다.
    // 그 조합이 프로덕션에서 애초에 성립하지 못하게 여기서 막는다.
    const env = productionEnv()
    delete env.DATABASE_URL

    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/)
  })

  it('문제를 한 번에 모아서 알려준다', () => {
    const env = productionEnv({ API_ALLOW_DEV_AUTH: 'true', API_ALLOW_DEBUG_SPIN: 'true' })
    delete env.CORS_ORIGIN
    delete env.DATABASE_URL

    // 하나 고치고 다시 떠서 또 실패하는 왕복을 줄인다.
    expect(() => loadConfig(env)).toThrow(/API_ALLOW_DEV_AUTH[\s\S]*API_ALLOW_DEBUG_SPIN[\s\S]*CORS_ORIGIN[\s\S]*DATABASE_URL/)
  })

  it('제대로 갖춰진 프로덕션 환경은 그냥 뜬다', () => {
    const config = loadConfig(productionEnv())

    expect(config.allowDevAuth).toBe(false)
    expect(config.allowDebugSpin).toBe(false)
    expect(config.corsOrigin).toBe('https://mini.example.com')
    expect(config.databaseUrl).toBe('postgres://user:pw@db.example.com:5432/app')
  })
})

describe('개발 기본값', () => {
  it('CORS_ORIGIN이 없으면 개발에서만 전면 개방으로 둔다', () => {
    expect(loadConfig(baseEnv()).corsOrigin).toBe('*')
  })

  it('DATABASE_URL이 없어도 개발에서는 그대로 뜬다 (in-memory 레포)', () => {
    expect(loadConfig(baseEnv()).databaseUrl).toBeUndefined()
  })
})
