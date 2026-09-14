import { tGlobal } from '@/ui/i18n'
import type { ToolbeltItem } from './canvas-toolbelt.types'

export type PlanToolId =
  | 'box_select'
  | 'measure'
  | 'nulpunt'
  | 'draw_wall'
  | 'draw_room'
  | 'draw_surface'
  | 'draw_roof'
  | 'draw_label'
  | 'draw_line'
  | 'add_door'
  | 'add_window'
  | 'add_fixture'

const SETTINGS_TOOLS: ReadonlySet<PlanToolId> = new Set([
  'draw_wall',
  'draw_room',
  'draw_surface',
  'draw_roof',
  'draw_label',
  'draw_line',
  'add_door',
  'add_window',
])

/** Eenmalige plaats-tools: na gebruik uit, Esc/knop stopt ook zonder startpunt. */
const ONESHOT_DRAW_TOOLS: ReadonlySet<PlanToolId> = new Set([
  'draw_wall',
  'draw_room',
  'draw_surface',
  'draw_roof',
  'draw_label',
  'draw_line',
  'add_door',
  'add_window',
  'add_fixture',
])

export function isPlanOneshotDrawTool(tool: PlanToolId | null): boolean {
  return tool != null && ONESHOT_DRAW_TOOLS.has(tool)
}

/** True when the FML toolbar shows the settings strip (selection or draw/add tool). */
export function isPlanToolbarSettingsOpen(args: {
  hasWallSelection: boolean
  hasJunctionSelection: boolean
  hasOpeningSelection: boolean
  hasAreaSelection: boolean
  hasLabelSelection: boolean
  hasLineSelection?: boolean
    hasItemSelection?: boolean
    hasDimensionSelection?: boolean
    hasFacadeGroupSelection?: boolean
  /** Viewer-maatlijnen: strip met wissen, ook in de floating settings-kaart. */
  hasMeasureLines?: boolean
  activeTool: PlanToolId | null
  /**
   * Reserved: Dak-tab draw_surface opens settings for Hoofddak/Dakkapel (same as other draw tools).
   * Callers may still pass it; it no longer suppresses the strip.
   */
  dakMode?: boolean
}): boolean {
  void args.dakMode
  if (
    args.hasWallSelection ||
    args.hasJunctionSelection ||
    args.hasOpeningSelection ||
    args.hasAreaSelection ||
    args.hasLabelSelection ||
    args.hasLineSelection ||
    args.hasItemSelection ||
    args.hasDimensionSelection ||
    args.hasFacadeGroupSelection
  ) {
    return true
  }
  if (args.activeTool === 'measure' || args.activeTool === 'box_select') return true
  if (args.activeTool === 'nulpunt') return true
  return args.activeTool != null && SETTINGS_TOOLS.has(args.activeTool)
}

/** Toggle in de select-rij, tussen maatlijn en nulpunt. Geen PlanToolId. */
export const PLAN_AREA_SIDE_DIMS_TOOL_ID = 'show_area_dims'

export function getPlanSelectTools(): ToolbeltItem[] {
  return [
    { id: 'box_select', icon: 'rect', label: tGlobal('toolbelt.plan.boxSelect') },
    { id: 'measure', icon: 'ruler', label: tGlobal('toolbelt.plan.measure') },
    {
      id: PLAN_AREA_SIDE_DIMS_TOOL_ID,
      icon: 'dims',
      label: tGlobal('toolbelt.plan.showAreaDims'),
      toggle: true,
    },
    { id: 'nulpunt', icon: 'origin', label: tGlobal('toolbelt.plan.nulpunt') },
  ]
}

export function getPlanDrawTools(options?: {
  includeSurface?: boolean
  includeRoof?: boolean
  includeAnnotations?: boolean
  dakMode?: boolean
}): ToolbeltItem[] {
  if (options?.dakMode === true) {
    return [
      { id: 'draw_wall', icon: 'ridge', label: tGlobal('result.toolbar.wallKindRidge') },
      { id: 'draw_surface', icon: 'roof', label: tGlobal('toolbelt.plan.drawRoof') },
    ]
  }
  const tools: ToolbeltItem[] = [
    { id: 'draw_wall', icon: 'wall', label: tGlobal('toolbelt.plan.drawWall') },
    { id: 'draw_room', icon: 'room', label: tGlobal('toolbelt.plan.drawRoom') },
  ]
  if (options?.includeRoof === true) {
    tools.push({ id: 'draw_roof', icon: 'roof', label: tGlobal('toolbelt.plan.drawRoof') })
  }
  if (options?.includeSurface === true) {
    tools.push({ id: 'draw_surface', icon: 'rect', label: tGlobal('toolbelt.plan.drawSurface') })
  }
  if (options?.includeAnnotations === true) {
    tools.push(
      { id: 'draw_label', icon: 'text', label: tGlobal('toolbelt.plan.drawLabel') },
      { id: 'draw_line', icon: 'slash', label: tGlobal('toolbelt.plan.drawLine') },
    )
  }
  return tools
}

export function getPlanLibraryTools(options?: { includeFixture?: boolean }): ToolbeltItem[] {
  const tools: ToolbeltItem[] = [
    { id: 'add_door', icon: 'door', label: tGlobal('toolbelt.plan.addDoor') },
    { id: 'add_window', icon: 'window', label: tGlobal('toolbelt.plan.addWindow') },
  ]
  if (options?.includeFixture === true) {
    tools.push({ id: 'add_fixture', icon: 'grid', label: tGlobal('toolbelt.plan.addFixture') })
  }
  return tools
}

export function getPlanEditTools(options?: {
  includeSurface?: boolean
  includeRoof?: boolean
  includeAnnotations?: boolean
  includeFixture?: boolean
}): ToolbeltItem[] {
  return [...getPlanDrawTools(options), ...getPlanLibraryTools(options)]
}

/** @deprecated Prefer getPlanSelectTools() so locale updates apply. */
export const PLAN_SELECT_TOOLS: ToolbeltItem[] = getPlanSelectTools()

/** @deprecated Prefer getPlanEditTools() so locale updates apply. */
export const PLAN_EDIT_TOOLS: ToolbeltItem[] = getPlanEditTools()
