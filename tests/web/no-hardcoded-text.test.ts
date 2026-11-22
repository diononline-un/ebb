import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

// Every visible string comes from locales/<lang>/<bereich>.json (AGENTS.md). The check parses each
// .tsx file with Vite's own parser instead of matching text with a regex: types, generics and arrow
// functions can stay where they belong, and only real JSX text or text attributes are reported.

const WEB_ROOT = join(process.cwd(), 'src/web')
/** Attributes whose value a person reads or hears. */
const TEXT_ATTRIBUTES = new Set(['placeholder', 'aria-label', 'title', 'alt', 'label'])
const HAS_LETTER = /\p{L}/u

type Node = { type: string; start: number; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'
}

/** A string literal or a template without expressions, as a string; anything else is null. */
function staticText(node: unknown): string | null {
  if (!isNode(node)) return null
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value']
  if (node.type === 'TemplateLiteral' && (node['expressions'] as unknown[]).length === 0) {
    return (node['quasis'] as { value: { cooked: string } }[]).map((quasi) => quasi.value.cooked).join('')
  }
  if (node.type === 'JSXExpressionContainer') return staticText(node['expression'])
  return null
}

export function findHardcodedText(source: string): string[] {
  const ast = parseAst(source, { lang: 'tsx' }) as unknown as Node
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
  const found: string[] = []
  const report = (node: Node, label: string, text: string) => {
    if (HAS_LETTER.test(text)) found.push(`line ${lineOf(node.start)}: ${label}: ${text.replace(/\s+/g, ' ').trim()}`)
  }

  const visit = (node: Node) => {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      for (const child of node['children'] as Node[]) {
        if (child.type === 'JSXText') report(child, 'jsx text', String(child['value']))
        const text = child.type === 'JSXExpressionContainer' ? staticText(child) : null
        if (text !== null) report(child, 'string child', text)
      }
    }
    if (node.type === 'JSXAttribute') {
      const name = node['name'] as Node
      const attribute = typeof name['name'] === 'string' ? name['name'] : ''
      const text = TEXT_ATTRIBUTES.has(attribute) ? staticText(node['value']) : null
      if (text !== null) report(node, `literal ${attribute}`, text)
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.filter(isNode).forEach(visit)
      else if (isNode(value)) visit(value)
    }
  }

  visit(ast)
  return found
}

function jsxFiles(): string[] {
  return readdirSync(WEB_ROOT, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => join(WEB_ROOT, entry))
    .sort()
}

const files = jsxFiles()

describe('no hardcoded UI text', () => {
  it('finds a plausible number of tsx files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('ignores types, generics and arrow functions', () => {
    const source = `
      type Props = { onSave: (id: string) => Promise<void>; items: Array<Map<string, number>> }
      export function A({ onSave }: Props) {
        return <input onChange={(event) => onSave(event.target.value)} aria-label={t('save')} className="px-4" />
      }`
    expect(findHardcodedText(source)).toEqual([])
  })

  it('reports text nodes, string children and literal text attributes', () => {
    const source = `export const B = () => <p title="Hint">Hello {'there'} <input placeholder={\`Name\`} /></p>`
    expect(findHardcodedText(source)).toHaveLength(4)
  })

  it.each(files)('%s', (file) => {
    expect(findHardcodedText(readFileSync(file, 'utf8'))).toEqual([])
  })
})
