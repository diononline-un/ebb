/// <reference types="vite/client" />
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import metaJson from '../../../locales/.meta.json'

type JsonModule = { default: Record<string, unknown> }
type Meta = Record<string, { reviewed?: boolean }>

// Machine translations stay invisible until a native speaker has reviewed them (E10-P1): only a
// language marked `reviewed: true` in locales/.meta.json is offered, so a half-checked translation
// can never reach a person. Flipping the flag is a manual decision (E10-P2).
const RELEASED = Object.entries(metaJson as Meta)
  .filter(([, entry]) => entry.reviewed === true)
  .map(([language]) => language)

const SUPPORTED: string[] = ['en', ...RELEASED]

// The pseudo locale (scripts/pseudo-locale.ts) is a layout aid for development and never ships.
const PSEUDO = 'en-XA'

const modules = import.meta.glob<JsonModule>('../../../locales/*/*.json', { eager: true })

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
const namespaces = new Set<string>()

for (const [path, module] of Object.entries(modules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
  const language = match?.[1]
  const namespace = match?.[2]
  if (!language || !namespace) continue
  if (language === PSEUDO ? !import.meta.env.DEV : !SUPPORTED.includes(language)) continue
  namespaces.add(namespace)
  const forLanguage = resources[language] ?? {}
  forLanguage[namespace] = module.default
  resources[language] = forLanguage
}

// Only after the files exist does en-XA count as a language a developer can switch to.
if (import.meta.env.DEV && resources[PSEUDO]) SUPPORTED.push(PSEUDO)

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
