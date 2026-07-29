import { pickGeomByPrefer, type GeomPrefer } from '@/cv/walls/rooms/face-dual-space'
import type { RefBBox, RefFace, RefFaceProfile, RefPoint } from './types'

const INK_THRESHOLD = 128

export type RefFaceGeom = {
  label: number
  bbox: RefBBox
  areaPx: number
  centroid: RefPoint
}

export type RefFaceDualSpace = {
  width: number
  height: number
  /** White CC labels (crop-lokaal), 0 = inkt/geen face. */
  labelsData: Int32Array
  /** Zelfde labels na ink-assign (inkt pixels bij white labels). */
  inkLabelsData: Int32Array
  whiteByLabel: Map<number, RefFaceGeom>
  inkByLabel: Map<number, RefFaceGeom>
  /** Backwards-compat: white geom + roles. */
  faces: RefFace[]
  geom(label: number, prefer: GeomPrefer): RefFaceGeom | undefined
}

function isInk(v: number): boolean {
  return v < INK_THRESHOLD
}

function geomFromLabelRaster(
  labels: Int32Array,
  width: number,
  height: number,
): Map<number, RefFaceGeom> {
  const acc = new Map<
    number,
    {
      minX: number
      minY: number
      maxX: number
      maxY: number
      area: number
      sumX: number
      sumY: number
    }
  >()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = labels[y * width + x] ?? 0
      if (!(label > 0)) continue
      const cur = acc.get(label)
      if (!cur) {
        acc.set(label, {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          area: 1,
          sumX: x,
          sumY: y,
        })
        continue
      }
      cur.minX = Math.min(cur.minX, x)
      cur.minY = Math.min(cur.minY, y)
      cur.maxX = Math.max(cur.maxX, x)
      cur.maxY = Math.max(cur.maxY, y)
      cur.area += 1
      cur.sumX += x
      cur.sumY += y
    }
  }
  const out = new Map<number, RefFaceGeom>()
  for (const [label, cur] of acc) {
    out.set(label, {
      label,
      areaPx: cur.area,
      bbox: {
        x: cur.minX,
        y: cur.minY,
        width: cur.maxX - cur.minX + 1,
        height: cur.maxY - cur.minY + 1,
      },
      centroid: { x: cur.sumX / cur.area, y: cur.sumY / cur.area },
    })
  }
  return out
}

/**
 * Ink-assign op crop-raster (bwCrop + whiteLabels zelfde afmeting).
 * BFS vanaf white-rand in zwarte pixels; zelfde label-IDs; ink-geom ≥ white-geom.
 */
export function assignInkLabelsToWhiteFacesCrop(params: {
  bwCrop: Uint8Array
  whiteLabels: Int32Array
  width: number
  height: number
}): Int32Array {
  const { bwCrop, whiteLabels, width, height } = params
  if (whiteLabels.length !== width * height || bwCrop.length !== width * height) {
    throw new Error('RefFaceDualSpace: bwCrop/whiteLabels lengte ≠ width×height')
  }
  const inkLabels = new Int32Array(whiteLabels)
  const queue: number[] = []
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const label = whiteLabels[i] ?? 0
      if (!(label > 0)) continue
      for (const [dx, dy] of deltas) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if ((inkLabels[ni] ?? 0) > 0) continue
        if (!isInk(bwCrop[ni] ?? 255)) continue
        inkLabels[ni] = label
        queue.push(ni)
      }
    }
  }

  let head = 0
  while (head < queue.length) {
    const i = queue[head]
    head += 1
    const label = inkLabels[i] ?? 0
    if (!(label > 0)) continue
    const x = i % width
    const y = Math.floor(i / width)
    for (const [dx, dy] of deltas) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if ((inkLabels[ni] ?? 0) > 0) continue
      if (!isInk(bwCrop[ni] ?? 255)) continue
      inkLabels[ni] = label
      queue.push(ni)
    }
  }

  return inkLabels
}

function pickGeom(
  whiteByLabel: Map<number, RefFaceGeom>,
  inkByLabel: Map<number, RefFaceGeom>,
  label: number,
  prefer: GeomPrefer,
): RefFaceGeom | undefined {
  return pickGeomByPrefer(whiteByLabel.get(label), inkByLabel.get(label), prefer)
}

function extractBwCrop(
  data: Uint8Array,
  width: number,
  height: number,
  bbox?: RefBBox,
): { bwCrop: Uint8Array; cropW: number; cropH: number; x0: number; y0: number } {
  const x0 = bbox ? Math.max(0, Math.floor(bbox.x)) : 0
  const y0 = bbox ? Math.max(0, Math.floor(bbox.y)) : 0
  const x1 = bbox ? Math.min(width, Math.ceil(bbox.x + bbox.width)) : width
  const y1 = bbox ? Math.min(height, Math.ceil(bbox.y + bbox.height)) : height
  const cropW = Math.max(1, x1 - x0)
  const cropH = Math.max(1, y1 - y0)
  if (x0 === 0 && y0 === 0 && cropW === width && cropH === height) {
    return { bwCrop: data, cropW, cropH, x0, y0 }
  }
  const bwCrop = new Uint8Array(cropW * cropH)
  for (let ly = 0; ly < cropH; ly += 1) {
    for (let lx = 0; lx < cropW; lx += 1) {
      bwCrop[ly * cropW + lx] = data[(y0 + ly) * width + (x0 + lx)] ?? 255
    }
  }
  return { bwCrop, cropW, cropH, x0, y0 }
}

/** RefFace met ink-inclusieve bbox/area (role e.d. blijven van white face). */
export function refFaceWithGeom(face: RefFace, geom: RefFaceGeom | undefined): RefFace {
  if (!geom) return face
  const bw = Math.max(1, geom.bbox.width)
  const bh = Math.max(1, geom.bbox.height)
  return {
    ...face,
    areaPx: geom.areaPx,
    bbox: { ...geom.bbox },
    centroid: { ...geom.centroid },
    aspectRatio: bh > 0 ? bw / bh : 1,
    compactness: bw * bh > 0 ? geom.areaPx / (bw * bh) : 0,
  }
}

/**
 * Bouw dual vanuit bestaande white-labeling (geen tweede CC).
 * `faces` = white geom (default); `geom(label, 'ink')` voor framing-maat.
 */
export function attachRefFaceDualFromWhiteLabels(params: {
  data: Uint8Array
  width: number
  height: number
  bbox?: RefBBox
  labels: Int32Array
  faces: RefFace[]
}): RefFaceDualSpace {
  const { data, width, height, bbox, labels, faces } = params
  if (!data || data.length === 0) {
    throw new Error('RefFaceDualSpace: B/W data ontbreekt')
  }
  if (labels.length === 0) {
    throw new Error('RefFaceDualSpace: white-labeling leverde geen labels')
  }
  const { bwCrop, cropW, cropH } = extractBwCrop(data, width, height, bbox)
  if (labels.length !== cropW * cropH) {
    throw new Error('RefFaceDualSpace: labels lengte komt niet overeen met crop')
  }
  const inkLabelsData = assignInkLabelsToWhiteFacesCrop({
    bwCrop,
    whiteLabels: labels,
    width: cropW,
    height: cropH,
  })
  const whiteByLabel = geomFromLabelRaster(labels, cropW, cropH)
  const inkByLabel = geomFromLabelRaster(inkLabelsData, cropW, cropH)
  const keep = new Set(faces.map((f) => f.label))
  for (const label of [...whiteByLabel.keys()]) {
    if (!keep.has(label)) whiteByLabel.delete(label)
  }
  for (const label of [...inkByLabel.keys()]) {
    if (!keep.has(label)) inkByLabel.delete(label)
  }
  return {
    width: cropW,
    height: cropH,
    labelsData: labels,
    inkLabelsData,
    whiteByLabel,
    inkByLabel,
    faces,
    geom(label, prefer) {
      return pickGeom(whiteByLabel, inkByLabel, label, prefer)
    },
  }
}

/** Convenience: profile-vorm met dual (faces = white). */
export function toRefFaceProfileWithDual(dual: RefFaceDualSpace): RefFaceProfile {
  return {
    faces: dual.faces,
    totalAreaPx: dual.faces.reduce((sum, f) => sum + f.areaPx, 0),
    faceCount: dual.faces.length,
    labelsData: dual.labelsData,
    dual,
  }
}
