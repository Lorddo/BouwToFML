import type { PlanToolId } from '@/ui/components/canvas/planToolbeltItems'
import { PLAN_AREA_SIDE_DIMS_TOOL_ID } from '@/ui/components/canvas/planToolbeltItems'

/** Embed / host kinds — one canvas, three capability presets. */
export type PlanKind = 'editor' | 'inspect' | 'detection'

export type PlanSettingsVariant = 'viewer' | 'workspace' | 'inspect'

export type PlanCapabilityToolId = PlanToolId | typeof PLAN_AREA_SIDE_DIMS_TOOL_ID

/**
 * File I/O rights per host. FML is a direction + entitlement, not a file property.
 * See `.cursor/docs/plg-native-format-plan.md` §8.
 *
 * Editor today = tekenbureau (FML import + lossy export). External-customer
 * tenants (native-only, no FML) land later via a tenant flag — not a fourth PlanKind.
 */
export type PlanIoCaps = {
  nativeRead: true
  /** inspect: false (observations-only write may come later) */
  nativeWrite: boolean
  fmlImport: boolean
  fmlExport: 'none' | 'lossy'
  ifcImport?: boolean
  ifcExport?: 'none' | 'lossy'
}

export type PlanCapabilities = {
  mutate: boolean
  inspect: boolean
  tools: Readonly<Record<PlanCapabilityToolId, boolean>>
  areaSurfaceEdit: boolean
  annotationEdit: boolean
  fixtureLibrary: boolean
  /** Current `touchEditor` — floating dock, fixture tool, coarse-pointer rail. */
  touchChrome: boolean
  /** Undo/redo/fit/fullscreen/zoom topbar (editor, inspect, detection). */
  viewportChrome: boolean
  rescale: boolean
  thicknessPick: boolean
  underlayMove: boolean
  /** Gevelgroepen in muursettings / inspect-panel (geen Stempel in inspect). */
  facadeGroups: boolean
  settingsVariant: PlanSettingsVariant
  /** Open/save + FML/IFC adapter rights. Editor file-picker follows nativeRead + fmlImport. */
  planIo: PlanIoCaps
}

function allTools(enabled: boolean): Record<PlanCapabilityToolId, boolean> {
  return {
    box_select: enabled,
    measure: enabled,
    [PLAN_AREA_SIDE_DIMS_TOOL_ID]: enabled,
    nulpunt: enabled,
    draw_wall: enabled,
    draw_room: enabled,
    draw_surface: enabled,
    draw_roof: enabled,
    draw_label: enabled,
    draw_line: enabled,
    add_door: enabled,
    add_window: enabled,
    add_fixture: enabled,
  }
}

/** Leading / most complete mode (`/FML-editor` edit). PLG-native; FML I/O until tenant split. */
export const PLAN_CAPABILITIES_EDITOR: PlanCapabilities = Object.freeze({
  mutate: true,
  inspect: false,
  tools: Object.freeze(allTools(true)),
  areaSurfaceEdit: true,
  annotationEdit: true,
  fixtureLibrary: true,
  touchChrome: true,
  viewportChrome: true,
  rescale: true,
  thicknessPick: false,
  underlayMove: true,
  facadeGroups: true,
  settingsVariant: 'viewer',
  planIo: Object.freeze({
    nativeRead: true,
    nativeWrite: true,
    fmlImport: true,
    fmlExport: 'lossy',
  }),
})

/** Read-only inspect (`/FML-editor` inspect tab / PWA embed). */
export const PLAN_CAPABILITIES_INSPECT: PlanCapabilities = Object.freeze({
  mutate: false,
  inspect: true,
  tools: Object.freeze(allTools(false)),
  areaSurfaceEdit: false,
  annotationEdit: false,
  fixtureLibrary: false,
  touchChrome: false,
  viewportChrome: true,
  rescale: false,
  thicknessPick: false,
  underlayMove: false,
  facadeGroups: true,
  settingsVariant: 'inspect',
  planIo: Object.freeze({
    nativeRead: true,
    nativeWrite: false,
    fmlImport: true,
    fmlExport: 'none',
  }),
})

/**
 * Workspace stap-4 FML result. Matches product gates:
 * `FML_AREA_SURFACE_EDIT_VISIBLE=false`, no fixture/annotation tools, no touch chrome.
 * Same canvas top chrome as editor/inspect (topbar, no inline hint).
 */
export const PLAN_CAPABILITIES_DETECTION: PlanCapabilities = Object.freeze({
  mutate: true,
  inspect: false,
  tools: Object.freeze({
    ...allTools(true),
    draw_surface: false,
    draw_roof: false,
    draw_label: false,
    draw_line: false,
    add_fixture: false,
  }),
  areaSurfaceEdit: false,
  annotationEdit: false,
  fixtureLibrary: false,
  touchChrome: false,
  viewportChrome: true,
  rescale: true,
  thicknessPick: true,
  underlayMove: true,
  /** Stempel-preset via checkbox (zelfde store als editor; geen gevel-UI). */
  facadeGroups: true,
  settingsVariant: 'workspace',
  planIo: Object.freeze({
    nativeRead: true,
    nativeWrite: true,
    fmlImport: true,
    fmlExport: 'lossy',
  }),
})

const PRESETS: Record<PlanKind, PlanCapabilities> = {
  editor: PLAN_CAPABILITIES_EDITOR,
  inspect: PLAN_CAPABILITIES_INSPECT,
  detection: PLAN_CAPABILITIES_DETECTION,
}

export function resolvePlanCapabilities(kind: PlanKind): PlanCapabilities {
  return PRESETS[kind]
}
