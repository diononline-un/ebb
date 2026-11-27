import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

// DESIGN.md still lists the app icon as "[asset needed]". This script renders the placeholder SVGs,
// so the final icon only means replacing the SVG and running `node scripts/render-icons.ts` again.
const ICON_DIR = join(import.meta.dirname, '..', 'public', 'icons')

const OUTPUTS = [
  { source: 'icon.svg', target: 'icon-192.png', size: 192 },
  { source: 'icon.svg', target: 'icon-512.png', size: 512 },
  { source: 'maskable.svg', target: 'maskable-512.png', size: 512 },
  { source: 'icon.svg', target: 'apple-touch-icon.png', size: 180 },
]

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const { source, target, size } of OUTPUTS) {
    const svg = await readFile(join(ICON_DIR, source), 'utf8')
    await page.setViewportSize({ width: size, height: size })
    // The SVG paints the full canvas, so the screenshot has no transparency; iOS shows a white
    // square for transparent icons.
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
    await page.screenshot({ path: join(ICON_DIR, target) })
    console.log(`${target}: ${size}x${size}`)
  }
} finally {
  await browser.close()
}
