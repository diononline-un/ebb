import i18n from 'i18next'
import { describe, expect, it } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'

describe('i18n resources', () => {
  it('ships only English while no other language is reviewed', async () => {
    await i18nReady

    expect(Object.keys(i18n.options.resources ?? {})).toEqual(['en'])
    expect(i18n.t('common:app.name')).toBe('ebbe')
  })
})
