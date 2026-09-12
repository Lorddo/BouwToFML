/** Losse editor (PLG-native). Pad is legacy; niet hernoemen zonder redirect. */
export const FML_EDITOR_PATH = '/FML-editor'

/** Extern Go2Scan-dashboard (andere host; nieuwe tab). */
export const DASHBOARD_URL = 'https://dashboard.go2scan.nl/projects'

export type AppShellView = 'workspace' | 'settings' | 'fml-viewer'

export function viewFromPathname(pathname: string): Exclude<AppShellView, 'settings'> {
  return isFmlEditorPath(pathname) ? 'fml-viewer' : 'workspace'
}

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

export function isFmlEditorPath(pathname: string): boolean {
  return normalizePathname(pathname).toLowerCase() === FML_EDITOR_PATH.toLowerCase()
}

/** Zet `/fml-editor/` e.d. om naar het canonieke pad. */
export function syncFmlEditorCanonicalPath(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  historyApi: Pick<History, 'replaceState' | 'state'> = history,
): void {
  if (!isFmlEditorPath(location.pathname)) return
  const current = `${location.pathname}${location.search}${location.hash}`
  const next = `${FML_EDITOR_PATH}${location.search}${location.hash}`
  if (current !== next) {
    historyApi.replaceState(historyApi.state, '', next)
  }
}
