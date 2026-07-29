import type { CanvasLike } from '@/cv/port/canvasEnv'
import { cropRegion } from './ref-crop-bw'
import { labelInkComponents, resolveOpeningUnits } from './ref-blob'
import { findInkBounds } from './ref-deskew'
import { classifyFaceRoles, labelWhiteFaces } from './ref-face-profile'
import type { RefBBox, RefBlobUnit, RefFaceProfile } from './types'

type RefKind = 'wall' | 'door' | 'window'

export type RefCropState = {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
}

export type FaceCropResult = {
  cropBBox: RefBBox
  state: RefCropState
  units: RefBlobUnit[]
  primary: RefBlobUnit | null
}

export type ResolvedFaceCrop = {
  cropBBox: RefBBox
  maskedData: Uint8Array
  units: RefBlobUnit[]
  primary: RefBlobUnit | null
}

function clampBBox(bbox: RefBBox, width: number, height: number): RefBBox {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  }
}

function bboxFromMask(mask: Uint8Array, width: number, height: number, padPx = 0): RefBBox | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) === 0) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  return {
    x: Math.max(0, minX - padPx),
    y: Math.max(0, minY - padPx),
    width: maxX - minX + 1 + padPx * 2,
    height: maxY - minY + 1 + padPx * 2,
  }
}

function areaInBBox(data: Uint8Array, width: number, height: number, bbox: RefBBox): number {
  let area = 0
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if ((data[y * width + x] ?? 255) < 128) area += 1
    }
  }
  return area
}

function centroidInBBox(data: Uint8Array, width: number, height: number, bbox: RefBBox): { x: number; y: number } {
  let n = 0
  let sx = 0
  let sy = 0
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      sx += x
      sy += y
      n += 1
    }
  }
  if (n <= 0) return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
  return { x: sx / n, y: sy / n }
}

function buildComponentUnit(data: Uint8Array, width: number, height: number): RefBlobUnit {
  const bbox = findInkBounds(data, width, height, 0) ?? { x: 0, y: 0, width, height }
  return {
    index: 0,
    areaPx: areaInBBox(data, width, height, bbox),
    bbox,
    centroid: centroidInBBox(data, width, height, bbox),
    isPrimary: true,
    source: 'component',
    includesBothHeads: false,
  }
}

function translateUnits(units: RefBlobUnit[], crop: RefBBox): RefBlobUnit[] {
  const out: RefBlobUnit[] = []
  for (const unit of units) {
    const x0 = Math.max(crop.x, unit.bbox.x)
    const y0 = Math.max(crop.y, unit.bbox.y)
    const x1 = Math.min(crop.x + crop.width, unit.bbox.x + unit.bbox.width)
    const y1 = Math.min(crop.y + crop.height, unit.bbox.y + unit.bbox.height)
    if (x1 - x0 < 1 || y1 - y0 < 1) continue
    out.push({
      ...unit,
      bbox: {
        x: x0 - crop.x,
        y: y0 - crop.y,
        width: x1 - x0,
        height: y1 - y0,
      },
      centroid: { x: unit.centroid.x - crop.x, y: unit.centroid.y - crop.y },
    })
  }
  return out
}

function buildEnclosureFaceMask(
  data: Uint8Array,
  width: number,
  height: number,
  faceProfile: RefFaceProfile,
  options: { includeOutside: boolean; sealBorders?: boolean },
): Uint8Array {
  const { labels, faces } = labelWhiteFaces(data, width, height, undefined, {
    sealBorders: options.sealBorders,
    connectivity: options.sealBorders ? 4 : 8,
  })
  const roles = classifyFaceRoles(faces, width, height)
  const byLabel = new Map<number, string>()
  for (const face of roles) byLabel.set(face.label, face.role)
  const targetLabels = new Set<number>()
  const allowRole = (role: string) =>
    role === 'interior' || role === 'head' || (options.includeOutside && role === 'outside')
  for (const face of faceProfile.faces) {
    const role = byLabel.get(face.label) ?? face.role
    if (allowRole(role)) targetLabels.add(face.label)
  }
  if (targetLabels.size === 0) {
    for (const face of roles) {
      if (allowRole(face.role)) targetLabels.add(face.label)
    }
  }
  const out = new Uint8Array(width * height)
  if (targetLabels.size === 0) return out
  for (let i = 0; i < labels.length; i += 1) {
    if (targetLabels.has(labels[i] ?? 0)) out[i] = 1
  }
  return out
}

function buildInteriorFaceMask(
  data: Uint8Array,
  width: number,
  height: number,
  faceProfile: RefFaceProfile,
): Uint8Array {
  return buildEnclosureFaceMask(data, width, height, faceProfile, { includeOutside: false })
}

function dilateMask(mask: Uint8Array, width: number, height: number, radiusPx: number): Uint8Array {
  const radius = Math.max(0, Math.floor(radiusPx))
  if (radius <= 0) return mask
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) !== 1) continue
      const x0 = Math.max(0, x - radius)
      const y0 = Math.max(0, y - radius)
      const x1 = Math.min(width - 1, x + radius)
      const y1 = Math.min(height - 1, y + radius)
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          out[yy * width + xx] = 1
        }
      }
    }
  }
  return out
}

function collectInkLabelsTouchingMask(
  data: Uint8Array,
  width: number,
  height: number,
  faceMask: Uint8Array,
): { labels: Int32Array; keep: Set<number> } {
  const ink = labelInkComponents(data, width, height)
  const keep = new Set<number>()
  const offsets = [-1, 0, 1]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((faceMask[y * width + x] ?? 0) === 0) continue
      for (const dy of offsets) {
        for (const dx of offsets) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const i = ny * width + nx
          if ((data[i] ?? 255) >= 128) continue
          const label = ink.labels[i] ?? 0
          if (label > 0) keep.add(label)
        }
      }
    }
  }
  if (keep.size === 0) {
    for (const blob of ink.blobs) keep.add(blob.label)
  }
  return { labels: ink.labels, keep }
}

function buildPolygonMaskedData(
  data: Uint8Array,
  width: number,
  height: number,
  faceMask: Uint8Array,
  maxInkDistancePx: number,
  protectedInkMask?: Uint8Array,
): { maskedData: Uint8Array; regionMask: Uint8Array } {
  const nearFaceMask = dilateMask(faceMask, width, height, maxInkDistancePx)
  const { labels, keep } = collectInkLabelsTouchingMask(data, width, height, faceMask)
  const maskedData = new Uint8Array(width * height)
  maskedData.fill(255)
  const regionMask = new Uint8Array(width * height)
  for (let i = 0; i < maskedData.length; i += 1) {
    const isFace = (faceMask[i] ?? 0) === 1
    if (isFace) regionMask[i] = 1
    const isProtected = (protectedInkMask?.[i] ?? 0) === 1
    if (
      (data[i] ?? 255) < 128 &&
      (isProtected || (keep.has(labels[i] ?? 0) && (nearFaceMask[i] ?? 0) === 1))
    ) {
      maskedData[i] = 0
      regionMask[i] = 1
    }
  }
  return { maskedData, regionMask }
}

export function resolveFaceCropBBox(params: {
  kind: RefKind
  data: Uint8Array
  width: number
  height: number
  faceProfile: RefFaceProfile
  padPx?: number
  maxInkDistancePx?: number
  /** Bescherm middenlijn-inkt tegen 3px face-trim (deur zonder draaicirkel) */
  protectedInkMask?: Uint8Array
}): ResolvedFaceCrop {
  const padPx = params.padPx ?? 2
  const maxInkDistancePx = params.maxInkDistancePx ?? 3

  if (params.kind === 'wall') {
    // Muur: zelfde inkt-sluiting als openingen, maar buitenranden (outside faces) tellen
    // ook als afsluiting — solid fill heeft vaak geen interior-witte faces.
    const faceMask = buildEnclosureFaceMask(
      params.data,
      params.width,
      params.height,
      params.faceProfile,
      { includeOutside: true, sealBorders: true },
    )
    const { maskedData, regionMask } = buildPolygonMaskedData(
      params.data,
      params.width,
      params.height,
      faceMask,
      maxInkDistancePx,
    )
    const hasInk = maskedData.some((v) => v < 128)
    const useData = hasInk ? maskedData : params.data
    const useMask = hasInk ? regionMask : undefined
    const fallbackBounds = findInkBounds(useData, params.width, params.height, padPx) ?? {
      x: 0,
      y: 0,
      width: params.width,
      height: params.height,
    }
    const polygonBounds = useMask
      ? bboxFromMask(useMask, params.width, params.height, padPx) ?? fallbackBounds
      : fallbackBounds
    const cropBBox = clampBBox(polygonBounds, params.width, params.height)
    const unit = buildComponentUnit(useData, params.width, params.height)
    return {
      cropBBox,
      maskedData: useData,
      units: [unit],
      primary: unit,
    }
  }

  const faceMask = buildInteriorFaceMask(params.data, params.width, params.height, params.faceProfile)
  const { maskedData, regionMask } = buildPolygonMaskedData(
    params.data,
    params.width,
    params.height,
    faceMask,
    maxInkDistancePx,
    params.protectedInkMask,
  )
  const fallbackBounds = findInkBounds(maskedData, params.width, params.height, 0) ?? {
    x: 0,
    y: 0,
    width: params.width,
    height: params.height,
  }
  const polygonBounds = bboxFromMask(regionMask, params.width, params.height, padPx) ?? fallbackBounds
  const cropBBox = clampBBox(polygonBounds, params.width, params.height)

  const resolved = resolveOpeningUnits({
    data: maskedData,
    width: params.width,
    height: params.height,
  })
  const units = resolved.units.length > 0 ? resolved.units : [buildComponentUnit(maskedData, params.width, params.height)]
  const primary = resolved.primary ?? units.find((unit) => unit.isPrimary) ?? units[0] ?? null
  return {
    cropBBox,
    maskedData,
    units,
    primary,
  }
}

export function cropRefByFaces(params: {
  kind: RefKind
  state: RefCropState
  faceProfile: RefFaceProfile
  padPx?: number
  maxInkDistancePx?: number
  protectedInkMask?: Uint8Array
}): FaceCropResult {
  const resolved = resolveFaceCropBBox({
    kind: params.kind,
    data: params.state.bwData,
    width: params.state.width,
    height: params.state.height,
    faceProfile: params.faceProfile,
    padPx: params.padPx,
    maxInkDistancePx: params.maxInkDistancePx,
    protectedInkMask: params.protectedInkMask,
  })
  const sourceState: RefCropState = {
    ...params.state,
    bwData: resolved.maskedData,
  }
  const cropped = cropRegion({ ...sourceState, bbox: resolved.cropBBox })
  let units = translateUnits(resolved.units, resolved.cropBBox).map((unit, index) => ({
    ...unit,
    index,
  }))
  if (units.length === 0) units = [buildComponentUnit(cropped.bwData, cropped.width, cropped.height)]
  let maxArea = -1
  let primaryIndex = 0
  for (const unit of units) {
    if (unit.areaPx > maxArea) {
      maxArea = unit.areaPx
      primaryIndex = unit.index
    }
  }
  for (const unit of units) unit.isPrimary = unit.index === primaryIndex
  const primary = units.find((unit) => unit.isPrimary) ?? units[0] ?? null
  return {
    cropBBox: resolved.cropBBox,
    state: cropped,
    units,
    primary,
  }
}
