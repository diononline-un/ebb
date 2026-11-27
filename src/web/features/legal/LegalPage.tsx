import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseMarkdown, type Block, type Inline } from '../../../shared/markdown-lite.ts'

// Lazy on purpose: a visitor of /today should not download the legal texts. The glob keys keep the
// relative prefix exactly as written here.
const CONTENT = import.meta.glob<string>('../../../../content/legal/*/*.md', {
  query: '?raw',
  import: 'default',
})

const DOCS = ['imprint', 'privacy', 'terms'] as const

export type LegalDoc = (typeof DOCS)[number]

export function isLegalDoc(value: string): value is LegalDoc {
  return (DOCS as readonly string[]).includes(value)
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'text-title',
  2: 'mt-4 text-heading',
  3: 'mt-2 text-body font-medium',
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        if (inline.type === 'strong') return <strong key={index}>{inline.text}</strong>
        if (inline.type === 'link') {
          return (
            <a key={index} href={inline.href} className="underline">
              {inline.text}
            </a>
          )
        }
        return inline.text
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3'
    return (
      <Tag className={HEADING_CLASS[block.level]}>
        <Inlines inlines={block.inlines} />
      </Tag>
    )
  }
  if (block.type === 'list') {
    return (
      <ul className="list-disc pl-6">
        {block.items.map((item, index) => (
          <li key={index} className="text-body text-ink">
            <Inlines inlines={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p className="text-body text-ink">
      <Inlines inlines={block.inlines} />
    </p>
  )
}

/** One legal document, in German when the app runs in German and in English everywhere else. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { i18n } = useTranslation()
  const language = i18n.language.startsWith('de') ? 'de' : 'en'
  const [blocks, setBlocks] = useState<Block[] | null>(null)

  useEffect(() => {
    let active = true
    setBlocks(null)
    const load = CONTENT[`../../../../content/legal/${language}/${doc}.md`]
    if (!load) {
      setBlocks([])
      return
    }
    void load().then((source) => {
      if (active) setBlocks(parseMarkdown(source))
    })
    return () => {
      active = false
    }
  }, [language, doc])

  if (blocks === null) return null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-4 py-12">
      <article className="flex flex-col gap-4">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </article>
    </main>
  )
}
