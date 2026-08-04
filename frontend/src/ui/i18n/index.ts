import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import nl from './locales/nl.json'
import th from './locales/th.json'

export const SUPPORTED_LOCALES = ['en', 'nl', 'th'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'en'

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function normalizeLocale(raw: unknown): AppLocale {
  return isAppLocale(raw) ? raw : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, nl, th },
})

/** Set vue-i18n locale + `<html lang>`. */
export function applyLocale(locale: AppLocale): void {
  const next = normalizeLocale(locale)
  i18n.global.locale.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
  }
}

/** Translate outside setup (composables / plain TS). */
export function tGlobal(key: string, params?: Record<string, unknown>): string {
  return String(i18n.global.t(key, params ?? {}))
}
