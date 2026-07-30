import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { shouldRetargetAcceptedWindowToDoorframe } from './window-door-arc-filter'
import { buildEvidenceStats } from './window-evidence-filter'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import type { WindowEvidenceAcceptance, WindowEvidenceFilterResult } from './types'

function assembleEvidenceResult(params: {
  accepted: WindowEvidenceAcceptance[]
  rejected: WindowEvidenceFilterResult['rejected']
  preserve: Pick<
    WindowEvidenceFilterResult['stats'],
    'rejectedNoEvidence' | 'stripStackFailedBeforeFraming'
  >
}): WindowEvidenceFilterResult {
  return {
    kept: params.accepted.map((row) => row.hypothesis),
    accepted: params.accepted,
    rejected: params.rejected,
    stats: buildEvidenceStats(params.accepted, params.preserve),
  }
}

// ESC:R-21 (D)
/**
 * Late Stage-3 doorframe-retarget: hyp-faces + as-overlap met deurboog
 * (geen framing-evidence). Retargeted accepted → doorframes; raw reject-stats behouden.
 */
export function applyStage3DoorframeRetarget(params: {
  stage3Raw: WindowEvidenceFilterResult
  stage3DoorframesRaw: WindowEvidenceFilterResult
  pipeDual: FaceDualSpace
  doorArcFaceIds: ReadonlySet<number>
}): {
  stage3: WindowEvidenceFilterResult
  stage3Doorframes: WindowEvidenceFilterResult
} {
  const wallInkAdjacency = params.pipeDual.space(WINDOW_SPACE_POLICY.stage2DoorArc).adjacency
  const doorArcBBoxByFaceId = new Map<
    number,
    { x: number; y: number; width: number; height: number }
  >()
  for (const id of params.doorArcFaceIds) {
    const geom = params.pipeDual.geom(id, 'ink') ?? params.pipeDual.geom(id, 'white')
    if (geom) doorArcBBoxByFaceId.set(id, geom.bbox)
  }

  const retargeted: WindowEvidenceAcceptance[] = []
  const keptWindowAccepted: WindowEvidenceAcceptance[] = []
  for (const entry of params.stage3Raw.accepted) {
    if (
      shouldRetargetAcceptedWindowToDoorframe({
        hypothesisFaceIds: entry.hypothesis.faceIds,
        hypothesisBBox: entry.hypothesis.unionBBox,
        orientation: entry.hypothesis.orientation,
        doorArcFaceIds: params.doorArcFaceIds,
        wallInkAdjacency,
        doorArcBBoxByFaceId,
      })
    ) {
      retargeted.push(entry)
      continue
    }
    keptWindowAccepted.push(entry)
  }

  const stage3DoorframeAccepted = [...params.stage3DoorframesRaw.accepted, ...retargeted]
  return {
    stage3: assembleEvidenceResult({
      accepted: keptWindowAccepted,
      rejected: params.stage3Raw.rejected,
      preserve: {
        rejectedNoEvidence: params.stage3Raw.stats.rejectedNoEvidence,
        stripStackFailedBeforeFraming: params.stage3Raw.stats.stripStackFailedBeforeFraming,
      },
    }),
    stage3Doorframes: assembleEvidenceResult({
      accepted: stage3DoorframeAccepted,
      rejected: params.stage3DoorframesRaw.rejected,
      preserve: {
        rejectedNoEvidence: params.stage3DoorframesRaw.stats.rejectedNoEvidence,
        stripStackFailedBeforeFraming:
          params.stage3DoorframesRaw.stats.stripStackFailedBeforeFraming,
      },
    }),
  }
}
