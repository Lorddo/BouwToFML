import type { SelectionRect } from '@/platform/selection'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import {
  windowRefColorHex,
  type ResolvedWindowCandidate,
  type WindowAxelHypothesis,
  type WindowAxelRefBand,
  type WindowAxelStage,
  type WindowEvidenceAcceptance,
} from '@/cv/windows'

export const WINDOW_REFRESH_DEBOUNCE_MS = 80

export type WindowFaceStatsByRef = {
  refIndex: number
  color: string
  stripCount: number
  targetHeightPx: number
  matches: number
}

export type WindowFaceUiStats = {
  stage: WindowAxelStage
  refBandCount: number
  candidateRootCount: number
  stage1HypothesisCount: number
  acceptedCount: number
  rejectedCount: number
  stage2AcceptedCount: number
  stage2RejectedShare: number
  stage2RejectedAdjacent: number
  stage2RejectedDirectional: number
  stage3AcceptedCount: number
  stage3AcceptedByFraming: number
  stage3AcceptedByStripStack: number
  stage3RejectedNoEvidence: number
  stage3DoorframeAcceptedCount: number
  stage4ResolvedCount: number
  stage4DoorframeCount: number
  hypothesisCount: number
  byRef: WindowFaceStatsByRef[]
}

export type FaceBBox = { x: number; y: number; width: number; height: number }

export type WindowAxelStageCache = {
  refBands: WindowAxelRefBand[]
  stage1Hypotheses: WindowAxelHypothesis[]
  stage2AcceptedHypotheses: WindowAxelHypothesis[]
  stage3AcceptedHypotheses: WindowAxelHypothesis[]
  /** Stage-3 acceptances; strip_stack evidenceFaceIds = volle stack voor class/overlay. */
  stage3Accepted: WindowEvidenceAcceptance[]
  stage3AcceptedDoorframes: WindowEvidenceAcceptance[]
  stage4ResolvedWindows: ResolvedWindowCandidate[]
  stage4ResolvedDoorframes: ResolvedWindowCandidate[]
  stage1CandidateRootCount: number
  stage1AcceptedCount: number
  stage1RejectedCount: number
  stage2RejectedShare: number
  stage2RejectedAdjacent: number
  stage2RejectedDirectional: number
  stage3AcceptedByFraming: number
  stage3AcceptedByStripStack: number
  stage3RejectedNoEvidence: number
  stage3DoorframeAcceptedCount: number
}

export function createEmptyWindowAxelStageCache(): WindowAxelStageCache {
  return {
    refBands: [],
    stage1Hypotheses: [],
    stage2AcceptedHypotheses: [],
    stage3AcceptedHypotheses: [],
    stage3Accepted: [],
    stage3AcceptedDoorframes: [],
    stage4ResolvedWindows: [],
    stage4ResolvedDoorframes: [],
    stage1CandidateRootCount: 0,
    stage1AcceptedCount: 0,
    stage1RejectedCount: 0,
    stage2RejectedShare: 0,
    stage2RejectedAdjacent: 0,
    stage2RejectedDirectional: 0,
    stage3AcceptedByFraming: 0,
    stage3AcceptedByStripStack: 0,
    stage3RejectedNoEvidence: 0,
    stage3DoorframeAcceptedCount: 0,
  }
}

export function activeWindowHypothesesForStage(params: {
  stage: WindowAxelStage
  cache: WindowAxelStageCache
}): WindowAxelHypothesis[] {
  if (params.stage === 'stage2') return params.cache.stage2AcceptedHypotheses
  if (params.stage === 'stage3') return params.cache.stage3AcceptedHypotheses
  return params.cache.stage1Hypotheses
}

export function signatureForWindowRects(rects: SelectionRect[]): string {
  return rects
    .filter((rect) => rect.type === 'window')
    .map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`)
    .join('|')
}

export function normalizeWindowState(state: SerializedRoomClassifyState | null | undefined) {
  if (!state) return null
  return {
    ...state,
    labelsData:
      state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData),
    parentMap: [...state.parentMap],
    classificationByLabel: [...state.classificationByLabel],
  }
}

export function statsByRef(
  refBands: WindowAxelRefBand[],
  hypotheses: WindowAxelHypothesis[],
): WindowFaceStatsByRef[] {
  const matchCount = new Map<number, number>()
  for (const hypothesis of hypotheses) {
    matchCount.set(
      hypothesis.matchedRefIndex,
      (matchCount.get(hypothesis.matchedRefIndex) ?? 0) + 1,
    )
  }
  return refBands.map((refBand) => ({
    refIndex: refBand.refIndex,
    color: windowRefColorHex(refBand.refIndex),
    stripCount: refBand.stripCount,
    targetHeightPx: refBand.targetStripHeightPx,
    matches: matchCount.get(refBand.refIndex) ?? 0,
  }))
}

export function signatureForFaceIdSet(faceIds: ReadonlySet<number>): string {
  return [...faceIds]
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
    .join(',')
}

export function collectAcceptedWindowFaceIds(hypotheses: WindowAxelHypothesis[]): number[] {
  const ids = new Set<number>()
  for (const hyp of hypotheses) {
    for (const faceId of hyp.faceIds) {
      if (faceId > 0) ids.add(faceId)
    }
  }
  return [...ids]
}

/**
 * Stage 3: classificeer glas altijd; rails alleen bij strip_stack (volle stack).
 * Framing-kozijnen (evidence) krijgen géén window-class — alleen overlay/FML-evidence.
 */
export function collectWindowClassFaceIds(params: {
  stage: WindowAxelStage
  cache: WindowAxelStageCache
}): number[] {
  if (params.stage !== 'stage3') {
    return collectAcceptedWindowFaceIds(activeWindowHypothesesForStage(params))
  }
  const ids = new Set<number>()
  for (const entry of params.cache.stage3Accepted) {
    for (const faceId of entry.hypothesis.faceIds) {
      if (faceId > 0) ids.add(faceId)
    }
    if (entry.evidence !== 'strip_stack') continue
    for (const faceId of entry.evidenceFaceIds) {
      if (faceId > 0) ids.add(faceId)
    }
  }
  return [...ids]
}

/**
 * Doorframe Stage 3: zelfde class-regel als ramen —
 * hyp faceIds altijd; rails alleen bij strip_stack. Framing-evidence géén class.
 */
export function collectDoorframeClassFaceIds(cache: WindowAxelStageCache): number[] {
  const ids = new Set<number>()
  for (const entry of cache.stage3AcceptedDoorframes) {
    for (const faceId of entry.hypothesis.faceIds) {
      if (faceId > 0) ids.add(faceId)
    }
    if (entry.evidence !== 'strip_stack') continue
    for (const faceId of entry.evidenceFaceIds) {
      if (faceId > 0) ids.add(faceId)
    }
  }
  return [...ids]
}

export function unionFaceBBox(a: FaceBBox, b: FaceBBox): FaceBBox {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Overlay: alleen strip_stack toont alle evidence-faces; framing blijft bij glas-faceIds. */
export function hypothesesWithStackEvidence(params: {
  hypotheses: WindowAxelHypothesis[]
  stage3Accepted: WindowEvidenceAcceptance[]
  faceBboxByRoot: Map<number, FaceBBox>
}): WindowAxelHypothesis[] {
  if (params.stage3Accepted.length <= 0) return params.hypotheses
  const byId = new Map(params.stage3Accepted.map((entry) => [entry.hypothesis.id, entry]))
  return params.hypotheses.map((hyp) => {
    const entry = byId.get(hyp.id)
    if (!entry || entry.evidence !== 'strip_stack' || entry.evidenceFaceIds.length <= 0) {
      return hyp
    }
    const faceIds = [
      ...new Set([...hyp.faceIds, ...entry.evidenceFaceIds].filter((id) => id > 0)),
    ].sort((a, b) => a - b)
    if (faceIds.length === hyp.faceIds.length && faceIds.every((id, i) => id === hyp.faceIds[i])) {
      return hyp
    }
    let bbox = hyp.unionBBox
    let maxAxisSpan = 0
    for (const faceId of faceIds) {
      const faceBbox = params.faceBboxByRoot.get(faceId)
      if (!faceBbox) continue
      bbox = unionFaceBBox(bbox, faceBbox)
      const along =
        hyp.orientation === 'horizontal' ? faceBbox.width : faceBbox.height
      if (along > maxAxisSpan) maxAxisSpan = along
    }
    const axisSpanPx =
      maxAxisSpan > 0
        ? maxAxisSpan
        : hyp.orientation === 'horizontal'
          ? bbox.width
          : bbox.height
    return {
      ...hyp,
      faceIds,
      unionBBox: bbox,
      axisSpanPx,
    }
  })
}
