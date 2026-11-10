import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CELEBRATION_SHAPES, ThemeFileSchema } from '@tgslot/game-sdk'
import { describe, expect, it } from 'vitest'
import {
  CELEBRATION_LEVELS,
  DEFAULT_CELEBRATION_LEVELS,
  DEFAULT_CELEBRATION_SKIN,
  celebrationLevelForWinTier,
  celebrationParticleCount,
  celebrationRayGeometry,
  celebrationShapeClipPath,
  celebrationShapePoints,
  opaqueHex,
  planCelebrationParticles,
  resolveCelebrationSkin,
  shadeColor,
} from './celebration.js'
import { parseTheme } from './theme.js'

describe('resolveCelebrationSkin — 기본값', () => {
  it('스킨이 없으면 허브 기본(금화·태양살·고리)이다', () => {
    const skin = resolveCelebrationSkin()
    expect(skin.custom).toBe(false)
    expect(skin.particles.kinds).toEqual([{ kind: 'shape', shape: 'coin' }])
    expect(skin.particles.colors).toBeNull()
    expect(skin.particles.motion).toBe('flip')
    expect(skin.rayStyle).toBe('sunburst')
    expect(skin.waveStyle).toBe('ring')
    expect(skin.labels).toEqual({})
    expect(DEFAULT_CELEBRATION_SKIN).toEqual(skin)
  })

  it('등급마다 기본 팔레트·광선·고리 수를 그대로 싣는다', () => {
    for (const level of CELEBRATION_LEVELS) {
      const resolved = DEFAULT_CELEBRATION_SKIN.levels[level]
      const base = DEFAULT_CELEBRATION_LEVELS[level]
      expect(resolved).toMatchObject(base)
      expect(resolved.density).toBe(1)
      expect(resolved.title.gradient).toEqual(['#ffffff', base.core, base.edge])
      expect(resolved.title.weight).toBe(900)
      expect(resolved.title.stroke).toBe(0)
    }
    expect(DEFAULT_CELEBRATION_SKIN.levels.surge.waves).toBe(0)
    expect(DEFAULT_CELEBRATION_SKIN.levels.cataclysm.waves).toBe(3)
  })

  it('렌더러 등급과 축하 등급은 1:1이다', () => {
    expect(celebrationLevelForWinTier('none')).toBe('none')
    expect(celebrationLevelForWinTier('big')).toBe('surge')
    expect(celebrationLevelForWinTier('mega')).toBe('blast')
    expect(celebrationLevelForWinTier('epic')).toBe('storm')
    expect(celebrationLevelForWinTier('max')).toBe('cataclysm')
  })
})

describe('resolveCelebrationSkin — 겹치는 순서', () => {
  it('기본 → 게임 공통 → 등급 순서로 덮는다', () => {
    const skin = resolveCelebrationSkin({
      palette: { core: '#111111', edge: '#222222' },
      title: { font: 'slab', stroke: 2 },
      tiers: { storm: { core: '#333333', waves: 1, density: 1.5, title: { stroke: 3 } } },
    })
    expect(skin.custom).toBe(true)
    expect(skin.levels.surge.core).toBe('#111111')
    expect(skin.levels.surge.glow).toBe(DEFAULT_CELEBRATION_LEVELS.surge.glow)
    expect(skin.levels.storm.core).toBe('#333333')
    expect(skin.levels.storm.edge).toBe('#222222')
    expect(skin.levels.storm.waves).toBe(1)
    expect(skin.levels.storm.density).toBe(1.5)
    expect(skin.levels.storm.title.stroke).toBe(3)
    expect(skin.levels.surge.title.stroke).toBe(2)
    expect(skin.levels.storm.title.fontFamily).toContain('Rockwell')
    // 그라디언트를 주지 않으면 그 등급의 최종 팔레트를 따른다.
    expect(skin.levels.storm.title.gradient).toEqual(['#ffffff', '#333333', '#222222'])
    // 프리스핀 종료 팝업(none)도 게임 공통 팔레트를 입는다.
    expect(skin.levels.none.core).toBe('#111111')
  })

  it('두 칸 그라디언트는 위 색을 가운데까지 끌어 세 칸으로 편다', () => {
    const skin = resolveCelebrationSkin({ title: { gradient: ['#ffffff', '#000000'] } })
    expect(skin.levels.blast.title.gradient).toEqual(['#ffffff', '#ffffff', '#000000'])
  })

  it('심볼 URL을 주면 없는 심볼은 버리고 있는 심볼엔 src를 싣는다', () => {
    const skin = resolveCelebrationSkin(
      { particles: { shapes: ['gem'], symbols: ['diamond', 'ghost'] } },
      { symbols: { diamond: '/games/x/theme/symbols/diamond.webp' } },
    )
    expect(skin.particles.kinds).toEqual([
      { kind: 'shape', shape: 'gem' },
      { kind: 'symbol', symbol: 'diamond', src: '/games/x/theme/symbols/diamond.webp' },
    ])
  })

  it('재료가 하나도 남지 않으면 금화로 떨어진다', () => {
    const skin = resolveCelebrationSkin({ particles: { symbols: ['ghost'] } }, { symbols: {} })
    expect(skin.particles.kinds).toEqual([{ kind: 'shape', shape: 'coin' }])
  })
})

describe('planCelebrationParticles', () => {
  it('색이 없으면 등급 팔레트(core)를 쓴다', () => {
    const looks = planCelebrationParticles(DEFAULT_CELEBRATION_SKIN, 'storm', 3)
    expect(looks).toHaveLength(3)
    expect(looks.every((look) => look.color === DEFAULT_CELEBRATION_LEVELS.storm.core)).toBe(true)
  })

  it('재료와 색을 다른 보폭으로 돌려 같은 짝만 반복하지 않는다', () => {
    const skin = resolveCelebrationSkin({
      particles: { shapes: ['star', 'casing'], colors: ['#ff0000', '#0000ff'] },
    })
    const pairs = new Set(
      planCelebrationParticles(skin, 'blast', 8).map((look) =>
        look.kind.kind === 'shape' ? `${look.kind.shape}:${look.color}` : '',
      ),
    )
    expect(pairs).toEqual(new Set(['star:#ff0000', 'casing:#0000ff', 'star:#0000ff', 'casing:#ff0000']))
  })

  it('밀도 배수를 적용하고 상한을 넘지 않는다', () => {
    const skin = resolveCelebrationSkin({ tiers: { cataclysm: { density: 2 } } })
    expect(celebrationParticleCount(skin, 'cataclysm', 28)).toBe(56)
    expect(celebrationParticleCount(skin, 'cataclysm', 60, 60)).toBe(60)
    expect(celebrationParticleCount(skin, 'surge', 20)).toBe(20)
  })

  it('그늘은 같은 색을 어둡게 민 것이다', () => {
    expect(shadeColor('#ff8000', 0.5)).toBe('#804000')
    expect(shadeColor('#fff', 0)).toBe('#ffffff')
    expect(opaqueHex('#ffab3d6b')).toBe('#ffab3d')
  })
})

describe('모양 윤곽', () => {
  it('원(coin)을 뺀 모든 모양이 상자 안 다각형이다', () => {
    for (const shape of CELEBRATION_SHAPES) {
      const points = celebrationShapePoints(shape)
      if (shape === 'coin') {
        expect(points).toBeNull()
        continue
      }
      expect(points!.length).toBeGreaterThanOrEqual(4)
      for (const [x, y] of points!) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('허브용 clip-path는 같은 점을 퍼센트로 옮긴 것이고 캐시된다', () => {
    expect(celebrationShapeClipPath('coin')).toBe('circle(50% at 50% 50%)')
    expect(celebrationShapeClipPath('shard')).toBe('polygon(42% 0%, 100% 36%, 70% 100%, 2% 72%)')
    expect(celebrationShapeClipPath('star')).toBe(celebrationShapeClipPath('star'))
  })

  it('광선 스타일마다 살 폭이 다르고 후광엔 살이 없다', () => {
    expect(celebrationRayGeometry('sunburst')).toEqual({ on: 4, period: 16 })
    expect(celebrationRayGeometry('beams').on).toBeGreaterThan(4)
    expect(celebrationRayGeometry('halo').on).toBe(0)
  })
})

describe('게임 팩의 축하 스킨', () => {
  const games = ['classic-777', 'fruit-fiesta', 'royal-diamond-777', 'sheriff-sixgun', 'shiba-shrine', 'astral-clocktower']
  const read = (id: string): unknown =>
    JSON.parse(readFileSync(resolve(process.cwd(), '../../games', id, 'theme/theme.json'), 'utf8'))

  it('여섯 게임 모두 스킨을 갖고, 서로 겹치지 않는다', () => {
    const signatures = new Set<string>()
    for (const id of games) {
      const file = ThemeFileSchema.parse(read(id))
      expect(file.celebration, id).toBeDefined()
      const skin = resolveCelebrationSkin(file.celebration, { symbols: file.symbols })
      expect(skin.custom).toBe(true)
      // 심볼 참조가 전부 살아남았다(오타면 버려져 개수가 준다).
      expect(skin.particles.kinds.filter((k) => k.kind === 'symbol')).toHaveLength(
        file.celebration?.particles?.symbols?.length ?? 0,
      )
      signatures.add(
        JSON.stringify([skin.particles.kinds, skin.particles.motion, skin.rayStyle, skin.waveStyle, skin.levels.blast.core]),
      )
    }
    expect(signatures.size).toBe(games.length)
  })

  it('parseTheme이 스킨을 그대로 실어 보낸다', () => {
    const theme = parseTheme(read('shiba-shrine'), '/games/shiba-shrine')
    expect(theme.celebration?.particles?.motion).toBe('flutter')
    expect(parseTheme({ symbols: {}, palette: { frame: '#000', reelBg: '#000', winLine: ['#fff'], text: '#fff' } }, '/g').celebration).toBeUndefined()
  })
})
