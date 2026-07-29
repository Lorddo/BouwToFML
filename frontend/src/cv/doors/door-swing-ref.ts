import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { attachRefFaceDualFromWhiteLabels, refFaceWithGeom } from '@/cv/refs/ref-face-dual-space'
import { classifyFaceRoles, labelWhiteFaces } from '@/cv/refs/ref-face-profile'
import { pickExtremeKozijnFaces } from '@/cv/refs/ref-general-categories'
import { runRefStages } from '@/cv/refs/ref-stages'
import { selectSwingSectorFace } from '@/cv/refs/ref-swing-arc'
import type { RefFace, RefPoint, RefRect } from '@/cv/refs/types'
import { computeDoorHingeFromMask, type DoorSwingHingeResult } from './door-swing-hinge'
import { normalizeVector } from './door-geometry-utils'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import { DOOR_SPACE_POLICY } from './door-space-policy'
import type { DoorSwingRefBand } from './types'

function resolveAxisSpan(face: { bbox: { x: number; y: number; width: number; height: number } }, axis: 'x' | 'y'): number {
  if (axis === 'x') return face.bbox.width
  return face.bbox.height
}

function faceOuterLow(face: RefFace, axis: 'x' | 'y'): number {
  return axis === 'x' ? face.bbox.x : face.bbox.y
}

function faceOuterHigh(face: RefFace, axis: 'x' | 'y'): number {
  return axis === 'x' ? face.bbox.x + face.bbox.width : face.bbox.y + face.bbox.height
}

function pickExtremeFacesByAxis(
  faces: RefFace[],
  axis: 'x' | 'y',
  spanPx: number,
): { left: RefFace; right: RefFace } | null {
  if (axis === 'x') return pickExtremeKozijnFaces(faces, spanPx)
  const rotatedFaces = faces.map((face) => ({
    ...face,
    bbox: {
      x: face.bbox.y,
      y: face.bbox.x,
      width: face.bbox.height,
      height: face.bbox.width,
    },
    centroid: { x: face.centroid.y, y: face.centroid.x },
    relativeCentroid: { x: face.relativeCentroid.y, y: face.relativeCentroid.x },
  }))
  const rotatedExtreme = pickExtremeKozijnFaces(rotatedFaces, spanPx)
  if (!rotatedExtreme) return null
  const byLabel = new Map(faces.map((face) => [face.label, face]))
  const left = byLabel.get(rotatedExtreme.left.label)
  const right = byLabel.get(rotatedExtreme.right.label)
  if (!left || !right) return null
  return { left, right }
}

/**
 * Richting langs de openingsas vanaf het boog-scharnier naar de vrije tip
 * (as-eindpunt weg van het scharnier, parallel aan de muur).
 */
function resolveOpeningFreeDirFromHinge(hinge: DoorSwingHingeResult, axis: 'x' | 'y'): RefPoint {
  const preferred = hinge.axes
    .map((entry) => ({
      entry,
      dir: normalizeVector(entry.b.x - entry.a.x, entry.b.y - entry.a.y),
    }))
    .filter((row): row is { entry: (typeof hinge.axes)[number]; dir: RefPoint } => !!row.dir)
  if (preferred.length <= 0) {
    return axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 }
  }
  const scored = preferred.map((row) => ({
    dir: row.dir,
    score: axis === 'x' ? Math.abs(row.dir.x) : Math.abs(row.dir.y),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0]!.dir
}

function projectOnAxis(point: RefPoint, axis: 'x' | 'y'): number {
  return axis === 'x' ? point.x : point.y
}

/**
 * De draaiboog-maat (`swingSpanPx`) komt uit het sector-vlak (max face-AABB),
 * niet uit scharnier-assen — die variëren te veel voor maatvoering.
 * Die span is ~gelijk aan het deurblad / kozijn-tot-kozijn. Zakt het via
 * kozijnvlakken gemeten blad (`bladeRefPx`) hier ver onder, dan is (meestal)
 * één kozijn gemist (bv. totalRefPx=13 terwijl de boog 113px is). Onder deze
 * drempel vertrouwen we op de face-span i.p.v. de kapotte kozijnmeting.
 */
const DEGENERATE_BLADE_TO_SPAN_RATIO = 0.5

type ReferenceSizing = Pick<
  DoorSwingRefBand,
  | 'framingPx'
  | 'totalRefPx'
  | 'bladeRefPx'
  | 'ratioBlade'
  | 'overhangAlongPx'
  | 'overhangOppositePx'
  | 'clearOverhangAlongRatio'
  | 'clearOverhangOppositeRatio'
  | 'framingAlongPx'
  | 'framingOppositePx'
>

function sizingFromSwingSpan(swingSpanPx: number, fallbackTotalPx: number): ReferenceSizing {
  const totalRefPx = Math.max(1, fallbackTotalPx, swingSpanPx)
  const bladeRefPx = totalRefPx
  const ratioBlade = Math.max(0.1, bladeRefPx / Math.max(1, swingSpanPx))
  // Bij een draaideur zit het scharnier aan één kozijn: de volle opening ligt
  // langs de muur vanaf het scharnier naar het verre kozijn (= swing-span),
  // niet symmetrisch rond het scharnier. Zo blijft het deurblad op volle maat.
  return {
    framingPx: 0,
    framingAlongPx: 0,
    framingOppositePx: 0,
    totalRefPx,
    bladeRefPx,
    ratioBlade,
    overhangAlongPx: totalRefPx,
    overhangOppositePx: 0,
    clearOverhangAlongRatio: ratioBlade,
    clearOverhangOppositeRatio: 0,
  }
}

function freeDirSignOnAxis(freeDir: RefPoint, axis: 'x' | 'y'): 1 | -1 {
  const component = axis === 'x' ? freeDir.x : freeDir.y
  return component >= 0 ? 1 : -1
}

/**
 * Meet overhangs t.o.v. boog-scharnier tot kozijn-buitenranden.
 * Pivot hoeft niet op het kozijn te liggen (typisch bij ondiepe bogen).
 */
export function resolveReferenceSizing(params: {
  faces: RefFace[]
  axis: 'x' | 'y'
  swingSpanPx: number
  fallbackTotalPx: number
  hingePx: RefPoint
  freeDir: RefPoint
}): Pick<
  DoorSwingRefBand,
  | 'framingPx'
  | 'totalRefPx'
  | 'bladeRefPx'
  | 'ratioBlade'
  | 'overhangAlongPx'
  | 'overhangOppositePx'
  | 'clearOverhangAlongRatio'
  | 'clearOverhangOppositeRatio'
  | 'framingAlongPx'
  | 'framingOppositePx'
> {
  const extreme = pickExtremeFacesByAxis(params.faces, params.axis, params.fallbackTotalPx)
  if (!extreme) {
    return sizingFromSwingSpan(params.swingSpanPx, params.fallbackTotalPx)
  }

  const low = faceOuterLow(extreme.left, params.axis)
  const high = faceOuterHigh(extreme.right, params.axis)
  const totalRefPx = Math.max(1, high - low)
  const hingePos = projectOnAxis(params.hingePx, params.axis)
  const clampedHinge = Math.min(high, Math.max(low, hingePos))
  const towardHigh = freeDirSignOnAxis(params.freeDir, params.axis) > 0
  const overhangAlongPx = Math.max(0, towardHigh ? high - clampedHinge : clampedHinge - low)
  const overhangOppositePx = Math.max(0, towardHigh ? clampedHinge - low : high - clampedHinge)

  const leftSpan = resolveAxisSpan(extreme.left, params.axis)
  const rightSpan = resolveAxisSpan(extreme.right, params.axis)
  const framingAlongPx = Math.max(0, towardHigh ? rightSpan : leftSpan)
  const framingOppositePx = Math.max(0, towardHigh ? leftSpan : rightSpan)
  const framingPx = Math.max(0, leftSpan + rightSpan)
  const bladeRefPx = Math.max(1, totalRefPx - framingPx)
  // Guard: gemist kozijn → absurd smalle opening. Val terug op de swing-span,
  // die het deurblad betrouwbaar weergeeft (voorkomt ~10 cm mini-deuren).
  if (bladeRefPx < params.swingSpanPx * DEGENERATE_BLADE_TO_SPAN_RATIO) {
    return sizingFromSwingSpan(params.swingSpanPx, params.fallbackTotalPx)
  }
  const ratioBlade = Math.max(0.1, bladeRefPx / Math.max(1, params.swingSpanPx))
  const clearAlongPx = Math.max(0, overhangAlongPx - framingAlongPx)
  const clearOppositePx = Math.max(0, overhangOppositePx - framingOppositePx)
  return {
    framingPx,
    framingAlongPx,
    framingOppositePx,
    totalRefPx,
    bladeRefPx,
    ratioBlade,
    overhangAlongPx,
    overhangOppositePx,
    clearOverhangAlongRatio: clearAlongPx / Math.max(1, params.swingSpanPx),
    clearOverhangOppositeRatio: clearOppositePx / Math.max(1, params.swingSpanPx),
  }
}

/**
 * Bouw een Stage-1 ref-band vanaf de **rechte face-crop** (na `runRefStages` /
 * `straightenRefLast`). Swing ligt daar altijd onderaan (90° bij verticaal +
 * eventueel 180°) — zelfde beeld als rapport-figuur «Rechte face-crop».
 */
export function buildDoorSwingRefBandFromStraightened(params: {
  cv: OpenCV
  bwData: Uint8Array
  width: number
  height: number
}): DoorSwingRefBand | null {
  const { bwData, width, height } = params
  const white = labelWhiteFaces(bwData, width, height)
  const roles = classifyFaceRoles(white.faces, width, height)
  const dual = attachRefFaceDualFromWhiteLabels({
    data: bwData,
    width,
    height,
    labels: white.labels,
    faces: roles,
  })
  // Swing-sector: policy white; framing/kozijn-sizing: policy ink.
  assertSpacePolicy('door REF swing', DOOR_SPACE_POLICY.refSwingMeasure, 'white')
  assertSpacePolicy('door REF framing', DOOR_SPACE_POLICY.refFramingMeasure, 'ink')
  const swingRoles = roles.map((face) =>
    refFaceWithGeom(face, dual.geom(face.label, DOOR_SPACE_POLICY.refSwingMeasure)),
  )
  const inkRoles = roles.map((face) =>
    refFaceWithGeom(face, dual.geom(face.label, DOOR_SPACE_POLICY.refFramingMeasure)),
  )
  const top = selectSwingSectorFace(swingRoles, width, height)
  if (!top) return null
  const swingWpx = Math.max(1, top.face.bbox.width)
  const swingHpx = Math.max(1, top.face.bbox.height)
  const minSide = Math.min(swingWpx, swingHpx)
  if (minSide <= 0) return null
  const sectorMask = new Uint8Array(width * height)
  for (let i = 0; i < white.labels.length; i += 1) {
    if ((white.labels[i] ?? 0) === top.face.label) sectorMask[i] = 255
  }
  const hinge = computeDoorHingeFromMask({
    cv: params.cv,
    maskData: sectorMask,
    width,
    height,
  })
  if (!hinge) return null
  const axis: 'x' | 'y' = swingWpx >= swingHpx ? 'x' : 'y'
  // Maatvoering uit sector-face, niet hinge.swingSpanPx (assen-variatie).
  const faceSwingSpanPx = Math.max(swingWpx, swingHpx)
  const wallRatio = Math.max(swingWpx, swingHpx) / Math.max(1, faceSwingSpanPx)
  const depthRatio = Math.min(swingWpx, swingHpx) / Math.max(1, faceSwingSpanPx)
  const areaSpan2Ratio = top.face.areaPx / Math.max(1, faceSwingSpanPx * faceSwingSpanPx)
  const fallbackTotalPx = faceSwingSpanPx
  const freeDir = resolveOpeningFreeDirFromHinge(hinge, axis)
  const sizing = resolveReferenceSizing({
    faces: inkRoles,
    axis,
    swingSpanPx: faceSwingSpanPx,
    fallbackTotalPx,
    hingePx: hinge.hingePx,
    freeDir,
  })
  return {
    aspectRef: Math.max(swingWpx, swingHpx) / minSide,
    swingWpx,
    swingHpx,
    areaPx: top.face.areaPx,
    wallRatio,
    depthRatio,
    areaSpan2Ratio,
    framingPx: sizing.framingPx,
    swingSpanPx: faceSwingSpanPx,
    swingAngleDeg: hinge.swingAngleDeg,
    ratioBlade: sizing.ratioBlade,
    totalRefPx: sizing.totalRefPx,
    bladeRefPx: sizing.bladeRefPx,
    overhangAlongPx: sizing.overhangAlongPx,
    overhangOppositePx: sizing.overhangOppositePx,
    clearOverhangAlongRatio: sizing.clearOverhangAlongRatio,
    clearOverhangOppositeRatio: sizing.clearOverhangOppositeRatio,
    framingAlongPx: sizing.framingAlongPx,
    framingOppositePx: sizing.framingOppositePx,
  }
}

/**
 * Stage-1 deur-ref-band: zelfde extractiepad als stap-2 rapport
 * (`runRefStages` → rechte face-crop), daarna pas swing-pick.
 * Zo werken verticale deuren (90° LBE) hetzelfde als horizontale.
 */
export async function analyzeDoorSwingRef(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<DoorSwingRefBand | null> {
  const stages = await runRefStages({
    cv: params.cv,
    image: params.image,
    rect: params.rect,
    kind: 'door',
    preprocess: params.preprocess,
    eraserMask: params.eraserMask,
    sharedWallBwMat: params.sharedWallBwMat,
  })
  return buildDoorSwingRefBandFromStraightened({
    cv: params.cv,
    bwData: stages.straightened.bwData,
    width: stages.straightened.width,
    height: stages.straightened.height,
  })
}
