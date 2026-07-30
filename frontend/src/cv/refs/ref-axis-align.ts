import { tally } from '@/core/diagnostics'
import type { OpenCV } from '@/cv/loadOpenCV'

/**
 * As-align op ref-crops (muur/deur/raam):
 * 1) Canny + HoughLinesP
 * 2) Voorkeur: lijnen die L én R (of T én B) van de bbox raken → die moeten H/V
 * 3) Anders: langste lijn → Math.atan2(dy,dx) → terugdraaien naar dichtstbijzijnde as
 * 4) Fallback: ink-hoogte links vs rechts (Δy / width)
 *
 * Geen findNonZero (bestaat niet in @opencvjs/web).
 */

const MAX_ABS_CORRECTION_DEG = 40

/** Vouw hoek naar afwijking t.o.v. dichtstbijzijnde H/V-as (−45..45]. */
function foldToNearestAxisDeviation(angleDeg: number): number {
  let a = angleDeg % 180
  if (a < 0) a += 180
  const toH = a > 90 ? a - 180 : a
  const toV = a - 90
  return Math.abs(toH) <= Math.abs(toV) ? toH : toV
}

type HoughSeg = { x1: number; y1: number; x2: number; y2: number; len: number; angleDeg: number }

function readHoughSegments(cv: OpenCV, bwMat: OpenCV['Mat']): HoughSeg[] {
  const edges = new cv.Mat()
  const lines = new cv.Mat()
  try {
    cv.Canny(bwMat, edges, 50, 150, 3, false)
    const minLen = Math.max(6, Math.round(Math.min(bwMat.cols, bwMat.rows) * 0.1))
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 15, minLen, 8)
    const out: HoughSeg[] = []
    const n = Math.min(lines.rows, 500)
    for (let i = 0; i < n; i += 1) {
      const x1 = lines.data32S[i * 4] ?? 0
      const y1 = lines.data32S[i * 4 + 1] ?? 0
      const x2 = lines.data32S[i * 4 + 2] ?? 0
      const y2 = lines.data32S[i * 4 + 3] ?? 0
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      if (len < 6) continue
      out.push({
        x1,
        y1,
        x2,
        y2,
        len,
        angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      })
    }
    return out
  } finally {
    lines.delete()
    edges.delete()
  }
}

function touchesOppositeSides(
  seg: HoughSeg,
  width: number,
  height: number,
  margin: number,
): 'horizontal' | 'vertical' | null {
  const left = Math.min(seg.x1, seg.x2) <= margin
  const right = Math.max(seg.x1, seg.x2) >= width - 1 - margin
  const top = Math.min(seg.y1, seg.y2) <= margin
  const bottom = Math.max(seg.y1, seg.y2) >= height - 1 - margin
  if (left && right) return 'horizontal'
  if (top && bottom) return 'vertical'
  return null
}

// ESC:REF-02 (A)
/**
 * Hoekcorrectie (UI-graden, + = klokwijs) zodat dominante lijnen H/V worden.
 * Exact: atan2 van de gekozen lijn, gevouwen naar as, daarna tegendraaien.
 */
function estimateInkAxisCorrectionDeg(cv: OpenCV, bwMat: OpenCV['Mat']): number {
  const w = bwMat.cols
  const h = bwMat.rows
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.04))
  const segs = readHoughSegments(cv, bwMat)

  // 1) Lijnen die tot beide zijkanten (of top+bottom) gaan — die ZIJN de horizon/loodlijn
  const spanning = segs
    .map((s) => ({ s, touch: touchesOppositeSides(s, w, h, margin) }))
    .filter((x) => x.touch != null)
    .sort((a, b) => b.s.len - a.s.len)

  if (spanning.length > 0) {
    const best = spanning[0]
    const deviation = foldToNearestAxisDeviation(best.s.angleDeg)
    const uiDeg = -deviation
    tally('REF-02', 'spanning')
    if (Math.abs(uiDeg) < 0.15) return 0
    return Math.max(-MAX_ABS_CORRECTION_DEG, Math.min(MAX_ABS_CORRECTION_DEG, uiDeg))
  }

  // 2) Langste lijn (bijna-horizontaal of bijna-verticaal)
  if (segs.length > 0) {
    const longest = [...segs].sort((a, b) => b.len - a.len)[0]
    const deviation = foldToNearestAxisDeviation(longest.angleDeg)
    // Alleen corrigeren als redelijk dicht bij een as (±25°)
    if (Math.abs(deviation) <= 25) {
      const uiDeg = -deviation
      if (Math.abs(uiDeg) >= 0.15) {
        tally('REF-02', 'longestLine')
        return Math.max(-MAX_ABS_CORRECTION_DEG, Math.min(MAX_ABS_CORRECTION_DEG, uiDeg))
      }
    }
  }

  // 3) Fallback: Δy ink links vs rechts → helling over volle breedte
  tally('REF-02', 'edgeInkHeights')
  return estimateAxisFromEdgeInkHeights(bwMat)
}

/** Tel ink-centroid-y aan linker- en rechterrand → atan2(Δy, width). */
function estimateAxisFromEdgeInkHeights(bwMat: OpenCV['Mat']): number {
  const data = bwMat.data as Uint8Array
  const w = bwMat.cols
  const h = bwMat.rows
  const band = Math.max(2, Math.round(w * 0.06))

  const meanY = (x0: number, x1: number): number | null => {
    let sum = 0
    let n = 0
    for (let y = 0; y < h; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if ((data[y * w + x] ?? 255) < 128) {
          sum += y
          n += 1
        }
      }
    }
    return n >= 3 ? sum / n : null
  }

  const leftY = meanY(0, band)
  const rightY = meanY(Math.max(0, w - band), w)
  if (leftY == null || rightY == null) return 0
  const angleDeg = (Math.atan2(rightY - leftY, w - band) * 180) / Math.PI
  const uiDeg = -angleDeg
  if (Math.abs(uiDeg) < 0.2) return 0
  return Math.max(-MAX_ABS_CORRECTION_DEG, Math.min(MAX_ABS_CORRECTION_DEG, uiDeg))
}

/** Nooit throwen. */
export function estimateRefAxisCorrectionDeg(cv: OpenCV, bwMat: OpenCV['Mat']): number {
  try {
    return estimateInkAxisCorrectionDeg(cv, bwMat)
  } catch {
    try {
      return estimateAxisFromEdgeInkHeights(bwMat)
    } catch {
      return 0
    }
  }
}
