import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import {
  colorForLabel,
  DOOR_FACE_RGBA,
  DOORFRAME_FACE_RGBA,
  OUTSIDE_FACE_RGBA,
  UNRESOLVED_INK_RGBA,
  UNKNOWN_FACE_RGBA,
  WALL_FACE_RGBA,
  WINDOW_FACE_RGBA,
} from './room-raster'
import { resolveMergedLabel } from './room-raster-merge'
import { ROOM_INK_CLASSIFY_TUNING } from './room-ink-classify-autoclass'
import {
  resolvePixelClassification,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify-mapping'

function resolveRenderedClassification(params: {
  rawLabel: number
  idx: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  keptWallMask?: Uint8Array
  groupBy?: RoomClassificationGroupBy
}): RoomRasterClass {
  const groupBy = params.groupBy ?? 'merged'
  const classification = resolvePixelClassification(
    params.rawLabel,
    params.parentMap,
    params.classificationByLabel,
    groupBy,
  )
  if (classification !== 'wall' || !params.keptWallMask) return classification
  if ((params.keptWallMask[params.idx] ?? 0) >= ROOM_INK_CLASSIFY_TUNING.bwInkThreshold) {
    return 'wall'
  }
  return 'unknown'
}

function rgbaForClassifiedPixel(params: {
  label: number
  idx: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  keptWallMask?: Uint8Array
  groupBy: RoomClassificationGroupBy
}): [number, number, number, number] {
  if (params.label <= 0) return UNRESOLVED_INK_RGBA
  const colorRoot =
    params.groupBy === 'component'
      ? params.label
      : resolveMergedLabel(params.label, params.parentMap)
  const classification = resolveRenderedClassification({
    rawLabel: params.label,
    idx: params.idx,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    keptWallMask: params.keptWallMask,
    groupBy: params.groupBy,
  })
  if (classification === 'wall') return WALL_FACE_RGBA
  if (classification === 'surface') return colorForLabel(colorRoot)
  if (classification === 'unknown') return UNKNOWN_FACE_RGBA
  if (classification === 'door') return DOOR_FACE_RGBA
  if (classification === 'window') return WINDOW_FACE_RGBA
  if (classification === 'doorframe') return DOORFRAME_FACE_RGBA
  return OUTSIDE_FACE_RGBA
}

export function renderClassifiedFaceMask(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  /** Pixels die wall waren maar niet in het behouden muurmask vallen → unknown kleur. */
  keptWallMask?: Uint8Array
  groupBy?: RoomClassificationGroupBy
}): CanvasLike {
  const canvas = createCanvas(params.width, params.height)
  paintClassifiedFaceMaskRegion(canvas, {
    ...params,
    bounds: { x0: 0, y0: 0, x1: params.width - 1, y1: params.height - 1 },
  })
  return canvas
}

/** Herkleur alleen een bbox op een bestaande mask-canvas (dirty-rect). */
export function paintClassifiedFaceMaskRegion(
  canvas: CanvasLike,
  params: {
    width: number
    height: number
    labelsData: Int32Array
    parentMap: Map<number, number>
    classificationByLabel: Map<number, RoomRasterClass>
    keptWallMask?: Uint8Array
    groupBy?: RoomClassificationGroupBy
    bounds: { x0: number; y0: number; x1: number; y1: number }
  },
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const x0 = Math.max(0, Math.min(params.width - 1, Math.floor(params.bounds.x0)))
  const y0 = Math.max(0, Math.min(params.height - 1, Math.floor(params.bounds.y0)))
  const x1 = Math.max(x0, Math.min(params.width - 1, Math.floor(params.bounds.x1)))
  const y1 = Math.max(y0, Math.min(params.height - 1, Math.floor(params.bounds.y1)))
  const regionW = x1 - x0 + 1
  const regionH = y1 - y0 + 1
  if (regionW < 1 || regionH < 1) return

  const groupBy = params.groupBy ?? 'merged'
  const image = ctx.createImageData(regionW, regionH)
  const data = image.data

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const idx = y * params.width + x
      const label = params.labelsData[idx] ?? 0
      const color = rgbaForClassifiedPixel({
        label,
        idx,
        parentMap: params.parentMap,
        classificationByLabel: params.classificationByLabel,
        keptWallMask: params.keptWallMask,
        groupBy,
      })
      const dataIdx = ((y - y0) * regionW + (x - x0)) * 4
      data[dataIdx] = color[0]
      data[dataIdx + 1] = color[1]
      data[dataIdx + 2] = color[2]
      data[dataIdx + 3] = color[3]
    }
  }

  ctx.putImageData(image, x0, y0)
}
