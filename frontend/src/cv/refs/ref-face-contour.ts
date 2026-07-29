import type { OpenCV } from '@/cv/loadOpenCV'
import { resolveKopeindeAxisBand, type KopeindeAxisBand } from './ref-general-categories'
import { labelWhiteFaces } from './ref-face-profile'
import type {
  CombinedFacePolygonPart,
  CombinedFacePolygonZone,
  RefFace,
  RefFaceProfile,
  RefPoint,
} from './types'

const DEFAULT_EPSILON_FACTOR = 0.003

function isFaceRoleIncluded(role: string): boolean {
  return role === 'interior' || role === 'head'
}

function resolveProfileLabelsData(
  data: Uint8Array,
  width: number,
  height: number,
  faceProfile: RefFaceProfile,
): Int32Array {
  if (faceProfile.labelsData && faceProfile.labelsData.length === width * height) {
    return faceProfile.labelsData
  }
  return labelWhiteFaces(data, width, height).labels
}

function extractApproxPointsFromContour(
  cv: OpenCV,
  contour: OpenCV['Mat'],
  epsilonFactor?: number,
): RefPoint[] {
  const approx = new cv.Mat()
  try {
    const epsilon = Math.max(
      0.5,
      cv.arcLength(contour, true) * (epsilonFactor ?? DEFAULT_EPSILON_FACTOR),
    )
    cv.approxPolyDP(contour, approx, epsilon, true)
    const data = approx.data32S as Int32Array
    const points: RefPoint[] = []
    for (let i = 0; i < approx.rows; i += 1) {
      points.push({ x: data[i * 2] ?? 0, y: data[i * 2 + 1] ?? 0 })
    }
    if (points.length >= 2) {
      const first = points[0]
      const last = points[points.length - 1]
      if (first && last && first.x === last.x && first.y === last.y) points.pop()
    }
    return points
  } finally {
    approx.delete()
  }
}

export function approxContoursFromMask(params: {
  cv: OpenCV
  maskData: Uint8Array
  width: number
  height: number
  epsilonFactor?: number
}): RefPoint[][] {
  const mat = new params.cv.Mat(params.height, params.width, params.cv.CV_8UC1)
  const contours = new params.cv.MatVector()
  const hierarchy = new params.cv.Mat()
  try {
    mat.data.set(params.maskData)
    params.cv.findContours(
      mat,
      contours,
      hierarchy,
      params.cv.RETR_EXTERNAL,
      params.cv.CHAIN_APPROX_SIMPLE,
    )
    const candidates: Array<{ area: number; polygon: RefPoint[] }> = []
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      try {
        const area = Math.abs(params.cv.contourArea(contour, false))
        const polygon = extractApproxPointsFromContour(params.cv, contour, params.epsilonFactor)
        if (polygon.length >= 3 && area > 0) candidates.push({ area, polygon })
      } finally {
        contour.delete()
      }
    }
    candidates.sort((a, b) => b.area - a.area)
    return candidates.map((entry) => entry.polygon)
  } finally {
    hierarchy.delete()
    contours.delete()
    mat.delete()
  }
}

function approxContourFromMask(params: {
  cv: OpenCV
  maskData: Uint8Array
  width: number
  height: number
  epsilonFactor?: number
}): RefPoint[] {
  return approxContoursFromMask(params)[0] ?? []
}

export function buildFaceUnionMask(
  data: Uint8Array,
  width: number,
  height: number,
  faceProfile: RefFaceProfile,
  includeLabels?: ReadonlySet<number>,
): Uint8Array {
  const labels = resolveProfileLabelsData(data, width, height, faceProfile)
  const include =
    includeLabels ??
    new Set(
      faceProfile.faces.filter((face) => isFaceRoleIncluded(face.role)).map((face) => face.label),
    )
  const mask = new Uint8Array(width * height)
  if (include.size === 0) return mask
  for (let i = 0; i < labels.length; i += 1) {
    if (include.has(labels[i] ?? 0)) mask[i] = 255
  }
  return mask
}

function classifyFaceAxisZone(face: RefFace, band: KopeindeAxisBand): CombinedFacePolygonZone {
  const y = face.centroid.y
  if (y < band.yMin) return 'above'
  if (y > band.yMax) return 'below'
  return 'on_axis'
}

function includedFacesByZone(
  faceProfile: RefFaceProfile,
  band: KopeindeAxisBand | null,
): Map<CombinedFacePolygonZone, number[]> {
  const groups = new Map<CombinedFacePolygonZone, number[]>([
    ['on_axis', []],
    ['above', []],
    ['below', []],
  ])
  for (const face of faceProfile.faces) {
    if (!isFaceRoleIncluded(face.role)) continue
    const zone = band ? classifyFaceAxisZone(face, band) : 'on_axis'
    groups.get(zone)!.push(face.label)
  }
  return groups
}

/** Pure indeling van interior/head-labels t.o.v. kopeinde-as (zonder contour-extractie). */
export function groupInteriorFaceLabelsByKopeindeAxis(
  faceProfile: RefFaceProfile,
  spanW: number,
): {
  band: KopeindeAxisBand | null
  onAxis: number[]
  above: number[]
  below: number[]
} {
  const band = resolveKopeindeAxisBand(faceProfile, spanW)
  const byZone = includedFacesByZone(faceProfile, band)
  return {
    band,
    onAxis: byZone.get('on_axis') ?? [],
    above: byZone.get('above') ?? [],
    below: byZone.get('below') ?? [],
  }
}

const ZONE_ORDER: CombinedFacePolygonZone[] = ['on_axis', 'above', 'below']

/**
 * Union-contouren gesplitst op kopeinde-as:
 * - on_axis: alle interior/head-vlakken waarvan centroid in de hoogteband van de koppen valt
 * - above / below: vlakken boven resp. onder die as
 * Zonder kopeinde: één zone (on_axis) = volledige union zoals voorheen.
 */
export function extractCombinedFacePolygonParts(params: {
  cv: OpenCV
  data: Uint8Array
  width: number
  height: number
  faceProfile: RefFaceProfile
  epsilonFactor?: number
}): CombinedFacePolygonPart[] {
  const band = resolveKopeindeAxisBand(params.faceProfile, params.width)
  const labels = resolveProfileLabelsData(
    params.data,
    params.width,
    params.height,
    params.faceProfile,
  )
  const byZone = new Map<CombinedFacePolygonZone, CombinedFacePolygonPart[]>([
    ['on_axis', []],
    ['above', []],
    ['below', []],
  ])
  const includedFaces = params.faceProfile.faces.filter((face) => isFaceRoleIncluded(face.role))
  for (const face of includedFaces) {
    const zone = band ? classifyFaceAxisZone(face, band) : 'on_axis'
    const mask = new Uint8Array(params.width * params.height)
    for (let i = 0; i < labels.length; i += 1) {
      if ((labels[i] ?? 0) === face.label) mask[i] = 255
    }
    const polygon = approxContourFromMask({
      cv: params.cv,
      maskData: mask,
      width: params.width,
      height: params.height,
      epsilonFactor: params.epsilonFactor,
    })
    if (polygon.length >= 3) {
      byZone.get(zone)?.push({ zone, polygon })
    }
  }
  const parts: CombinedFacePolygonPart[] = []
  for (const zone of ZONE_ORDER) {
    const zoneParts = byZone.get(zone) ?? []
    parts.push(...zoneParts)
  }
  return parts
}

export function extractFacePolygons(params: {
  cv: OpenCV
  data: Uint8Array
  width: number
  height: number
  faceProfile: RefFaceProfile
  epsilonFactor?: number
}): Map<number, RefPoint[]> {
  const labels = resolveProfileLabelsData(
    params.data,
    params.width,
    params.height,
    params.faceProfile,
  )
  const out = new Map<number, RefPoint[]>()
  for (const face of params.faceProfile.faces) {
    if (!isFaceRoleIncluded(face.role)) continue
    const mask = new Uint8Array(params.width * params.height)
    for (let i = 0; i < labels.length; i += 1) {
      if ((labels[i] ?? 0) === face.label) mask[i] = 255
    }
    const polygon = approxContourFromMask({
      cv: params.cv,
      maskData: mask,
      width: params.width,
      height: params.height,
      epsilonFactor: params.epsilonFactor,
    })
    if (polygon.length >= 3) out.set(face.label, polygon)
  }
  return out
}
