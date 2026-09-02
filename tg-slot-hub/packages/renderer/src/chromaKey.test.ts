import { describe, expect, it } from 'vitest'
import { CHROMA_GREEN_DOMINANCE, CHROMA_GREEN_MIN } from './constants.js'
import { isChromaGreen, keyOutGreen } from './chromaKey.js'

describe('isChromaGreen', () => {
  it('순수 크로마키 초록을 잡는다', () => {
    expect(isChromaGreen(0, 255, 0)).toBe(true)
  })

  it('디스필이 덜 된 초록 테두리도 잡는다', () => {
    expect(isChromaGreen(90, 200, 100)).toBe(true)
  })

  it('브라스(노랑 계열)는 건드리지 않는다', () => {
    // 금색은 빨강과 초록이 비슷해 우세 조건을 넘지 못한다.
    expect(isChromaGreen(0xd8, 0xa9, 0x4a)).toBe(false)
    expect(isChromaGreen(0xf4, 0xd9, 0x8a)).toBe(false)
  })

  it('청록은 파랑이 커서 남는다', () => {
    expect(isChromaGreen(0x4f, 0xc3, 0xd9)).toBe(false)
  })

  it('채도 높은 초록은 잔여 크로마키로 보고 지운다', () => {
    // 의도된 절충이다. 프레임 아트에 초록 요소(잎, 보석)를 넣으면 뚫린다.
    // 브라스와 네이비만 쓰는 아트 디렉션에서는 문제가 되지 않는다.
    expect(isChromaGreen(0x3f, 0xae, 0x6a)).toBe(true)
  })

  it('흰색과 검정은 남긴다', () => {
    expect(isChromaGreen(255, 255, 255)).toBe(false)
    expect(isChromaGreen(0, 0, 0)).toBe(false)
  })

  it('밝기 문턱 바로 아래위에서 갈린다', () => {
    expect(isChromaGreen(0, CHROMA_GREEN_MIN, 0)).toBe(false)
    expect(isChromaGreen(0, CHROMA_GREEN_MIN + 1, 0)).toBe(true)
  })

  it('우세 문턱 바로 아래위에서 갈린다', () => {
    const g = 200
    expect(isChromaGreen(g - CHROMA_GREEN_DOMINANCE, g, 0)).toBe(false)
    expect(isChromaGreen(g - CHROMA_GREEN_DOMINANCE - 1, g, 0)).toBe(true)
    expect(isChromaGreen(0, g, g - CHROMA_GREEN_DOMINANCE)).toBe(false)
  })
})

describe('keyOutGreen', () => {
  it('초록 픽셀만 투명하게 만든다', () => {
    const pixels = [
      0, 255, 0, 255, // 크로마키 초록
      216, 169, 74, 255, // 브라스
    ]
    expect(keyOutGreen(pixels)).toBe(1)
    expect(pixels[3]).toBe(0)
    expect(pixels[7]).toBe(255)
  })

  it('색 채널은 그대로 두고 알파만 바꾼다', () => {
    const pixels = [0, 255, 0, 255]
    keyOutGreen(pixels)
    expect(pixels.slice(0, 3)).toEqual([0, 255, 0])
  })

  it('지울 초록이 없으면 0을 돌려준다', () => {
    const pixels = [216, 169, 74, 255, 11, 18, 32, 255]
    expect(keyOutGreen(pixels)).toBe(0)
    expect(pixels[3]).toBe(255)
  })

  it('이미 투명한 픽셀은 세지 않는다', () => {
    const pixels = [0, 255, 0, 0]
    expect(keyOutGreen(pixels)).toBe(0)
  })

  it('Uint8ClampedArray도 제자리에서 고친다', () => {
    const pixels = new Uint8ClampedArray([0, 255, 0, 255, 255, 255, 255, 255])
    expect(keyOutGreen(pixels)).toBe(1)
    expect(pixels[3]).toBe(0)
    expect(pixels[7]).toBe(255)
  })

  it('두 번 돌려도 결과가 같다', () => {
    const pixels = new Uint8ClampedArray([0, 255, 0, 255])
    keyOutGreen(pixels)
    expect(keyOutGreen(pixels)).toBe(0)
  })

  it('RGBA 배열이 아니면 던진다', () => {
    expect(() => keyOutGreen([0, 255, 0])).toThrow(RangeError)
  })
})
