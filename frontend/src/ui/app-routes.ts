/** Losse editor (PLG-native). Canonieke URL; `/FML-editor` redirect hierheen. */
export const EDITOR_PATH = '/editor'

/** Legacy bookmarks / oude links. */
export const EDITOR_PATH_LEGACY = '/FML-editor'

/** Extern Go2Scan-dashboard (andere host; nieuwe tab). */
export const DASHBOARD_URL = 'https://dashboard.go2scan.nl/projects'

export type AppShellView = 'workspace' | 'settings' | 'editor'

export function viewFromPathname(pathname: string): Exclude<AppShellView, 'settings'> {
  return isEditorPath(pathname) ? 'editor' : 'workspace'
}

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

export function isEditorPath(pathname: string): boolean {
  const n = normalizePathname(pathname).toLowerCase()
  return n === EDITOR_PATH || n === EDITOR_PATH_LEGACY.toLowerCase()
}

/** Zet `/FML-editor`, `/fml-editor/` e.d. om naar `/editor`. */
export function syncEditorCanonicalPath(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  historyApi: Pick<History, 'replaceState' | 'state'> = history,
): void {
  if (!isEditorPath(location.pathname)) return
  const current = `${location.pathname}${location.search}${location.hash}`
  const next = `${EDITOR_PATH}${location.search}${location.hash}`
  if (current !== next) {
    historyApi.replaceState(historyApi.state, '', next)
  }
}
