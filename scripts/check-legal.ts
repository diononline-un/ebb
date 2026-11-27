import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Every operator detail on the legal pages is a [[PLACEHOLDER]]. Until the operator fills them in,
// a release must fail: an imprint that ships [[OPERATOR_NAME]] is worse than a failed tag build.
// This runs only in the image job (tags v*), so normal pushes stay green.

const root = join(process.cwd(), 'content/legal')

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? markdownFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const hits: string[] = []
for (const file of markdownFiles(root)) {
  if (!file.endsWith('.md')) continue
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (line.includes('[[')) hits.push(`${relative(process.cwd(), file)}:${index + 1}`)
    })
}

if (hits.length > 0) {
  console.error(hits.join('\n'))
  process.exit(1)
}
