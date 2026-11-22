import { createStore, get, set, update } from 'idb-keyval'
import type { DumpCreate } from '../../shared/schemas/dump.ts'
import { apiFetch } from './api.ts'

/**
 * Offline safety net for the dump only: a thought typed without a connection must not get lost,
 * and nothing else goes through here (docs/architektur.md, "PWA und Offline").
 */
export type QueuedDump = DumpCreate

const KEY = 'queue'
const store = createStore('ebb-offline', 'dump')

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Lets the UI re-read the queue after enqueue, flush or a failed send. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function pendingDump(): Promise<QueuedDump[]> {
  return (await get<QueuedDump[]>(KEY, store)) ?? []
}

export async function pendingCount(): Promise<number> {
  return (await pendingDump()).length
}

/** Adds one line to the end of the queue. The clientId from the caller keeps replays idempotent. */
export async function enqueueDump(line: QueuedDump): Promise<void> {
  await update<QueuedDump[]>(KEY, (current) => [...(current ?? []), line], store)
  notify()
}

export async function clearDumpQueue(): Promise<void> {
  await set(KEY, [], store)
  notify()
}

let flushing: Promise<void> | null = null

/**
 * Sends the queue in order. The first request that fails stops the run and the line it failed on
 * stays at the front, so nothing overtakes anything and nothing is sent twice: a replay carries the
 * same clientId, which the server deduplicates.
 */
export async function flushQueue(): Promise<void> {
  // Two tabs (or a page and the quick capture sheet) may flush at once; one run is enough.
  if (flushing) return flushing
  flushing = run()
  try {
    await flushing
  } finally {
    flushing = null
  }
}

async function run(): Promise<void> {
  const queue = await pendingDump()
  if (queue.length === 0) return

  for (const [index, line] of queue.entries()) {
    try {
      await apiFetch('/api/dump', { method: 'POST', body: JSON.stringify(line) })
    } catch {
      // Whoever fails is not sent again by this run: the line stays at the front together with
      // everything behind it, so the next flush retries the same order (spec: a failure stops the
      // queue and keeps the rest). Lines never leave this module without the server accepting them.
      await set(KEY, queue.slice(index), store)
      notify()
      return
    }
    await set(KEY, queue.slice(index + 1), store)
    notify()
  }
}
