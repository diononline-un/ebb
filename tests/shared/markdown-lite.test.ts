import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../src/shared/markdown-lite.ts'

describe('parseMarkdown', () => {
  it('parses headings one to three', () => {
    expect(parseMarkdown('# One\n\n## Two\n\n### Three')).toEqual([
      { type: 'heading', level: 1, inlines: [{ type: 'text', text: 'One' }] },
      { type: 'heading', level: 2, inlines: [{ type: 'text', text: 'Two' }] },
      { type: 'heading', level: 3, inlines: [{ type: 'text', text: 'Three' }] },
    ])
  })

  it('joins wrapped paragraph lines and splits at blank lines', () => {
    expect(parseMarkdown('First line\ncontinues here.\n\nSecond paragraph.')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: 'First line continues here.' }] },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Second paragraph.' }] },
    ])
  })

  it('parses a dash list', () => {
    expect(parseMarkdown('- one\n- two')).toEqual([
      {
        type: 'list',
        items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]],
      },
    ])
  })

  it('parses bold', () => {
    expect(parseMarkdown('This is **strong** text').at(0)).toEqual({
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'This is ' },
        { type: 'strong', text: 'strong' },
        { type: 'text', text: ' text' },
      ],
    })
  })

  it.each(['https://example.com/terms', 'mailto:hello@example.com', '/settings'])(
    'keeps %s as a link',
    (href) => {
      expect(parseMarkdown(`[label](${href})`)).toEqual([
        { type: 'paragraph', inlines: [{ type: 'link', text: 'label', href }] },
      ])
    },
  )

  it.each(['javascript:alert(1)', '//evil.example', 'relative/path'])('turns %s into text', (href) => {
    expect(parseMarkdown(`[label](${href})`)).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: `[label](${href})` }] },
    ])
  })

  it('keeps HTML as text', () => {
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: '<script>alert(1)</script>' }] },
    ])
  })

  it('drops an HTML comment at the start of the file', () => {
    expect(parseMarkdown('<!-- draft, not legal advice -->\n\n# Imprint')).toEqual([
      { type: 'heading', level: 1, inlines: [{ type: 'text', text: 'Imprint' }] },
    ])
  })
})
