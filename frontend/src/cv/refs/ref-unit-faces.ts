import type { RefBBox, RefFace, RefFaceRole, RefPoint, RefUnitFacePolygon } from './types'

function isInteriorLikeFace(face: { role: RefFaceRole }): boolean {
  return face.role === 'interior' || face.role === 'head'
}

function isPointInBBox(point: RefPoint, bbox: RefBBox): boolean {
  return (
    point.x >= bbox.x &&
    point.x <= bbox.x + bbox.width &&
    point.y >= bbox.y &&
    point.y <= bbox.y + bbox.height
  )
}

function bboxOverlapArea(a: RefBBox, b: RefBBox): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return 0
  return w * h
}

export function resolveUnitFacePolygons(unitBBox: RefBBox, faces: RefFace[]): RefUnitFacePolygon[] {
  const result: RefUnitFacePolygon[] = []
  for (const face of faces) {
    if (!isInteriorLikeFace(face) || !face.approxPolygon || face.approxPolygon.length < 3) continue
    const inCentroid = isPointInBBox(face.centroid, unitBBox)
    const overlap = bboxOverlapArea(unitBBox, face.bbox)
    if (!inCentroid && overlap <= 0) continue
    result.push({
      label: face.label,
      role: face.role,
      areaPx: face.areaPx,
      approxPolygon: face.approxPolygon,
    })
  }
  return result
}

/** Union van unit-bbox + interior/head face-bboxes (voorkomt gemiste kozijnen bij te smalle kozijn_span). */
function expandBBoxToInteriorFaces(base: RefBBox, faces: RefFace[]): RefBBox {
  let x0 = base.x
  let y0 = base.y
  let x1 = base.x + base.width
  let y1 = base.y + base.height
  let expanded = false
  for (const face of faces) {
    if (!isInteriorLikeFace(face)) continue
    expanded = true
    x0 = Math.min(x0, face.bbox.x)
    y0 = Math.min(y0, face.bbox.y)
    x1 = Math.max(x1, face.bbox.x + face.bbox.width)
    y1 = Math.max(y1, face.bbox.y + face.bbox.height)
  }
  if (!expanded) return base
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  }
}

/**
 * BBox waarmee face-contouren aan een unit worden gekoppeld.
 * Bij 1 unit: hele crop (zelfde bereik als primitives) zodat beide kopeinden meekomen.
 */
export function resolveUnitBBoxForFaces(params: {
  unit: { bbox: RefBBox; includesBothHeads?: boolean; source: string }
  faces: RefFace[]
  cropWidth: number
  cropHeight: number
  singleUnit: boolean
}): RefBBox {
  if (params.singleUnit) {
    return { x: 0, y: 0, width: params.cropWidth, height: params.cropHeight }
  }
  if (params.unit.includesBothHeads || params.unit.source === 'kozijn_span') {
    return expandBBoxToInteriorFaces(params.unit.bbox, params.faces)
  }
  return params.unit.bbox
}
