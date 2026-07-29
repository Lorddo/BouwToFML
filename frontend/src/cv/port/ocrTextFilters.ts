import type { OcrTextCandidate } from '@/core/extraction'

/** Pass waarop Tesseract het woord vond (horizontaal of na 90°/270° rotatie). */
export type OcrScanPass = 'horizontal' | 'vertical'

export interface OcrWordHit extends OcrTextCandidate {
  pass: OcrScanPass
}

const LINE_ARTIFACT = /^(?:[|Il1]{2,}|[O0]{2,})$/i

function isHorizontallyOrientedBox(width: number, height: number): boolean {
  const h = Math.max(1, height)
  return width / h >= 0.85
}

function isVerticallyOrientedBox(width: number, height: number): boolean {
  const w = Math.max(1, width)
  return height / w >= 1.15
}

/** Muurlijnen, arcering en kastcontouren → langwerpige dunne bboxen. */
export function isLineLikeArchitecturalBBox(width: number, height: number): boolean {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  if (long < 24) return false
  return long / short >= 5.5 && short <= 28
}

function singleLetterMinConfidence(minConfidence: number, pass: OcrScanPass): number {
  if (minConfidence >= 80) return pass === 'vertical' ? 92 : 90
  return Math.max(minConfidence, 50)
}

function isTinyLowConfidenceNoise(word: OcrTextCandidate, minConfidence: number): boolean {
  const token = word.text.trim()
  if (token.length > 2) return false
  const shortSide = Math.min(word.width, word.height)
  if (shortSide >= 16) return false
  return word.confidence < Math.max(minConfidence + 15, 65)
}

const OCR_UNDERLAY_FALLBACK_MAX_EDGE_PX = 2000

export function looksLikeTextToken(
  word: OcrTextCandidate,
  mode: 'general' | 'numbers',
  pass: OcrScanPass,
  minConfidence: number,
  underlayMaxEdgePx: number = OCR_UNDERLAY_FALLBACK_MAX_EDGE_PX,
): boolean {
  const token = word.text.trim()
  if (!token) return false
  const width = Math.max(1, word.width)
  const height = Math.max(1, word.height)
  const area = width * height
  if (area < 16 || area > 12000) return false
  const maxBoxSide = Math.max(1, underlayMaxEdgePx * 0.1)
  if (width > maxBoxSide || height > maxBoxSide) return false
  if (isLineLikeArchitecturalBBox(width, height)) return false
  if (isTinyLowConfidenceNoise(word, minConfidence)) return false

  const chars = [...token]
  const alnumChars = chars.filter((ch) => /[0-9A-Za-z]/.test(ch))
  const digitChars = chars.filter((ch) => /[0-9]/.test(ch))
  const alphaNumRatio = alnumChars.length / Math.max(1, chars.length)

  if (mode === 'numbers') {
    if (digitChars.length === 0) return false
    if (!/^[0-9.,:+\-xX/ ]+$/.test(token)) return false
    return pass === 'horizontal' || isVerticallyOrientedBox(width, height)
  }

  if (alphaNumRatio < 0.5) return false
  if (LINE_ARTIFACT.test(token)) return false

  const horizontalBox = isHorizontallyOrientedBox(width, height)
  const verticalBox = isVerticallyOrientedBox(width, height)
  const letterFloor = singleLetterMinConfidence(minConfidence, pass)

  // Duidelijke woorden: oriëntatie niet strikt afdwingen.
  if (token.length >= 4 && alphaNumRatio >= 0.85) return true

  if (pass === 'horizontal') {
    if (token.length === 1) {
      const oriented = horizontalBox || minConfidence < 80
      if (!oriented) return false
      if (digitChars.length === 0 && word.confidence < letterFloor) return false
      return true
    }
    return horizontalBox || !verticalBox
  }

  if (token.length === 1) {
    if (horizontalBox && !verticalBox) return false
    if (digitChars.length === 0 && word.confidence < letterFloor) return false
    return verticalBox || horizontalBox
  }

  return verticalBox || (horizontalBox && token.length >= 2)
}

function bboxOverlapRatio(a: OcrTextCandidate, b: OcrTextCandidate): number {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height
  const ix0 = Math.max(a.x, b.x)
  const iy0 = Math.max(a.y, b.y)
  const ix1 = Math.min(ax2, bx2)
  const iy1 = Math.min(ay2, by2)
  if (ix1 <= ix0 || iy1 <= iy0) return 0
  const inter = (ix1 - ix0) * (iy1 - iy0)
  const minArea = Math.min(a.width * a.height, b.width * b.height)
  return minArea > 0 ? inter / minArea : 0
}

function wordScore(hit: OcrWordHit): number {
  const lenBonus = Math.min(hit.text.trim().length, 12) * 4
  const passBonus = hit.pass === 'horizontal' ? 6 : 0
  return hit.confidence + lenBonus + passBonus
}

/** Bij overlap: voorkeur voor langer woord / horizontale pass (voorkomt m→3 van verticale scan). */
export function resolveOverlappingHits(words: OcrWordHit[]): OcrWordHit[] {
  const sorted = [...words].sort((a, b) => wordScore(b) - wordScore(a))
  const kept: OcrWordHit[] = []

  for (const word of sorted) {
    const conflict = kept.find((k) => bboxOverlapRatio(k, word) >= 0.55)
    if (!conflict) {
      kept.push(word)
      continue
    }

    const sameArea = bboxOverlapRatio(conflict, word) >= 0.72
    const singleCharVertical =
      word.pass === 'vertical' &&
      word.text.trim().length === 1 &&
      isHorizontallyOrientedBox(word.width, word.height)

    if (singleCharVertical && conflict.text.trim().length >= 1) continue
    if (sameArea && word.text.trim().length < conflict.text.trim().length) continue
    if (
      sameArea &&
      word.text.trim().length === conflict.text.trim().length &&
      word.confidence <= conflict.confidence
    ) {
      continue
    }
    kept.push(word)
  }

  return kept
}

function dedupeWordHits(words: OcrWordHit[], underlayMaxEdgePx: number): OcrWordHit[] {
  const dedupeDistPx = Math.max(1, underlayMaxEdgePx * 0.006)
  const kept: OcrWordHit[] = []
  for (const word of words) {
    const cx = word.x + word.width / 2
    const cy = word.y + word.height / 2
    const duplicate = kept.some((k) => {
      const kx = k.x + k.width / 2
      const ky = k.y + k.height / 2
      const dist = Math.hypot(cx - kx, cy - ky)
      const textSame = k.text.toLowerCase() === word.text.toLowerCase()
      return textSame && dist < dedupeDistPx
    })
    if (!duplicate) kept.push(word)
  }
  return kept
}

function sameTextLine(a: OcrWordHit, b: OcrWordHit): boolean {
  const avgH = (a.height + b.height) / 2
  const ay = a.y + a.height / 2
  const by = b.y + b.height / 2
  if (Math.abs(ay - by) > avgH * 0.75) return false

  if (a.pass === 'vertical' && b.pass === 'vertical') {
    const ax = a.x + a.width / 2
    const bx = b.x + b.width / 2
    return Math.abs(ax - bx) <= avgH * 0.75
  }

  if (a.pass !== b.pass) return false
  return true
}

function gapBetweenBoxes(a: OcrWordHit, b: OcrWordHit): number {
  const aRight = a.x + a.width
  const bRight = b.x + b.width
  const aBottom = a.y + a.height
  const bBottom = b.y + b.height

  if (a.pass === 'vertical') {
    const verticalGap = b.y >= aBottom ? b.y - aBottom : a.y >= bBottom ? a.y - bBottom : 0
    return verticalGap
  }

  const horizontalGap = b.x >= aRight ? b.x - aRight : a.x >= bRight ? a.x - bRight : 0
  return horizontalGap
}

function mergeGroup(group: OcrWordHit[]): OcrWordHit {
  if (group.length === 1) return group[0]
  const x0 = Math.min(...group.map((w) => w.x))
  const y0 = Math.min(...group.map((w) => w.y))
  const x1 = Math.max(...group.map((w) => w.x + w.width))
  const y1 = Math.max(...group.map((w) => w.y + w.height))
  const text = group
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join(group[0].pass === 'vertical' ? '' : ' ')
  const confidence = Math.max(...group.map((w) => w.confidence))
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    text,
    confidence,
    pass: group[0].pass,
  }
}

function mergeOneOrientation(words: OcrWordHit[]): OcrWordHit[] {
  if (words.length <= 1) return words

  const sorted =
    words[0]?.pass === 'vertical'
      ? [...words].sort((a, b) => a.y - b.y || a.x - b.x)
      : [...words].sort((a, b) => a.x - b.x || a.y - b.y)

  const groups: OcrWordHit[][] = []
  for (const word of sorted) {
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup) {
      groups.push([word])
      continue
    }
    const prev = lastGroup[lastGroup.length - 1]
    const avgH = (prev.height + word.height) / 2
    const maxGap = Math.max(8, avgH * 2.25)
    if (sameTextLine(prev, word) && gapBetweenBoxes(prev, word) <= maxGap) {
      lastGroup.push(word)
    } else {
      groups.push([word])
    }
  }

  return groups.map(mergeGroup)
}

function stripPass(hit: OcrWordHit): OcrTextCandidate {
  return {
    x: hit.x,
    y: hit.y,
    width: hit.width,
    height: hit.height,
    text: hit.text,
    confidence: hit.confidence,
  }
}

/** Voeg dicht bij elkaar liggende woordfragmenten samen tot één masker-regio. */
export function mergeAdjacentWordHits(words: OcrWordHit[]): OcrWordHit[] {
  if (words.length <= 1) return words
  const horizontal = words.filter((w) => w.pass === 'horizontal')
  const vertical = words.filter((w) => w.pass === 'vertical')
  return [...mergeOneOrientation(horizontal), ...mergeOneOrientation(vertical)]
}

export function filterAndMergeOcrHits(
  words: OcrWordHit[],
  params: {
    minConfidence: number
    mode: 'general' | 'numbers'
    underlayMaxEdgePx?: number
  },
): OcrTextCandidate[] {
  const underlayMaxEdgePx = params.underlayMaxEdgePx ?? OCR_UNDERLAY_FALLBACK_MAX_EDGE_PX
  const filtered = dedupeWordHits(words, underlayMaxEdgePx).filter((word) => {
    if (word.confidence < params.minConfidence) return false
    return looksLikeTextToken(word, params.mode, word.pass, params.minConfidence, underlayMaxEdgePx)
  })
  const merged = mergeAdjacentWordHits(filtered)
  return resolveOverlappingHits(merged).map(stripPass)
}
