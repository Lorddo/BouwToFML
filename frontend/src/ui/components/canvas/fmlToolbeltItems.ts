import { tGlobal } from '@/ui/i18n'
import type { ToolbeltItem } from './canvas-toolbelt.types'

export type FmlToolId =
  | 'box_select'
  | 'measure'
  | 'nulpunt'
  | 'draw_wall'
  | 'draw_room'
  | 'draw_surface'
  | 'draw_label'
  | 'draw_line'
  | 'add_door'
  | 'add_window'
  | 'add_fixture'

const SETTINGS_TOOLS: ReadonlySet<FmlToolId> = new Set([
  'draw_wall',
  'draw_room',
  'draw_surface',
  'draw_label',
  'draw_line',
  'add_door',
  'add_window',
])

/** Eenmalige plaats-tools: na gebruik uit, Esc/knop stopt ook zonder startpunt. */
const ONESHOT_DRAW_TOOLS: ReadonlySet<FmlToolId> = new Set([
  'draw_wall',
  'draw_room',
  'draw_surface',
  'draw_label',
  'draw_line',
  'add_door',
  'add_window',
  'add_fixture',
])

export function isFmlOneshotDrawTool(tool: FmlToolId | null): boolean {
  return tool != null && ONESHOT_DRAW_TOOLS.has(tool)
}

/** True when the FML toolbar shows the settings strip (selection or draw/add tool). */
export function isFmlToolbarSettingsOpen(args: {
  hasWallSelection: boolean
  hasJunctionSelection: boolean
  hasOpeningSelection: boolean
  hasAreaSelection: boolean
  hasLabelSelection: boolean
  hasItemSelection?: boolean
  activeTool: FmlToolId | null
}): boolean {
  if (
    args.hasWallSelection ||
    args.hasJunctionSelection ||
    args.hasOpeningSelection ||
    args.hasAreaSelection ||
    args.hasLabelSelection ||
    args.hasItemSelection
  ) {
    return true
  }
  return args.activeTool != null && SETTINGS_TOOLS.has(args.activeTool)
}

/** Toggle in de select-rij, tussen maatlijn en nulpunt. Geen FmlToolId. */
export const FML_AREA_SIDE_DIMS_TOOL_ID = 'show_area_dims'

export function getFmlSelectTools(): ToolbeltItem[] {
  return [
    { id: 'box_select', icon: 'rect', label: tGlobal('toolbelt.fml.boxSelect') },
    { id: 'measure', icon: 'ruler', label: tGlobal('toolbelt.fml.measure') },
    {
      id: FML_AREA_SIDE_DIMS_TOOL_ID,
      icon: 'dims',
      label: tGlobal('toolbelt.fml.showAreaDims'),
      toggle: true,
    },
    { id: 'nulpunt', icon: 'origin', label: tGlobal('toolbelt.fml.nulpunt') },
  ]
}

export function getFmlDrawTools(options?: {
  includeSurface?: boolean
  includeAnnotations?: boolean
}): ToolbeltItem[] {
  const tools: ToolbeltItem[] = [
    { id: 'draw_wall', icon: 'wall', label: tGlobal('toolbelt.fml.drawWall') },
    { id: 'draw_room', icon: 'room', label: tGlobal('toolbelt.fml.drawRoom') },
  ]
  if (options?.includeSurface === true) {
    tools.push({ id: 'draw_surface', icon: 'rect', label: tGlobal('toolbelt.fml.drawSurface') })
  }
  if (options?.includeAnnotations === true) {
    tools.push(
      { id: 'draw_label', icon: 'text', label: tGlobal('toolbelt.fml.drawLabel') },
      { id: 'draw_line', icon: 'slash', label: tGlobal('toolbelt.fml.drawLine') },
    )
  }
  return tools
}

export function getFmlLibraryTools(options?: { includeFixture?: boolean }): ToolbeltItem[] {
  const tools: ToolbeltItem[] = [
    { id: 'add_door', icon: 'door', label: tGlobal('toolbelt.fml.addDoor') },
    { id: 'add_window', icon: 'window', label: tGlobal('toolbelt.fml.addWindow') },
  ]
  if (options?.includeFixture === true) {
    tools.push({ id: 'add_fixture', icon: 'grid', label: tGlobal('toolbelt.fml.addFixture') })
  }
  return tools
}

export function getFmlEditTools(options?: {
  includeSurface?: boolean
  includeAnnotations?: boolean
  includeFixture?: boolean
}): ToolbeltItem[] {
  return [...getFmlDrawTools(options), ...getFmlLibraryTools(options)]
}

/** @deprecated Prefer getFmlSelectTools() so locale updates apply. */
export const FML_SELECT_TOOLS: ToolbeltItem[] = getFmlSelectTools()

/** @deprecated Prefer getFmlEditTools() so locale updates apply. */
export const FML_EDIT_TOOLS: ToolbeltItem[] = getFmlEditTools()
