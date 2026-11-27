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

// English is the fallback and has to answer the first paint, so it stays in the entry chunk.
const eager = import.meta.glob<JsonModule>('../../../locales/en/*.json', { eager: true })
// Every other language becomes its own lazy chunk: it downloads only when it is chosen.
const lazy = import.meta.glob<JsonModule>('../../../locales/*/*.json', { eager: false })

function split(path: string): { language: string; namespace: string } | null {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
  if (!match?.[1] || !match[2]) return null
  return { language: match[1], namespace: match[2] }
}

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
const namespaces = new Set<string>()

for (const [path, module] of Object.entries(eager)) {
  const parts = split(path)
  if (!parts) continue
  namespaces.add(parts.namespace)
  const forLanguage = resources[parts.language] ?? {}
  forLanguage[parts.namespace] = module.default
  resources[parts.language] = forLanguage
}

const loaders: Record<string, Record<string, () => Promise<JsonModule>>> = {}

for (const [path, load] of Object.entries(lazy)) {
  const parts = split(path)
  if (!parts) continue
  if (parts.language === PSEUDO ? !import.meta.env.DEV : !RELEASED.includes(parts.language)) continue
  const forLanguage = loaders[parts.language] ?? {}
  forLanguage[parts.namespace] = load
  loaders[parts.language] = forLanguage
}

// Only after the files exist does en-XA count as a language a developer can switch to.
if (import.meta.env.DEV && loaders[PSEUDO]) SUPPORTED.push(PSEUDO)

async function bundlesOf(language: string): Promise<Record<string, Record<string, unknown>>> {
  const forLanguage = loaders[language]
  if (!forLanguage) return {}
  const bundles: Record<string, Record<string, unknown>> = {}
  await Promise.all(
    Object.entries(forLanguage).map(async ([namespace, load]) => {
      bundles[namespace] = (await load()).default
    }),
  )
  return bundles
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

const startLanguage = detectLanguage()

export const i18nReady = bundlesOf(startLanguage)
  .then((bundles) => {
    resources[startLanguage] = { ...resources[startLanguage], ...bundles }
    return i18n.use(initReactI18next).init({
      lng: startLanguage,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: namespaces.size > 0 ? [...namespaces] : ['common'],
      resources,
      interpolation: { escapeValue: false },
      returnNull: false,
    })
  })
  .then((t) => {
    // A switch to a released language fetches its chunks then; the entry chunk never carries them.
    i18n.on('languageChanged', (language) => {
      void bundlesOf(language).then((bundles) => {
        for (const [namespace, bundle] of Object.entries(bundles)) {
          i18n.addResourceBundle(language, namespace, bundle, true, true)
        }
      })
    })
    return t
  })
