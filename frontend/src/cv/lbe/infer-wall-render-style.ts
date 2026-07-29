import type { BoundingBox, ExampleSample } from '@/core/extraction'
import type { WallRenderStyle } from '@/core/extraction/geometric-signature'
import {
  bboxOrientation,
  measureInkBandInBox,
  measureParallelSpacingInBox,
} from '@/cv/port/wallKernel'
import { median } from '@/cv/util/stats'
import { sampleScanLines } from '@/cv/util/scanLines'

type CvMat = { cols: number; rows: number; ucharPtr: (y: number, x: number) => Uint8Array }

const DARK_THRESHOLD = 245
const STYLES: WallRenderStyle[] = ['solid', 'parallel_lines', 'details']

export interface WallRenderStyleInference {
  renderStyle: WallRenderStyle
  confidence: number
  scores: Record<WallRenderStyle, number>
  /** Median aantal parallelle inktlijnen (alleen relevant bij parallel_lines). */
  parallelLineCount?: number
}

export interface InferWallRenderStyleOptions {
  expectedWallStyles?: WallRenderStyle[]
}

function isDark(mat: CvMat, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mat.cols || y >= mat.rows) return false
  return mat.ucharPtr(y, x)[0] < DARK_THRESHOLD
}

function clampBox(mat: CvMat, bbox: BoundingBox) {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(mat.cols, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(mat.rows, Math.ceil(bbox.y + bbox.height))
  return { x0, y0, x1, y1 }
}

function darkRunsOnScan(
  mat: CvMat,
  fixed: number,
  from: number,
  to: number,
  verticalScan: boolean,
): Array<{ start: number; end: number; length: number }> {
  const runs: Array<{ start: number; end: number; length: number }> = []
  let runStart: number | null = null

  for (let i = from; i <= to; i += 1) {
    const x = verticalScan ? fixed : i
    const y = verticalScan ? i : fixed
    const dark = isDark(mat, x, y)
    if (dark && runStart === null) {
      runStart = i
      continue
    }
    if (!dark && runStart !== null) {
      const end = i - 1
      runs.push({ start: runStart, end, length: end - runStart + 1 })
      runStart = null
    }
  }
  if (runStart !== null) {
    runs.push({ start: runStart, end: to, length: to - runStart + 1 })
  }
  return runs
}

function parallelInkRuns(
  runs: Array<{ start: number; end: number; length: number }>,
  span: number,
) {
  const maxRun = Math.max(4, Math.min(12, Math.round(span * 0.28)))
  return runs.filter((r) => r.length >= 1 && r.length <= maxRun)
}

function isRegularParallelThinRuns(
  runs: Array<{ start: number; end: number; length: number }>,
  span: number,
): boolean {
  const thin = parallelInkRuns(runs, span)
  if (thin.length < 2 || thin.length > 8) return false
  const centers = thin.map((r) => (r.start + r.end) / 2).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < centers.length; i += 1) {
    gaps.push(centers[i] - centers[i - 1])
  }
  if (gaps.length === 0) return false
  const gapMed = median(gaps, gaps[0])
  return gaps.every((g) => Math.abs(g - gapMed) <= Math.max(2, gapMed * 0.45))
}

function countRegularParallelLines(
  runs: Array<{ start: number; end: number; length: number }>,
  span: number,
): number {
  const thin = parallelInkRuns(runs, span)
  if (thin.length >= 2 && isRegularParallelThinRuns(runs, span)) {
    return thin.length
  }
  if (runs.length === 1 && runs[0].length >= span * 0.35) {
    return 1
  }
  return 0
}

function measureAlongWallContinuity(
  mat: CvMat,
  bbox: BoundingBox,
  orientation: ReturnType<typeof bboxOrientation>,
  centerPositions: number[] = [],
): number {
  const { x0, y0, x1, y1 } = clampBox(mat, bbox)

  if (centerPositions.length > 0) {
    let hits = 0
    if (orientation === 'vertical') {
      const alongSpan = y1 - y0
      if (alongSpan < 4) return 0
      for (const x of centerPositions) {
        const xi = Math.round(x)
        if (xi < x0 || xi >= x1) continue
        const runs = darkRunsOnScan(mat, xi, y0, y1 - 1, true).filter((r) => r.length >= 1)
        if (runs.some((r) => r.length >= alongSpan * 0.35)) hits += 1
      }
    } else {
      const alongSpan = x1 - x0
      if (alongSpan < 4) return 0
      for (const y of centerPositions) {
        const yi = Math.round(y)
        if (yi < y0 || yi >= y1) continue
        const runs = darkRunsOnScan(mat, yi, x0, x1 - 1, false).filter((r) => r.length >= 1)
        if (runs.some((r) => r.length >= alongSpan * 0.35)) hits += 1
      }
    }
    return hits / centerPositions.length
  }

  const scanCount = 9
  let longScans = 0

  if (orientation === 'vertical') {
    const alongSpan = y1 - y0
    if (alongSpan < 4) return 0
    const xs = sampleScanLines(
      x0 + Math.floor((x1 - x0) * 0.15),
      x1 - Math.floor((x1 - x0) * 0.15),
      scanCount,
    )
    for (const x of xs) {
      const runs = darkRunsOnScan(mat, x, y0, y1 - 1, true).filter((r) => r.length >= 1)
      if (runs.some((r) => r.length >= alongSpan * 0.35)) longScans += 1
    }
  } else {
    const alongSpan = x1 - x0
    if (alongSpan < 4) return 0
    const ys = sampleScanLines(
      y0 + Math.floor((y1 - y0) * 0.15),
      y1 - Math.floor((y1 - y0) * 0.15),
      scanCount,
    )
    for (const y of ys) {
      const runs = darkRunsOnScan(mat, y, x0, x1 - 1, false).filter((r) => r.length >= 1)
      if (runs.some((r) => r.length >= alongSpan * 0.35)) longScans += 1
    }
  }

  return longScans / scanCount
}

function analyzeInkStructure(
  mat: CvMat,
  bbox: BoundingBox,
  orientation: ReturnType<typeof bboxOrientation>,
) {
  const { x0, y0, x1, y1 } = clampBox(mat, bbox)
  const span = orientation === 'vertical' ? y1 - y0 : x1 - x0
  if (span < 4) {
    return {
      darkRatio: 0,
      parallelLineRatio: 0,
      singleThickRatio: 0,
      detailsRatio: 0,
      avgTransitions: 0,
      medianParallelLineCount: 1,
      inconsistentTransitions: 0,
      alongWallContinuity: 0,
    }
  }

  const scanCount = 7
  const lines =
    orientation === 'vertical'
      ? sampleScanLines(y0 + Math.floor(span * 0.15), y1 - Math.floor(span * 0.15), scanCount)
      : sampleScanLines(x0 + Math.floor(span * 0.15), x1 - Math.floor(span * 0.15), scanCount)

  let darkPixels = 0
  let totalPixels = 0
  let parallelLineScans = 0
  let singleThickLines = 0
  let detailsLines = 0
  let transitionSum = 0
  const parallelLineCounts: number[] = []
  const parallelCenterSets: number[][] = []
  const transitionCounts: number[] = []

  for (const line of lines) {
    const runs = darkRunsOnScan(
      mat,
      line,
      orientation === 'vertical' ? x0 : y0,
      orientation === 'vertical' ? x1 - 1 : y1 - 1,
      orientation !== 'vertical',
    ).filter((r) => r.length >= 1)

    for (const run of runs) {
      darkPixels += run.length
    }
    totalPixels += orientation === 'vertical' ? x1 - x0 : y1 - y0

    const sorted = [...runs].sort((a, b) => b.length - a.length)
    const transitions = runs.length
    transitionSum += transitions
    transitionCounts.push(transitions)

    const parallelCount = countRegularParallelLines(runs, span)
    const thin = parallelInkRuns(runs, span)
    if (parallelCount >= 2) {
      parallelCenterSets.push(thin.map((r) => (r.start + r.end) / 2).sort((a, b) => a - b))
    }
    if (parallelCount >= 2) {
      parallelLineScans += 1
      parallelLineCounts.push(parallelCount)
    }

    if (sorted.length === 1 && sorted[0].length >= span * 0.35) {
      singleThickLines += 1
    }

    if (transitions >= 4) {
      const medianLen = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)].length : 0
      const regularParallel = isRegularParallelThinRuns(runs, span)
      const manyShortRuns = parallelInkRuns(runs, span).length > 8
      if (medianLen <= span * 0.18 && (!regularParallel || manyShortRuns)) {
        detailsLines += 1
      }
    }
  }

  const scanned = Math.max(1, lines.length)
  let parallelCenterStability = 1
  if (parallelCenterSets.length >= 2) {
    const ref = parallelCenterSets[0]
    let maxDrift = 0
    for (let i = 1; i < parallelCenterSets.length; i += 1) {
      const other = parallelCenterSets[i]
      for (let j = 0; j < Math.min(ref.length, other.length); j += 1) {
        maxDrift = Math.max(maxDrift, Math.abs(ref[j] - other[j]))
      }
    }
    parallelCenterStability = maxDrift <= Math.max(3, span * 0.1) ? 1 : 0
  }

  const transitionSpread =
    transitionCounts.length > 1 ? Math.max(...transitionCounts) - Math.min(...transitionCounts) : 0
  const inconsistentTransitions = transitionSpread >= 3 ? 1 : 0
  const referenceCenters =
    parallelCenterSets.length > 0
      ? parallelCenterSets.reduce(
          (best, set) => (set.length > best.length ? set : best),
          parallelCenterSets[0],
        )
      : []
  const alongWallContinuity = measureAlongWallContinuity(mat, bbox, orientation, referenceCenters)

  return {
    darkRatio: darkPixels / Math.max(1, totalPixels),
    parallelLineRatio: (parallelLineScans / scanned) * parallelCenterStability,
    singleThickRatio: singleThickLines / scanned,
    detailsRatio: detailsLines / scanned,
    avgTransitions: transitionSum / scanned,
    medianParallelLineCount: Math.max(2, Math.round(median(parallelLineCounts, 2))),
    inconsistentTransitions,
    alongWallContinuity,
  }
}

function scoreStyles(
  mat: CvMat,
  sample: ExampleSample,
  options?: InferWallRenderStyleOptions,
): { scores: Record<WallRenderStyle, number>; parallelLineCount?: number } {
  const orientation = bboxOrientation(sample)
  const structure = analyzeInkStructure(mat, sample.bbox, orientation)
  const band = measureInkBandInBox(mat, sample.bbox, orientation)
  const parallelSpacing = measureParallelSpacingInBox(mat, sample.bbox, orientation)
  const thicknessPx = band?.thicknessPx ?? 14
  const spacingPx = parallelSpacing ?? 0

  const scores: Record<WallRenderStyle, number> = {
    solid: 0.12,
    parallel_lines: 0.12,
    details: 0.12,
  }

  if (
    parallelSpacing != null &&
    spacingPx >= thicknessPx * 0.7 &&
    structure.parallelLineRatio >= 0.35
  ) {
    scores.parallel_lines += 0.34
  }
  scores.parallel_lines += structure.parallelLineRatio * 0.42
  if (structure.parallelLineRatio >= 0.45) {
    scores.parallel_lines += 0.2
  }
  if (structure.medianParallelLineCount >= 2) {
    scores.parallel_lines += 0.08 + Math.min(0.12, (structure.medianParallelLineCount - 2) * 0.03)
  }
  if (structure.darkRatio >= 0.12 && structure.darkRatio <= 0.48) {
    scores.parallel_lines += 0.12
  }
  if (structure.avgTransitions >= 2 && structure.avgTransitions <= 6) {
    scores.parallel_lines += 0.06
  }

  scores.solid += structure.singleThickRatio * 0.42
  if (structure.darkRatio >= 0.5) {
    scores.solid += 0.22
  }
  if (band && band.thicknessPx >= 8 && structure.parallelLineRatio < 0.35) {
    scores.solid += 0.1
  }
  if (parallelSpacing == null || spacingPx <= thicknessPx * 1.15) {
    scores.solid += 0.08
  }
  if (structure.avgTransitions <= 2.2) {
    scores.solid += 0.06
  }
  if (structure.medianParallelLineCount <= 1 && structure.singleThickRatio >= 0.4) {
    scores.solid += 0.1
  }

  if (structure.parallelLineRatio >= 0.35 && structure.alongWallContinuity < 0.35) {
    scores.parallel_lines -= 0.65
    scores.details += 0.55
  }
  if (structure.inconsistentTransitions && structure.avgTransitions >= 3.5) {
    scores.details += 0.22
    scores.parallel_lines -= 0.12
  }
  if (
    structure.avgTransitions >= 4.2 &&
    structure.singleThickRatio < 0.2 &&
    structure.parallelLineRatio < 0.4
  ) {
    scores.details += 0.28
  }
  if (structure.detailsRatio >= 0.3 && structure.parallelLineRatio < 0.45) {
    scores.details += 0.15
  }
  if (structure.avgTransitions >= 3.2 && structure.parallelLineRatio < 0.35) {
    scores.details += 0.18
  }
  if (structure.darkRatio >= 0.22 && structure.darkRatio <= 0.58) {
    scores.details += 0.1
  }
  if (structure.parallelLineRatio < 0.35 && structure.singleThickRatio < 0.45) {
    scores.details += 0.08
  }
  if (structure.parallelLineRatio >= 0.4) {
    scores.details -= 0.15
  }

  for (const style of options?.expectedWallStyles ?? []) {
    scores[style] += 0.08
  }

  const parallelLineCount =
    structure.parallelLineRatio >= 0.35 && structure.alongWallContinuity >= 0.35
      ? structure.medianParallelLineCount
      : undefined

  return { scores, parallelLineCount }
}

function pickWinner(scores: Record<WallRenderStyle, number>): {
  renderStyle: WallRenderStyle
  confidence: number
} {
  const ranked = [...STYLES].sort((a, b) => scores[b] - scores[a])
  const top = ranked[0]
  const second = ranked[1]
  const topScore = scores[top]
  const gap = topScore - scores[second]
  const confidence = Math.min(0.98, Math.max(0.38, 0.42 + (gap / Math.max(topScore, 0.01)) * 0.5))
  return { renderStyle: top, confidence }
}

export function inferWallRenderStyle(
  mat: CvMat,
  sample: ExampleSample,
  options?: InferWallRenderStyleOptions,
): WallRenderStyleInference {
  const { scores, parallelLineCount } = scoreStyles(mat, sample, options)
  const { renderStyle, confidence } = pickWinner(scores)
  return {
    renderStyle,
    confidence,
    scores,
    parallelLineCount: renderStyle === 'parallel_lines' ? parallelLineCount : undefined,
  }
}
