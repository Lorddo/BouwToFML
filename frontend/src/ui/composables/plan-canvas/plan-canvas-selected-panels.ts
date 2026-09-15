import type { Opening, Wall } from '@/core/plan/types'
import {
  readJunctionElevation,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
} from '@/core/plan/wall-endpoint-height'
import type { RenderModel, RenderWall } from './plan-canvas-render-types'
import { computeOpeningDraftState } from './plan-canvas-opening-draft'
import type { WallEndRef } from '@/core/plan/junction-core'

export function buildSelectedWallPanel(
  model: RenderModel,
  ids: string[],
  floorHeightCm: number,
  mode: 'quick' | 'full' = 'full',
) {
  if (ids.length === 0) return null

  const wallLines = ids
    .map(
      (id) =>
        model.wallLines.find((item) => item.id === id) ??
        model.ridgeLines.find((item) => item.id === id),
    )
    .filter((item): item is RenderWall => item != null)
  if (wallLines.length === 0) return null

  const lengths = wallLines.map((line) => Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y))
  const thicknesses = wallLines.map((line) => Math.round(line.wall.thickness))
  const balances = wallLines.map((line) => line.wall.balance ?? 0.5)
  const heights: number[] = []
  const bottoms: number[] = []
  for (const line of wallLines) {
    heights.push(Math.round(wallEndpointHeightCm(line.wall, 'a', floorHeightCm)))
    heights.push(Math.round(wallEndpointHeightCm(line.wall, 'b', floorHeightCm)))
    const bottom = wallUniformBottomZCm(line.wall, floorHeightCm)
    if (bottom != null) bottoms.push(bottom)
    else {
      // mixed ends on one wall → treat as mixed overall
      bottoms.push(Number.NaN)
    }
  }
  const firstThickness = thicknesses[0] ?? 20
  const thicknessMixed = thicknesses.some((value) => value !== firstThickness)
  const firstBalance = Math.round((balances[0] ?? 0.5) * 100) / 100
  const balanceMixed = balances.some(
    (value) => Math.round((value ?? 0.5) * 100) / 100 !== firstBalance,
  )
  const firstHeight = heights[0] ?? Math.round(floorHeightCm)
  const heightMixed = heights.some((value) => value !== firstHeight)
  const firstBottom = bottoms.find((value) => Number.isFinite(value)) ?? 0
  const bottomMixed =
    bottoms.length === 0 ||
    bottoms.some((value) => !Number.isFinite(value) || value !== firstBottom)
  const openingCount = wallLines.reduce((sum, line) => sum + line.wall.openings.length, 0)
  const singleLine = wallLines.length === 1 ? wallLines[0] : null

  return {
    wallIds: wallLines.map((line) => line.id),
    count: wallLines.length,
    lengthCm: singleLine ? lengths[0] : null,
    lengthCmMin: wallLines.length > 1 ? Math.min(...lengths) : null,
    lengthCmMax: wallLines.length > 1 ? Math.max(...lengths) : null,
    thicknessCm: thicknessMixed ? null : firstThickness,
    thicknessMixed,
    balance: balanceMixed ? null : firstBalance,
    balanceMixed,
    heightCm: heightMixed ? null : firstHeight,
    heightMixed,
    bottomZCm: bottomMixed ? null : firstBottom,
    bottomZMixed: bottomMixed,
    openingCount,
    canSplit: singleLine != null && (lengths[0] ?? 0) >= 8,
    ridgeCount: wallLines.filter(
      (line) => line.wall.thickness === 0 || line.wall.extras?.ridge === true,
    ).length,
    mode,
  }
}

export function buildSelectedJunctionPanel(
  walls: Wall[],
  junction: { id: string; refs: WallEndRef[] } | null | undefined,
  floorHeightCm: number,
) {
  if (!junction || junction.refs.length === 0) return null
  const elev = readJunctionElevation(walls, junction.refs, floorHeightCm)
  if (!elev) return null
  const ridgeCount = junction.refs.filter((ref) => {
    const wall = walls.find((item) => item.id === ref.wallId)
    return wall != null && (wall.extras?.ridge === true || wall.thickness === 0)
  }).length
  return {
    junctionId: junction.id,
    wallCount: junction.refs.length,
    heightCm: elev.heightCm,
    heightMixed: false,
    bottomZCm: elev.bottomZCm,
    bottomZMixed: false,
    ridgeCount,
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

export function buildSelectedOpeningPanel(
  model: RenderModel,
  ids: string[],
  mode: 'quick' | 'full' = 'full',
) {
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
    mode,
    openingType,
    subtype: draft.subtypeMixed ? null : draft.subtype,
    subtypeMixed: draft.subtypeMixed,
    widthCm: draft.widthMixed ? null : draft.widthCm,
    widthMixed: draft.widthMixed,
    heightCm: draft.heightMixed ? null : draft.heightCm,
    heightMixed: draft.heightMixed,
    sillZCm:
      openingType === 'window' || openingType === 'door'
        ? draft.sillZMixed
          ? null
          : draft.sillZCm
        : null,
    sillZMixed: openingType === 'window' || openingType === 'door' ? draft.sillZMixed : false,
    hingeAtStart: openingType === 'door' ? (draft.hingeMixed ? null : draft.hingeAtStart) : null,
    hingeMixed: openingType === 'door' ? draft.hingeMixed : false,
    swingRight: openingType === 'door' ? (draft.swingMixed ? null : draft.swingRight) : null,
    swingMixed: openingType === 'door' ? draft.swingMixed : false,
  }
}
