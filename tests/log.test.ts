import { afterAll, describe, expect, it, vi } from 'vitest'

// The request log reads its switch while env.ts parses process.env, so it has to be set first.
process.env['LOG_REQUESTS'] = '1'
const { createApp } = await import('../src/server/app.ts')
const { closeDb } = await import('../src/server/db.ts')

// The deep health check opens a database connection; the pool goes with it.
afterAll(closeDb)

const TASK_ID = '3f0c1a3e-6f5b-4c47-9a51-8f2d0c6c1b7e'

/** Collects everything the app writes to stdout, whichever way it writes it. */
function captureStdout() {
  const lines: string[] = []
  const consoleLog = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  return {
    lines,
    restore: () => {
      consoleLog.mockRestore()
      stdoutWrite.mockRestore()
    },
  }
}

describe('requestLog', () => {
  it('writes the route pattern instead of the real path', async () => {
    const capture = captureStdout()
    try {
      const res = await createApp().request(`/api/tasks/${TASK_ID}?q=hidden-marker`)
      expect(res.status).toBe(401)
    } finally {
      capture.restore()
    }

    const line = capture.lines.find((value) => value.includes('"route"'))
    expect(line).toBeDefined()
    expect(JSON.parse(line ?? '{}')).toMatchObject({
      method: 'GET',
      route: '/api/tasks/:id',
      status: 401,
    })
    expect(line).not.toContain(TASK_ID)
    expect(line).not.toContain('hidden-marker')
  })

  it('writes nothing for health checks', async () => {
    const capture = captureStdout()
    try {
      await createApp().request('/api/health')
      await createApp().request('/api/health/deep')
    } finally {
      capture.restore()
    }

    expect(capture.lines.filter((value) => value.includes('"route"'))).toEqual([])
  })
})
