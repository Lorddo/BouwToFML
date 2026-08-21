import type { FmlToolId } from '@/ui/components/canvas/fmlToolbeltItems'
import { FML_AREA_SIDE_DIMS_TOOL_ID } from '@/ui/components/canvas/fmlToolbeltItems'

/** Embed / host kinds — one canvas, three capability presets. */
export type FmlKind = 'editor' | 'inspect' | 'detection'

export type FmlSettingsVariant = 'viewer' | 'workspace' | 'inspect'

export type FmlCapabilityToolId = FmlToolId | typeof FML_AREA_SIDE_DIMS_TOOL_ID

export type FmlCapabilities = {
  mutate: boolean
  inspect: boolean
  tools: Readonly<Record<FmlCapabilityToolId, boolean>>
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
  settingsVariant: FmlSettingsVariant
}

function allTools(enabled: boolean): Record<FmlCapabilityToolId, boolean> {
  return {
    box_select: enabled,
    measure: enabled,
    [FML_AREA_SIDE_DIMS_TOOL_ID]: enabled,
    nulpunt: enabled,
    draw_wall: enabled,
    draw_room: enabled,
    draw_surface: enabled,
    draw_label: enabled,
    draw_line: enabled,
    add_door: enabled,
    add_window: enabled,
    add_fixture: enabled,
  }
}

/** Leading / most complete mode (`/FML-editor` edit). */
export const FML_CAPABILITIES_EDITOR: FmlCapabilities = Object.freeze({
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
})

/** Read-only inspect (`/FML-editor` inspect tab / PWA embed). */
export const FML_CAPABILITIES_INSPECT: FmlCapabilities = Object.freeze({
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
})

/**
 * Workspace stap-4 FML result. Matches product gates:
 * `FML_AREA_SURFACE_EDIT_VISIBLE=false`, no fixture/annotation tools, no touch chrome.
 * Same canvas top chrome as editor/inspect (topbar, no inline hint).
 */
export const FML_CAPABILITIES_DETECTION: FmlCapabilities = Object.freeze({
  mutate: true,
  inspect: false,
  tools: Object.freeze({
    ...allTools(true),
    draw_surface: false,
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
})

const PRESETS: Record<FmlKind, FmlCapabilities> = {
  editor: FML_CAPABILITIES_EDITOR,
  inspect: FML_CAPABILITIES_INSPECT,
  detection: FML_CAPABILITIES_DETECTION,
}

export function resolveFmlCapabilities(kind: FmlKind): FmlCapabilities {
  return PRESETS[kind]
}

/** Toolbar / toolbelt: only tools allowed by the preset. */
export function isFmlToolEnabled(caps: FmlCapabilities, toolId: string): boolean {
  return caps.tools[toolId as FmlCapabilityToolId] === true
}

/**
 * Derive canvas flags from a kind (+ optional legacy boolean overrides).
 * Prefer passing `kind` from hosts; overrides keep call-sites that still set props.
 */
export function fmlCanvasFlagsFromCapabilities(
  caps: FmlCapabilities,
  overrides?: {
    areaSurfaceEditEnabled?: boolean
    annotationEditEnabled?: boolean
    inspectMode?: boolean
    touchEditor?: boolean
  },
): {
  areaSurfaceEditEnabled: boolean
  annotationEditEnabled: boolean
  inspectMode: boolean
  touchEditor: boolean
  includeSurfaceTool: boolean
  includeAnnotationTools: boolean
  includeFixtureTool: boolean
} {
  const areaSurfaceEditEnabled = overrides?.areaSurfaceEditEnabled ?? caps.areaSurfaceEdit
  const annotationEditEnabled = overrides?.annotationEditEnabled ?? caps.annotationEdit
  const inspectMode = overrides?.inspectMode ?? caps.inspect
  const touchEditor = overrides?.touchEditor ?? caps.touchChrome
  return {
    areaSurfaceEditEnabled,
    annotationEditEnabled,
    inspectMode,
    touchEditor,
    includeSurfaceTool: areaSurfaceEditEnabled,
    includeAnnotationTools: annotationEditEnabled,
    includeFixtureTool: touchEditor && caps.fixtureLibrary,
  }
}
