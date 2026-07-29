import type { RefBBox } from './types'
import { isInk, type AxisSpan } from './ref-blob-label'

/**
 * Detecteer kopeinden (dikke loodrechte ink-clusters) aan beide uiteinden van de opening-as.
 * Retourneert spans van head-zones langs de as, of null als geen betrouwbare koppen.
 */
export function detectKopeindeZones(
  data: Uint8Array,
  width: number,
  height: number,
  bbox: RefBBox,
  orientation: 'horizontal' | 'vertical',
): { startHead: AxisSpan; endHead: AxisSpan } | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  const spanAlong = orientation === 'horizontal' ? x1 - x0 : y1 - y0
  const spanAcross = orientation === 'horizontal' ? y1 - y0 : x1 - x0
  if (spanAlong < 8 || spanAcross < 2) return null

  const headBudget = Math.max(3, Math.min(24, Math.round(spanAlong * 0.18)))
  const thicknessRuns = (alongPos: number): number => {
    let dark = 0
    if (orientation === 'horizontal') {
      const x = x0 + alongPos
      for (let y = y0; y < y1; y += 1) {
        if (isInk(data[y * width + x] ?? 255)) dark += 1
      }
    } else {
      const y = y0 + alongPos
      for (let x = x0; x < x1; x += 1) {
        if (isInk(data[y * width + x] ?? 255)) dark += 1
      }
    }
    return dark
  }

  const profile: number[] = []
  for (let i = 0; i < spanAlong; i += 1) profile.push(thicknessRuns(i))
  const med = [...profile].sort((a, b) => a - b)[Math.floor(profile.length / 2)] ?? 0
  const headThreshold = Math.max(2, med + Math.max(1, Math.round(spanAcross * 0.15)))

  const findHead = (from: number, to: number, forward: boolean): AxisSpan | null => {
    let best: AxisSpan | null = null
    let runStart: number | null = null
    const step = forward ? 1 : -1
    for (let i = from; forward ? i <= to : i >= to; i += step) {
      if ((profile[i] ?? 0) >= headThreshold) {
        if (runStart === null) runStart = i
      } else if (runStart !== null) {
        const a = Math.min(runStart, i - step)
        const b = Math.max(runStart, i - step)
        if (b - a + 1 >= 2) best = { start: a, end: b }
        runStart = null
        if (best) break
      }
    }
    if (runStart !== null) {
      const a = Math.min(runStart, to)
      const b = Math.max(runStart, from)
      if (b - a + 1 >= 2) best = { start: a, end: b }
    }
    return best
  }

  const startHead = findHead(0, Math.min(spanAlong - 1, headBudget * 2), true)
  const endHead = findHead(spanAlong - 1, Math.max(0, spanAlong - 1 - headBudget * 2), false)
  if (!startHead || !endHead) return null
  if (startHead.end >= endHead.start) return null
  const along0 = orientation === 'horizontal' ? x0 : y0
  return {
    startHead: { start: along0 + startHead.start, end: along0 + startHead.end },
    endHead: { start: along0 + endHead.start, end: along0 + endHead.end },
  }
}

/**
 * Vind smalle verticale kozijn-stijlen langs X (na horizontale normalisatie).
 * Lokale pieken in kolom-hoogte-dekking — géén brede solid-muur plateaus.
 */
export function findKozijnPostsAlongX(
  data: Uint8Array,
  width: number,
  height: number,
  bbox: RefBBox,
): AxisSpan[] {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  const across = Math.max(1, y1 - y0)
  const spanW = Math.max(1, x1 - x0)
  const heightCover: number[] = []
  const inkFrac: number[] = []
  for (let x = x0; x < x1; x += 1) {
    let dark = 0
    let run = 0
    let maxRun = 0
    for (let y = y0; y < y1; y += 1) {
      if (isInk(data[y * width + x] ?? 255)) {
        dark += 1
        run += 1
        if (run > maxRun) maxRun = run
      } else {
        run = 0
      }
    }
    heightCover.push(maxRun / across)
    inkFrac.push(dark / across)
  }
  if (heightCover.length < 8) return []

  const sortedCover = [...heightCover].sort((a, b) => a - b)
  const medCover = sortedCover[Math.floor(sortedCover.length / 2)] ?? 0
  const p80 = sortedCover[Math.floor(sortedCover.length * 0.8)] ?? medCover
  // Kozijnstijl: hoge verticale run, lokaal boven omgeving
  const coverFloor = Math.max(0.28, medCover + 0.12, p80 * 0.55)
  const maxPostW = Math.max(3, Math.min(18, Math.round(spanW * 0.07)))
  const minGap = Math.max(8, Math.round(spanW * 0.05))
  const neighbor = Math.max(2, Math.round(spanW * 0.015))

  const isLocalPeak = (i: number): boolean => {
    const v = heightCover[i] ?? 0
    if (v < coverFloor) return false
    let leftMax = 0
    let rightMax = 0
    for (let d = 1; d <= neighbor; d += 1) {
      leftMax = Math.max(leftMax, heightCover[i - d] ?? 0)
      rightMax = Math.max(rightMax, heightCover[i + d] ?? 0)
    }
    // Streng: hoger of gelijk aan buren (plateau-midden van solid muur valt af
    // omdat we later maxPostW afkappen)
    return v + 0.02 >= leftMax && v + 0.02 >= rightMax
  }

  const peakMask = new Uint8Array(heightCover.length)
  for (let i = 0; i < heightCover.length; i += 1) {
    if (isLocalPeak(i)) peakMask[i] = 1
  }
  // Uiteinden: hoge verticale run telt als stijl (1e lijn L/R na rechtzetten)
  if ((heightCover[0] ?? 0) >= coverFloor) peakMask[0] = 1
  const lastIdx = heightCover.length - 1
  if ((heightCover[lastIdx] ?? 0) >= coverFloor) peakMask[lastIdx] = 1

  const raw: AxisSpan[] = []
  let runStart: number | null = null
  for (let i = 0; i < peakMask.length; i += 1) {
    const cover = heightCover[i] ?? 0
    const on = peakMask[i] === 1 || (runStart !== null && cover >= coverFloor * 0.9)
    if (on) {
      if (runStart === null) runStart = i
    } else if (runStart !== null) {
      const end = i - 1
      const postW = end - runStart + 1
      if (postW >= 1 && postW <= maxPostW) {
        raw.push({ start: x0 + runStart, end: x0 + end })
      }
      runStart = null
    }
  }
  if (runStart !== null) {
    const end = peakMask.length - 1
    const postW = end - runStart + 1
    if (postW >= 1 && postW <= maxPostW) {
      raw.push({ start: x0 + runStart, end: x0 + end })
    }
  }

  // Merge nabije pieken tot één stijl
  const merged: AxisSpan[] = []
  for (const p of raw) {
    const prev = merged[merged.length - 1]
    if (prev && p.start - prev.end <= 2) {
      const nextEnd = p.end
      if (nextEnd - prev.start + 1 <= maxPostW) prev.end = nextEnd
      else merged.push({ ...p })
    } else {
      merged.push({ ...p })
    }
  }

  if (merged.length === 0) return []

  // Dedup op minGap: houd sterkste post (hoogste cover)
  const score = (span: AxisSpan) => {
    let best = 0
    for (let x = span.start; x <= span.end; x += 1) {
      best = Math.max(best, heightCover[x - x0] ?? 0)
    }
    return best
  }
  const filtered: AxisSpan[] = [merged[0]]
  for (let i = 1; i < merged.length; i += 1) {
    const prev = filtered[filtered.length - 1]
    const cur = merged[i]
    if (cur.start - prev.end >= minGap) filtered.push(cur)
    else if (score(cur) > score(prev)) filtered[filtered.length - 1] = cur
  }
  return filtered
}

/**
 * Fallback als piek-detectie faalt: scan vanaf links/rechts tot 1e kolom
 * met voldoende verticale ink-run (= 1e verticale lijn aan beide kanten).
 */
export function findOuterVerticalsByScan(
  data: Uint8Array,
  width: number,
  height: number,
): { left: AxisSpan; right: AxisSpan } | null {
  const coverAt = (x: number): number => {
    let run = 0
    let maxRun = 0
    for (let y = 0; y < height; y += 1) {
      if (isInk(data[y * width + x] ?? 255)) {
        run += 1
        if (run > maxRun) maxRun = run
      } else run = 0
    }
    return maxRun / Math.max(1, height)
  }
  const floor = 0.3
  const maxW = Math.max(3, Math.round(width * 0.08))

  const expand = (startX: number, dir: 1 | -1): AxisSpan | null => {
    if (coverAt(startX) < floor) return null
    let a = startX
    let b = startX
    while (true) {
      const nx = dir === 1 ? b + 1 : a - 1
      if (nx < 0 || nx >= width) break
      if (coverAt(nx) < floor * 0.85) break
      if (dir === 1) b = nx
      else a = nx
      if (b - a + 1 > maxW) break
    }
    return { start: a, end: b }
  }

  let left: AxisSpan | null = null
  for (let x = 0; x < width; x += 1) {
    if (coverAt(x) >= floor) {
      left = expand(x, 1)
      break
    }
  }
  let right: AxisSpan | null = null
  for (let x = width - 1; x >= 0; x -= 1) {
    if (coverAt(x) >= floor) {
      right = expand(x, -1)
      break
    }
  }
  if (!left || !right) return null
  if (right.start <= left.end) return null
  return { left, right }
}
