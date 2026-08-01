import { tally } from '@/core/diagnostics'
import type { RasterRoomComponent } from './room-raster'
import type { RoomRasterClass } from './room-ink-classify'
import { cardinalNeighborRoots, resolveMergedLabel } from './room-raster-merge'

const EXTERIOR_POCKET_REF_FALLBACK_PX = 30
const EXTERIOR_POCKET_MAX_BBOX_RATIO = 3
/** Alleen demoten als alle 4 cardinale zijden een buur hebben én die buur outside is. */
const EXTERIOR_POCKET_MIN_OUTSIDE_SIDES = 4

function resolveExteriorPocketMaxBBoxPx(referenceWallThicknessPx?: number): number {
  const ref =
    referenceWallThicknessPx && referenceWallThicknessPx > 0
      ? referenceWallThicknessPx
      : EXTERIOR_POCKET_REF_FALLBACK_PX
  return Math.max(1, Math.round(ref * EXTERIOR_POCKET_MAX_BBOX_RATIO))
}

function bboxMaxSide(component: RasterRoomComponent): number {
  return Math.max(component.bbox.width, component.bbox.height)
}

function resolveClassForLabel(
  label: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): RoomRasterClass {
  const direct = classificationByLabel.get(label)
  if (direct) return direct
  const root = resolveMergedLabel(label, parentMap)
  // ESC:W-06 (E)
  const resolved = classificationByLabel.get(root)
  if (resolved == null) tally('W-06', 'surface_fallback')
  return resolved ?? 'surface'
}

// ESC:W-02 (A)
export function demoteExteriorPocketFaces(params: {
  components: RasterRoomComponent[]
  rawLabelsData: Int32Array
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap: Map<number, number>
  faceOverrides?: Map<number, RoomRasterClass>
  maxBBoxPx?: number
  referenceWallThicknessPx?: number
  minOutsideSides?: number
}): { classificationByLabel: Map<number, RoomRasterClass>; demotedLabels: number[] } {
  const maxBBoxPx = Math.max(
    1,
    Math.round(params.maxBBoxPx ?? resolveExteriorPocketMaxBBoxPx(params.referenceWallThicknessPx)),
  )
  const minOutsideSides = Math.max(
    1,
    Math.min(4, Math.round(params.minOutsideSides ?? EXTERIOR_POCKET_MIN_OUTSIDE_SIDES)),
  )
  const faceOverrides = params.faceOverrides ?? new Map<number, RoomRasterClass>()
  const nextClassification = new Map(params.classificationByLabel)
  const demotedLabels: number[] = []
  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return 0
    return params.rawLabelsData[y * params.width + x] ?? 0
  }
  const componentsByLabel = new Map(
    params.components.map((component) => [component.label, component]),
  )
  const resolve = (label: number) => resolveMergedLabel(label, params.parentMap)

  for (const component of params.components) {
    if (component.touchesBorder) continue
    if (bboxMaxSide(component) > maxBBoxPx) continue

    const componentRoot = resolve(component.label)
    if (faceOverrides.has(component.label) || faceOverrides.has(componentRoot)) continue

    const currentClass = resolveClassForLabel(component.label, params.parentMap, nextClassification)
    if (currentClass === 'outside') continue

    const neighbors = cardinalNeighborRoots({
      child: component,
      labelAt,
      imageWidth: params.width,
      imageHeight: params.height,
      resolve,
      componentsByLabel,
    })

    // Alle 4 zijden moeten een buur opleveren — null (onopgelost) telt niet mee als outside.
    if (neighbors.length !== 4 || neighbors.some((neighbor) => neighbor == null)) continue

    const neighborClasses = neighbors.map((neighbor) =>
      resolveClassForLabel(neighbor!, params.parentMap, nextClassification),
    )
    if (neighborClasses.some((neighborClass) => neighborClass === 'surface')) continue

    const outsideCount = neighborClasses.filter(
      (neighborClass) => neighborClass === 'outside',
    ).length
    if (outsideCount < minOutsideSides) continue

    nextClassification.set(component.label, 'outside')
    nextClassification.set(componentRoot, 'outside')
    demotedLabels.push(component.label)
    tally('W-02', 'demoted')
  }

  return {
    classificationByLabel: nextClassification,
    demotedLabels,
  }
}
