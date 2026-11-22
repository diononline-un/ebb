import { useTranslation } from 'react-i18next'

/** Shown while the dump is empty: a few quiet questions, no illustration (DESIGN §8). */
export function DumpPrompts() {
  const { t } = useTranslation('dump')

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[65ch] text-body text-ink-2">{t('prompts.title')}</p>
      <ul className="flex max-w-[65ch] flex-col gap-2 text-small text-ink-3">
        <li>{t('prompts.prompt1')}</li>
        <li>{t('prompts.prompt2')}</li>
        <li>{t('prompts.prompt3')}</li>
      </ul>
    </div>
  )
}
