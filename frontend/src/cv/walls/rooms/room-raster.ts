import type { OpenCV } from '@/cv/loadOpenCV'
import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import {
  buildEnclosedFaceParentMap,
  countMergedSurfaces,
  resolveMergedLabel,
} from './room-raster-merge'

export interface RasterRoomComponent {
  label: number
  areaPx: number
  bbox: { x: number; y: number; width: number; height: number }
  touchesBorder: boolean
}

export interface FaceLabelsResult {
  components: RasterRoomComponent[]
  labels: OpenCV['Mat']
  labelsData: Int32Array
  width: number
  height: number
}

export interface RasterRoomResult {
  components: RasterRoomComponent[]
  debugMask: CanvasLike
  parentMap: Map<number, number>
  labels: OpenCV['Mat']
  mergedFaceCount: number
  mergedSurfaceCount: number
  absorbedFaceCount: number
}

/** Buiten plan (witte vlakken die de rand raken). */
export const OUTSIDE_FACE_RGBA: [number, number, number, number] = [255, 255, 255, 255]

/** Muurvlak in classificatie-overlay. */
export const WALL_FACE_RGBA: [number, number, number, number] = [32, 32, 32, 255]

/** Onbekend vlak — rood, niet verwarren met skelet (#a855f7). */
export const UNKNOWN_FACE_RGBA: [number, number, number, number] = [239, 68, 68, 255]

/** Deur-draaiboog (Stage 2) — amber, onderscheidbaar van muur/vloer/onbekend. */
export const DOOR_FACE_RGBA: [number, number, number, number] = [245, 158, 11, 255]

/** Raam-vlak (Stage 3) — cyaan, onderscheidbaar van deur-amber en muur/onbekend. */
export const WINDOW_FACE_RGBA: [number, number, number, number] = [6, 182, 212, 255]

/**
 * Deurkozijn (Stage 2→3 doorframe) — donker oranje, richting draaiboog-amber
 * maar iets donkerder zodat deur vs kozijn te scheiden blijft.
 */
export const DOORFRAME_FACE_RGBA: [number, number, number, number] = [194, 88, 12, 255]

/** Niet-toegewezen inkt (label 0 na resolve). */
export const UNRESOLVED_INK_RGBA: [number, number, number, number] = [0, 0, 0, 255]

/** Niet-toegewezen rand-void na ink-resolve. */
const BORDER_VOID_FACE_RGBA: [number, number, number, number] = [128, 128, 128, 255]

/** Halve breedte (°) rond deur-amber / raam-cyaan — surface-pastels blijven erbuiten. */
const RESERVED_SURFACE_HUE_HALF_WIDTH_DEG = 28

/**
 * Minimale perceived lightness t.o.v. `WALL_FACE_RGBA` (L≈32).
 * Donkere surface-pastels lezen anders als muurvlak.
 */
const MIN_SURFACE_LIGHTNESS = 110

/**
 * Minimale chroma in het midtone-bereik. Bijna-grijs onder deze drempel
 * is gereserveerd voor muur (achromatisch), niet voor surface-labels.
 */
const MIN_SURFACE_CHROMA = 40

/** Boven deze lightness mag bijna-grijs wél (lichte vloer, geen muur). */
const MAX_WALL_LIKE_GRAY_LIGHTNESS = 150

function hueDistanceDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** RGB → hue in [0, 360). Bij bijna-grijs: null (geen conflict met reserved hue-bands). */
function rgbToHueDeg(r: number, g: number, b: number): number | null {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  if (delta < 1e-6) return null
  let hue = 0
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return hue
}

function perceivedLightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function rgbChroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** Centers afgeleid van deur/raam/doorframe RGBA zodat bands meeschuiven. */
function reservedSurfaceHueCenters(): number[] {
  const centers: number[] = []
  for (const rgba of [DOOR_FACE_RGBA, WINDOW_FACE_RGBA, DOORFRAME_FACE_RGBA] as const) {
    const hue = rgbToHueDeg(rgba[0], rgba[1], rgba[2])
    if (hue != null) centers.push(hue)
  }
  return centers
}

function isReservedSurfaceHue(hueDeg: number): boolean {
  return reservedSurfaceHueCenters().some(
    (center) => hueDistanceDeg(hueDeg, center) <= RESERVED_SURFACE_HUE_HALF_WIDTH_DEG,
  )
}

/**
 * Donker / bijna-grijs botst visueel met `WALL_FACE_RGBA` (geen hue — muur is achromatisch).
 */
function isReservedSurfaceWallLike(r: number, g: number, b: number): boolean {
  const lightness = perceivedLightness(r, g, b)
  if (lightness < MIN_SURFACE_LIGHTNESS) return true
  return (
    rgbChroma(r, g, b) < MIN_SURFACE_CHROMA && lightness < MAX_WALL_LIKE_GRAY_LIGHTNESS
  )
}

/**
 * Deterministische pastel per face-label. Vermijdt amber/cyaan hue-bands
 * (`door` / `window`) én donker/bijna-grijs (`wall`).
 */
export function colorForLabel(label: number): [number, number, number, number] {
  if (label <= 0) return [0, 0, 0, 255]
  for (let salt = 0; salt < 24; salt += 1) {
    const t = label + salt * 19
    const r = ((t * 97) % 180) + 60
    const g = ((t * 57) % 180) + 60
    const b = ((t * 131) % 180) + 60
    if (isReservedSurfaceWallLike(r, g, b)) continue
    const hue = rgbToHueDeg(r, g, b)
    if (hue == null || !isReservedSurfaceHue(hue)) return [r, g, b, 255]
  }
  // Fallback buiten amber/cyaan én muur-donkergrijs.
  return [140, 105, 185, 255]
}

function renderComponentMask(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap?: Map<number, number>
}): CanvasLike {
  const canvas = createCanvas(params.width, params.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(params.width, params.height)
  const data = image.data
  const parentMap = params.parentMap
  const { width, labelsData } = params
  for (let y = 0; y < params.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rawLabel = labelsData[y * width + x] ?? 0
      const label = parentMap ? resolveMergedLabel(rawLabel, parentMap) : rawLabel
      const [r, g, b, a] = colorForLabel(label)
      const idx = (y * params.width + x) * 4
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Component-metadata uit bestaande labelsData (geen OpenCV re-detect). */
export function extractComponentsFromLabelsData(
  labelsData: Int32Array,
  width: number,
  height: number,
): RasterRoomComponent[] {
  const byLabel = new Map<
    number,
    { areaPx: number; minX: number; minY: number; maxX: number; maxY: number }
  >()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = labelsData[y * width + x] ?? 0
      if (label <= 0) continue
      const prev = byLabel.get(label) ?? {
        areaPx: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
      }
      prev.areaPx += 1
      prev.minX = Math.min(prev.minX, x)
      prev.minY = Math.min(prev.minY, y)
      prev.maxX = Math.max(prev.maxX, x)
      prev.maxY = Math.max(prev.maxY, y)
      byLabel.set(label, prev)
    }
  }
  const components: RasterRoomComponent[] = []
  for (const [label, stats] of byLabel.entries()) {
    const touchesBorder =
      stats.minX <= 0 ||
      stats.minY <= 0 ||
      stats.maxX >= width - 1 ||
      stats.maxY >= height - 1
    components.push({
      label,
      areaPx: stats.areaPx,
      bbox: {
        x: stats.minX,
        y: stats.minY,
        width: stats.maxX - stats.minX + 1,
        height: stats.maxY - stats.minY + 1,
      },
      touchesBorder,
    })
  }
  return components
}

export function buildFaceLabelsFromBw(params: {
  cv: OpenCV
  mat: OpenCV['Mat']
}): FaceLabelsResult {
  const { cv, mat } = params
  const width = mat.cols
  const height = mat.rows

  const binary = new cv.Mat()
  cv.threshold(mat, binary, 127, 255, cv.THRESH_BINARY)

  const labels = new cv.Mat()
  const stats = new cv.Mat()
  const centroids = new cv.Mat()
  const count = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 8, cv.CV_32S)

  const components: RasterRoomComponent[] = []
  for (let label = 1; label < count; label += 1) {
    const left = stats.intAt(label, cv.CC_STAT_LEFT)
    const top = stats.intAt(label, cv.CC_STAT_TOP)
    const widthPx = stats.intAt(label, cv.CC_STAT_WIDTH)
    const heightPx = stats.intAt(label, cv.CC_STAT_HEIGHT)
    const area = stats.intAt(label, cv.CC_STAT_AREA)
    const touchesBorder =
      left <= 0 || top <= 0 || left + widthPx >= width - 1 || top + heightPx >= height - 1
    components.push({
      label,
      areaPx: area,
      bbox: { x: left, y: top, width: widthPx, height: heightPx },
      touchesBorder,
    })
  }

  centroids.delete()
  stats.delete()
  binary.delete()

  return {
    components,
    labels,
    labelsData: new Int32Array(labels.data32S as Int32Array),
    width,
    height,
  }
}

/** Debug-wrapper: CC + enclosed merge + kleurmasker. Classify gebruikt losse stappen. */
function buildFaceColorMaskFromBw(params: {
  cv: OpenCV
  mat: OpenCV['Mat']
  /** Classify-pipeline heeft geen kleur-debugmasker nodig — scheelt een volledige pixel-pass. */
  skipDebugMask?: boolean
}): RasterRoomResult {
  const faceLabels = buildFaceLabelsFromBw(params)
  const { width, height, labelsData, components, labels } = faceLabels

  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return labelsData[y * width + x] ?? 0
  }
  const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
  const debugMask = params.skipDebugMask
    ? createCanvas(1, 1)
    : renderComponentMask({ width, height, labelsData, parentMap })
  const mergedFaceCount = new Set(
    components.map((c) => resolveMergedLabel(c.label, parentMap)),
  ).size
  const mergedSurfaceCount = countMergedSurfaces(components, parentMap)
  const absorbedFaceCount = parentMap.size

  return {
    components,
    debugMask,
    parentMap,
    labels,
    mergedFaceCount,
    mergedSurfaceCount,
    absorbedFaceCount,
  }
}
