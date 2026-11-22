// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TideLine } from '../../src/web/ui/TideLine.tsx'

// Also the reference for new component tests: plain .test.tsx with JSX, type-checked by
// tsconfig.tests-web.json, no createElement and no @ts-nocheck.

afterEach(cleanup)

describe('TideLine', () => {
  it('is decorative and still by default', () => {
    const { container } = render(<TideLine />)
    const line = container.firstElementChild
    expect(line?.getAttribute('aria-hidden')).toBe('true')
    expect(line?.classList.contains('ebb-tide-line')).toBe(true)
    expect(line?.classList.contains('ebb-tide-line--in')).toBe(false)
  })

  it('draws itself in for the anchor moment', () => {
    const { container } = render(<TideLine animateIn />)
    expect(container.firstElementChild?.classList.contains('ebb-tide-line--in')).toBe(true)
  })
})
