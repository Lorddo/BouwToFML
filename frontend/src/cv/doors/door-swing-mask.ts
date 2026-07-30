import type { OpenCV } from '@/cv/loadOpenCV'
import { directionalCloseForeground } from '@/cv/port/morphClose'
import { clampRefBBoxToImage, type BBoxBounds } from './door-geometry-utils'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { RefBBox } from '@/cv/refs/types'

/**
 * Directional MORPH_CLOSE kernel (px lengte) om dunne inktbruggen tussen
 * cluster-witstroken te dichten. Alleen pixels binnen de faceIds-mask —
 * buur-twins zitten niet in de mask en mergen dus niet mee.
 */
export const CLUSTER_SWING_CLOSE_KERNEL_PX = 5

export type SwingMaskCrop = {
  maskData: Uint8Array
  width: number
  height: number
  offsetX: number
  offsetY: number
}

/**
 * Trim empty borders so hinge/L11 ziet alleen swing pixels (niet cluster-unie
 * leegte na doorframe-peel). Seed-bbox blijft zoekvenster.
 */
export function trimMaskToContent(params: {
  maskData: Uint8Array
  width: number
  height: number
  offsetX: number
  offsetY: number
}): SwingMaskCrop | null {
  let minX = params.width
  let minY = params.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < params.height; y += 1) {
    for (let x = 0; x < params.width; x += 1) {
      if ((params.maskData[y * params.width + x] ?? 0) < 128) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  const trimW = maxX - minX + 1
  const trimH = maxY - minY + 1
  if (trimW === params.width && trimH === params.height && minX === 0 && minY === 0) {
    return {
      maskData: params.maskData,
      width: params.width,
      height: params.height,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    }
  }
  const out = new Uint8Array(trimW * trimH)
  for (let y = 0; y < trimH; y += 1) {
    const srcRow = (minY + y) * params.width + minX
    out.set(params.maskData.subarray(srcRow, srcRow + trimW), y * trimW)
  }
  return {
    maskData: out,
    width: trimW,
    height: trimH,
    offsetX: params.offsetX + minX,
    offsetY: params.offsetY + minY,
  }
}

export function countUniqueSwingFaceIds(faceIds: readonly number[]): number {
  const set = new Set<number>()
  for (const id of faceIds) {
    if (id > 0) set.add(id)
  }
  return set.size
}

/** Paint faceIds in bbox → tight content crop (geen morph-close). */
export function paintSwingFaceMask(params: {
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  faceIds: readonly number[]
  bbox: RefBBox
}): SwingMaskCrop | null {
  const bounds = clampRefBBoxToImage(params.bbox, params.width, params.height)
  if (!bounds) return null
  const faceSet = new Set(params.faceIds.filter((id) => id > 0))
  if (faceSet.size <= 0) return null
  const cropWidth = bounds.x1 - bounds.x0
  const cropHeight = bounds.y1 - bounds.y0
  const maskData = new Uint8Array(cropWidth * cropHeight)
  let filled = 0
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const label = params.labelsData[y * params.width + x] ?? 0
      if (label <= 0) continue
      const root = resolveMergedLabel(label, params.parentMap)
      if (!faceSet.has(root) && !faceSet.has(label)) continue
      maskData[(y - bounds.y0) * cropWidth + (x - bounds.x0)] = 255
      filled += 1
    }
  }
  if (filled <= 0) return null
  return trimMaskToContent({
    maskData,
    width: cropWidth,
    height: cropHeight,
    offsetX: bounds.x0,
    offsetY: bounds.y0,
  })
}

/**
 * Dicht dunne inktgaten tussen multi-face cluster-witstroken zodat
 * `findContours(RETR_EXTERNAL)` één sectorcontour ziet i.p.v. N losse bladen.
 */
export function closeClusterSwingMaskGaps(params: {
  cv: OpenCV
  maskData: Uint8Array
  width: number
  height: number
  offsetX: number
  offsetY: number
  kernelPx?: number
}): SwingMaskCrop {
  const kernelPx = Math.max(3, Math.round(params.kernelPx ?? CLUSTER_SWING_CLOSE_KERNEL_PX))
  const mat = new params.cv.Mat(params.height, params.width, params.cv.CV_8UC1)
  try {
    mat.data.set(params.maskData)
    const closed = directionalCloseForeground(params.cv, mat, kernelPx, 'white')
    try {
      const out = new Uint8Array(params.width * params.height)
      out.set(closed.data as Uint8Array)
      return (
        trimMaskToContent({
          maskData: out,
          width: params.width,
          height: params.height,
          offsetX: params.offsetX,
          offsetY: params.offsetY,
        }) ?? {
          maskData: out,
          width: params.width,
          height: params.height,
          offsetX: params.offsetX,
          offsetY: params.offsetY,
        }
      )
    } finally {
      closed.delete()
    }
  } finally {
    mat.delete()
  }
}

/** Paint + optioneel morph-close bij multi-face (L11/L12 gedeeld). */
export function buildDoorSwingMask(params: {
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  faceIds: readonly number[]
  bbox: RefBBox
  cv?: OpenCV | null
}): SwingMaskCrop | null {
  let painted = paintSwingFaceMask(params)
  if (!painted) return null
  // ESC:D-54 (A)
  if (params.cv && countUniqueSwingFaceIds(params.faceIds) > 1) {
    painted = closeClusterSwingMaskGaps({
      cv: params.cv,
      maskData: painted.maskData,
      width: painted.width,
      height: painted.height,
      offsetX: painted.offsetX,
      offsetY: painted.offsetY,
    })
  }
  return painted
}

export type SwingMaskSide = 'left' | 'right' | 'top' | 'bottom'

export type SwingMaskSideContact = {
  side: SwingMaskSide
  /** White pixels sampled on that mask-edge band. */
  sampleCount: number
  /** Samples with wall within contactDepth. */
  contactCount: number
  score: number
  proximityDistancePx: number
  sideMid: { x: number; y: number }
  sideLength: number
}

function distanceToWallMask(
  wallMask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  normalX: number,
  normalY: number,
  maxSteps: number,
  inkThreshold: number,
): number {
  for (let step = 0; step <= maxSteps; step += 1) {
    const x = Math.round(startX + normalX * step)
    const y = Math.round(startY + normalY * step)
    if (x < 0 || y < 0 || x >= width || y >= height) return Number.POSITIVE_INFINITY
    if ((wallMask[y * width + x] ?? 0) >= inkThreshold) return step
  }
  return Number.POSITIVE_INFINITY
}

function distanceToWallBBoxes(
  wallBBoxes: readonly BBoxBounds[],
  startX: number,
  startY: number,
  normalX: number,
  normalY: number,
  maxSteps: number,
): number {
  if (wallBBoxes.length <= 0) return Number.POSITIVE_INFINITY
  let best = Number.POSITIVE_INFINITY
  for (let step = 0; step <= maxSteps; step += 1) {
    const x = startX + normalX * step
    const y = startY + normalY * step
    for (const box of wallBBoxes) {
      if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) {
        best = Math.min(best, step)
        break
      }
    }
    if (best <= step) return best
  }
  return best
}

/**
 * Meet per zijde hoeveel gemergde swing-rand tegen muur zit (wallMask en/of
 * adjacent wall-bboxes). As-keuze voor L11 Path B — niet wall-union aspect.
 */
export function measureSwingMaskSideContacts(params: {
  mask: SwingMaskCrop
  wallMask: Uint8Array
  width: number
  height: number
  contactDepthPx: number
  searchDepthPx: number
  wallBBoxes?: readonly BBoxBounds[]
  inkThreshold?: number
  edgeBandPx?: number
}): SwingMaskSideContact[] {
  const inkThreshold = params.inkThreshold ?? 128
  const band = Math.max(1, Math.round(params.edgeBandPx ?? 3))
  const depth = Math.max(1, params.contactDepthPx)
  const searchDepth = Math.max(depth, params.searchDepthPx)
  const wallBBoxes = params.wallBBoxes ?? []
  const { maskData, width: mw, height: mh, offsetX, offsetY } = params.mask

  const sides: Array<{
    side: SwingMaskSide
    normalX: number
    normalY: number
  }> = [
    { side: 'left', normalX: -1, normalY: 0 },
    { side: 'right', normalX: 1, normalY: 0 },
    { side: 'top', normalX: 0, normalY: -1 },
    { side: 'bottom', normalX: 0, normalY: 1 },
  ]

  const out: SwingMaskSideContact[] = []
  for (const { side, normalX, normalY } of sides) {
    let sampleCount = 0
    let contactCount = 0
    let distanceSum = 0
    let distanceHits = 0
    let midSumX = 0
    let midSumY = 0

    const visit = (lx: number, ly: number): void => {
      if ((maskData[ly * mw + lx] ?? 0) < 128) return
      sampleCount += 1
      const fx = offsetX + lx
      const fy = offsetY + ly
      midSumX += fx
      midSumY += fy
      const dMask = distanceToWallMask(
        params.wallMask,
        params.width,
        params.height,
        fx,
        fy,
        normalX,
        normalY,
        searchDepth,
        inkThreshold,
      )
      const dBox = distanceToWallBBoxes(wallBBoxes, fx, fy, normalX, normalY, searchDepth)
      // ESC:D-55 (C)
      const distancePx = Math.min(dMask, dBox)
      if (!Number.isFinite(distancePx)) return
      distanceSum += distancePx
      distanceHits += 1
      if (distancePx <= depth) contactCount += 1
    }

    if (side === 'left') {
      for (let y = 0; y < mh; y += 1) {
        for (let x = 0; x < Math.min(band, mw); x += 1) visit(x, y)
      }
    } else if (side === 'right') {
      for (let y = 0; y < mh; y += 1) {
        for (let x = Math.max(0, mw - band); x < mw; x += 1) visit(x, y)
      }
    } else if (side === 'top') {
      for (let y = 0; y < Math.min(band, mh); y += 1) {
        for (let x = 0; x < mw; x += 1) visit(x, y)
      }
    } else {
      for (let y = Math.max(0, mh - band); y < mh; y += 1) {
        for (let x = 0; x < mw; x += 1) visit(x, y)
      }
    }

    const sideLength = side === 'left' || side === 'right' ? Math.max(1, mh) : Math.max(1, mw)
    const edgeMid =
      side === 'left'
        ? { x: offsetX, y: sampleCount > 0 ? midSumY / sampleCount : offsetY + mh / 2 }
        : side === 'right'
          ? {
              x: offsetX + mw - 1,
              y: sampleCount > 0 ? midSumY / sampleCount : offsetY + mh / 2,
            }
          : side === 'top'
            ? { x: sampleCount > 0 ? midSumX / sampleCount : offsetX + mw / 2, y: offsetY }
            : {
                x: sampleCount > 0 ? midSumX / sampleCount : offsetX + mw / 2,
                y: offsetY + mh - 1,
              }
    out.push({
      side,
      sampleCount,
      contactCount,
      score: contactCount / Math.max(1, sampleCount),
      proximityDistancePx: distanceHits > 0 ? distanceSum / distanceHits : Number.POSITIVE_INFINITY,
      sideMid: edgeMid,
      sideLength,
    })
  }
  return out
}
