import { tGlobal } from '@/ui/i18n'

function translated(key: string): string | null {
  const value = tGlobal(key)
  return value && value !== key ? value : null
}

/** Catalogus-`label` blijft NL (FML); UI toont de locale. */
export function fixtureDisplayLabel(kind: string, fallback?: string): string {
  return (
    translated(`catalog.fixtures.${kind}`) ??
    fallback?.trim() ??
    translated('catalog.fixtures.generic') ??
    kind
  )
}

export function fixtureCategoryLabel(category: string, fallback?: string): string {
  return (
    translated(`catalog.fixtureCategories.${category}`) ??
    fallback?.trim() ??
    translated('catalog.fixtureCategories.overig') ??
    category
  )
}

/** Eigen naam wint; catalogus-NL «Trapgat» volgt de locale. */
export function fixtureItemDisplayLabel(
  item: { name?: string | null; kind: string },
  catalogLabel?: string,
): string {
  const named = item.name?.trim()
  if (named && named !== catalogLabel) return named
  return fixtureDisplayLabel(item.kind, catalogLabel ?? named)
}

export function roomTypeDisplayName(role: number, fallback?: string): string {
  return translated(`catalog.roomTypes.${role}`) ?? fallback?.trim() ?? String(role)
}

function localizeStairwellAlias(text: string): string {
  if (text === 'Trapgat') return translated('result.toolbar.surfaceCutout') ?? text
  return text
}

/** Canvas/toolbelt: customName wint; anders roomtype via `role`. */
export function displayAreaLabelLocalized(item: {
  name?: string
  customName?: string
  role?: number
  isCutout?: boolean
}): string | null {
  const custom = item.customName?.trim()
  if (custom) return localizeStairwellAlias(custom)
  if (item.role != null) {
    const fromRole = translated(`catalog.roomTypes.${item.role}`)
    if (fromRole) return fromRole
  }
  const name = item.name?.trim()
  if (name) return localizeStairwellAlias(name)
  if (item.isCutout === true) return translated('result.toolbar.surfaceCutout')
  return null
}
