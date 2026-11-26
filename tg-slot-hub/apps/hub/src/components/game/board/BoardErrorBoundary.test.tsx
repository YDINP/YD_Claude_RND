import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardErrorBoundary } from './BoardErrorBoundary'

function Boom(): ReactNode {
  throw new Error('말판 그리기 실패')
}

afterEach(() => cleanup())

describe('BoardErrorBoundary', () => {
  it('자식이 그리다 죽으면 onFail을 한 번 부르고 아무것도 그리지 않는다(spin()의 기다림을 풀 기회)', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onFail = vi.fn()
    const { container } = render(
      <BoardErrorBoundary onFail={onFail}>
        <Boom />
      </BoardErrorBoundary>,
    )
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
    quiet.mockRestore()
  })

  it('정상이면 자식을 그대로 그린다', () => {
    const onFail = vi.fn()
    const { getByText } = render(
      <BoardErrorBoundary onFail={onFail}>
        <span>말판</span>
      </BoardErrorBoundary>,
    )
    expect(getByText('말판')).toBeTruthy()
    expect(onFail).not.toHaveBeenCalled()
  })
})
