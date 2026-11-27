// Checks whether a translation still covers its English source (E10-P1). Pure: the caller hands in
// flattened maps ("ns:a.b" → text), so the CLI check and the unit test run the same code.

export type LocaleComparison = {
  /** Keys of the English source that the translation lacks. */
  missing: string[]
  /** Keys the translation has but the English source does not. */
  extra: string[]
  /** Keys present in both whose `{{placeholder}}` set differs. */
  placeholderMismatch: string[]
}

/** i18next plural suffixes; a key that ends in one of these has several forms. */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other']

const PLACEHOLDER = /\{\{[^{}]*\}\}/g

/** Every `{{name}}` in the text, sorted. A swapped order is no defect, a lost placeholder is. */
export function placeholdersOf(text: string): string[] {
  return (text.match(PLACEHOLDER) ?? []).map((placeholder) => placeholder.slice(2, -2).trim()).sort()
}

/** The key without its plural suffix, or null when it carries none. */
export function pluralBase(key: string): string | null {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(`_${suffix}`)) return key.slice(0, -(suffix.length + 1))
  }
  return null
}

/** Plural bases of a flat map, so "has any form of this base" stays a set lookup. */
function pluralBases(flat: Record<string, string>): Set<string> {
  const bases = new Set<string>()
  for (const key of Object.keys(flat)) {
    const base = pluralBase(key)
    if (base !== null) bases.add(base)
  }
  return bases
}

/**
 * A key counts as covered when the target has it or, for a plural key, any plural form of the same
 * base. Japanese and Chinese only have `_other`, so `_one`/`_other` in English is fine.
 */
function covers(target: Record<string, string>, base: Set<string>, key: string): boolean {
  if (Object.hasOwn(target, key)) return true
  const plural = pluralBase(key)
  return plural !== null && base.has(plural)
}

export function compareLocale(en: Record<string, string>, other: Record<string, string>): LocaleComparison {
  const enBases = pluralBases(en)
  const otherBases = pluralBases(other)
  const missing: string[] = []
  const extra: string[] = []
  const placeholderMismatch: string[] = []

  for (const [key, text] of Object.entries(en)) {
    if (!covers(other, otherBases, key)) {
      missing.push(key)
      continue
    }
    // Only the identical key shares a text: another plural form of the same base is not a copy.
    if (!Object.hasOwn(other, key)) continue
    const translated = other[key]
    if (translated === undefined) continue
    if (placeholdersOf(text).join() !== placeholdersOf(translated).join()) placeholderMismatch.push(key)
  }

  for (const key of Object.keys(other)) {
    if (!covers(en, enBases, key)) extra.push(key)
  }

  return { missing: missing.sort(), extra: extra.sort(), placeholderMismatch: placeholderMismatch.sort() }
}
