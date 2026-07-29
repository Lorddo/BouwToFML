import type { Opening } from '@/core/fml/types'
import {
  resolveOpeningCatalog,
  type DoorAssetKind,
} from '@/core/fml/opening-refid-catalog'
import {
  buildDoorSwingSymbol,
  buildMirrored,
  resolveHingeAtStart,
  resolveSwingSign,
  type DoorSymbol,
} from '@/core/fml/door-swing-symbol'
import { clamp01 } from '@/core/fml/extraction-to-plan-geom'
import { buildDoorOpeningId } from '@/ui/components/fml-preview-openings'

export { buildMirrored, resolveHingeAtStart, resolveSwingSign }
export type { DoorSymbol }

export interface DoorDisplayGroup {
  id: string
  openingIndex: number
  openingGuid?: string
  openings: Opening[]
  catalogLabel: string
  isDouble: boolean
  startCm: { x: number; y: number }
  endCm: { x: number; y: number }
  leafLines: number[][]
  arcPoints: number[][]
  arrowPoints: number[][]
}

type Point = { x: number; y: number }

/**
 * Per deuropening (type=door) op een muur bouwen we precies één weergave-groep.
 * Er wordt NIET meer paarsgewijs gemerged op refid — dubbele deuren zijn of een
 * `double_wide` asset (één brede opening), of twee onafhankelijke openingen die
 * elk hun eigen symbool krijgen. Zo klopt elke deur, ongeacht het FML-bestand.
 */
export function groupDoorOpeningsOnWall(
  wallId: string,
  wallA: Point,
  wallB: Point,
  openings: Opening[],
): DoorDisplayGroup[] {
  const dx = wallB.x - wallA.x
  const dy = wallB.y - wallA.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return []
  const wallUnit = { x: dx / len, y: dy / len }

  return openings.flatMap((opening, openingIndex) => {
    if (opening.type !== 'door') return []
    const catalog = resolveOpeningCatalog(opening.refid, 'door')
    const fullSpan = openingSpanOnWall(wallA, wallUnit, len, opening)
    // Gap = volle opening.width. Boog/blad: vaste catalogus-inset per zijde (REF ID),
    // niet gemeten ref-framing — anders verschilt weergave per plattegrond.
    const inset = catalog.swingInsetCm
    const swing = resolveSwingSpanWithinOpening({
      startCm: fullSpan.start,
      endCm: fullSpan.end,
      wallUnit,
      swingHingeInsetCm: inset,
      swingFreeInsetCm: inset,
    })
    const symbol = buildDoorSwingSymbol({
      kind: catalog.kind as DoorAssetKind,
      start: swing.start,
      end: swing.end,
      wallUnit,
      width: swing.width,
      mirrored: opening.mirrored,
      leafLength: swing.width,
    })
    return {
      id: buildDoorOpeningId(wallId, opening, openingIndex),
      openingIndex,
      openingGuid: opening.guid,
      openings: [opening],
      catalogLabel: catalog.label,
      isDouble: catalog.kind === 'double_wide',
      startCm: fullSpan.start,
      endCm: fullSpan.end,
      leafLines: symbol.leafLines,
      arcPoints: symbol.arcPoints,
      arrowPoints: symbol.arrowPoints,
    }
  })
}

function openingSpanOnWall(
  wallA: Point,
  wallUnit: Point,
  wallLength: number,
  opening: Opening,
): { start: Point; end: Point } {
  const t = clamp01(opening.t)
  const center = { x: wallA.x + t * wallUnit.x * wallLength, y: wallA.y + t * wallUnit.y * wallLength }
  const half = Math.max(0.5, opening.width / 2)
  return {
    start: { x: center.x - wallUnit.x * half, y: center.y - wallUnit.y * half },
    end: { x: center.x + wallUnit.x * half, y: center.y + wallUnit.y * half },
  }
}

/**
 * FML-viewer alleen: blad/boog gecentreerd in de opening.
 * Insets komen uit de REF ID-catalogus (`swingInsetCm` per zijde); asymmetrische
 * ref-framing hoort bij L12-detectie-overlay, niet bij FML-weergave.
 */
export function resolveSwingSpanWithinOpening(params: {
  startCm: Point
  endCm: Point
  wallUnit: Point
  swingHingeInsetCm?: number
  swingFreeInsetCm?: number
}): { start: Point; end: Point; width: number } {
  const totalFrameCm =
    Math.max(0, params.swingHingeInsetCm ?? 0) + Math.max(0, params.swingFreeInsetCm ?? 0)
  const spanLength = Math.hypot(params.endCm.x - params.startCm.x, params.endCm.y - params.startCm.y)
  const eachSide = Math.min(totalFrameCm / 2, Math.max(0, (spanLength - 1) / 2))
  const ux = params.wallUnit.x
  const uy = params.wallUnit.y
  const start = {
    x: params.startCm.x + ux * eachSide,
    y: params.startCm.y + uy * eachSide,
  }
  const end = {
    x: params.endCm.x - ux * eachSide,
    y: params.endCm.y - uy * eachSide,
  }
  const width = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))
  return { start, end, width }
}
