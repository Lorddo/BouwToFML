import type { KozijnFaceMetrics, RefBBox, RefFace, RefFaceProfile } from './types'

export type { KozijnFaceMetrics } from './types'

/** Per opening-unit — px op rechte face-crop (zelfde beeld als rapport-figuur). */
export type UnitGeneralCategoryMetrics = {
  kopeinde: boolean
  kozijnLinks: KozijnFaceMetrics | null
  kozijnRechts: KozijnFaceMetrics | null
  kozijnTotaalOppervlakPx: number | null
  draaicirkel: boolean | null
  /** Alleen deuren zonder draaicirkel */
  middenlijn?: boolean
  middenlijnSpanPx?: number | null
}

export type GeneralCategoryAggregate = {
  kozijnLinks: KozijnFaceMetrics[]
  kozijnRechts: KozijnFaceMetrics[]
  kozijnTotaalOppervlakPx: number[]
  draaicirkelJa: number
  draaicirkelNee: number
  middenlijnJa: number
  middenlijnNee: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Horizontale rail tussen koppen — geen kozijn. */
function isHorizontalRail(face: RefFace, spanW: number): boolean {
  return face.bbox.width > face.bbox.height * 2.5 && face.bbox.width > spanW * 0.15
}

/** Eén kozijn = één interior face op de face-crop. */
function isKozijnFace(face: RefFace, spanW: number): boolean {
  if (face.role !== 'interior') return false
  if (face.areaPx < 4) return false
  if (isHorizontalRail(face, spanW)) return false
  if (face.bbox.height < face.bbox.width * 0.45) return false
  return true
}

function faceToMetrics(face: RefFace): KozijnFaceMetrics {
  return {
    widthPx: face.bbox.width,
    heightPx: face.bbox.height,
    areaPx: face.areaPx,
    centroidX: round1(face.centroid.x),
    centroidY: round1(face.centroid.y),
  }
}

/** Meest linkse + meest rechtse interior face op bbox.x — elk precies één vlak. */
export function pickExtremeKozijnFaces(
  faces: RefFace[],
  spanW: number,
): { left: RefFace; right: RefFace } | null {
  const kozijnen = faces.filter((face) => isKozijnFace(face, spanW))
  if (kozijnen.length < 2) return null
  const sorted = [...kozijnen].sort((a, b) => a.bbox.x - b.bbox.x || a.bbox.y - b.bbox.y)
  const left = sorted[0]
  const right = sorted[sorted.length - 1]
  if (left.label === right.label) return null
  return { left, right }
}

/** Horizontale as-band = Y-extent van linker- + rechterkopeinde (kozijn). */
export type KopeindeAxisBand = {
  yMin: number
  /** Inclusieve onderkant van de as-band */
  yMax: number
}

export function resolveKopeindeAxisBand(
  faceProfile: RefFaceProfile,
  spanW: number,
): KopeindeAxisBand | null {
  const extreme = pickExtremeKozijnFaces(faceProfile.faces, spanW)
  if (!extreme) return null
  const leftTop = extreme.left.bbox.y
  const rightTop = extreme.right.bbox.y
  const leftBottom = extreme.left.bbox.y + extreme.left.bbox.height - 1
  const rightBottom = extreme.right.bbox.y + extreme.right.bbox.height - 1
  return {
    yMin: Math.min(leftTop, rightTop),
    yMax: Math.max(leftBottom, rightBottom),
  }
}

function resolveKozijnFromFaces(params: { faceProfile: RefFaceProfile; spanW: number }): {
  kopeinde: boolean
  kozijnLinks: KozijnFaceMetrics | null
  kozijnRechts: KozijnFaceMetrics | null
} {
  const empty = {
    kopeinde: false,
    kozijnLinks: null,
    kozijnRechts: null,
  }

  const extreme = pickExtremeKozijnFaces(params.faceProfile.faces, params.spanW)
  if (!extreme) return empty

  return {
    kopeinde: true,
    kozijnLinks: faceToMetrics(extreme.left),
    kozijnRechts: faceToMetrics(extreme.right),
  }
}

/**
 * Kozijn links/rechts = meest linkse en rechtse interior face-bbox op rechte face-crop.
 */
export function computeUnitGeneralCategoryMetrics(params: {
  data: Uint8Array
  width: number
  height: number
  bbox: RefBBox
  faceProfile: RefFaceProfile
  orientation: 'horizontal' | 'vertical'
  kind: 'door' | 'window'
  draaicirkel?: boolean
  middenlijn?: boolean
  middenlijnSpanPx?: number | null
}): UnitGeneralCategoryMetrics {
  const doorArc =
    params.kind === 'door' ? { draaicirkel: params.draaicirkel ?? false } : { draaicirkel: null }

  const midline =
    params.kind === 'door' && params.draaicirkel === false
      ? {
          middenlijn: params.middenlijn ?? false,
          middenlijnSpanPx: params.middenlijnSpanPx ?? null,
        }
      : {}

  const kozijn = resolveKozijnFromFaces({
    faceProfile: params.faceProfile,
    spanW: params.width,
  })

  if (!kozijn.kopeinde || !kozijn.kozijnLinks || !kozijn.kozijnRechts) {
    return {
      kopeinde: false,
      kozijnLinks: null,
      kozijnRechts: null,
      kozijnTotaalOppervlakPx: null,
      ...doorArc,
      ...midline,
    }
  }

  return {
    kopeinde: true,
    kozijnLinks: kozijn.kozijnLinks,
    kozijnRechts: kozijn.kozijnRechts,
    kozijnTotaalOppervlakPx: round1(kozijn.kozijnLinks.areaPx + kozijn.kozijnRechts.areaPx),
    ...doorArc,
    ...midline,
  }
}

export function aggregateGeneralCategoryMetrics(
  units: UnitGeneralCategoryMetrics[],
): GeneralCategoryAggregate {
  const agg: GeneralCategoryAggregate = {
    kozijnLinks: [],
    kozijnRechts: [],
    kozijnTotaalOppervlakPx: [],
    draaicirkelJa: 0,
    draaicirkelNee: 0,
    middenlijnJa: 0,
    middenlijnNee: 0,
  }

  for (const unit of units) {
    if (unit.kozijnLinks) agg.kozijnLinks.push(unit.kozijnLinks)
    if (unit.kozijnRechts) agg.kozijnRechts.push(unit.kozijnRechts)
    if (unit.kozijnTotaalOppervlakPx != null)
      agg.kozijnTotaalOppervlakPx.push(unit.kozijnTotaalOppervlakPx)
    if (unit.draaicirkel === true) agg.draaicirkelJa += 1
    else if (unit.draaicirkel === false) agg.draaicirkelNee += 1
    if (unit.middenlijn === true) agg.middenlijnJa += 1
    else if (unit.middenlijn === false) agg.middenlijnNee += 1
  }

  return agg
}
