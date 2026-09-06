import type { ParticleBudgetSnapshot, PoolStats } from './pool.js'
import type { TextureRegistrySnapshot } from './textureRegistry.js'

/**
 * 렌더러 내부의 재사용·수명 상태를 한 번에 뜬 사진.
 *
 * **순수 데이터다.** 여기에는 그림도, 서식도, 단위 변환도 없다. 디버그 패널이 무엇을 어떻게
 * 보여줄지는 화면 쪽이 정한다. 이 모듈이 아는 것은 "무엇을 셀 가치가 있는가"뿐이다.
 *
 * 읽는 법: `created`가 시간이 지나도 늘지 않고 `hitRate`가 1에 가까워지면 그 풀은 제 일을
 * 하고 있다. `discarded`가 계속 늘면 상한이 실제 동시 사용량보다 작다는 뜻이고,
 * `textures.sheets.evicted`가 늘면 시트 캐시가 게임 수에 비해 좁다는 뜻이다.
 */
export interface RendererDiagnostics {
  pools: {
    /** 변형 연출 파티클. */
    mutation: PoolStats
    /** 시트 애니메이션 스프라이트(프레임 묶음별 합계). */
    sheetSprites: PoolStats
    /** 절차적 심볼 연출의 덧그림(홑겹 + 띠/마스크 쌍 합계). */
    symbolFx: PoolStats
    /** 승리 파티클(코인·색종이·스캐터). */
    particles: PoolStats
  }
  /** 지금 상주 중인 시트 프레임 묶음 수. 게임 하나가 보통 3벌을 쓴다. */
  sheetSpriteKeys: number
  /** 동시에 살아 있는 승리 파티클 수와 그 상한. */
  particleBudget: ParticleBudgetSnapshot
  textures: {
    /** 이 렌더러가 직접 만든 텍스처(폴백·코인·연출). */
    owned: TextureRegistrySnapshot
    /** 여러 렌더러가 나눠 쓰는 시트 아틀라스. 참조가 끊긴 것부터 밀려난다. */
    sheets: TextureRegistrySnapshot
  }
}

const EMPTY_POOL: PoolStats = {
  free: 0,
  live: 0,
  created: 0,
  acquired: 0,
  reused: 0,
  discarded: 0,
  hitRate: 0,
}

const EMPTY_TEXTURES: TextureRegistrySnapshot = {
  owned: 0,
  cached: 0,
  live: 0,
  idle: 0,
  evicted: 0,
  capacity: 0,
}

/**
 * 아직 렌더러가 없을 때 돌려주는 빈 진단.
 * 호출 측이 null을 다루지 않게 하려는 것이다 — 초기화 전에는 "전부 0"이 사실이다.
 */
export function emptyDiagnostics(): RendererDiagnostics {
  return {
    pools: {
      mutation: { ...EMPTY_POOL },
      sheetSprites: { ...EMPTY_POOL },
      symbolFx: { ...EMPTY_POOL },
      particles: { ...EMPTY_POOL },
    },
    sheetSpriteKeys: 0,
    particleBudget: { inUse: 0, capacity: 0, free: 0 },
    textures: { owned: { ...EMPTY_TEXTURES }, sheets: { ...EMPTY_TEXTURES } },
  }
}
