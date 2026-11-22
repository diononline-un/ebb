import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/Tabs.tsx'
import { PLAN_VIEWS, type ListView } from './api.ts'
import { PlanList } from './PlanList.tsx'

/** The slow lane of the app: everything that is not today, grouped by day where it makes sense. */
export function PlanPage() {
  const { t } = useTranslation('plan')
  const [view, setView] = useState<ListView>('inbox')

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-title">{t('title')}</h1>
      <Tabs value={view} onValueChange={(next) => setView(next as ListView)}>
        <TabsList aria-label={t('tabsLabel')}>
          {PLAN_VIEWS.map((entry) => (
            <TabsTrigger key={entry} value={entry}>
              {t(`tabs.${entry}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {PLAN_VIEWS.map((entry) => (
          <TabsContent key={entry} value={entry}>
            <PlanList view={entry} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
