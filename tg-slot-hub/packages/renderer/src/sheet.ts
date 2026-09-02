import { z } from 'zod'
import type { ResolvedFxEffect } from './fx.js'

/** 아틀라스 안의 프레임 하나. 픽셀 좌표다. */
export const SheetFrameSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
})
export type SheetFrame = z.infer<typeof SheetFrameSchema>

/**
 * 스프라이트 시트 사이드카(`sheets/<id>.json`)의 스키마.
 * 아틀라스 이미지는 같은 경로의 `.webp`다.
 */
export const SpriteSheetSchema = z
  .object({
    /** 프레임 한 칸의 기준 크기. 심볼 폭에 맞출 때 이 값을 쓴다. */
    frameW: z.number().int().positive(),
    frameH: z.number().int().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    count: z.number().int().positive(),
    fps: z.number().positive(),
    frames: z.array(SheetFrameSchema).min(1),
    symbol: z.string().min(1),
  })
  .superRefine((sheet, ctx) => {
    const issue = (message: string, path: (string | number)[]): void => {
      ctx.addIssue({ code: 'custom', message, path })
    }

    if (sheet.frames.length !== sheet.count) {
      issue(`count(${sheet.count})와 frames 개수(${sheet.frames.length})가 다르다`, ['frames'])
    }
    const capacity = sheet.cols * sheet.rows
    if (sheet.count > capacity) {
      issue(`count(${sheet.count})가 격자 용량(${sheet.cols}x${sheet.rows}=${capacity})을 넘는다`, ['count'])
    }

    // 아틀라스 크기는 격자에서 유도한다. 프레임이 그 밖을 가리키면 잘린 그림이 나온다.
    const atlasWidth = sheet.cols * sheet.frameW
    const atlasHeight = sheet.rows * sheet.frameH
    sheet.frames.forEach((frame, index) => {
      if (frame.x + frame.w > atlasWidth) {
        issue(`프레임 ${index}가 아틀라스 오른쪽(${atlasWidth})을 넘는다`, ['frames', index, 'w'])
      }
      if (frame.y + frame.h > atlasHeight) {
        issue(`프레임 ${index}가 아틀라스 아래(${atlasHeight})를 넘는다`, ['frames', index, 'h'])
      }
    })
  })

export type SpriteSheet = z.infer<typeof SpriteSheetSchema>

export class SheetError extends Error {
  override name = 'SheetError'
}

/** 사이드카 JSON을 검증한다. 실패하면 어디가 틀렸는지 담아 던진다. */
export function parseSpriteSheet(json: unknown): SpriteSheet {
  const parsed = SpriteSheetSchema.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')
    throw new SheetError(`스프라이트 시트 검증 실패: ${detail}`)
  }
  return parsed.data
}

/** 아틀라스 이미지 경로. 사이드카와 이름이 같고 확장자만 다르다. */
export function atlasUrlFor(sheetUrl: string): string {
  return sheetUrl.replace(/\.json$/i, '.webp')
}

/** 프레임 하나가 화면에 머무는 시간(ms). */
export function sheetFrameMs(sheet: Pick<SpriteSheet, 'fps'>): number {
  return 1000 / sheet.fps
}

/** 한 바퀴 재생에 걸리는 시간(ms). */
export function sheetDurationMs(sheet: Pick<SpriteSheet, 'fps' | 'count'>): number {
  return (sheet.count / sheet.fps) * 1000
}

/**
 * 경과 시간에 해당하는 프레임 번호.
 * `loop`면 끝에서 처음으로 돌아가고, 아니면 마지막 프레임에 머문다.
 */
export function sheetFrameIndexAt(
  sheet: Pick<SpriteSheet, 'fps' | 'count'>,
  elapsedMs: number,
  loop = true,
): number {
  if (elapsedMs <= 0) return 0
  const raw = Math.floor(elapsedMs / sheetFrameMs(sheet))
  if (!loop) return Math.min(sheet.count - 1, raw)
  return ((raw % sheet.count) + sheet.count) % sheet.count
}

/**
 * Pixi `AnimatedSprite.animationSpeed`. 1이 60fps 기준이라 그렇게 환산한다.
 */
export function sheetAnimationSpeed(sheet: Pick<SpriteSheet, 'fps'>): number {
  return sheet.fps / 60
}

/**
 * 프레임을 셀 크기에 맞추는 배율.
 * 기준은 `frameW`다. 프레임마다 실제 폭이 달라도 흔들리지 않게 한 값으로 맞춘다.
 */
export function sheetScaleFor(sheet: Pick<SpriteSheet, 'frameW'>, symbolWidthPx: number): number {
  if (sheet.frameW <= 0) throw new RangeError(`frameW가 올바르지 않다: ${sheet.frameW}`)
  return symbolWidthPx / sheet.frameW
}

export interface SheetFxPlan {
  /** 시트 애니메이션을 재생할지. */
  useSheet: boolean
  /** 시트 위에 함께 얹을 절차적 효과. */
  procedural: ResolvedFxEffect[]
}

/**
 * 시트와 절차적 효과를 어떻게 섞을지 정한다.
 *
 * - 테마가 `sheet`를 명시했으면 그것만 재생한다(목록에 남은 다른 효과는 함께 얹는다).
 * - 명시하지 않았어도 시트가 있으면 재생하고, 적어 둔 절차적 효과를 **위에 겹친다**.
 * - 시트를 못 쓰면 절차적 효과로 돌아간다. 그마저 비어 있으면 `fallback`을 쓴다.
 *   시트만 적어 둔 심볼이 아틀라스 로딩 실패로 아무 연출도 못 받는 일을 막는다.
 */
export function planSheetFx(
  effects: readonly ResolvedFxEffect[],
  sheetAvailable: boolean,
  fallback: readonly ResolvedFxEffect[] = [],
): SheetFxPlan {
  const procedural = effects.filter((effect) => effect.type !== 'sheet')
  if (sheetAvailable) return { useSheet: true, procedural }

  const declaredSheet = effects.length !== procedural.length
  if (procedural.length > 0 || !declaredSheet) return { useSheet: false, procedural }
  return { useSheet: false, procedural: [...fallback] }
}

/** 테마가 이 심볼을 시트 전용으로 선언했는지. 늦게 도착한 시트로 갈아탈 때 쓴다. */
export function isSheetOnly(effects: readonly ResolvedFxEffect[]): boolean {
  return effects.length > 0 && effects.every((effect) => effect.type === 'sheet')
}
