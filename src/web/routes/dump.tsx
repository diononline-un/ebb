import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DumpComposer } from '../features/dump/DumpComposer.tsx'
import { DumpList } from '../features/dump/DumpList.tsx'
import { DumpPrompts } from '../features/dump/DumpPrompts.tsx'
import { useDumpActions, useDumpLines, useDumpSubmit } from '../features/dump/api.ts'
import type { DumpEntry } from '../features/dump/types.ts'
import { useDumpQueue } from '../features/dump/useDumpQueue.ts'

export const Route = createFileRoute('/dump')({
  component: DumpPage,
})

function DumpPage() {
  const { t } = useTranslation('dump')
  const lines = useDumpLines()
  const actions = useDumpActions()
  const { submit, busy, error } = useDumpSubmit()
  const pending = useDumpQueue()

  const entries: DumpEntry[] = [
    ...(lines.data ?? []).map((line) => ({
      id: line.id,
      text: line.text,
      taskId: line.taskId,
      pending: false,
    })),
    // Thoughts still waiting for a connection are shown right away, in their order.
    ...pending.map((line) => ({ id: line.clientId, text: line.text, taskId: null, pending: true })),
  ]

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-title">{t('title')}</h1>

      {pending.length > 0 ? (
        <p className="text-small text-ink-2">{t('pending', { count: pending.length })}</p>
      ) : null}

      <div className="flex flex-col gap-6 rounded-card bg-surface-sunken p-4">
        {entries.length === 0 ? (
          <DumpPrompts />
        ) : (
          <DumpList entries={entries} onToTask={actions.toTask} onArchive={actions.archive} />
        )}
        <DumpComposer onSubmit={submit} busy={busy} error={error} />
      </div>
    </section>
  )
}
