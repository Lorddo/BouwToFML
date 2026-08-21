/**
 * Filter inject-vectoren op stempel-gum (eraseMask).
 * Hydrate/serialize houden de volle lijst; filter alleen bij lezen voor generate.
 */
import type { Wall, Point2D } from '@/core/fml/types'
import { cmPointToImagePx } from '@/core/fml/measure-underlay-wall-thickness'
import { transformPointByBounds, type StampBounds } from '@/cv/preprocess/wall-stamp-raster'

/** Weg als ≥ deze fractie van de hartlijn-monsters gewist is. */
export const STAMP_ERASE_DROP_COVERAGE = 0.5

const SAMPLE_COUNT = 11

function sampleEraseCoverage(params: {
  aPx: Point2D
  bPx: Point2D
  eraseMask: Uint8Array
  width: number
  height: number
}): number {
  const { aPx, bPx, eraseMask, width, height } = params
  let hit = 0
  let total = 0
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const t = i / (SAMPLE_COUNT - 1)
    const x = Math.round(aPx.x + (bPx.x - aPx.x) * t)
    const y = Math.round(aPx.y + (bPx.y - aPx.y) * t)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    total += 1
    if ((eraseMask[y * width + x] ?? 0) > 0) hit += 1
  }
  if (total === 0) return 0
  return hit / total
}

/**
 * Houd inject-muren waarvan de hartlijn (na bounds-transform) niet ≥50% gewist is.
 */
export function filterInjectWallsByEraseMask(params: {
  walls: readonly Wall[]
  eraseMask: Uint8Array | null | undefined
  imageWidth: number
  imageHeight: number
  originCm: Point2D
  baseBounds: StampBounds
  bounds: StampBounds
  pxPerMmX: number
  pxPerMmY: number
  dropCoverage?: number
}): Wall[] {
  const {
    walls,
    eraseMask,
    imageWidth,
    imageHeight,
    originCm,
    baseBounds,
    bounds,
    pxPerMmX,
    pxPerMmY,
  } = params
  const dropAt = params.dropCoverage ?? STAMP_ERASE_DROP_COVERAGE
  if (!eraseMask || eraseMask.length !== imageWidth * imageHeight) {
    return walls.map((w) => w)
  }
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) return walls.map((w) => w)

  return walls.filter((wall) => {
    const a0 = cmPointToImagePx(wall.a, originCm, pxPerMmX, pxPerMmY)
    const b0 = cmPointToImagePx(wall.b, originCm, pxPerMmX, pxPerMmY)
    const aPx = transformPointByBounds(a0, baseBounds, bounds)
    const bPx = transformPointByBounds(b0, baseBounds, bounds)
    const coverage = sampleEraseCoverage({
      aPx,
      bPx,
      eraseMask,
      width: imageWidth,
      height: imageHeight,
    })
    return coverage < dropAt
  })
}
