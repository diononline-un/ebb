import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Layout aid (E10-P1): en-XA is English with accented letters and 40 % longer text, so clipped
// buttons and overflowing rows show up before a single real translation exists. Generated on
// demand, never committed (.gitignore).

const LOCALES = join(import.meta.dirname, '..', 'locales')
const SOURCE = 'en'
const PSEUDO = 'en-XA'
const GROWTH = 0.4
const SUFFIX = '.json'

/** Accented stand-ins: wider than the Latin original, so text length and glyph width both grow. */
const ACCENTS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'þ',
  q: 'ɋ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
}

function accent(letter: string): string {
  const replacement = ACCENTS[letter.toLowerCase()]
  if (replacement === undefined) return letter
  return letter === letter.toUpperCase() ? replacement.toUpperCase() : replacement
}

/** `{{placeholders}}` stay untouched, otherwise every letter gets its accent. */
function pseudoText(text: string): string {
  const accented = text.replace(/\{\{[^{}]*\}\}|[A-Za-z]/g, (part) =>
    part.startsWith('{{') ? part : accent(part),
  )
  const padding = Math.max(0, Math.ceil(text.length * (1 + GROWTH)) - accented.length)
  return `[${accented}${'~'.repeat(padding)}]`
}

/** Same shape and keys, so plural keys keep their `_one`/`_other` suffixes. */
function pseudo(value: unknown): unknown {
  if (typeof value === 'string') return pseudoText(value)
  if (Array.isArray(value)) return value.map(pseudo)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) out[key] = pseudo(inner)
    return out
  }
  return value
}

const source = join(LOCALES, SOURCE)
const target = join(LOCALES, PSEUDO)
// Start clean: a namespace removed from en must not linger in the generated locale.
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

const files = readdirSync(source).filter((name) => name.endsWith(SUFFIX)).sort()
for (const file of files) {
  const messages = JSON.parse(readFileSync(join(source, file), 'utf8')) as unknown
  writeFileSync(join(target, file), `${JSON.stringify(pseudo(messages), null, 2)}\n`)
}

console.log(`${PSEUDO}: ${files.length} namespaces written to locales/${PSEUDO}`)
