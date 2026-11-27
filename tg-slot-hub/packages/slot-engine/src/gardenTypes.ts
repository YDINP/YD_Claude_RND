import type { GridPosition, SymbolId, WinLine } from './types.js'

/**
 * 자라는 정원(growBoard) 팩의 결과 타입. 기획서 `docs/PLAN_greenhouse-garden.md` §4-2.
 *
 * 좌표는 전부 **물리 8×8 판의 절대 좌표** `[reel, row]`다. 판이 자라도 좌표가 바뀌지 않아
 * 씨앗·당첨 칸·렌더러 스프라이트가 성장 중에 자리를 옮기지 않는다.
 */

/** 활성 영역. `x`=첫 열, `y`=첫 행, `size`=한 변. 단계 → 범위는 고정 표(`gardenBoundsFor`)다. */
export interface GardenBounds {
  x: number
  y: number
  size: number
}

/** 씨앗 화분. `tier`는 `growBoard.seedTiers`의 인덱스(0 = 가장 작은 등급). */
export interface GardenSeed {
  reel: number
  row: number
  tier: number
}

/** 한 겹 성장. 남은 씨앗이 먼저 한 등급 오르고, 새 칸이 열리며 새 씨앗이 나온다. */
export interface GardenGrow {
  from: GardenBounds
  to: GardenBounds
  /** 새로 열린 칸. 씨앗 추첨(RNG) 순서와 같다(행 오름차순, 같은 행은 열 오름차순). */
  cells: GridPosition[]
  /** 이번 성장으로 새로 나온 씨앗(이번 성장에서는 자라지 않는다). */
  seeds: GardenSeed[]
  /** 등급이 실제로 오른 기존 씨앗 수(최고 등급에 이미 닿은 씨앗은 세지 않는다). */
  grown: number
}

/**
 * 한 단계. 순서는 «평가 → 씨앗 배정 → 팝 → 활성 범위 안 중력 → 리필 → (문턱을 넘었으면) 성장»이다.
 * 당첨 없이 성장만 하는 단계도 있다(`wins`가 빈 배열, `grow`만 있음).
 */
export interface GardenStep {
  index: number
  /** 절대 좌표. `win`은 씨앗 배율까지 곱한 실지급(캡 적용 후). */
  wins: WinLine[]
  /** 지워진 칸, reel·row 오름차순. */
  removed: GridPosition[]
  /** 활성 열 왼→오른(`bounds.x`부터 `size`개), 각 열은 위→아래로 떨어지는 심볼. */
  refill: SymbolId[][]
  /** 이번 단계에 쓰인(피고 사라진) 씨앗 자리. */
  bloomed: GridPosition[]
  grow?: GardenGrow
  /** 이 단계 뒤 성장 막대 값(기본 게임은 스핀 누적, 프리스핀은 라운드 누적). */
  popped: number
  stepWin: number
}

/** 햇살 1회(프리스핀 8×8 전용). 씨앗 전부 +1등급 후 빈 화분에 새 씨앗을 심는다. */
export interface GardenSun {
  /** 등급이 실제로 오른 씨앗 수. */
  grown: number
  /** 새로 심은 씨앗(최대 씨앗 수에 걸려 버린 추첨은 빠진다). */
  planted: GardenSeed[]
  /** 이 햇살 뒤 판 위 씨앗 전부. */
  seeds: GardenSeed[]
}

/** 프리스핀 결과 팝업용 집계. 서버(엔진)가 낸 값만 정본이다. */
export interface GardenRoundStats {
  /** 라운드 동안 닿은 가장 큰 판 한 변(4~8). */
  maxSize: number
  /** 라운드 동안 판 위에 있었던 가장 큰 씨앗 값(없으면 0). */
  bestSeed: number
  /** 프리스핀 한 판 최고 지급 코인. */
  bestSpinWin: number
  /** 프리스핀 지급 합계 코인(진입 스핀 제외, 최저 보장 포함). */
  freeWin: number
  /** 최저 보장으로 채운 코인(없으면 0). */
  topUp: number
}

/** 정원 프리스핀 동안만 존재하는 스핀 간 상태. */
export interface GardenCarry {
  /** 성장 단계 0~4 (4×4 ~ 8×8). */
  stage: number
  /** 성장 막대(라운드 누적 터진 칸). */
  popped: number
  seeds: GardenSeed[]
  /** 지금까지 받은 리트리거 횟수. */
  retriggers: number
  /** 지금까지 받은 햇살 횟수. */
  suns: number
  /** 라운드(진입 스핀 + 프리스핀) 누적 지급 코인. 라운드 지급 상한에 쓴다. */
  roundWin: number
  /** 프리스핀 누적 지급 코인(진입 스핀 제외). 최저 보장에 쓴다. */
  freeWin: number
  maxStage: number
  /** 라운드 동안 판 위에 있었던 가장 큰 씨앗 등급 인덱스(없으면 -1). */
  bestTier: number
  bestSpinWin: number
}

/** 스핀 하나의 정원 진행 전부. 착지(8×8 `grid`)에서 시작해 `foldGarden`으로 접으면 `finalGrid`가 된다. */
export interface GardenTrigger {
  type: 'garden'
  start: GardenBounds
  startSeeds: GardenSeed[]
  startPopped: number
  steps: GardenStep[]
  finalGrid: SymbolId[][]
  final: GardenBounds
  /** 단계·햇살이 모두 끝난 뒤 판 위 씨앗. */
  seeds: GardenSeed[]
  /** 이 스핀 끝 햇살(프리스핀만, 없으면 키가 없다). */
  sun?: GardenSun[]
  /** 프리스핀만. 이 스핀까지 반영한 라운드 집계. */
  round?: GardenRoundStats
  /** 라운드 지급 상한에 닿아 단계를 끊었다. */
  capped: boolean
  /** 팝 단계 상한에 닿아 남은 클러스터를 지급하지 않았다. */
  hitMaxCascades: boolean
}

/** 정원 프리스핀 최저 보장. 마지막 프리스핀에서 모자란 몫을 더했다(코인). */
export interface GardenTopUpTrigger {
  type: 'gardenTopUp'
  amount: number
}
