import { noteMissingMeasurement } from '@/core/diagnostics'
import { resolveDoorFmlTemplateRefId } from '@/core/fml/types'
import { resolveOpeningCatalog, toCvDoorKind } from '@/core/fml/opening-refid-catalog'
import { measureSwingSpanPxFromFaceBBox } from './door-swing-hinge'
import { round2 } from './door-wall-snap-geom'
import type {
  DoorResolvedKind,
  DoorSwingHypothesis,
  DoorSwingRefBand,
  ResolvedDoorCandidate,
} from './types'

function resolveAveragePpm(pxPerMmX: number, pxPerMmY: number): number {
  const x = pxPerMmX > 0 ? pxPerMmX : 0
  const y = pxPerMmY > 0 ? pxPerMmY : 0
  if (x <= 0 && y <= 0) return 0
  if (x <= 0) return y
  if (y <= 0) return x
  return (x + y) / 2
}

function resolveRefKind(
  ref: DoorSwingRefBand | undefined,
  _hyp: DoorSwingHypothesis,
): { kind: DoorResolvedKind; fmlRefId: string } {
  const baseRefId = resolveDoorFmlTemplateRefId(ref?.fmlRefId)
  const catalogKind = resolveOpeningCatalog(baseRefId, 'door').kind
  const baseKind = ref?.kind ?? toCvDoorKind(catalogKind)
  return {
    kind: baseKind,
    fmlRefId: baseRefId,
  }
}

function resolveRefSwingSpanPx(ref: DoorSwingRefBand | undefined, fallback: number): number {
  if (!ref) return Math.max(1, fallback)
  return Math.max(1, ref.swingSpanPx ?? 0, ref.swingWpx, ref.swingHpx)
}

function resolveClearOverhangRatio(params: {
  explicit: number | undefined
  legacyOverhangPx: number
  framingPx: number
  refSwingSpanPx: number
}): number {
  if (
    typeof params.explicit === 'number' &&
    Number.isFinite(params.explicit) &&
    params.explicit >= 0
  ) {
    return params.explicit
  }
  const clearPx = Math.max(0, params.legacyOverhangPx - params.framingPx)
  return clearPx / Math.max(1, params.refSwingSpanPx)
}

/**
 * Stage-2 resolve: maat/meta voor L11/L12. Geen hinge — die volgt in L12.
 */
export function resolveDoorCandidates(params: {
  hypotheses: DoorSwingHypothesis[]
  refBands: DoorSwingRefBand[]
  pxPerMmX: number
  pxPerMmY: number
}): ResolvedDoorCandidate[] {
  const ppm = resolveAveragePpm(params.pxPerMmX, params.pxPerMmY)
  return [...params.hypotheses]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((hypothesis): ResolvedDoorCandidate => {
      const ref = params.refBands[hypothesis.matchedRefIndex]
      // ESC:D-43 (E)
      if (!ref?.ratioBlade || ref.ratioBlade <= 0) {
        noteMissingMeasurement(
          'D-43',
          'resolveDoorCandidates',
          'ratioBlade ontbreekt of ongeldig op ref-band, val terug op 1',
          { hypothesisId: hypothesis.id, matchedRefIndex: hypothesis.matchedRefIndex },
        )
      }
      const ratioBlade = ref?.ratioBlade && ref.ratioBlade > 0 ? ref.ratioBlade : 1
      const framingPx = Math.max(0, ref?.framingPx ?? 0)
      const { kind, fmlRefId } = resolveRefKind(ref, hypothesis)
      const centroidPx = {
        x: hypothesis.unionBBox.x + hypothesis.unionBBox.width / 2,
        y: hypothesis.unionBBox.y + hypothesis.unionBBox.height / 2,
      }
      // Schaal uit draaiboog-vlak (unie-bbox), niet uit scharnier-assen.
      const swingSpanPx = measureSwingSpanPxFromFaceBBox(hypothesis.unionBBox)
      const refSwingSpan = resolveRefSwingSpanPx(ref, swingSpanPx)
      const refAlong = Math.max(0, ref?.overhangAlongPx ?? 0)
      const refOpposite = Math.max(0, ref?.overhangOppositePx ?? 0)
      const hasRefOverhangs = refAlong + refOpposite > 0
      // Kozijnbreedte blijft vast (zelfde tekening/schaal); alleen het blad schaalt
      // mee met de gemeten face-span. Anders worden grote deuren onevenredig
      // dikke kozijn-insets (blauwe marge buiten de oranje boog).
      const refFrameAlong = Math.max(0, ref?.framingAlongPx ?? 0)
      const refFrameOpposite = Math.max(0, ref?.framingOppositePx ?? 0)
      const hasRefFramingSides = refFrameAlong + refFrameOpposite > 0
      const framingAlongPx = hasRefFramingSides ? refFrameAlong : Math.max(0, framingPx / 2)
      const framingOppositePx = hasRefFramingSides
        ? refFrameOpposite
        : Math.max(0, framingPx - framingAlongPx)
      const clearAlongRatio = hasRefOverhangs
        ? resolveClearOverhangRatio({
            explicit: ref?.clearOverhangAlongRatio,
            legacyOverhangPx: refAlong,
            framingPx: framingAlongPx,
            refSwingSpanPx: refSwingSpan,
          })
        : ratioBlade
      const clearOppositeRatio = hasRefOverhangs
        ? resolveClearOverhangRatio({
            explicit: ref?.clearOverhangOppositeRatio,
            legacyOverhangPx: refOpposite,
            framingPx: framingOppositePx,
            refSwingSpanPx: refSwingSpan,
          })
        : 0
      const overhangAlongPx = Math.max(0, swingSpanPx * clearAlongRatio + framingAlongPx)
      const overhangOppositePx = Math.max(0, swingSpanPx * clearOppositeRatio + framingOppositePx)
      const widthPx = Math.max(1, overhangAlongPx + overhangOppositePx)
      const widthCm = ppm > 0 ? widthPx / ppm / 10 : 0
      return {
        id: hypothesis.id,
        source: hypothesis.source,
        score: hypothesis.score,
        matchedRefIndex: hypothesis.matchedRefIndex,
        faceIds: [...hypothesis.faceIds],
        doorframeFaceIds:
          hypothesis.doorframeFaceIds && hypothesis.doorframeFaceIds.length > 0
            ? [...hypothesis.doorframeFaceIds]
            : undefined,
        bbox: {
          x: hypothesis.unionBBox.x,
          y: hypothesis.unionBBox.y,
          width: hypothesis.unionBBox.width,
          height: hypothesis.unionBBox.height,
        },
        centroidPx,
        swingSpanPx: round2(swingSpanPx),
        framingPx: round2(framingPx),
        overhangAlongPx: round2(overhangAlongPx),
        overhangOppositePx: round2(overhangOppositePx),
        framingAlongPx: round2(framingAlongPx),
        framingOppositePx: round2(framingOppositePx),
        ratioBlade: round2(ratioBlade),
        widthPx: round2(widthPx),
        widthCm: round2(widthCm),
        fmlRefId,
        kind,
      }
    })
}
