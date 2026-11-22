import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { TriageAnswer } from '../../../shared/triage.ts'
import { ApiError } from '../../lib/api.ts'
import { triageTask, usePatchTask, useToday } from '../tasks/api.ts'
import { TriageFlow } from './TriageFlow.tsx'

const TODAY_KEY = ['today'] as const

/** Route page: loads the day, sends the answers, and hands the flow its callbacks. */
export function TriagePage() {
  const { t } = useTranslation('triage')
  const query = useToday()
  const queryClient = useQueryClient()
  const patchTask = usePatchTask()
  const router = useRouter()

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  const view = query.data

  const onTriage = async (id: string, answer: TriageAnswer) => {
    await triageTask(id, answer)
    await queryClient.invalidateQueries({ queryKey: TODAY_KEY })
  }

  const onChooseAnchor = async (id: string, replace: boolean): Promise<'ok' | 'conflict'> => {
    const patch = replace ? { anchor: true, replaceAnchor: true } : { anchor: true }
    try {
      await patchTask.mutateAsync({ id, patch })
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && error.code === 'anchor_exists') return 'conflict'
      throw error
    }
  }

  const onDone = () => {
    void router.navigate({ to: '/today' })
  }

  return <TriageFlow view={view} onTriage={onTriage} onChooseAnchor={onChooseAnchor} onDone={onDone} />
}
