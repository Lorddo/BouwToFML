import { describe, expect, it, vi } from 'vitest'
import {
  FML_EDITOR_PATH,
  isFmlEditorPath,
  normalizePathname,
  syncFmlEditorCanonicalPath,
} from '@/ui/app-routes'

describe('app-routes', () => {
  it('normalizes trailing slashes', () => {
    expect(normalizePathname('/')).toBe('/')
    expect(normalizePathname('/FML-editor/')).toBe('/FML-editor')
    expect(normalizePathname('/FML-editor')).toBe('/FML-editor')
  })

  it('matches the FML editor path case-insensitively', () => {
    expect(isFmlEditorPath('/FML-editor')).toBe(true)
    expect(isFmlEditorPath('/fml-editor/')).toBe(true)
    expect(isFmlEditorPath('/')).toBe(false)
    expect(isFmlEditorPath('/settings')).toBe(false)
  })

  it('rewrites aliases to the canonical editor path', () => {
    const replaceState = vi.fn()
    syncFmlEditorCanonicalPath(
      { pathname: '/fml-editor/', search: '?x=1', hash: '#a' },
      { replaceState, state: null },
    )
    expect(replaceState).toHaveBeenCalledWith(null, '', `${FML_EDITOR_PATH}?x=1#a`)
  })

  it('leaves the canonical editor path alone', () => {
    const replaceState = vi.fn()
    syncFmlEditorCanonicalPath(
      { pathname: FML_EDITOR_PATH, search: '', hash: '' },
      { replaceState, state: null },
    )
    expect(replaceState).not.toHaveBeenCalled()
  })
})
