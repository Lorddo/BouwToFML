import type { RefBBox, RefBlobUnit, RefPoint } from './types'
import { filterSignificantBlobs, isInk, labelInkComponents, type AxisSpan } from './ref-blob-label'
import {
  detectKopeindeZones,
  findKozijnPostsAlongX,
  findOuterVerticalsByScan,
} from './ref-blob-kozijn'

function bboxFromSpan(
  span: AxisSpan,
  orientation: 'horizontal' | 'vertical',
  crossMin: number,
  crossMax: number,
  pad = 1,
): RefBBox {
  if (orientation === 'horizontal') {
    return {
      x: Math.max(0, span.start - pad),
      y: Math.max(0, crossMin - pad),
      width: span.end - span.start + 1 + pad * 2,
      height: crossMax - crossMin + 1 + pad * 2,
    }
  }
  return {
    x: Math.max(0, crossMin - pad),
    y: Math.max(0, span.start - pad),
    width: crossMax - crossMin + 1 + pad * 2,
    height: span.end - span.start + 1 + pad * 2,
  }
}

function areaInBBox(data: Uint8Array, width: number, height: number, bbox: RefBBox): number {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  let area = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (isInk(data[y * width + x] ?? 255)) area += 1
    }
  }
  return area
}

function centroidInBBox(data: Uint8Array, width: number, height: number, bbox: RefBBox): RefPoint {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  let area = 0
  let sumX = 0
  let sumY = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!isInk(data[y * width + x] ?? 255)) continue
      area += 1
      sumX += x
      sumY += y
    }
  }
  if (area === 0) {
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
  }
  return { x: sumX / area, y: sumY / area }
}

/** Houd alleen de grootste ink-blob; rest → wit. */
export function keepPrimaryBlobOnly(
  data: Uint8Array,
  width: number,
  height: number,
): {
  data: Uint8Array
  labels: Int32Array
  primaryLabel: number | null
  primaryBBox: RefBBox | null
} {
  const labeled = labelInkComponents(data, width, height)
  const significant = filterSignificantBlobs(labeled.blobs, width * height, {
    minAreaPx: 8,
    minRatioOfLargest: 0.15,
  })
  const primary = significant[0] ?? null
  const out = new Uint8Array(data.length)
  out.fill(255)
  if (!primary) {
    return { data: out, labels: labeled.labels, primaryLabel: null, primaryBBox: null }
  }
  for (let i = 0; i < labeled.labels.length; i += 1) {
    if (labeled.labels[i] === primary.label) out[i] = data[i] ?? 255
  }
  return {
    data: out,
    labels: labeled.labels,
    primaryLabel: primary.label,
    primaryBBox: { ...primary.bbox },
  }
}

/**
 * Verwijder alleen speckles; behoud alle significante blobs (muur + kozijn + boog).
 * Voor deuren: keepPrimaryBlobOnly gooit vaak de draaicirkel weg als die los zit van de muurstrook.
 */
export function removeInkSpeckles(
  data: Uint8Array,
  width: number,
  height: number,
  options?: { minAreaPx?: number; minRatioOfLargest?: number },
): { data: Uint8Array; labels: Int32Array; keptLabels: number[] } {
  const labeled = labelInkComponents(data, width, height)
  const significant = filterSignificantBlobs(labeled.blobs, width * height, {
    minAreaPx: options?.minAreaPx ?? 8,
    minRatioOfLargest: options?.minRatioOfLargest ?? 0.06,
  })
  const keep = new Set(significant.map((b) => b.label))
  const out = new Uint8Array(data.length)
  out.fill(255)
  for (let i = 0; i < labeled.labels.length; i += 1) {
    const lab = labeled.labels[i] ?? 0
    if (keep.has(lab)) out[i] = data[i] ?? 255
  }
  return { data: out, labels: labeled.labels, keptLabels: [...keep] }
}

function tightInkBBox(
  data: Uint8Array,
  width: number,
  height: number,
  bbox: RefBBox,
  pad = 2,
): RefBBox {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  let minX = x1
  let maxX = x0 - 1
  let minY = y1
  let maxY = y0 - 1
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!isInk(data[y * width + x] ?? 255)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) return { ...bbox }
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    width: Math.min(width, maxX + pad + 1) - Math.max(0, minX - pad),
    height: Math.min(height, maxY + pad + 1) - Math.max(0, minY - pad),
  }
}

/**
 * Opening-units na horizontale normalisatie:
 * 1) vind smalle verticale kozijn-stijlen
 * 2) elk opeenvolgend post-paar = 1 unit met exact 2 kozijnen
 * 3) bbox X = linkerstijl→rechterstijl (muur erbuiten valt weg)
 * 4) Y = tight ink in die X-band
 *
 * Geen keepPrimaryBlobOnly vóór posts — dat houdt muur+kozijn als één blob.
 */
export function resolveOpeningUnits(params: {
  data: Uint8Array
  width: number
  height: number
  singleUnit?: boolean
}): {
  primary: RefBlobUnit | null
  units: RefBlobUnit[]
  labels: Int32Array
  maskedData: Uint8Array
} {
  const { width, height, data } = params
  const labeled = labelInkComponents(data, width, height)
  const labels = labeled.labels

  const searchBox: RefBBox = { x: 0, y: 0, width, height }
  const posts = findKozijnPostsAlongX(data, width, height, searchBox)

  let candidateBBoxes: Array<{ bbox: RefBBox; source: RefBlobUnit['source'] }> = []

  if (posts.length >= 2) {
    for (let i = 0; i < posts.length - 1; i += 1) {
      const a = posts[i]!
      const b = posts[i + 1]!
      const strip: RefBBox = {
        x: a.start,
        y: 0,
        width: b.end - a.start + 1,
        height,
      }
      const tight = tightInkBBox(data, width, height, strip, 2)
      const bbox: RefBBox = {
        x: Math.max(0, a.start - 1),
        y: tight.y,
        width: Math.min(width, b.end + 2) - Math.max(0, a.start - 1),
        height: tight.height,
      }
      if (bbox.width < 6) continue
      if (bbox.width > width * 0.98 && posts.length > 2) continue
      // Smalle volle-hoogte sliert (vaak dikke muurstrook als "2 posts") ≠ opening-unit
      if (bbox.width < width * 0.28 && bbox.height > height * 0.8) continue
      candidateBBoxes.push({ bbox, source: 'kozijn_span' })
    }
  } else {
    const scanned = findOuterVerticalsByScan(data, width, height)
    if (scanned) {
      const strip: RefBBox = {
        x: scanned.left.start,
        y: 0,
        width: scanned.right.end - scanned.left.start + 1,
        height,
      }
      const tight = tightInkBBox(data, width, height, strip, 2)
      candidateBBoxes.push({
        bbox: {
          x: Math.max(0, scanned.left.start - 1),
          y: tight.y,
          width: Math.min(width, scanned.right.end + 2) - Math.max(0, scanned.left.start - 1),
          height: tight.height,
        },
        source: 'kozijn_span',
      })
    } else {
      const kept = keepPrimaryBlobOnly(data, width, height)
      if (kept.primaryBBox) {
        const heads = detectKopeindeZones(kept.data, width, height, kept.primaryBBox, 'horizontal')
        if (heads) {
          const span: AxisSpan = { start: heads.startHead.start, end: heads.endHead.end }
          const raw = bboxFromSpan(
            span,
            'horizontal',
            kept.primaryBBox.y,
            kept.primaryBBox.y + kept.primaryBBox.height - 1,
            2,
          )
          candidateBBoxes.push({
            bbox: tightInkBBox(kept.data, width, height, raw, 2),
            source: 'kozijn_span',
          })
        } else {
          candidateBBoxes.push({
            bbox: tightInkBBox(kept.data, width, height, kept.primaryBBox, 2),
            source: 'component',
          })
        }
      }
    }
  }

  const unitsRaw: RefBlobUnit[] = candidateBBoxes.map((cand, index) => {
    const heads = detectKopeindeZones(data, width, height, cand.bbox, 'horizontal')
    return {
      index,
      areaPx: areaInBBox(data, width, height, cand.bbox),
      bbox: cand.bbox,
      centroid: centroidInBBox(data, width, height, cand.bbox),
      isPrimary: false,
      source: cand.source,
      includesBothHeads: heads != null || cand.source === 'kozijn_span',
    }
  })

  // Verwerp mini-paren (vals 3e post-fragment): < 20% van cropbreedte én niet de enige unit
  let units =
    unitsRaw.length > 1
      ? unitsRaw.filter((u) => u.bbox.width >= Math.max(12, width * 0.2))
      : unitsRaw
  if (units.length === 0) units = unitsRaw

  if (params.singleUnit && units.length > 1) {
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let anyBothHeads = false
    let anyKozijnSpan = false
    for (const unit of units) {
      const x0 = Math.max(0, Math.floor(unit.bbox.x))
      const y0 = Math.max(0, Math.floor(unit.bbox.y))
      const x1 = Math.min(width, Math.ceil(unit.bbox.x + unit.bbox.width))
      const y1 = Math.min(height, Math.ceil(unit.bbox.y + unit.bbox.height))
      if (x0 < minX) minX = x0
      if (y0 < minY) minY = y0
      if (x1 > maxX) maxX = x1
      if (y1 > maxY) maxY = y1
      anyBothHeads = anyBothHeads || unit.includesBothHeads === true
      anyKozijnSpan = anyKozijnSpan || unit.source === 'kozijn_span'
    }
    const mergedBbox: RefBBox = {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
    units = [
      {
        index: 0,
        areaPx: areaInBBox(data, width, height, mergedBbox),
        bbox: mergedBbox,
        centroid: centroidInBBox(data, width, height, mergedBbox),
        isPrimary: true,
        source: anyKozijnSpan ? 'kozijn_span' : 'component',
        includesBothHeads:
          anyBothHeads ||
          detectKopeindeZones(data, width, height, mergedBbox, 'horizontal') != null,
      },
    ]
  }

  for (let i = 0; i < units.length; i += 1) units[i]!.index = i

  let maxArea = -1
  let primaryIndex = 0
  for (const u of units) {
    if (u.areaPx > maxArea) {
      maxArea = u.areaPx
      primaryIndex = u.index
    }
  }
  for (const u of units) u.isPrimary = u.index === primaryIndex

  return {
    primary: units.find((u) => u.isPrimary) ?? units[0] ?? null,
    units,
    labels,
    maskedData: data,
  }
}
