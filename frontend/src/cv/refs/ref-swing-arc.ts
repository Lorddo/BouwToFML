import type { RefBBox, RefFace, RefFaceProfile } from './types'
import { classifyFaceRoles, labelWhiteFaces } from './ref-face-profile'
import {
  resolveKopeindeAxisBand,
  type KopeindeAxisBand,
} from './ref-general-categories'

/** Bbox-breedte ≥ dit aandeel van crop → “full-width” kamerblob (t.o.v. echte boog). */
const FULL_WIDTH_RATIO = 0.9

/**
 * Detecteert of een deur een gevuld draaicirkel/sector-vlak heeft.
 * Geen hoekmeting — alleen ja/nee op basis van het beste swing-vlak (zone-aware).
 */
export function detectDoorSwingSector(params: {
  data: Uint8Array
  width: number
  height: number
  bbox: RefBBox
}): boolean {
  const { data, width, height, bbox } = params
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  const cropW = Math.max(1, x1 - x0)
  const cropH = Math.max(1, y1 - y0)
  if (cropW < 8 || cropH < 8) return false

  const white = labelWhiteFaces(data, width, height, { x: x0, y: y0, width: cropW, height: cropH })
  const roles = classifyFaceRoles(white.faces, cropW, cropH)
  if (roles.length === 0) return false

  return selectSwingSectorFace(roles, cropW, cropH) != null
}

export type RankedSwingSectorFace = {
  face: RefFace
  score: number
}

function isThinKozijnStrip(
  face: {
    bbox: { width: number; height: number }
    relativeCentroid: { y: number }
    compactness: number
  },
  cropH: number,
): boolean {
  const minStripH = Math.max(4, cropH * 0.12)
  return face.bbox.height <= minStripH && face.compactness > 0.72
}

function isFullCanvasInterior(
  face: { areaPx: number; bbox: { width: number; height: number } },
  cropW: number,
  cropH: number,
): boolean {
  const cropArea = cropW * cropH
  return face.areaPx > cropArea * 0.72 && face.bbox.width > cropW * 0.9 && face.bbox.height > cropH * 0.9
}

function scoreSwingSectorFace(
  face: RefFace,
  cropW: number,
  cropH: number,
): number {
  if (isFullCanvasInterior(face, cropW, cropH)) return -1
  if (face.areaPx < Math.max(24, Math.round(cropW * cropH * 0.01))) return -1
  if (isThinKozijnStrip(face, cropH)) return -1
  if (face.relativeCentroid.y < 0.18) return -1

  const largeWedge =
    face.areaPx >= cropW * cropH * 0.08 &&
    face.bbox.height >= Math.max(8, cropH * 0.2) &&
    face.relativeCentroid.y > 0.32
  if (!largeWedge) return -1

  let score = face.areaPx
  if (face.relativeCentroid.y > 0.4) score *= 1.25
  if (face.compactness > 0.25 && face.compactness < 0.9) score *= 1.1
  if (face.touchesBorder && face.relativeCentroid.y > 0.45) score *= 1.15
  if (face.role === 'outside' && face.relativeCentroid.y > 0.38) score *= 1.1

  return score
}

function faceAxisZone(
  face: RefFace,
  band: KopeindeAxisBand,
): 'above' | 'below' | 'on_axis' {
  const y = face.centroid.y
  if (y < band.yMin) return 'above'
  if (y > band.yMax) return 'below'
  return 'on_axis'
}

function buildFaceProfile(faces: RefFace[]): RefFaceProfile {
  return {
    faces,
    totalAreaPx: faces.reduce((sum, face) => sum + face.areaPx, 0),
    faceCount: faces.length,
  }
}

/**
 * Candidate pool t.o.v. kopeinde-as (LBE: boog = `below`).
 * Inclusief outside (rand-touchende boog); niet alleen interior/head.
 */
function resolveSwingCandidatePool(faces: RefFace[], cropW: number): RefFace[] {
  if (faces.length === 0) return []
  const band = resolveKopeindeAxisBand(buildFaceProfile(faces), cropW)
  if (!band) return faces

  const below: RefFace[] = []
  const onAxis: RefFace[] = []
  for (const face of faces) {
    const zone = faceAxisZone(face, band)
    if (zone === 'below') below.push(face)
    else if (zone === 'on_axis') onAxis.push(face)
  }
  if (below.length > 0) return below
  if (onAxis.length > 0) return onAxis
  // Band bestaat maar geen below/on_axis → niet `above` forceren; legacy all-faces.
  return faces
}

function rejectFullWidthWhenNarrowerExists(
  ranked: RankedSwingSectorFace[],
  cropW: number,
): RankedSwingSectorFace[] {
  if (ranked.length <= 1) return ranked
  const widthLimit = cropW * FULL_WIDTH_RATIO
  const hasNarrower = ranked.some((row) => row.face.bbox.width < widthLimit)
  if (!hasNarrower) return ranked
  return ranked.filter((row) => row.face.bbox.width < widthLimit)
}

export function rankSwingSectorFaces(
  faces: RefFace[],
  cropW: number,
  cropH: number,
): RankedSwingSectorFace[] {
  return faces
    .map((face) => ({ face, score: scoreSwingSectorFace(face, cropW, cropH) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * Zone-aware swing pick: kopeinde-`below` eerst, dan rank; full-width blob
 * wijkt voor een smallere kandidaat (Project4 Otsu-deur: 4915 vs 1072).
 */
export function rankSwingSectorFacesForPick(
  faces: RefFace[],
  cropW: number,
  cropH: number,
): RankedSwingSectorFace[] {
  const pool = resolveSwingCandidatePool(faces, cropW)
  const ranked = rankSwingSectorFaces(pool.length > 0 ? pool : faces, cropW, cropH)
  return rejectFullWidthWhenNarrowerExists(ranked, cropW)
}

export function selectSwingSectorFace(
  faces: RefFace[],
  cropW: number,
  cropH: number,
): RankedSwingSectorFace | null {
  return rankSwingSectorFacesForPick(faces, cropW, cropH)[0] ?? null
}
