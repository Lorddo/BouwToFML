import { buildFaceProfile } from './ref-face-profile'
import { rotateBwData180 } from './ref-orient'
import type { RefFace } from './types'

/** Duidelijke muuras uit rij- vs kolom-inktpiek. */
const WALL_AXIS_MARGIN = 1.2
/** Alleen bij twijfelachtige muuras: swing-offset als zwakke tie-break. */
const SWING_SIDE_MARGIN = 1.25

function foldToSigned90(angleDeg: number): number {
  let angle = angleDeg
  while (angle <= -90) angle += 180
  while (angle > 90) angle -= 180
  return angle
}

function inkCentroid(
  data: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; count: number } {
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      count += 1
      sumX += x
      sumY += y
    }
  }
  if (count <= 0) return { x: width / 2, y: height / 2, count: 0 }
  return { x: sumX / count, y: sumY / count, count }
}

/**
 * Muuras in de huidige crop: inkt geconcentreerd in weinig rijen ⇒ muur horizontaal;
 * in weinig kolommen ⇒ muur verticaal. Geen aanname over LBE-aspect.
 */
function resolveDoorWallAxis(params: { bwData: Uint8Array; width: number; height: number }): {
  axis: 'horizontal' | 'vertical' | 'ambiguous'
  rowPeak: number
  colPeak: number
} {
  const { bwData, width, height } = params
  const rowInk = new Float64Array(height)
  const colInk = new Float64Array(width)
  let total = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((bwData[y * width + x] ?? 255) >= 128) continue
      rowInk[y] += 1
      colInk[x] += 1
      total += 1
    }
  }
  if (total < 20) {
    return { axis: 'ambiguous', rowPeak: 0, colPeak: 0 }
  }

  const peakRatio = (profile: Float64Array): number => {
    let max = 0
    let sum = 0
    for (let i = 0; i < profile.length; i += 1) {
      const v = profile[i] ?? 0
      sum += v
      if (v > max) max = v
    }
    const mean = sum / Math.max(1, profile.length)
    if (!(mean > 0)) return 0
    return max / mean
  }

  const rowPeak = peakRatio(rowInk)
  const colPeak = peakRatio(colInk)
  if (rowPeak > colPeak * WALL_AXIS_MARGIN) {
    return { axis: 'horizontal', rowPeak, colPeak }
  }
  if (colPeak > rowPeak * WALL_AXIS_MARGIN) {
    return { axis: 'vertical', rowPeak, colPeak }
  }
  return { axis: 'ambiguous', rowPeak, colPeak }
}

/** Zwaarste wit-vlak — alle roles (swing raakt vaak de crop-rand → `outside`). */
function pickHeaviestFace(faces: RefFace[]): RefFace | null {
  if (faces.length === 0) return null
  let heaviest = faces[0]
  for (let i = 1; i < faces.length; i += 1) {
    const face = faces[i]
    if (face.areaPx > heaviest.areaPx) heaviest = face
  }
  return heaviest
}

/**
 * Ontdek of de muur in de huidige crop verticaal staat → 90° CW zodat muur
 * horizontaal komt. Hoek is niet vooraf bekend; alleen geometrie.
 *
 * 1) Rij-/kolom-inktpiek (muuras)
 * 2) Alleen bij ambiguous: swing-centroid t.o.v. ink (zwak; ondiepe deuren
 *    hebben kleine |dy| en mogen hier niet vals 90° triggeren)
 */
export function resolveDoorNeed90Cw(params: {
  bwData: Uint8Array
  width: number
  height: number
  faces?: RefFace[]
}): { need90: boolean; source: 'wallAxis' | 'swingSide' | 'none' } {
  const wall = resolveDoorWallAxis({
    bwData: params.bwData,
    width: params.width,
    height: params.height,
  })
  if (wall.axis === 'vertical') {
    return { need90: true, source: 'wallAxis' }
  }
  if (wall.axis === 'horizontal') {
    return { need90: false, source: 'wallAxis' }
  }

  const faces =
    params.faces ??
    buildFaceProfile(params.bwData, params.width, params.height, undefined, { minAreaPx: 4 }).faces
  const heaviest = pickHeaviestFace(faces)
  const ink = inkCentroid(params.bwData, params.width, params.height)
  if (heaviest && ink.count >= 20) {
    const dx = heaviest.centroid.x - ink.x
    const dy = heaviest.centroid.y - ink.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    // Streng: alleen als lateraal écht domineert (ondiepe H-deur heeft kleine dy).
    if (absDx > absDy * SWING_SIDE_MARGIN && absDx > Math.min(params.width, params.height) * 0.12) {
      return { need90: true, source: 'swingSide' }
    }
    if (absDy > absDx * SWING_SIDE_MARGIN) {
      return { need90: false, source: 'swingSide' }
    }
  }

  return { need90: false, source: 'none' }
}

/**
 * LBE-doel: muur-inkt BOVEN, zwaarste wit-vlak (draai) ONDER.
 * Vergelijkt ink-centroid met swing-centroid.
 */
export function orientDoorHeaviestFaceToBottom(
  bwData: Uint8Array,
  width: number,
  height: number,
): { bwData: Uint8Array; width: number; height: number; rotated180: boolean } {
  if (height < 8 || width < 8) {
    return { bwData, width, height, rotated180: false }
  }

  const profile = buildFaceProfile(bwData, width, height, undefined, { minAreaPx: 4 })
  const heaviest = pickHeaviestFace(profile.faces)
  const ink = inkCentroid(bwData, width, height)

  if (heaviest && ink.count >= 20) {
    const margin = Math.max(2, height * 0.02)
    if (ink.y > heaviest.centroid.y + margin) {
      const rotated = rotateBwData180(bwData, width, height)
      return {
        bwData: rotated.data,
        width: rotated.width,
        height: rotated.height,
        rotated180: true,
      }
    }
    return { bwData, width, height, rotated180: false }
  }

  let topWhite = 0
  let bottomWhite = 0
  const yTop = Math.floor(height * 0.45)
  const yBot0 = Math.floor(height * 0.55)
  for (let y = 0; y < yTop; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((bwData[y * width + x] ?? 255) >= 128) topWhite += 1
    }
  }
  for (let y = yBot0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((bwData[y * width + x] ?? 255) >= 128) bottomWhite += 1
    }
  }
  if (topWhite <= bottomWhite * 1.08) {
    return { bwData, width, height, rotated180: false }
  }
  const rotated = rotateBwData180(bwData, width, height)
  return {
    bwData: rotated.data,
    width: rotated.width,
    height: rotated.height,
    rotated180: true,
  }
}

/**
 * Deskew-hoek uit inkt in de muur-band (boven het draaivlak).
 * PCA op muur-inkt — geen swing-chords.
 */
export function estimateDoorWallDeskewFromInk(params: {
  bwData: Uint8Array
  width: number
  height: number
  wallYMax: number
  maxAbsDeg?: number
  minAbsDeg?: number
}): number {
  const { bwData, width, height } = params
  const wallYMax = Math.max(2, Math.min(height, Math.floor(params.wallYMax)))
  const maxAbsDeg = params.maxAbsDeg ?? 8
  const minAbsDeg = params.minAbsDeg ?? 0.35

  let count = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < wallYMax; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((bwData[y * width + x] ?? 255) >= 128) continue
      count += 1
      sumX += x
      sumY += y
    }
  }
  if (count < 30) return 0

  const meanX = sumX / count
  const meanY = sumY / count
  let cxx = 0
  let cxy = 0
  let cyy = 0
  for (let y = 0; y < wallYMax; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((bwData[y * width + x] ?? 255) >= 128) continue
      const dx = x - meanX
      const dy = y - meanY
      cxx += dx * dx
      cxy += dx * dy
      cyy += dy * dy
    }
  }
  if (cxx <= 0 && cyy <= 0) return 0

  const pcaAxisDeg = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI
  const residual = foldToSigned90(pcaAxisDeg - 0)
  if (Math.abs(residual) > 15) return 0
  const correction = -residual
  if (!Number.isFinite(correction)) return 0
  const clamped = Math.max(-maxAbsDeg, Math.min(maxAbsDeg, correction))
  return Math.abs(clamped) < minAbsDeg ? 0 : clamped
}

/** Bovenkant van het draaivlak ≈ onderkant muur-band. */
export function resolveDoorWallYMax(params: {
  bwData: Uint8Array
  width: number
  height: number
  faces?: RefFace[]
}): number {
  const faces =
    params.faces ??
    buildFaceProfile(params.bwData, params.width, params.height, undefined, { minAreaPx: 4 }).faces
  const heaviest = pickHeaviestFace(faces)
  if (heaviest) {
    return Math.max(4, Math.min(params.height * 0.7, heaviest.bbox.y + 2))
  }
  const ink = inkCentroid(params.bwData, params.width, params.height)
  return Math.max(4, Math.min(params.height * 0.55, ink.y + params.height * 0.15))
}
