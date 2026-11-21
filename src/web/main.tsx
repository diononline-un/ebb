import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import '@fontsource-variable/atkinson-hyperlegible-next/index.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/index.css'
import './styles.css'
import { i18nReady } from './lib/i18n.ts'
import { router } from './router.tsx'

const queryClient = new QueryClient()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element')

const root = createRoot(rootElement)

void i18nReady.then(() => {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
