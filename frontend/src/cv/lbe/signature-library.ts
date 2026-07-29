import type { ExampleSample } from '@/core/extraction'
import type {
  DoorSignature,
  GeometricSignature,
  WallLineFingerprint,
  WallSignature,
  WindowSignature,
} from '@/core/extraction/geometric-signature'
import type { OpenCV } from '@/cv/loadOpenCV'
import { detectBaseline } from '@/cv/port/baseline'
import type { Segment } from '@/cv/port/wallGraph'
import {
  extractSignaturesFromExamples,
  finalizeWallSignature,
  type ExtractSignatureOptions,
} from './extract-signature'
import { wallMinLengthPxForRenderStyle } from './wall-min-length'
import { median } from '@/cv/util/stats'

type CvMat = { cols: number; rows: number; ucharPtr: (y: number, x: number) => Uint8Array }

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

function bboxContainsSegmentCenter(
  bbox: { x: number; y: number; width: number; height: number },
  seg: Segment,
): boolean {
  const cx = (seg.a.x + seg.b.x) / 2
  const cy = (seg.a.y + seg.b.y) / 2
  return cx >= bbox.x && cy >= bbox.y && cx <= bbox.x + bbox.width && cy <= bbox.y + bbox.height
}

function deriveLineFingerprint(lines: Segment[]): WallLineFingerprint | undefined {
  if (lines.length === 0) return undefined
  const horizontal = lines.filter(
    (line) => Math.abs(line.b.x - line.a.x) >= Math.abs(line.b.y - line.a.y),
  )
  const vertical = lines.filter(
    (line) => Math.abs(line.b.x - line.a.x) < Math.abs(line.b.y - line.a.y),
  )
  const dominantOrientation = horizontal.length >= vertical.length ? 'horizontal' : 'vertical'
  const dominant = dominantOrientation === 'horizontal' ? horizontal : vertical
  const lengths = dominant.map((line) => segmentLength(line))
  const centers = dominant.map((line) =>
    dominantOrientation === 'horizontal' ? (line.a.y + line.b.y) / 2 : (line.a.x + line.b.x) / 2,
  )
  const sortedCenters = [...centers].sort((a, b) => a - b)
  const spacings: number[] = []
  for (let i = 1; i < sortedCenters.length; i += 1) {
    const d = sortedCenters[i] - sortedCenters[i - 1]
    if (d >= 2) spacings.push(d)
  }

  return {
    rawLineCount: lines.length,
    dominantOrientation,
    medianLengthPx: Math.max(4, Math.round(median(lengths, 12))),
    spacingPx: spacings.length > 0 ? Math.round(median(spacings, 0)) : undefined,
  }
}

function withWallFingerprints(
  signatures: GeometricSignature[],
  examples: ExampleSample[],
  rawLines: Segment[],
): GeometricSignature[] {
  const examplesById = new Map(examples.map((ex) => [ex.id, ex]))
  return signatures.map((sig) => {
    if (!sig.wall) return sig
    if (sig.wall.renderStyle !== 'parallel_lines') {
      return { ...sig, wall: finalizeWallSignature(sig.wall) }
    }
    const ex = examplesById.get(sig.sourceExampleId)
    if (!ex) return sig
    const linesInBox = rawLines.filter((line) => bboxContainsSegmentCenter(ex.bbox, line))
    const fingerprint = deriveLineFingerprint(linesInBox)
    if (!fingerprint) return { ...sig, wall: finalizeWallSignature(sig.wall) }
    const wall = finalizeWallSignature({
      ...sig.wall,
      lineFingerprint: fingerprint,
      parallelSpacingPx: sig.wall.parallelSpacingPx ?? fingerprint.spacingPx,
      parallelLineCount: sig.wall.parallelLineCount ?? fingerprint.rawLineCount,
    })
    return { ...sig, wall }
  })
}

function wallsAreSimilar(a: WallSignature, b: WallSignature): boolean {
  if (a.renderStyle !== b.renderStyle) return false
  if (a.renderStyle === 'parallel_lines') {
    const countA = a.parallelLineCount ?? a.lineFingerprint?.rawLineCount ?? 0
    const countB = b.parallelLineCount ?? b.lineFingerprint?.rawLineCount ?? 0
    if (countA > 0 && countB > 0 && Math.abs(countA - countB) > 1) return false
  }
  const maxT = Math.max(a.thicknessPx, b.thicknessPx)
  const minT = Math.min(a.thicknessPx, b.thicknessPx)
  return minT / maxT >= 0.78
}

function clusterWallSignatures(walls: WallSignature[]): WallSignature[][] {
  const clusters: WallSignature[][] = []
  for (const wall of walls) {
    const cluster = clusters.find((set) => wallsAreSimilar(set[0], wall))
    if (cluster) {
      cluster.push(wall)
    } else {
      clusters.push([wall])
    }
  }
  return clusters
}

function aggregateWallSignatures(signatures: GeometricSignature[]): GeometricSignature[] {
  const wallEntries = signatures.filter((sig) => !!sig.wall)
  if (wallEntries.length <= 1) return signatures
  const clusters = clusterWallSignatures(wallEntries.map((sig) => sig.wall as WallSignature))
  if (clusters.length === wallEntries.length) return signatures

  const aggregatedWallEntries: GeometricSignature[] = []
  for (const set of clusters) {
    const thicknessPx = Math.max(
      3,
      Math.round(
        median(
          set.map((s) => s.thicknessPx),
          14,
        ),
      ),
    )
    const spacingPool = set
      .map((s) => s.parallelSpacingPx ?? s.lineFingerprint?.spacingPx)
      .filter((v): v is number => typeof v === 'number' && v > 0)
    const parallelSpacingPx =
      spacingPool.length > 0 ? Math.max(2, Math.round(median(spacingPool, thicknessPx))) : undefined
    const style = set[0].renderStyle
    const parallelLineCount =
      style === 'parallel_lines'
        ? Math.max(
            2,
            Math.round(
              median(
                set.map((s) => s.parallelLineCount ?? s.lineFingerprint?.rawLineCount ?? 2),
                2,
              ),
            ),
          )
        : undefined
    const merged = finalizeWallSignature({
      renderStyle: style,
      thicknessPx,
      parallelLineCount,
      parallelSpacingPx,
      angleToleranceDeg: Math.round(
        median(
          set.map((s) => s.angleToleranceDeg),
          12,
        ),
      ),
      minLengthPx: wallMinLengthPxForRenderStyle(style),
      closeKernelPx:
        style === 'details'
          ? Math.round(
              median(
                set.map((s) => s.closeKernelPx ?? s.thicknessPx),
                thicknessPx,
              ),
            )
          : undefined,
      rejectDiagonalHatch: style === 'details',
      lineFingerprint:
        style === 'parallel_lines'
          ? {
              rawLineCount: Math.round(
                median(
                  set.map((s) => s.lineFingerprint?.rawLineCount ?? 0),
                  0,
                ),
              ),
              dominantOrientation:
                set.filter((s) => s.lineFingerprint?.dominantOrientation === 'horizontal').length >=
                set.filter((s) => s.lineFingerprint?.dominantOrientation === 'vertical').length
                  ? 'horizontal'
                  : 'vertical',
              medianLengthPx: Math.max(
                4,
                Math.round(
                  median(
                    set.map((s) => s.lineFingerprint?.medianLengthPx ?? s.minLengthPx),
                    12,
                  ),
                ),
              ),
              spacingPx: parallelSpacingPx,
            }
          : undefined,
    })
    aggregatedWallEntries.push({
      id: `wall-cluster-${style}-${thicknessPx}`,
      type: 'wall',
      sourceExampleId: `wall-cluster-${style}-${thicknessPx}`,
      wall: merged,
    })
  }

  return [...signatures.filter((sig) => !sig.wall), ...aggregatedWallEntries]
}

export interface SignatureLibrary {
  all: GeometricSignature[]
  walls: WallSignature[]
  doors: DoorSignature[]
  windows: WindowSignature[]
}

export function buildSignatureLibrary(
  cv: OpenCV,
  mat: CvMat,
  examples: ExampleSample[],
  options?: ExtractSignatureOptions,
): SignatureLibrary {
  const baseline = detectBaseline(cv, mat as OpenCV['Mat'])
  const allRaw = extractSignaturesFromExamples(mat, examples, options)
  const all = withWallFingerprints(allRaw, examples, baseline.segments)
  const clustered = aggregateWallSignatures(all)
  return {
    all: clustered,
    walls: clustered.map((sig) => sig.wall).filter((sig): sig is WallSignature => !!sig),
    doors: [],
    windows: [],
  }
}
