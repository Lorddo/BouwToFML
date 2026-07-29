import { colorForLabel } from '@/cv/walls/rooms/room-raster'
import { attachRefFaceDualFromWhiteLabels } from './ref-face-dual-space'
import type { RefBBox, RefFace, RefFaceProfile, RefFaceRole } from './types'

const INK_THRESHOLD = 128

function isWhite(v: number): boolean {
  return v >= INK_THRESHOLD
}

export type LabelWhiteFacesOptions = {
  /**
   * Muur-refs: behandel crop-rand als inkt-afsluiting (1px frame),
   * zodat open kopeinden van de selectie faces sluiten — anders dan deuren/ramen
   * die alleen echte inkt binnen de opname als afsluiting gebruiken.
   */
  sealBorders?: boolean
  /**
   * Muur-refs: 4-connectiviteit (geen diagonaal lek door arcering).
   * Openingen blijven 8-connected (bestaande deur/raam-gedrag).
   */
  connectivity?: 4 | 8
}

/** Kopieer B/W en zet 1px omtrek op inkt (zwart) — crop-rand = afsluiting. */
function sealBwBorders(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data)
  if (width <= 0 || height <= 0) return out
  for (let x = 0; x < width; x += 1) {
    out[x] = 0
    out[(height - 1) * width + x] = 0
  }
  for (let y = 0; y < height; y += 1) {
    out[y * width] = 0
    out[y * width + (width - 1)] = 0
  }
  return out
}

/**
 * Exclusive face labels: één label per wit vlak (gescheiden door inkt).
 * Pixels binnen een vlak delen hetzelfde label — geen overlap tussen vlakken.
 */
export function labelWhiteFaces(
  data: Uint8Array,
  width: number,
  height: number,
  bbox?: RefBBox,
  options?: LabelWhiteFacesOptions,
): { labels: Int32Array; faces: RefFace[] } {
  const sealed =
    options?.sealBorders === true && !bbox ? sealBwBorders(data, width, height) : data
  const src = sealed
  const connectivity = options?.connectivity ?? 8
  const x0 = bbox ? Math.max(0, Math.floor(bbox.x)) : 0
  const y0 = bbox ? Math.max(0, Math.floor(bbox.y)) : 0
  const x1 = bbox ? Math.min(width, Math.ceil(bbox.x + bbox.width)) : width
  const y1 = bbox ? Math.min(height, Math.ceil(bbox.y + bbox.height)) : height
  const cropW = Math.max(1, x1 - x0)
  const cropH = Math.max(1, y1 - y0)

  const labels = new Int32Array(cropW * cropH)
  const faces: RefFace[] = []
  let nextLabel = 1
  const idx = (x: number, y: number) => y * cropW + x
  const neighborDeltas =
    connectivity === 4
      ? [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
      : [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ]

  for (let ly = 0; ly < cropH; ly += 1) {
    for (let lx = 0; lx < cropW; lx += 1) {
      const gx = x0 + lx
      const gy = y0 + ly
      const i = idx(lx, ly)
      if (labels[i] !== 0 || !isWhite(src[gy * width + gx] ?? 255)) continue

      const label = nextLabel
      nextLabel += 1
      let area = 0
      let sumX = 0
      let sumY = 0
      let minX = lx
      let maxX = lx
      let minY = ly
      let maxY = ly
      let inkNeighbor = 0

      const stack: Array<{ x: number; y: number }> = [{ x: lx, y: ly }]
      labels[i] = label

      while (stack.length > 0) {
        const cur = stack.pop()!
        area += 1
        sumX += cur.x
        sumY += cur.y
        if (cur.x < minX) minX = cur.x
        if (cur.x > maxX) maxX = cur.x
        if (cur.y < minY) minY = cur.y
        if (cur.y > maxY) maxY = cur.y

        for (const [dx, dy] of neighborDeltas) {
          const nx = cur.x + dx
          const ny = cur.y + dy
          if (nx < 0 || ny < 0 || nx >= cropW || ny >= cropH) {
            // border of ROI — telt als afsluiting (geen flood naar buiten)
            if (options?.sealBorders) inkNeighbor += 1
            continue
          }
          const ngx = x0 + nx
          const ngy = y0 + ny
          const ni = idx(nx, ny)
          if (!isWhite(src[ngy * width + ngx] ?? 255)) {
            inkNeighbor += 1
            continue
          }
          if (labels[ni] !== 0) continue
          labels[ni] = label
          stack.push({ x: nx, y: ny })
        }
      }

      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      const bboxArea = bw * bh
      const centroid = { x: sumX / area, y: sumY / area }
      const touchesBorder =
        minX <= 0 || minY <= 0 || maxX >= cropW - 1 || maxY >= cropH - 1

      faces.push({
        label,
        areaPx: area,
        bbox: { x: minX, y: minY, width: bw, height: bh },
        centroid,
        relativeCentroid: {
          x: cropW > 1 ? centroid.x / (cropW - 1) : 0,
          y: cropH > 1 ? centroid.y / (cropH - 1) : 0,
        },
        inkRatio: area > 0 ? inkNeighbor / (area * 8) : 0,
        aspectRatio: bh > 0 ? bw / bh : 1,
        compactness: bboxArea > 0 ? area / bboxArea : 0,
        touchesBorder,
        role: 'unknown',
      })
    }
  }

  return { labels, faces }
}

function countTouchedBorders(face: RefFace, width: number, height: number): number {
  const minX = Math.floor(face.bbox.x)
  const minY = Math.floor(face.bbox.y)
  const maxX = Math.floor(face.bbox.x + face.bbox.width) - 1
  const maxY = Math.floor(face.bbox.y + face.bbox.height) - 1
  let count = 0
  if (minX <= 0) count += 1
  if (minY <= 0) count += 1
  if (maxX >= width - 1) count += 1
  if (maxY >= height - 1) count += 1
  return count
}

export function classifyFaceRoles(
  faces: RefFace[],
  width: number,
  height: number,
): RefFace[] {
  if (faces.length === 0) return []
  return faces.map((face) => {
    const borderHits = countTouchedBorders(face, width, height)
    const role: RefFaceRole = face.touchesBorder || borderHits > 0 ? 'outside' : 'interior'
    return { ...face, role }
  })
}

export function buildFaceProfile(
  data: Uint8Array,
  width: number,
  height: number,
  bbox?: RefBBox,
  options?: { minAreaPx?: number; sealBorders?: boolean; connectivity?: 4 | 8 },
): RefFaceProfile {
  const x0 = bbox ? Math.max(0, Math.floor(bbox.x)) : 0
  const y0 = bbox ? Math.max(0, Math.floor(bbox.y)) : 0
  const x1 = bbox ? Math.min(width, Math.ceil(bbox.x + bbox.width)) : width
  const y1 = bbox ? Math.min(height, Math.ceil(bbox.y + bbox.height)) : height
  const cropW = Math.max(1, x1 - x0)
  const cropH = Math.max(1, y1 - y0)
  const sealBorders = options?.sealBorders === true
  const { labels, faces } = labelWhiteFaces(data, width, height, bbox, {
    sealBorders,
    connectivity: options?.connectivity ?? (sealBorders ? 4 : 8),
  })
  const minAreaPx = options?.minAreaPx ?? 4
  const filtered = faces.filter((f) => f.areaPx >= minAreaPx)
  const roles = classifyFaceRoles(filtered, cropW, cropH)
  const dual = attachRefFaceDualFromWhiteLabels({
    data,
    width,
    height,
    bbox,
    labels,
    faces: roles,
  })
  return {
    faces: roles,
    totalAreaPx: roles.reduce((sum, f) => sum + f.areaPx, 0),
    faceCount: roles.length,
    labelsData: labels,
    dual,
  }
}

export function renderFaceOverlayRgba(
  data: Uint8Array,
  width: number,
  height: number,
  bbox?: RefBBox,
  options?: { shadeOutside?: boolean; sealBorders?: boolean; connectivity?: 4 | 8 },
): Uint8ClampedArray {
  const x0 = bbox ? Math.max(0, Math.floor(bbox.x)) : 0
  const y0 = bbox ? Math.max(0, Math.floor(bbox.y)) : 0
  const x1 = bbox ? Math.min(width, Math.ceil(bbox.x + bbox.width)) : width
  const y1 = bbox ? Math.min(height, Math.ceil(bbox.y + bbox.height)) : height
  const cropW = Math.max(1, x1 - x0)
  const cropH = Math.max(1, y1 - y0)
  const sealBorders = options?.sealBorders === true
  const { labels, faces } = labelWhiteFaces(data, width, height, bbox, {
    sealBorders,
    connectivity: options?.connectivity ?? (sealBorders ? 4 : 8),
  })
  const roles = classifyFaceRoles(faces, cropW, cropH)
  const roleByLabel = new Map<number, RefFaceRole>()
  for (const face of roles) roleByLabel.set(face.label, face.role)
  const out = new Uint8ClampedArray(cropW * cropH * 4)

  for (let ly = 0; ly < cropH; ly += 1) {
    for (let lx = 0; lx < cropW; lx += 1) {
      const gx = x0 + lx
      const gy = y0 + ly
      const o = (ly * cropW + lx) * 4
      const v = data[gy * width + gx] ?? 255
      if (v < INK_THRESHOLD) {
        out[o] = 20
        out[o + 1] = 20
        out[o + 2] = 20
        out[o + 3] = 255
        continue
      }
      const label = labels[ly * cropW + lx] ?? 0
      const role = roleByLabel.get(label) ?? 'unknown'
      if (role === 'outside') {
        if (options?.shadeOutside === false) {
          out[o] = 255
          out[o + 1] = 255
          out[o + 2] = 255
          out[o + 3] = 255
          continue
        }
        out[o] = 172
        out[o + 1] = 176
        out[o + 2] = 184
        out[o + 3] = 255
        continue
      }
      if (role === 'head') {
        out[o] = 139
        out[o + 1] = 92
        out[o + 2] = 246
        out[o + 3] = 255
        continue
      }
      const [r, g, b, a] = colorForLabel(label)
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  }
  return out
}
