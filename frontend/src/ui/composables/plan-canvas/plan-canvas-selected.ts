import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'
import { resolvePlanStickySelectKind, type PlanStickySelectKind } from './plan-canvas-sticky-select'

/**
 * De **Selected**-bak van de selectie-store: wat is geselecteerd.
 * Hover en ToolSession horen hier niet in — zie `.cursor/docs/refactor/lean/editor-kernel.md` §4.
 *
 * Bewust géén enkele `mode: 'settings' | 'move'`-discriminant: settings-ids en
 * een move-target kunnen tegelijk bestaan (Ctrl-select plus verplaats-doel), en
 * zowel sticky als delete leunen op die combinatie.
 */
export type PlanSelectedKind =
  | 'wall'
  | 'junction'
  | 'opening'
  | 'item'
  | 'area'
  | 'surface'
  | 'label'
  | 'line'
  | 'facadeGroup'
  | 'dimension'

export interface PlanSelectRequest {
  kind: PlanSelectedKind
  /**
   * Settings-paneel; meerdere ids alleen bij muur en opening.
   * Bij `facadeGroup` zijn dit de **leden-muren op deze verdieping** — een
   * gevelgroep is geen broertje van de muur maar een muurselectie mét markering.
   */
  settingsIds?: string[]
  /** Verplaats-doel. Bij de knoop is dit `pinnedJunctionId` (wacht op precise). */
  moveId?: string | null
  /** Alleen `kind: 'facadeGroup'`: welke groep `settingsIds` beschrijft. */
  groupId?: string | null
}

/**
 * Wist de veertien Selected-refs. `draggingJunctionId` blijft staan: dat is
 * drag-state, geen selectie — de bestaande `clearSelection()` laat hem ook staan.
 *
 * Wat hier **niet** hoort en bij de aanroeper blijft: mixed-vlaggen, pending
 * field-commits en ToolSession-velden (`surfaceEditId`, draw-punten).
 */
export function clearPlanSelected(selection: PlanCanvasSelectionRefs): void {
  selection.settingsWallIds.value = []
  selection.moveWallId.value = null
  selection.settingsFacadeGroupId.value = null
  selection.settingsJunctionId.value = null
  selection.pinnedJunctionId.value = null
  selection.settingsOpeningIds.value = []
  selection.moveOpeningId.value = null
  selection.settingsItemId.value = null
  selection.moveItemId.value = null
  selection.settingsAreaId.value = null
  selection.settingsSurfaceId.value = null
  selection.settingsLabelId.value = null
  selection.settingsLineId.value = null
  selection.moveDimensionId.value = null
}

/**
 * Verlaat elke verplaats-modus, maar houd de settings-selectie. Nodig waar het
 * paneel open mag blijven terwijl de grepen weg moeten — inspect-modus en elke
 * inspect-pick. `surfaceEditId` en de draw-punten horen bij ToolSession en
 * blijven daarom bij de aanroeper.
 */
export function clearPlanMoveModes(selection: PlanCanvasSelectionRefs): void {
  selection.moveWallId.value = null
  selection.pinnedJunctionId.value = null
  selection.moveOpeningId.value = null
  selection.moveItemId.value = null
  selection.moveDimensionId.value = null
}

/** Eén schrijf-lane: alles wissen, dan precies één soort zetten. */
export function setPlanSelected(
  selection: PlanCanvasSelectionRefs,
  next: PlanSelectRequest | null,
): void {
  clearPlanSelected(selection)
  if (!next) return
  const ids = next.settingsIds ?? []
  const first = ids[0] ?? null
  const moveId = next.moveId ?? null

  switch (next.kind) {
    case 'wall':
      selection.settingsWallIds.value = [...ids]
      selection.moveWallId.value = moveId
      break
    case 'junction':
      selection.settingsJunctionId.value = first
      selection.pinnedJunctionId.value = moveId
      break
    case 'opening':
      selection.settingsOpeningIds.value = [...ids]
      selection.moveOpeningId.value = moveId
      break
    case 'item':
      selection.settingsItemId.value = first
      selection.moveItemId.value = moveId
      break
    case 'area':
      selection.settingsAreaId.value = first
      break
    case 'surface':
      selection.settingsSurfaceId.value = first
      break
    case 'label':
      selection.settingsLabelId.value = first
      break
    case 'line':
      selection.settingsLineId.value = first
      break
    case 'facadeGroup':
      selection.settingsWallIds.value = [...ids]
      selection.settingsFacadeGroupId.value = next.groupId ?? null
      break
    case 'dimension':
      selection.moveDimensionId.value = moveId ?? first
      break
  }
}

/** Huidig settings-id van een soort met één id; `null` als er niets staat. */
function currentSettingsId(
  selection: PlanCanvasSelectionRefs,
  kind: PlanSelectedKind,
): string | null {
  switch (kind) {
    case 'junction':
      return selection.settingsJunctionId.value
    case 'item':
      return selection.settingsItemId.value
    case 'area':
      return selection.settingsAreaId.value
    case 'surface':
      return selection.settingsSurfaceId.value
    case 'label':
      return selection.settingsLabelId.value
    case 'line':
      return selection.settingsLineId.value
    case 'facadeGroup':
      return selection.settingsFacadeGroupId.value
    default:
      return null
  }
}

/**
 * Ctrl-klik op een enkelvoudig soort: staat het er al, dan deselecteren.
 * Vervangt het handmatige `x === id ? null : id` plus tien losse `= null`.
 */
export function togglePlanSelected(
  selection: PlanCanvasSelectionRefs,
  kind: PlanSelectedKind,
  id: string,
): void {
  const wasSelected = currentSettingsId(selection, kind) === id
  setPlanSelected(selection, wasSelected ? null : { kind, settingsIds: [id] })
}

/**
 * Sticky-vraag: "wat houd ik vast?" — bepaalt of een hit op iets anders mag
 * doorkomen. Muur wint hier van opening.
 *
 * Let op: `deleteSelected()` gebruikt een **andere** volgorde (opening vóór
 * muur). Dat is bestaand gedrag en geen vergissing van één van de twee: de
 * vragen zijn verschillend. Ze bewust apart houden.
 */
export function planStickySelectKind(
  selection: PlanCanvasSelectionRefs,
): PlanStickySelectKind | null {
  return resolvePlanStickySelectKind({
    hasWall: selection.settingsWallIds.value.length > 0 || selection.moveWallId.value != null,
    hasJunction:
      selection.settingsJunctionId.value != null || selection.pinnedJunctionId.value != null,
    hasOpening:
      selection.settingsOpeningIds.value.length > 0 || selection.moveOpeningId.value != null,
    hasItem: selection.settingsItemId.value != null || selection.moveItemId.value != null,
    hasAnnotation:
      selection.settingsLabelId.value != null || selection.settingsLineId.value != null,
    hasDimension: selection.moveDimensionId.value != null,
  })
}
