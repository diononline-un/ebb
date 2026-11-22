import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { flushQueue, pendingDump, subscribeQueue, type QueuedDump } from '../../lib/offline-queue.ts'

/**
 * Reads the offline queue and replays it: once when the app starts, again whenever the browser
 * comes back online. A flushed run refreshes the dump list, so the optimistic lines hand over to
 * the saved ones.
 */
export function useDumpQueue(): QueuedDump[] {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<QueuedDump[]>([])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void pendingDump().then((lines) => {
        if (active) setPending(lines)
      })
    }
    const replay = () => {
      void flushQueue()
        .then(() => queryClient.invalidateQueries({ queryKey: ['dump'] }))
        .finally(refresh)
    }

    refresh()
    replay()
    const unsubscribe = subscribeQueue(refresh)
    window.addEventListener('online', replay)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('online', replay)
    }
  }, [queryClient])

  return pending
}
