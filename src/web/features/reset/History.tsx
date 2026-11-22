import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from '../../../shared/day.ts'
import { formatDay, useResetHistory } from './api.ts'

/**
 * The weeks before this one (PRD F12, E6-P4): one line each, the answers open on a tap. No chart and
 * no figure beyond the date, so a week can be read without being scored.
 */
export function History() {
  const { t, i18n } = useTranslation('reset')
  const query = useResetHistory()
  const [open, setOpen] = useState<string | null>(null)

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('history.loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('history.loadError')}</p>
  }

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-title">{t('history.title')}</h1>

      {query.data.length === 0 ? (
        <p className="max-w-[65ch] text-body text-ink-2">{t('history.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {query.data.map((week) => {
            const expanded = open === week.weekStart
            // The week ends on the reset day, so the last day names it better than its first.
            const resetDay = formatDay(addDays(week.weekStart, 6), i18n.language)
            const answers = [
              { question: t('review.wentWell'), text: week.wentWell },
              { question: t('review.wentBadly'), text: week.wentBadly },
              { question: t('review.change'), text: week.change },
            ].filter((answer) => answer.text.trim() !== '')

            return (
              <li key={week.weekStart} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  className="flex min-h-13 w-full items-center justify-between gap-3 py-2 text-left motion-quick hover:text-ink-2"
                  onClick={() => setOpen(expanded ? null : week.weekStart)}
                >
                  <span className="min-w-0 text-body break-words text-ink">{resetDay}</span>
                  <span className="shrink-0 text-meta text-ink-3">
                    {week.completedAt === null ? t('history.open') : t('history.done')}
                  </span>
                </button>

                {expanded ? (
                  <div className="flex flex-col gap-4 pb-4">
                    {answers.length === 0 ? (
                      <p className="max-w-[65ch] text-body text-ink-2">{t('done.empty')}</p>
                    ) : null}

                    {answers.map((answer) => (
                      <div key={answer.question} className="flex flex-col gap-1">
                        <h2 className="text-small text-ink-2">{answer.question}</h2>
                        <p className="max-w-[65ch] text-body whitespace-pre-wrap text-ink">{answer.text}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
