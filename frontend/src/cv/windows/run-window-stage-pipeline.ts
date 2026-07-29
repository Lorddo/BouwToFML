import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { prepareOpeningPipeDual } from '@/cv/walls/rooms/opening-pipe-dual'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { filterWindowsTouchingDoorArcs } from './window-door-arc-filter'
import { filterWindowsByRefEvidence } from './window-evidence-filter'
import { runWindowAxelFilter } from './window-axel-filter'
import { resolveWindowCandidates } from './window-resolve'
import { applyStage3DoorframeRetarget } from './window-stage3-retarget'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import type {
  ResolvedWindowCandidate,
  WindowAxelFilterResult,
  WindowAxelOrientation,
  WindowAxelRefBand,
  WindowDoorArcFilterResult,
  WindowEvidenceFilterResult,
} from './types'

/** Minimum glass opening (cm) — gedeelde scale-floor voor Stage-1 min-span. */
const MIN_WINDOW_GLASS_CM = 20

export function resolveWindowMinSpanPxByOrientation(
  ppm: { x: number; y: number },
): Partial<Record<WindowAxelOrientation, number>> {
  const minWindowMm = MIN_WINDOW_GLASS_CM * 10
  return {
    horizontal: ppm.x > 0 ? ppm.x * minWindowMm : 0,
    vertical: ppm.y > 0 ? ppm.y * minWindowMm : 0,
  }
}

export type RunWindowStagePipelineParams = {
  /** Floor dual: Stage 1 white; cluster/door-arc/evidence ink. */
  dual: FaceDualSpace
  refBands: WindowAxelRefBand[]
  refRects: Array<{ refIndex: number; rect: { x: number; y: number; width: number; height: number } }>
  minSpanPxByOrientation: Partial<Record<WindowAxelOrientation, number>>
  doorArcFaceIds: ReadonlySet<number>
  wallThicknessPx: number
  pxPerMmX: number
  pxPerMmY: number
}

export type RunWindowStagePipelineResult = {
  components: RasterRoomComponent[]
  detachedParentMap: Map<number, number>
  /** Pipeline dual na detach (white herbonden; ink ongewijzigd). */
  pipeDual: FaceDualSpace
  stage1: WindowAxelFilterResult
  stage2: WindowDoorArcFilterResult
  stage3: WindowEvidenceFilterResult
  stage3Doorframes: WindowEvidenceFilterResult
  stage4: ResolvedWindowCandidate[]
  stage4Doorframes: ResolvedWindowCandidate[]
}

/**
 * Stage 1–4 window pipeline (na ref-band analyse): `prepareOpeningPipeDual` →
 * filter → door-arc → evidence → resolve. Pure CV, geen Vue.
 *
 * Verplicht `dual: FaceDualSpace` — opening-wit voor maat/seeds, wall-ink voor bruggen/framing.
 * Bootstrap: seed-detach + white rebind zodat `geom`/`byId` de detached parentMap volgen.
 */
export function runWindowStagePipeline(
  params: RunWindowStagePipelineParams,
): RunWindowStagePipelineResult {
  assertSpacePolicy('window Stage 2 door-arc', WINDOW_SPACE_POLICY.stage2DoorArc, 'ink')

  const { dual } = params
  const { pipeDual, detachedParentMap } = prepareOpeningPipeDual(dual)
  const components = pipeDual.white.components
  const wallInkAdjacency = pipeDual.space(WINDOW_SPACE_POLICY.stage2DoorArc).adjacency

  const stage1 = runWindowAxelFilter({
    dual: pipeDual,
    refBands: params.refBands,
    minSpanPxByOrientation: params.minSpanPxByOrientation,
    refRects: params.refRects,
  })
  const stage2 = filterWindowsTouchingDoorArcs({
    hypotheses: stage1.hypotheses,
    doorArcFaceIds: params.doorArcFaceIds,
    wallInkAdjacency,
    wallThicknessPx: params.wallThicknessPx,
  })

  const stage3Raw = filterWindowsByRefEvidence({
    dual: pipeDual,
    refBands: params.refBands,
    hypotheses: stage2.kept,
  })
  const stage3DoorframesRaw = filterWindowsByRefEvidence({
    dual: pipeDual,
    refBands: params.refBands,
    hypotheses: stage2.doorframeCandidates.map((entry) => entry.hypothesis),
    evidenceModes: ['framing'],
  })
  const { stage3, stage3Doorframes } = applyStage3DoorframeRetarget({
    stage3Raw,
    stage3DoorframesRaw,
    pipeDual,
    doorArcFaceIds: params.doorArcFaceIds,
  })

  const stage4 = resolveWindowCandidates({
    dual: pipeDual,
    refBands: params.refBands,
    accepted: stage3.accepted,
    pxPerMmX: params.pxPerMmX,
    pxPerMmY: params.pxPerMmY,
  })
  const stage4Doorframes = resolveWindowCandidates({
    dual: pipeDual,
    refBands: params.refBands,
    accepted: stage3Doorframes.accepted,
    pxPerMmX: params.pxPerMmX,
    pxPerMmY: params.pxPerMmY,
  })

  return {
    components,
    detachedParentMap,
    pipeDual,
    stage1,
    stage2,
    stage3,
    stage3Doorframes,
    stage4,
    stage4Doorframes,
  }
}
