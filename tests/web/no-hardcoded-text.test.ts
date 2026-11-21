import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = join(process.cwd(), 'src/web')

// Every visible string comes from locales/<lang>/<bereich>.json (§ AGENTS.md).
// Text between a tag's ">" and the next "<". The lookbehind skips arrows (=>), whose ">" is not a tag end
// and would otherwise match across lines up to the next element.
export const JSX_TEXT = /(?<!=)>\s*[A-Za-z][^<{]*</g
const LITERAL_ATTRIBUTE = /\b(?:placeholder|aria-label)\s*=\s*"[^"]*[A-Za-z][^"]*"/g

function jsxFiles(): string[] {
  return readdirSync(WEB_ROOT, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => join(WEB_ROOT, entry))
    .sort()
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

const files = jsxFiles()

describe('no hardcoded UI text', () => {
  it('finds a plausible number of tsx files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('flags text nodes but not arrow functions in attributes', () => {
    const arrow = 'onChange={(event) => setEmail(event.target.value)}\n  />\n  <p>{t(\'x\')}</p>'
    expect([...arrow.matchAll(JSX_TEXT)]).toEqual([])
    expect([...'<p>Hello there</p>'.matchAll(JSX_TEXT)]).toHaveLength(1)
  })

  it.each(files)('%s', (file) => {
    const text = readFileSync(file, 'utf8')
    const offenders: string[] = []

    for (const [pattern, label] of [
      [JSX_TEXT, 'jsx text node'],
      [LITERAL_ATTRIBUTE, 'literal placeholder/aria-label'],
    ] as const) {
      for (const match of text.matchAll(pattern)) {
        offenders.push(`line ${lineOf(text, match.index ?? 0)}: ${label}: ${match[0].replace(/\s+/g, ' ').trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
