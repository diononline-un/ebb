// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { FULLSCREEN_PATHS, isFullscreenPath } from '../../src/web/features/shell/AppShell.tsx'

describe('isFullscreenPath', () => {
  it.each(FULLSCREEN_PATHS)('treats %s as a fullscreen route', (path) => {
    expect(isFullscreenPath(path)).toBe(true)
  })

  it('tolerates a trailing slash', () => {
    expect(isFullscreenPath('/ritual/')).toBe(true)
  })

  it.each(['/today', '/ritualx', '/'])('leaves %s inside the shell', (path) => {
    expect(isFullscreenPath(path)).toBe(false)
  })
})
