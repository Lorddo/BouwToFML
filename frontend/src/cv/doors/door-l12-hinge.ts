import type { OpenCV } from '@/cv/loadOpenCV'
import { normalizeVector } from './door-geometry-utils'
import { computeDoorHingeFromMask } from './door-swing-hinge'
import { buildDoorSwingMask } from './door-swing-mask'
import type { DoorHingeAxis } from './types'
import type { RefBBox, RefPoint } from '@/cv/refs/types'

export {
  buildDoorSwingMask,
  closeClusterSwingMaskGaps,
  countUniqueSwingFaceIds,
  trimMaskToContent,
  CLUSTER_SWING_CLOSE_KERNEL_PX,
} from './door-swing-mask'

type Vec2 = { x: number; y: number }

export type L12HingeStraightenMeta = {
  /** UI-clockwise degrees: crop → wall-horizontal. */
  wallAlignUiDeg: number
  expandedWidth: number
  expandedHeight: number
  offsetX: number
  offsetY: number
  centerX: number
  centerY: number
  rotated180: boolean
  /** Floor-space origin of the local crop. */
  offsetFloorX: number
  offsetFloorY: number
}

export type L12DoorHingeResult = {
  hingePx: RefPoint
  axes: [DoorHingeAxis, DoorHingeAxis]
  swingAngleDeg: number
}

/** UI-clockwise degrees that map wallUnit → +X (horizontal, tip to the right). */
export function wallAlignUiDegrees(wallUnit: Vec2): number {
  const n = normalizeVector(wallUnit.x, wallUnit.y)
  if (!n) return 0
  // Image angle of wall tip (atan2 y,x); want 0° (+X). UI clockwise = -imageDeg.
  const imageDeg = (Math.atan2(n.y, n.x) * 180) / Math.PI
  return -imageDeg
}

function expandedSize(
  width: number,
  height: number,
  uiDeg: number,
): { width: number; height: number } {
  const rad = (-uiDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    width: Math.max(1, Math.ceil(width * cos + height * sin)),
    height: Math.max(1, Math.ceil(width * sin + height * cos)),
  }
}

/**
 * Binary mask rotate (255 = swing), zelfde model als `rotateMatExpandBounds`
 * (OpenCV getRotationMatrix2D + expand offset).
 */
export function rotateSwingMaskExpand(
  maskData: Uint8Array,
  width: number,
  height: number,
  uiDeg: number,
): { data: Uint8Array; width: number; height: number; offsetX: number; offsetY: number } {
  if (Math.abs(uiDeg) < 0.01) {
    return { data: maskData, width, height, offsetX: 0, offsetY: 0 }
  }
  const expanded = expandedSize(width, height, uiDeg)
  const offsetX = (expanded.width - width) / 2
  const offsetY = (expanded.height - height) / 2
  const cx = width / 2
  const cy = height / 2
  const cvRad = (-uiDeg * Math.PI) / 180
  const cos = Math.cos(cvRad)
  const sin = Math.sin(cvRad)
  const out = new Uint8Array(expanded.width * expanded.height)
  // Inverse map: for each dst pixel, sample nearest src (nearest for binary).
  for (let y = 0; y < expanded.height; y += 1) {
    for (let x = 0; x < expanded.width; x += 1) {
      const dx = x - cx - offsetX
      const dy = y - cy - offsetY
      const sx = cos * dx - sin * dy + cx
      const sy = sin * dx + cos * dy + cy
      const ix = Math.round(sx)
      const iy = Math.round(sy)
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue
      out[y * expanded.width + x] = maskData[iy * width + ix] ?? 0
    }
  }
  return {
    data: out,
    width: expanded.width,
    height: expanded.height,
    offsetX,
    offsetY,
  }
}

function bandWhiteMass(data: Uint8Array, width: number, y0: number, y1: number): number {
  const ya = Math.max(0, Math.floor(y0))
  const yb = Math.max(ya, Math.floor(y1))
  let count = 0
  for (let y = ya; y < yb; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 0) >= 128) count += 1
    }
  }
  return count
}

/** LBE: swing-massa onderaan (white ≥128), anders 180°. */
export function orientSwingMaskToBottom(
  maskData: Uint8Array,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number; rotated180: boolean } {
  if (height < 8 || width < 8) {
    return { data: maskData, width, height, rotated180: false }
  }
  const top = bandWhiteMass(maskData, width, 0, height * 0.45)
  const bottom = bandWhiteMass(maskData, width, height * 0.55, height)
  // Meer swing-massa boven → 180° zodat sector onderaan ligt (LBE).
  if (top <= bottom * 1.08) {
    return { data: maskData, width, height, rotated180: false }
  }
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[(height - 1 - y) * width + (width - 1 - x)] = maskData[y * width + x] ?? 0
    }
  }
  return { data: out, width, height, rotated180: true }
}

/** Straightened → local crop coords (vóór floor-offset). */
function untransformStraightenedPoint(point: RefPoint, meta: L12HingeStraightenMeta): RefPoint {
  let x = point.x
  let y = point.y
  if (meta.rotated180) {
    x = meta.expandedWidth - 1 - x
    y = meta.expandedHeight - 1 - y
  }
  const cx = meta.centerX
  const cy = meta.centerY
  const dx = x - cx - meta.offsetX
  const dy = y - cy - meta.offsetY
  const cvRad = (-meta.wallAlignUiDeg * Math.PI) / 180
  const cos = Math.cos(cvRad)
  const sin = Math.sin(cvRad)
  // Inverse of OpenCV R(cvDeg): R^T
  return {
    x: cos * dx - sin * dy + cx,
    y: sin * dx + cos * dy + cy,
  }
}

function toFloorAxis(axis: DoorHingeAxis, meta: L12HingeStraightenMeta): DoorHingeAxis {
  const aLocal = untransformStraightenedPoint(axis.a, meta)
  const bLocal = untransformStraightenedPoint(axis.b, meta)
  return {
    a: { x: aLocal.x + meta.offsetFloorX, y: aLocal.y + meta.offsetFloorY },
    b: { x: bLocal.x + meta.offsetFloorX, y: bLocal.y + meta.offsetFloorY },
    angleDeg: axis.angleDeg,
    supportLength: axis.supportLength,
  }
}

/**
 * L12 hinge: tight white faceIds-mask → (cluster: morph-close ink-gaps) →
 * muur H + swing onder → mask-hinge → floor.
 * Zelfde hinge-opties als REF (`preferredWallAxis: 'h'`, geen angle-prior).
 */
export function computeL12DoorHinge(params: {
  cv: OpenCV
  /** Opening-wit labels (`rawLabelsData`). */
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  faceIds: number[]
  /** Zoekvenster; mask wordt getrimd tot face-pixels. */
  bbox: RefBBox
  wallUnit: Vec2
}): L12DoorHingeResult | null {
  const painted = buildDoorSwingMask({
    labelsData: params.labelsData,
    parentMap: params.parentMap,
    width: params.width,
    height: params.height,
    faceIds: params.faceIds,
    bbox: params.bbox,
    cv: params.cv,
  })
  if (!painted) return null

  const wallAlignUiDeg = wallAlignUiDegrees(params.wallUnit)
  const rotated = rotateSwingMaskExpand(
    painted.maskData,
    painted.width,
    painted.height,
    wallAlignUiDeg,
  )
  const oriented = orientSwingMaskToBottom(rotated.data, rotated.width, rotated.height)
  const meta: L12HingeStraightenMeta = {
    wallAlignUiDeg,
    expandedWidth: oriented.width,
    expandedHeight: oriented.height,
    offsetX: rotated.offsetX,
    offsetY: rotated.offsetY,
    centerX: painted.width / 2,
    centerY: painted.height / 2,
    rotated180: oriented.rotated180,
    offsetFloorX: painted.offsetX,
    offsetFloorY: painted.offsetY,
  }

  const hingeLocal = computeDoorHingeFromMask({
    cv: params.cv,
    maskData: oriented.data,
    width: oriented.width,
    height: oriented.height,
    offsetX: 0,
    offsetY: 0,
    options: {
      preferredWallAxis: 'h',
    },
  })
  if (!hingeLocal) return null

  const hingeCrop = untransformStraightenedPoint(hingeLocal.hingePx, meta)
  const axes: [DoorHingeAxis, DoorHingeAxis] = [
    toFloorAxis(hingeLocal.axes[0], meta),
    toFloorAxis(hingeLocal.axes[1], meta),
  ]
  return {
    hingePx: {
      x: hingeCrop.x + meta.offsetFloorX,
      y: hingeCrop.y + meta.offsetFloorY,
    },
    axes,
    swingAngleDeg: hingeLocal.swingAngleDeg,
  }
}

/** Test/helper: roundtrip local crop point through straighten. */
export function roundtripStraightenedPoint(
  localPoint: RefPoint,
  meta: L12HingeStraightenMeta,
): RefPoint {
  const cx = meta.centerX
  const cy = meta.centerY
  const cvRad = (-meta.wallAlignUiDeg * Math.PI) / 180
  const cos = Math.cos(cvRad)
  const sin = Math.sin(cvRad)
  let x = cos * (localPoint.x - cx) + sin * (localPoint.y - cy) + cx + meta.offsetX
  let y = -sin * (localPoint.x - cx) + cos * (localPoint.y - cy) + cy + meta.offsetY
  if (meta.rotated180) {
    x = meta.expandedWidth - 1 - x
    y = meta.expandedHeight - 1 - y
  }
  return untransformStraightenedPoint({ x, y }, meta)
}
