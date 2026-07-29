import type { OpeningRefPrimitives, RefBBox, RefFaceProfile } from './types'
import { computeUnitGeneralCategoryMetrics } from './ref-general-categories'
import { detectMidlineInk } from './ref-midline-ink'

export function deriveOpeningPrimitives(params: {
  kind: 'door' | 'window'
  data: Uint8Array
  width: number
  height: number
  metricsBBox: RefBBox
  orientation: 'horizontal' | 'vertical'
  faceProfile: RefFaceProfile
  draaicirkel?: boolean
}): OpeningRefPrimitives {
  const draaicirkel = params.kind === 'door' ? (params.draaicirkel ?? false) : undefined

  let middenlijn: boolean | undefined
  let middenlijnSpanPx: number | null | undefined
  if (params.kind === 'door' && draaicirkel === false) {
    const mid = detectMidlineInk({
      data: params.data,
      width: params.width,
      height: params.height,
      bbox: params.metricsBBox,
      orientation: params.orientation,
    })
    middenlijn = mid.hasMidline
    middenlijnSpanPx = mid.hasMidline ? mid.spanPx : null
  }

  const metrics = computeUnitGeneralCategoryMetrics({
    data: params.data,
    width: params.width,
    height: params.height,
    bbox: params.metricsBBox,
    faceProfile: params.faceProfile,
    orientation: params.orientation,
    kind: params.kind,
    draaicirkel,
    middenlijn,
    middenlijnSpanPx,
  })

  return {
    kopeinde: metrics.kopeinde,
    kozijnLinks: metrics.kozijnLinks,
    kozijnRechts: metrics.kozijnRechts,
    kozijnTotaalOppervlakPx: metrics.kozijnTotaalOppervlakPx,
    draaicirkel,
    middenlijn: params.kind === 'door' && draaicirkel === false ? (middenlijn ?? false) : undefined,
    middenlijnSpanPx:
      params.kind === 'door' && draaicirkel === false ? (middenlijnSpanPx ?? null) : undefined,
  }
}
