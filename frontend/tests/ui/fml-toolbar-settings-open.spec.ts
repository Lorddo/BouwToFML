import { describe, expect, it } from 'vitest'
import { isFmlToolbarSettingsOpen } from '@/ui/components/canvas/fmlToolbeltItems'

describe('isFmlToolbarSettingsOpen', () => {
  const none: {
    hasWallSelection: boolean
    hasJunctionSelection: boolean
    hasOpeningSelection: boolean
    hasAreaSelection: boolean
    hasLabelSelection: boolean
    activeTool: null
  } = {
    hasWallSelection: false,
    hasJunctionSelection: false,
    hasOpeningSelection: false,
    hasAreaSelection: false,
    hasLabelSelection: false,
    activeTool: null,
  }

  it('is uit zonder selectie of teken-tool', () => {
    expect(isFmlToolbarSettingsOpen(none)).toBe(false)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'measure' })).toBe(false)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_label' })).toBe(false)
  })

  it('is aan bij selectie of muur/deur/raam-tool', () => {
    expect(isFmlToolbarSettingsOpen({ ...none, hasWallSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasJunctionSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasOpeningSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasAreaSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasLabelSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_wall' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'add_window' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasItemSelection: true })).toBe(true)
  })
})
