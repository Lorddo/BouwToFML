import { describe, expect, it } from 'vitest'
import {
  isFmlOneshotDrawTool,
  isFmlToolbarSettingsOpen,
} from '@/ui/components/canvas/fmlToolbeltItems'

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
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'nulpunt' })).toBe(false)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'box_select' })).toBe(false)
  })

  it('is aan bij maatlijn-tool (mode-dropdown), ook zonder tape-lijnen', () => {
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'measure' })).toBe(true)
    expect(
      isFmlToolbarSettingsOpen({ ...none, activeTool: 'measure', hasMeasureLines: true }),
    ).toBe(true)
    expect(
      isFmlToolbarSettingsOpen({ ...none, activeTool: 'nulpunt', hasMeasureLines: true }),
    ).toBe(false)
  })

  it('is aan bij selectie of muur/deur/raam-tool', () => {
    expect(isFmlToolbarSettingsOpen({ ...none, hasWallSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasJunctionSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasOpeningSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasAreaSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasLabelSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasLineSelection: true })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_wall' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_line' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_label' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'draw_surface' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'add_window' })).toBe(true)
    expect(isFmlToolbarSettingsOpen({ ...none, hasItemSelection: true })).toBe(true)
  })

  it('houdt de fixture-bibliotheek buiten de midden-settingskaart', () => {
    expect(isFmlToolbarSettingsOpen({ ...none, activeTool: 'add_fixture' })).toBe(false)
  })
})

describe('isFmlOneshotDrawTool', () => {
  it('is aan voor teken- en plaats-tools, uit voor select/maat', () => {
    expect(isFmlOneshotDrawTool('draw_wall')).toBe(true)
    expect(isFmlOneshotDrawTool('draw_room')).toBe(true)
    expect(isFmlOneshotDrawTool('draw_line')).toBe(true)
    expect(isFmlOneshotDrawTool('add_door')).toBe(true)
    expect(isFmlOneshotDrawTool('measure')).toBe(false)
    expect(isFmlOneshotDrawTool('nulpunt')).toBe(false)
    expect(isFmlOneshotDrawTool('box_select')).toBe(false)
    expect(isFmlOneshotDrawTool(null)).toBe(false)
  })
})
