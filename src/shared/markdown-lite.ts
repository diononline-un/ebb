// The legal pages ship plain Markdown. This parser covers exactly what those pages use: headings
// (#, ##, ###), paragraphs, dash lists, **bold** and [text](url). It never builds HTML, because the
// caller renders blocks as React elements; a "<script>" in the source therefore stays text.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; text: string; href: string }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: Inline[][] }

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]*)\)/
const HEADING = /^(#{1,3})\s+(.*)$/
const LIST_ITEM = /^-\s+(.*)$/

/** https, mailto and app paths are clickable; protocol-relative //host and every other scheme are not. */
function isAllowedHref(href: string): boolean {
  return /^https:/i.test(href) || /^mailto:/i.test(href) || (href.startsWith('/') && !href.startsWith('//'))
}

function pushText(inlines: Inline[], text: string): void {
  const last = inlines.at(-1)
  if (last?.type === 'text') last.text += text
  else if (text !== '') inlines.push({ type: 'text', text })
}

function parseInline(text: string): Inline[] {
  const inlines: Inline[] = []
  let rest = text
  for (;;) {
    const match = INLINE.exec(rest)
    if (!match) {
      pushText(inlines, rest)
      return inlines
    }
    pushText(inlines, rest.slice(0, match.index))
    const strong = match[1]
    const label = match[2]
    const href = match[3]
    if (strong !== undefined) {
      inlines.push({ type: 'strong', text: strong })
    } else if (label !== undefined && href !== undefined && isAllowedHref(href)) {
      inlines.push({ type: 'link', text: label, href })
    } else {
      // A refused link is not silently dropped either: the Markdown stays visible as plain text.
      pushText(inlines, match[0])
    }
    rest = rest.slice(match.index + match[0].length)
  }
}

/** The draft note sits in an HTML comment at the top of every file; it is not page content. */
function stripLeadingComments(src: string): string {
  let out = src.replace(/\r\n?/g, '\n')
  for (;;) {
    const comment = /^\s*<!--[\s\S]*?-->/.exec(out)
    if (!comment) break
    out = out.slice(comment[0].length)
  }
  return out.replace(/^\s+/, '')
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let items: Inline[][] | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) })
    paragraph = []
  }
  const flushList = (): void => {
    if (items === null) return
    blocks.push({ type: 'list', items })
    items = null
  }
  const flush = (): void => {
    flushParagraph()
    flushList()
  }

  for (const raw of stripLeadingComments(src).split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      const hashes = heading[1] ?? ''
      blocks.push({
        type: 'heading',
        level: hashes.length as 1 | 2 | 3,
        inlines: parseInline((heading[2] ?? '').trim()),
      })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      flushParagraph()
      items ??= []
      items.push(parseInline((item[1] ?? '').trim()))
      continue
    }
    flushList()
    paragraph.push(line)
  }

  flush()
  return blocks
}
