import { PACK_FILES, createMemorySource } from './pack.js'
import type { PackSource } from './pack.js'

/**
 * 테스트용 최소 게임 팩. **실제 `games/*`를 건드리지 않는다** — 팩이 바뀌면 테스트가 흔들리기 때문에
 * 검사기 테스트는 전부 이 합성 팩 위에서 돈다.
 *
 * 2릴 1행 1라인짜리 장난감 모델이지만 `GameMathSchema`를 그대로 통과한다.
 */
export const FIXTURE_ID = 'demo-slot'

export const fixtureMath = {
  id: FIXTURE_ID,
  reels: 2,
  rows: 1,
  symbols: [
    { id: 'wild', name: { en: 'Wild', ko: '와일드' }, wild: true },
    { id: 'cherry', name: { en: 'Cherry', ko: '체리' } },
  ],
  strips: [
    ['wild', 'cherry'],
    ['wild', 'cherry'],
  ],
  paylines: [[0, 0]],
  paytable: { wild: { '2': 10 }, cherry: { '2': 4 } },
  betLevels: [10],
  rtpTarget: 0.95,
  volatility: 'medium',
}

export const fixtureManifest = {
  id: FIXTURE_ID,
  name: { en: 'Demo Slot', ko: '데모 슬롯' },
  version: '1.0.0',
  thumbnail: `/games/${FIXTURE_ID}/thumb.webp`,
  status: 'hidden',
  reels: 2,
  rows: 1,
  lines: 1,
  betLevels: [10],
  rtpTarget: 0.95,
  volatility: 'medium',
}

export const fixtureTheme = {
  version: '1.0.0',
  symbols: { wild: 'symbols/wild.webp', cherry: 'symbols/cherry.webp' },
  background: 'bg.webp',
  palette: { frame: '#d8a94a', reelBg: '#0b1220', winLine: ['#f4d98a'], text: '#f2f4f8' },
  fx: { default: { win: [{ type: 'pulse', scale: 1.1 }] } },
}

export const fixtureArtFx = { fx: fixtureTheme.fx }

export const fixturePrompts = {
  game: FIXTURE_ID,
  concept: 'demo',
  stylePrefix: 'demo style',
  negative: 'blurry',
  assets: [
    { id: 'wild', kind: 'symbol', prompt: 'a wild', size: '1024x1024', out: 'theme/symbols/wild.webp', outSize: 512 },
    { id: 'cherry', kind: 'symbol', prompt: 'a cherry', size: '1024x1024', out: 'theme/symbols/cherry.webp', outSize: 512 },
    { id: 'bg', kind: 'bg', prompt: 'a background', size: '1024x1536', out: 'theme/bg.webp', outSize: 1080 },
    { id: 'thumb', kind: 'thumb', prompt: 'a thumbnail', size: '1536x1024', out: 'thumb.webp', outSize: 640 },
  ],
}

/** 참조가 전부 맞아떨어지는 파일 목록. 자산 파일 내용은 검사하지 않으므로 자리만 채운다. */
const FIXTURE_BINARIES = [
  'theme/symbols/wild.webp',
  'theme/symbols/wild@128.webp',
  'theme/symbols/cherry.webp',
  'theme/symbols/cherry@128.webp',
  'theme/bg.webp',
  'thumb.webp',
]

export interface FixtureOverrides {
  /** 키를 그대로 덮어쓴다. `null`을 주면 그 파일을 아예 없앤다. */
  files?: Record<string, string | null>
  /** 자산 파일 목록에 더할 경로. */
  extraBinaries?: string[]
  /** 자산 파일 목록에서 뺄 경로. */
  removeBinaries?: string[]
  /**
   * git이 추적 중인 파일 목록. 주지 않으면 `listTracked` 자체를 달지 않아
   * 검사기가 추적 검사를 건너뛴다 (= git 없는 환경과 같은 상태).
   * `'all'`을 주면 팩의 모든 파일이 추적 중인 것으로 본다.
   */
  tracked?: readonly string[] | 'all'
}

/** 문제가 하나도 없는 팩을 만들고, 필요하면 딱 한 군데만 망가뜨린다. */
export function createFixtureSource(overrides: FixtureOverrides = {}): PackSource {
  const files: Record<string, string> = {
    [PACK_FILES.manifest]: JSON.stringify(fixtureManifest),
    [PACK_FILES.math]: JSON.stringify(fixtureMath),
    [PACK_FILES.theme]: JSON.stringify(fixtureTheme),
    [PACK_FILES.prompts]: JSON.stringify(fixturePrompts),
    [PACK_FILES.fx]: JSON.stringify(fixtureArtFx),
    'README.md': '# demo',
  }
  const binaries = new Set([...FIXTURE_BINARIES, ...(overrides.extraBinaries ?? [])])
  for (const path of overrides.removeBinaries ?? []) binaries.delete(path)
  for (const path of binaries) files[path] = ''

  for (const [path, content] of Object.entries(overrides.files ?? {})) {
    if (content === null) delete files[path]
    else files[path] = content
  }

  const tracked = overrides.tracked === 'all' ? Object.keys(files) : overrides.tracked
  return createMemorySource(files, tracked)
}

/** 픽스처 JSON을 깊은 복사로 받아 한 군데만 고칠 때 쓴다. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
