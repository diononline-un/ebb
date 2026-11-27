import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareLocale, staleKeys } from '../src/shared/locale-check.ts'

// Gate for the translations E10-P2 produces (E10-P1): every language besides English must cover the
// English keys, keep their placeholders, and still match the English text its hashes were taken
// from. Machine translations stay invisible until reviewed (src/web/lib/i18n.ts), so this check is
// what a reviewer runs before flipping `reviewed`.
//
//   node scripts/check-locales.ts                 # findings, exit 1 if there are any
//   node scripts/check-locales.ts --write-meta de # record the current English hashes of `de`

const LOCALES = join(import.meta.dirname, '..', 'locales')
const META_FILE = join(LOCALES, '.meta.json')
/** English is the source; en-XA is the generated pseudo locale from scripts/pseudo-locale.ts. */
const SKIPPED = new Set(['en', 'en-XA'])
const SUFFIX = '.json'

type Meta = Record<string, { reviewed?: boolean; machine?: boolean; source?: Record<string, string> }>

function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const path = `${prefix}${key}`
    if (typeof inner === 'object' && inner !== null) flatten(inner, `${path}.`, out)
    else out[path] = String(inner)
  }
}

/** Flat map "ns:a.b" → text, the shape compareLocale expects. */
function readLocale(language: string): Record<string, string> {
  const directory = join(LOCALES, language)
  const flat: Record<string, string> = {}
  for (const file of readdirSync(directory).filter((name) => name.endsWith(SUFFIX)).sort()) {
    const namespace = file.slice(0, -SUFFIX.length)
    flatten(JSON.parse(readFileSync(join(directory, file), 'utf8')), `${namespace}:`, flat)
  }
  return flat
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function readMeta(): Meta {
  return JSON.parse(readFileSync(META_FILE, 'utf8')) as Meta
}

function writeMeta(language: string): void {
  const meta = readMeta()
  const source: Record<string, string> = {}
  for (const [key, text] of Object.entries(readLocale('en'))) source[key] = sha256(text)
  // New hashes mean new source texts and therefore a new translation: the language goes back to
  // invisible until a native speaker reviews it and sets `reviewed` by hand
  // (src/web/lib/i18n.ts only offers reviewed languages).
  meta[language] = { reviewed: false, machine: true, source }
  writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`)
}

const argv = process.argv.slice(2)

if (argv[0] === '--write-meta') {
  const language = argv[1]
  if (!language) {
    console.error('usage: node scripts/check-locales.ts --write-meta <lang>')
    process.exit(1)
  }
  writeMeta(language)
  process.exit(0)
}

const en = readLocale('en')
const meta = readMeta()
const languages = readdirSync(LOCALES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !SKIPPED.has(entry.name))
  .map((entry) => entry.name)
  .sort()

if (languages.length === 0) {
  console.log('no locales besides en')
  process.exit(0)
}

let findings = 0
const report = (language: string, key: string, problem: string) => {
  console.log(`${language} ${key}: ${problem}`)
  findings += 1
}

for (const language of languages) {
  const other = readLocale(language)
  const comparison = compareLocale(en, other)
  for (const key of comparison.missing) report(language, key, 'missing')
  for (const key of comparison.extra) report(language, key, 'extra, not in en')
  for (const key of comparison.placeholderMismatch) report(language, key, 'placeholders differ from en')
  // A changed English text invalidates the translation made from the old one, a vanished key too.
  // A key without a recorded hash is no hash finding: `--write-meta` records them in one go, and
  // compareLocale already calls such a key missing in every language that lacks it.
  const source = meta[language]?.source ?? {}
  for (const key of staleKeys(en, source, sha256)) {
    if (en[key] === undefined) report(language, key, 'outdated, gone from en')
    else if (Object.hasOwn(source, key)) report(language, key, 'outdated, en text changed')
  }
}

process.exit(findings === 0 ? 0 : 1)
