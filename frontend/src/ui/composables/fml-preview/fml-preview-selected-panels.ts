import type { Opening } from '@/core/fml/types'
import type { RenderModel, RenderWall } from './fml-preview-render-types'
import { computeOpeningDraftState } from './fml-preview-opening-draft'

export function buildSelectedWallPanel(model: RenderModel, ids: string[]) {
  if (ids.length === 0) return null

  const wallLines = ids
    .map((id) => model.wallLines.find((item) => item.id === id))
    .filter((item): item is RenderWall => item != null)
  if (wallLines.length === 0) return null

  const lengths = wallLines.map((line) => Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y))
  const thicknesses = wallLines.map((line) => Math.round(line.wall.thickness))
  const balances = wallLines.map((line) => line.wall.balance ?? 0.5)
  const firstThickness = thicknesses[0] ?? 20
  const thicknessMixed = thicknesses.some((value) => value !== firstThickness)
  const firstBalance = Math.round((balances[0] ?? 0.5) * 100) / 100
  const balanceMixed = balances.some(
    (value) => Math.round((value ?? 0.5) * 100) / 100 !== firstBalance,
  )
  const openingCount = wallLines.reduce((sum, line) => sum + line.wall.openings.length, 0)
  const singleLine = wallLines.length === 1 ? wallLines[0]! : null

  return {
    wallIds: wallLines.map((line) => line.id),
    count: wallLines.length,
    lengthCm: singleLine ? lengths[0]! : null,
    lengthCmMin: wallLines.length > 1 ? Math.min(...lengths) : null,
    lengthCmMax: wallLines.length > 1 ? Math.max(...lengths) : null,
    thicknessCm: thicknessMixed ? null : firstThickness,
    thicknessMixed,
    balance: balanceMixed ? null : firstBalance,
    balanceMixed,
    openingCount,
    canSplit: singleLine != null && (lengths[0] ?? 0) >= 8,
  }
}

export function buildSelectedInfo(
  model: RenderModel,
  selectedOpeningId: string | null,
): { title: string; subtitle: string } | null {
  if (!selectedOpeningId) return null
  const door = model.doorGroups.find((item) => item.id === selectedOpeningId) ?? null
  if (door) {
    return {
      title: door.label,
      subtitle: door.detail,
    }
  }
  const window = model.windows.find((item) => item.id === selectedOpeningId) ?? null
  if (window) {
    return {
      title: window.label,
      subtitle: window.detail,
    }
  }
  return null
}

export function buildSelectedOpeningPanel(model: RenderModel, ids: string[]) {
  if (ids.length === 0) return null

  const selected: { id: string; opening: Opening }[] = []
  for (const id of ids) {
    const door = model.doorGroups.find((item) => item.id === id)
    if (door?.openings[0]) {
      selected.push({ id: door.id, opening: door.openings[0] })
      continue
    }
    const window = model.windows.find((item) => item.id === id)
    if (window) selected.push({ id: window.id, opening: window.opening })
  }
  if (selected.length === 0) return null

  const draft = computeOpeningDraftState(selected.map((item) => item.opening))
  if (!draft) return null

  const { openingType } = draft
  return {
    openingIds: selected.map((item) => item.id),
    count: selected.length,
    openingType,
    widthCm: draft.widthMixed ? null : draft.widthCm,
    widthMixed: draft.widthMixed,
    heightCm: draft.heightMixed ? null : draft.heightCm,
    heightMixed: draft.heightMixed,
    sillZCm: openingType === 'window' ? (draft.sillZMixed ? null : draft.sillZCm) : null,
    sillZMixed: openingType === 'window' ? draft.sillZMixed : false,
    hingeAtStart: openingType === 'door' ? (draft.hingeMixed ? null : draft.hingeAtStart) : null,
    hingeMixed: openingType === 'door' ? draft.hingeMixed : false,
    swingRight: openingType === 'door' ? (draft.swingMixed ? null : draft.swingRight) : null,
    swingMixed: openingType === 'door' ? draft.swingMixed : false,
  }
}
