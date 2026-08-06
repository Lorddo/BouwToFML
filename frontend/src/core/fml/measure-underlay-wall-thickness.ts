import { noteDiscardedMeasurement, tally } from '@/core/diagnostics'
import type { Point2D, Wall } from './types'

/**
 * De getekende inktband is iets breder dan de werkelijke muur (lijndikte/anti-alias).
 * Neem 90% van de gemeten dikte zodat de bandgrens niet stelselmatig te dik uitvalt.
 */
// ESC:X-18 (E)
const INK_THICKNESS_FACTOR = 0.9
/**
 * Zoekvenster per zijde loodrecht op de muur (cm), per band-pick tier.
 * Buitenste-inkt in deze box — bewust niet hartlijn-walk (arcering).
 */
export const FML_THICKNESS_PICK_SEARCH_CM = {
  min: 20,
  max: 50,
} as const
/** Fallback als geen tier-zoekvenster is meegegeven. */
const DEFAULT_WALL_SEARCH_CM = FML_THICKNESS_PICK_SEARCH_CM.max
/** Overbrug interne witgaten bij diagonale fallback (cm). */
const INTERNAL_GAP_TOLERANCE_CM = 6
/** Korte box-lengte langs de muur-as (px). */
const PROBE_ALONG_AXIS_MIN_PX = 40
const PROBE_ALONG_AXIS_MAX_PX = 80
const PROBE_ALONG_AXIS_RATIO = 0.15
/** Scanlijnen in het midden van de probe-box (zoals measureInkBandInBox). */
const PROBE_SCAN_COUNT = 5
/** Binnen deze graden van H/V: as-aligned bbox; anders diagonale fallback. */
const ORTHO_ANGLE_EPS_DEG = 15

/** Muur-B/W (0 = inkt, 255 = wit) → meetmask (255 = inkt). */
export function wallBwToInkMask(wallBw: Uint8Array): Uint8Array {
  const mask = new Uint8Array(wallBw.length)
  for (let i = 0; i < wallBw.length; i += 1) {
    mask[i] = (wallBw[i] ?? 255) < 128 ? 255 : 0
  }
  return mask
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isDark(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return (mask[y * width + x] ?? 0) >= 128
}

function sampleScanLines(from: number, to: number, count: number): number[] {
  if (to < from) return []
  if (count <= 1) return [Math.round((from + to) / 2)]
  const lines: number[] = []
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1)
    lines.push(Math.round(from + (to - from) * t))
  }
  return [...new Set(lines)]
}

/**
 * Loopt vanaf `start` langs `direction` en geeft de afstand tot de buitenrand
 * van de muur-inkt. Interne witgaten tot `gapTolerance` worden overbrugd.
 */
function walkToWallEdge(
  mask: Uint8Array,
  width: number,
  height: number,
  start: Point2D,
  direction: Point2D,
  maxDistance: number,
  gapTolerance: number,
): number {
  let lastDark = 0
  let whiteRun = 0
  for (let step = 1; step <= maxDistance; step += 1) {
    const x = Math.round(start.x + direction.x * step)
    const y = Math.round(start.y + direction.y * step)
    if (x < 0 || y < 0 || x >= width || y >= height) break
    if ((mask[y * width + x] ?? 0) >= 128) {
      lastDark = step
      whiteRun = 0
    } else {
      whiteRun += 1
      if (whiteRun > gapTolerance) break
    }
  }
  return lastDark
}

/** Zoek vanaf een wit punt langs de normaal naar de dichtstbijzijnde inkt. */
function findInkAlongNormal(
  mask: Uint8Array,
  width: number,
  height: number,
  start: Point2D,
  nx: number,
  ny: number,
  maxSearchPx: number,
): Point2D | null {
  for (let step = 0; step <= maxSearchPx; step += 1) {
    for (const sign of [1, -1] as const) {
      if (step === 0 && sign === -1) continue
      const x = Math.round(start.x + nx * step * sign)
      const y = Math.round(start.y + ny * step * sign)
      if (isDark(mask, width, height, x, y)) return { x, y }
    }
  }
  return null
}

interface ThicknessSampleResult {
  values: number[]
  nx: number
  ny: number
}

/**
 * Meet buitenste inktband in een as-aligned probe-box rond het segment-midden
 * (zelfde semantiek als measureInkBandInBox, puur op Uint8Array-mask).
 */
function sampleThicknessViaProbeBox(params: {
  mask: Uint8Array
  width: number
  height: number
  a: Point2D
  b: Point2D
  maxSearchPx: number
}): ThicknessSampleResult {
  const dx = params.b.x - params.a.x
  const dy = params.b.y - params.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return { values: [], nx: 0, ny: 0 }

  const mid = { x: (params.a.x + params.b.x) / 2, y: (params.a.y + params.b.y) / 2 }
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  // Normaal: H-muur → verticaal (0,1); V-muur → horizontaal (1,0)
  const nx = horizontal ? 0 : 1
  const ny = horizontal ? 1 : 0

  const alongPx = Math.max(
    PROBE_ALONG_AXIS_MIN_PX,
    Math.min(PROBE_ALONG_AXIS_MAX_PX, Math.round(len * PROBE_ALONG_AXIS_RATIO)),
  )
  const halfAlong = alongPx / 2
  const halfPerp = params.maxSearchPx

  const x0 = Math.max(0, Math.floor(horizontal ? mid.x - halfAlong : mid.x - halfPerp))
  const x1 = Math.min(params.width, Math.ceil(horizontal ? mid.x + halfAlong : mid.x + halfPerp))
  const y0 = Math.max(0, Math.floor(horizontal ? mid.y - halfPerp : mid.y - halfAlong))
  const y1 = Math.min(params.height, Math.ceil(horizontal ? mid.y + halfPerp : mid.y + halfAlong))
  if (x1 <= x0 || y1 <= y0) return { values: [], nx, ny }

  const values: number[] = []

  if (horizontal) {
    // H-muur: scan verticaal (buitenste inkt top↔bottom) op x-lijnen in box-midden.
    const xStart = x0 + Math.floor((x1 - x0) * 0.2)
    const xEnd = x1 - Math.floor((x1 - x0) * 0.2)
    for (const x of sampleScanLines(xStart, Math.max(xStart, xEnd), PROBE_SCAN_COUNT)) {
      let top: number | null = null
      let bottom: number | null = null
      for (let y = y0; y < y1; y += 1) {
        if (isDark(params.mask, params.width, params.height, x, y)) {
          top = y
          break
        }
      }
      for (let y = y1 - 1; y >= y0; y -= 1) {
        if (isDark(params.mask, params.width, params.height, x, y)) {
          bottom = y
          break
        }
      }
      if (top === null || bottom === null || bottom < top) continue
      values.push(bottom - top + 1)
    }
  } else {
    // V-muur: scan horizontaal (buitenste inkt left↔right) op y-lijnen.
    const yStart = y0 + Math.floor((y1 - y0) * 0.2)
    const yEnd = y1 - Math.floor((y1 - y0) * 0.2)
    for (const y of sampleScanLines(yStart, Math.max(yStart, yEnd), PROBE_SCAN_COUNT)) {
      let left: number | null = null
      let right: number | null = null
      for (let x = x0; x < x1; x += 1) {
        if (isDark(params.mask, params.width, params.height, x, y)) {
          left = x
          break
        }
      }
      for (let x = x1 - 1; x >= x0; x -= 1) {
        if (isDark(params.mask, params.width, params.height, x, y)) {
          right = x
          break
        }
      }
      if (left === null || right === null || right < left) continue
      values.push(right - left + 1)
    }
  }

  return { values, nx, ny }
}

/**
 * Diagonale fallback: 1–3 normale walks vanuit midden; bij wit eerst naar inkt zoeken.
 */
function sampleThicknessDiagonalAtMid(params: {
  mask: Uint8Array
  width: number
  height: number
  a: Point2D
  b: Point2D
  maxSearchPx: number
  gapTolerancePx: number
}): ThicknessSampleResult {
  const dx = params.b.x - params.a.x
  const dy = params.b.y - params.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return { values: [], nx: 0, ny: 0 }
  const nx = -dy / len
  const ny = dx / len
  const mid = { x: (params.a.x + params.b.x) / 2, y: (params.a.y + params.b.y) / 2 }
  const ux = dx / len
  const uy = dy / len
  const offsets = [0, -8, 8]
  const values: number[] = []

  for (const offset of offsets) {
    const sample = { x: mid.x + ux * offset, y: mid.y + uy * offset }
    let start = sample
    const cx = Math.round(sample.x)
    const cy = Math.round(sample.y)
    if (!isDark(params.mask, params.width, params.height, cx, cy)) {
      const ink = findInkAlongNormal(
        params.mask,
        params.width,
        params.height,
        sample,
        nx,
        ny,
        params.maxSearchPx,
      )
      if (!ink) continue
      start = ink
    }
    const plus = walkToWallEdge(
      params.mask,
      params.width,
      params.height,
      start,
      { x: nx, y: ny },
      params.maxSearchPx,
      params.gapTolerancePx,
    )
    const minus = walkToWallEdge(
      params.mask,
      params.width,
      params.height,
      start,
      { x: -nx, y: -ny },
      params.maxSearchPx,
      params.gapTolerancePx,
    )
    const thickness = plus + minus + 1
    if (thickness > 0) values.push(thickness)
  }

  return { values, nx, ny }
}

function isNearOrtho(a: Point2D, b: Point2D): boolean {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dx <= 1e-6 && dy <= 1e-6) return true
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  // 0° = H, 90° = V — dicht bij 0 of 90.
  return angleDeg <= ORTHO_ANGLE_EPS_DEG || angleDeg >= 90 - ORTHO_ANGLE_EPS_DEG
}

function sampleThicknessPxOnMask(params: {
  mask: Uint8Array
  width: number
  height: number
  a: Point2D
  b: Point2D
  maxSearchPx?: number
  gapTolerancePx?: number
}): ThicknessSampleResult {
  const maxSearchPx = params.maxSearchPx ?? 512
  const gapTolerancePx = params.gapTolerancePx ?? 0
  // ESC:X-19 (A)
  if (isNearOrtho(params.a, params.b)) {
    const boxed = sampleThicknessViaProbeBox({
      mask: params.mask,
      width: params.width,
      height: params.height,
      a: params.a,
      b: params.b,
      maxSearchPx,
    })
    if (boxed.values.length) {
      tally('X-19', 'ortho_box')
      return boxed
    }
  }
  tally('X-19', 'diagonal')
  return sampleThicknessDiagonalAtMid({
    mask: params.mask,
    width: params.width,
    height: params.height,
    a: params.a,
    b: params.b,
    maxSearchPx,
    gapTolerancePx,
  })
}

export function cmPointToImagePx(
  cm: Point2D,
  origin: Point2D,
  pxPerMmX: number,
  pxPerMmY: number,
): Point2D {
  return {
    x: (cm.x + origin.x) * pxPerMmX * 10,
    y: (cm.y + origin.y) * pxPerMmY * 10,
  }
}

/**
 * Zet een px-dikte om naar cm langs een gegeven muur-normaal (`nx`,`ny`).
 * Een px-stap langs de normaal verplaatst `nx/pxPerMmX` mm horizontaal en
 * `ny/pxPerMmY` mm verticaal — zodat een horizontale muur op de Y-schaal meet
 * en een verticale muur op de X-schaal (niet op het gemiddelde van beide).
 */
export function imagePxThicknessToCmAlongNormal(
  thicknessPx: number,
  nx: number,
  ny: number,
  pxPerMmX: number,
  pxPerMmY: number,
): number {
  const safeX = Number.isFinite(pxPerMmX) && pxPerMmX > 0 ? pxPerMmX : 0
  const safeY = Number.isFinite(pxPerMmY) && pxPerMmY > 0 ? pxPerMmY : 0
  const normLen = Math.hypot(nx, ny)
  // ESC:X-20 (E)
  if (normLen <= 1e-6 || (safeX <= 0 && safeY <= 0)) {
    tally('X-20', 'invalid_normal_or_scale')
    return 10
  }
  const ux = nx / normLen
  const uy = ny / normLen
  const mmPerPxX = safeX > 0 ? 1 / safeX : safeY > 0 ? 1 / safeY : 0
  const mmPerPxY = safeY > 0 ? 1 / safeY : safeX > 0 ? 1 / safeX : 0
  const mmPerPxAlongNormal = Math.hypot(ux * mmPerPxX, uy * mmPerPxY)
  if (mmPerPxAlongNormal <= 0) {
    tally('X-20', 'zero_along_normal')
    return 10
  }
  return Math.max(1, (thicknessPx * mmPerPxAlongNormal) / 10)
}

export function imagePxThicknessToCm(
  thicknessPx: number,
  pxPerMmX: number,
  pxPerMmY: number,
): number {
  const pxPerMmAvg = (pxPerMmX + pxPerMmY) / 2
  if (!Number.isFinite(pxPerMmAvg) || pxPerMmAvg <= 0) return 10
  return Math.max(1, thicknessPx / pxPerMmAvg / 10)
}

/**
 * Meet muurdikte loodrecht op de hartlijn via muur-B/W (0 = inkt).
 * Ortho: buitenste inkt in probe-box (arcering/dubbele lijn blijft één band).
 */
export function measureWallThicknessCmOnUnderlay(params: {
  /** Canonieke muur-B/W (ná bake; OpenCV: 0 = inkt, 255 = wit). */
  wallBw: { data: Uint8Array; width: number; height: number }
  wall: Pick<Wall, 'a' | 'b'>
  origin: Point2D
  pxPerMmX: number
  pxPerMmY: number
  /** Zoekvenster per zijde loodrecht op de muur (cm). */
  maxSearchCm?: number
}): number {
  const { width, height } = params.wallBw
  if (width <= 0 || height <= 0 || params.wallBw.data.length < width * height) {
    throw new Error('Muur-B/W ontbreekt of heeft ongeldige afmetingen.')
  }
  const mask = wallBwToInkMask(params.wallBw.data)
  const a = cmPointToImagePx(params.wall.a, params.origin, params.pxPerMmX, params.pxPerMmY)
  const b = cmPointToImagePx(params.wall.b, params.origin, params.pxPerMmX, params.pxPerMmY)
  const pxPerMmAvg =
    (Math.max(0, params.pxPerMmX) + Math.max(0, params.pxPerMmY)) / 2 ||
    Math.max(params.pxPerMmX, params.pxPerMmY)
  const searchCm =
    Number.isFinite(params.maxSearchCm) && (params.maxSearchCm as number) > 0
      ? (params.maxSearchCm as number)
      : DEFAULT_WALL_SEARCH_CM
  const maxSearchPx = pxPerMmAvg > 0 ? Math.round(searchCm * 10 * pxPerMmAvg) : 512
  const gapTolerancePx =
    pxPerMmAvg > 0 ? Math.round(INTERNAL_GAP_TOLERANCE_CM * 10 * pxPerMmAvg) : 4
  const { values, nx, ny } = sampleThicknessPxOnMask({
    mask,
    width,
    height,
    a,
    b,
    maxSearchPx,
    gapTolerancePx,
  })
  if (!values.length) {
    throw new Error('Geen muur-inkt gevonden op de muur-B/W bij deze muur.')
  }
  const measuredPx = medianOf(values)
  const thicknessPx = measuredPx * INK_THICKNESS_FACTOR
  noteDiscardedMeasurement('X-18', 'measureUnderlayWallThickness', measuredPx, thicknessPx, {
    factor: INK_THICKNESS_FACTOR,
    samples: values.length,
    maxSearchCm: searchCm,
  })
  const cm = imagePxThicknessToCmAlongNormal(thicknessPx, nx, ny, params.pxPerMmX, params.pxPerMmY)
  return Math.round(cm * 10) / 10
}

/** Test-helper: meet (mediaan, buitenste inkt rond segment-midden) op een binaire mask. */
export function measureWallThicknessPxOnMask(
  mask: Uint8Array,
  width: number,
  height: number,
  a: Point2D,
  b: Point2D,
  options?: { maxSearchPx?: number; gapTolerancePx?: number },
): number {
  const { values } = sampleThicknessPxOnMask({
    mask,
    width,
    height,
    a,
    b,
    maxSearchPx: options?.maxSearchPx,
    gapTolerancePx: options?.gapTolerancePx,
  })
  return values.length ? medianOf(values) : 0
}
