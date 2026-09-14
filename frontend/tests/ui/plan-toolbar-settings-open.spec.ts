import { describe, expect, it } from 'vitest'
import {
  isPlanOneshotDrawTool,
  isPlanToolbarSettingsOpen,
} from '@/ui/components/canvas/planToolbeltItems'

describe('isPlanToolbarSettingsOpen', () => {
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
    expect(isPlanToolbarSettingsOpen(none)).toBe(false)
  })

  it('is aan bij nulpunt (X om uit te zetten), zoals maatlijn', () => {
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'nulpunt' })).toBe(true)
  })

  it('is aan bij box-select (type-dropdown), zoals maatlijn', () => {
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'box_select' })).toBe(true)
  })

  it('is aan bij maatlijn-tool (mode-dropdown), ook zonder tape-lijnen', () => {
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'measure' })).toBe(true)
    expect(
      isPlanToolbarSettingsOpen({ ...none, activeTool: 'measure', hasMeasureLines: true }),
    ).toBe(true)
    expect(
      isPlanToolbarSettingsOpen({ ...none, activeTool: 'nulpunt', hasMeasureLines: true }),
    ).toBe(true)
  })

  it('is aan bij selectie of muur/deur/raam-tool', () => {
    expect(isPlanToolbarSettingsOpen({ ...none, hasWallSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasJunctionSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasOpeningSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasAreaSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasLabelSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasLineSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_wall' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_line' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_label' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_surface' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_roof' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'draw_surface', dakMode: true })).toBe(
      true,
    )
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'add_window' })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasItemSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasDimensionSelection: true })).toBe(true)
    expect(isPlanToolbarSettingsOpen({ ...none, hasFacadeGroupSelection: true })).toBe(true)
  })

  it('houdt de fixture-bibliotheek buiten de midden-settingskaart', () => {
    expect(isPlanToolbarSettingsOpen({ ...none, activeTool: 'add_fixture' })).toBe(false)
  })
})

describe('isPlanOneshotDrawTool', () => {
  it('is aan voor teken- en plaats-tools, uit voor select/maat', () => {
    expect(isPlanOneshotDrawTool('draw_wall')).toBe(true)
    expect(isPlanOneshotDrawTool('draw_room')).toBe(true)
    expect(isPlanOneshotDrawTool('draw_roof')).toBe(true)
    expect(isPlanOneshotDrawTool('draw_line')).toBe(true)
    expect(isPlanOneshotDrawTool('add_door')).toBe(true)
    expect(isPlanOneshotDrawTool('measure')).toBe(false)
    expect(isPlanOneshotDrawTool('nulpunt')).toBe(false)
    expect(isPlanOneshotDrawTool('box_select')).toBe(false)
    expect(isPlanOneshotDrawTool(null)).toBe(false)
  })
})
