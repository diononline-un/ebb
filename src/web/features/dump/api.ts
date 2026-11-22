import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DumpLine } from '../../../shared/schemas/dump.ts'
import { ApiError, apiFetch } from '../../lib/api.ts'
import { enqueueDump, type QueuedDump } from '../../lib/offline-queue.ts'

export async function fetchDump(): Promise<DumpLine[]> {
  return apiFetch<DumpLine[]>('/api/dump')
}

export function useDumpLines() {
  return useQuery({ queryKey: ['dump'], queryFn: fetchDump })
}

/**
 * Tries to send now. Without a connection (or when the server is unreachable) the line goes into
 * the offline queue instead and answers 'queued'; a refused thought (4xx) stays an error, because
 * retrying it would never help.
 */
export async function sendDumpLine(line: QueuedDump): Promise<'sent' | 'queued'> {
  try {
    await apiFetch<DumpLine>('/api/dump', { method: 'POST', body: JSON.stringify(line) })
    return 'sent'
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error
    await enqueueDump(line)
    return 'queued'
  }
}

export function useDumpActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dump'] })

  return {
    add: async (text: string) => {
      const result = await sendDumpLine({ clientId: crypto.randomUUID(), text })
      await refresh()
      return result
    },
    toTask: async (id: string) => {
      await apiFetch(`/api/dump/${id}/to-task`, { method: 'POST' })
      // The new task waits in today's inbox, so the day (and the ritual's sorting) has to see it too.
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['today'] })])
    },
    archive: async (id: string) => {
      await apiFetch(`/api/dump/${id}/archive`, { method: 'POST' })
      await refresh()
    },
  }
}

/** Draft, busy state and the one error line both the page and the quick capture need. */
export function useDumpSubmit() {
  const { t } = useTranslation('dump')
  const actions = useDumpActions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (text: string): Promise<boolean> => {
    const trimmed = text.trim()
    if (!trimmed) return false

    setBusy(true)
    setError(null)
    try {
      await actions.add(trimmed)
      return true
    } catch (failure) {
      const tooLong = failure instanceof ApiError && failure.status === 400
      setError(t(tooLong ? 'errors.tooLong' : 'errors.generic'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { submit, busy, error }
}
