import type { OpenCV } from '@/cv/loadOpenCV'

const BINARY_MID = 128

/** Witte rand = papier/achtergrond (verwacht bij plattegronden). */
export function measureBorderWhiteRatio(data: Uint8Array, width: number, height: number): number {
  if (width === 0 || height === 0) return 1

  let white = 0
  let total = 0
  const tally = (idx: number) => {
    total += 1
    if ((data[idx] ?? 255) >= BINARY_MID) white += 1
  }

  for (let x = 0; x < width; x += 1) {
    tally(x)
    tally((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    tally(y * width)
    tally(y * width + width - 1)
  }

  return total > 0 ? white / total : 1
}

export function shouldInvertBinaryPolarity(
  data: Uint8Array,
  width: number,
  height: number,
): boolean {
  const borderWhiteRatio = measureBorderWhiteRatio(data, width, height)
  // Typische scan/PDF: rand is wit papier. Donkere rand → witte inkt op zwarte achtergrond.
  if (borderWhiteRatio < 0.5) return true

  // Fallback: inkt is minority; bijna alles zwart terwijl rand nog licht is → omgedraaid.
  const step = Math.max(1, Math.floor((width * height) / 20000))
  let dark = 0
  let samples = 0
  for (let i = 0; i < data.length; i += step) {
    samples += 1
    if ((data[i] ?? 255) < BINARY_MID) dark += 1
  }
  const darkRatio = samples > 0 ? dark / samples : 0
  return darkRatio > 0.62 && borderWhiteRatio < 0.75
}

/**
 * Zorg dat binair beeld zwarte inkt op witte achtergrond is — conventie in hele CV-pipeline.
 * @returns true wanneer de mat is omgedraaid.
 */
export function ensureBlackInkOnWhiteBackground(cv: OpenCV, mat: OpenCV['Mat']): boolean {
  const data = mat.data as Uint8Array
  if (!shouldInvertBinaryPolarity(data, mat.cols, mat.rows)) return false
  cv.bitwise_not(mat, mat)
  return true
}
