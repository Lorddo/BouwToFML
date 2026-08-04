import { describe, expect, it } from 'vitest'
import en from '@/ui/i18n/locales/en.json'
import nl from '@/ui/i18n/locales/nl.json'
import th from '@/ui/i18n/locales/th.json'
import { applyLocale, normalizeLocale, SUPPORTED_LOCALES, tGlobal } from '@/ui/i18n'

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return prefix ? [prefix] : []
  const record = obj as Record<string, unknown>
  const keys: string[] = []
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe('i18n locales', () => {
  const enKeys = flattenKeys(en).sort()
  const nlKeys = flattenKeys(nl).sort()
  const thKeys = flattenKeys(th).sort()

  it('nl has the same keys as en', () => {
    expect(nlKeys).toEqual(enKeys)
  })

  it('th has the same keys as en', () => {
    expect(thKeys).toEqual(enKeys)
  })

  it('normalizeLocale defaults to en', () => {
    expect(normalizeLocale(undefined)).toBe('en')
    expect(normalizeLocale('de')).toBe('en')
    expect(normalizeLocale('nl')).toBe('nl')
    expect(SUPPORTED_LOCALES).toEqual(['en', 'nl', 'th'])
  })

  it('applyLocale switches tGlobal output', () => {
    applyLocale('en')
    expect(tGlobal('app.settings')).toBe('Settings')
    applyLocale('nl')
    expect(tGlobal('app.settings')).toBe('Instellingen')
    applyLocale('th')
    expect(tGlobal('app.settings')).toBe('การตั้งค่า')
    applyLocale('en')
  })

  it('flow and settings core keys resolve in all locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      applyLocale(locale)
      expect(tGlobal('flow.previous').length).toBeGreaterThan(0)
      expect(tGlobal('settings.language').length).toBeGreaterThan(0)
      expect(tGlobal('tabs.flow.project').length).toBeGreaterThan(0)
    }
    applyLocale('en')
  })
})
