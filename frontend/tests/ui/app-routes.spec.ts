import { describe, expect, it, vi } from 'vitest'
import {
  DASHBOARD_URL,
  EDITOR_PATH,
  EDITOR_PATH_LEGACY,
  isEditorPath,
  normalizePathname,
  syncEditorCanonicalPath,
  viewFromPathname,
} from '@/ui/app-routes'

describe('app-routes', () => {
  it('normalizes trailing slashes', () => {
    expect(normalizePathname('/')).toBe('/')
    expect(normalizePathname('/editor/')).toBe('/editor')
    expect(normalizePathname('/editor')).toBe('/editor')
    expect(normalizePathname('/FML-editor/')).toBe('/FML-editor')
  })

  it('matches the editor path and legacy aliases case-insensitively', () => {
    expect(isEditorPath('/editor')).toBe(true)
    expect(isEditorPath('/editor/')).toBe(true)
    expect(isEditorPath('/FML-editor')).toBe(true)
    expect(isEditorPath('/fml-editor/')).toBe(true)
    expect(isEditorPath('/')).toBe(false)
    expect(isEditorPath('/settings')).toBe(false)
  })

  it('maps pathnames to shell views', () => {
    expect(viewFromPathname('/')).toBe('workspace')
    expect(viewFromPathname('/editor')).toBe('editor')
    expect(viewFromPathname('/FML-editor')).toBe('editor')
    expect(viewFromPathname('/fml-editor/')).toBe('editor')
    expect(viewFromPathname('/settings')).toBe('workspace')
  })

  it('keeps the dashboard on the Go2Scan host', () => {
    expect(DASHBOARD_URL).toBe('https://dashboard.go2scan.nl/projects')
  })

  it('rewrites aliases to the canonical editor path', () => {
    const replaceState = vi.fn()
    syncEditorCanonicalPath(
      { pathname: '/fml-editor/', search: '?x=1', hash: '#a' },
      { replaceState, state: null },
    )
    expect(replaceState).toHaveBeenCalledWith(null, '', `${EDITOR_PATH}?x=1#a`)
  })

  it('rewrites the legacy canonical path to /editor', () => {
    const replaceState = vi.fn()
    syncEditorCanonicalPath(
      { pathname: EDITOR_PATH_LEGACY, search: '', hash: '' },
      { replaceState, state: null },
    )
    expect(replaceState).toHaveBeenCalledWith(null, '', EDITOR_PATH)
  })

  it('leaves the canonical editor path alone', () => {
    const replaceState = vi.fn()
    syncEditorCanonicalPath(
      { pathname: EDITOR_PATH, search: '', hash: '' },
      { replaceState, state: null },
    )
    expect(replaceState).not.toHaveBeenCalled()
  })
})
