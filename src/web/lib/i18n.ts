/// <reference types="vite/client" />
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

type JsonModule = { default: Record<string, unknown> }

const SUPPORTED = ['en', 'es', 'fr', 'de', 'ja', 'zh-CN']

const modules = import.meta.glob<JsonModule>('../../../locales/*/*.json', { eager: true })

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
const namespaces = new Set<string>()

for (const [path, module] of Object.entries(modules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
  const language = match?.[1]
  const namespace = match?.[2]
  if (!language || !namespace) continue
  namespaces.add(namespace)
  const forLanguage = resources[language] ?? {}
  forLanguage[namespace] = module.default
  resources[language] = forLanguage
}

// Language comes from the user's settings once E1-P5 lands; until then the browser decides.
function detectLanguage(): string {
  const candidates = typeof navigator === 'undefined' ? [] : [...navigator.languages]
  for (const candidate of candidates) {
    const exact = SUPPORTED.find((language) => language.toLowerCase() === candidate.toLowerCase())
    if (exact) return exact
    const base = candidate.split('-')[0]?.toLowerCase()
    const related = SUPPORTED.find((language) => language.toLowerCase().split('-')[0] === base)
    if (related) return related
  }
  return 'en'
}

export const i18nReady = i18n.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: namespaces.size > 0 ? [...namespaces] : ['common'],
  resources,
  interpolation: { escapeValue: false },
  returnNull: false,
})
