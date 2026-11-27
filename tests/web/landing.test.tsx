// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '../../src/web/features/landing/LandingPage.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// The landing page stands alone, and the test has no router above it: a plain anchor keeps the
// links checkable without building a router for a page that only links out.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: { doc?: string }; children?: ReactNode }) => (
    <a href={params?.doc ? to.replace('$doc', params.doc) : to}>{children}</a>
  ),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(cleanup)

const copy = JSON.parse(readFileSync(join(process.cwd(), 'locales/en/landing.json'), 'utf8')) as Record<string, unknown>

function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (typeof value === 'object' && value !== null) for (const inner of Object.values(value)) texts(inner, out)
  return out
}

describe('LandingPage', () => {
  it('has exactly one h1', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })

  it('sends the primary call to action to sign-up', () => {
    const { getByRole } = render(<LandingPage />)
    expect(getByRole('link', { name: 'Start 7 days free' }).getAttribute('href')).toBe('/sign-up')
  })

  it('links the three legal documents', () => {
    const { getByRole } = render(<LandingPage />)
    expect(getByRole('link', { name: 'Imprint' }).getAttribute('href')).toBe('/legal/imprint')
    expect(getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/legal/privacy')
    expect(getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/legal/terms')
  })
})

describe('landing copy', () => {
  const lines = texts(copy)

  it.each(lines)('keeps "%s" calm and free of exclamation marks', (line) => {
    // DESIGN §9: no exclamation marks, and the forbidden words never appear in UI text.
    const forbidden = [
      'overdue',
      'late',
      'failed',
      'missed',
      'lazy',
      'streak',
      'behind',
      'crush',
      'hustle',
      'boost',
      'supercharge',
      'unlock',
      'seamless',
      'magic',
      'productivity hack',
      'babe',
    ]
    expect(line).not.toContain('!')
    for (const word of forbidden) {
      expect(line.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`))
    }
  })

  it('asks the sorting question word for word', () => {
    expect(lines.some((line) => line.includes('What breaks if this waits until tomorrow?'))).toBe(true)
  })
})
