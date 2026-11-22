import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDumpQueue,
  enqueueDump,
  flushQueue,
  pendingCount,
  pendingDump,
} from '../../src/web/lib/offline-queue.ts'

const newClientId = () => crypto.randomUUID()

type Sent = { clientId: string; text: string }

let sent: Sent[] = []

function respondWith(status: number): Promise<Response> {
  return Promise.resolve(new Response('{}', { status, headers: { 'content-type': 'application/json' } }))
}

/** fetch stub that records every dump POST and answers with the given statuses one after another. */
function stubFetch(statuses: number[], options: { failAt?: number } = {}): ReturnType<typeof vi.fn> {
  let call = 0
  const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    call += 1
    if (options.failAt === call) return Promise.reject(new TypeError('fetch failed'))
    const body = JSON.parse(String(init?.body ?? '{}')) as Sent
    sent.push(body)
    const status = statuses[call - 1] ?? 201
    return respondWith(status)
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

beforeEach(async () => {
  sent = []
  await clearDumpQueue()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('offline queue', () => {
  it('starts empty', async () => {
    expect(await pendingCount()).toBe(0)
    expect(await pendingDump()).toEqual([])
  })

  it('sends queued lines in the order they were added', async () => {
    const lines = [
      { clientId: newClientId(), text: 'first' },
      { clientId: newClientId(), text: 'second' },
      { clientId: newClientId(), text: 'third' },
    ]
    for (const line of lines) await enqueueDump(line)
    expect(await pendingCount()).toBe(3)

    const stub = stubFetch([201, 201, 201])
    await flushQueue()

    expect(stub).toHaveBeenCalledTimes(3)
    expect(sent.map((line) => line.text)).toEqual(['first', 'second', 'third'])
    expect(sent.map((line) => line.clientId)).toEqual(lines.map((line) => line.clientId))
    expect(await pendingCount()).toBe(0)
  })

  it('sends nothing twice when flushed again', async () => {
    await enqueueDump({ clientId: newClientId(), text: 'only one' })

    const stub = stubFetch([201])
    await flushQueue()
    await flushQueue()

    expect(stub).toHaveBeenCalledTimes(1)
    expect(await pendingCount()).toBe(0)
  })

  it('stops at the first failure and keeps that line and the rest', async () => {
    const lines = [
      { clientId: newClientId(), text: 'goes through' },
      { clientId: newClientId(), text: 'network breaks here' },
      { clientId: newClientId(), text: 'waits behind it' },
    ]
    for (const line of lines) await enqueueDump(line)

    stubFetch([201, 201, 201], { failAt: 2 })
    await flushQueue()

    expect(sent.map((line) => line.text)).toEqual(['goes through'])
    expect((await pendingDump()).map((line) => line.text)).toEqual(['network breaks here', 'waits behind it'])

    // The next attempt starts with the failing line and keeps the order.
    vi.unstubAllGlobals()
    stubFetch([201, 201])
    await flushQueue()
    expect(sent.map((line) => line.text)).toEqual(['goes through', 'network breaks here', 'waits behind it'])
    expect(await pendingCount()).toBe(0)
  })

  it('keeps everything from the rejected line on, in order', async () => {
    await enqueueDump({ clientId: newClientId(), text: 'rejected' })
    await enqueueDump({ clientId: newClientId(), text: 'behind it' })

    stubFetch([400, 201])
    await flushQueue()

    // The queue stops at the first refusal; nothing is thrown away and nothing jumps ahead.
    expect(sent.map((line) => line.text)).toEqual(['rejected'])
    expect((await pendingDump()).map((line) => line.text)).toEqual(['rejected', 'behind it'])
  })

  it('does not send one line twice when two flushes run at the same time', async () => {
    await enqueueDump({ clientId: newClientId(), text: 'once' })

    const stub = stubFetch([201])
    await Promise.all([flushQueue(), flushQueue()])

    expect(stub).toHaveBeenCalledTimes(1)
  })
})
