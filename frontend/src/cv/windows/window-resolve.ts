import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { unionFaceBBox } from '@/cv/walls/rooms/face-dual-space'
import type {
  ResolvedWindowCandidate,
  WindowAxelOrientation,
  WindowAxelRefBand,
  WindowEvidenceAcceptance,
} from './types'
import { axisSpan, perpSpan } from './window-evidence-geom'
import { WINDOW_SPACE_POLICY } from './window-space-policy'

type BBox = { x: number; y: number; width: number; height: number }

function centroidFromBBox(bbox: BBox): { x: number; y: number } {
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2,
  }
}

function averagePxPerMm(pxPerMmX: number, pxPerMmY: number): number {
  const values = [pxPerMmX, pxPerMmY].filter((value) => value > 0)
  if (values.length <= 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toCm(lengthPx: number, avgPxPerMm: number): number {
  if (!(avgPxPerMm > 0)) return 0
  return lengthPx / avgPxPerMm / 10
}

/**
 * Framing-maat = glas + kozijnen.
 * Glas: WINDOW_SPACE_POLICY.stage4GlassBBox; kozijn/evidence: stage4FrameBBox.
 */
function resolveFramingBBox(params: {
  accepted: WindowEvidenceAcceptance
  dual: FaceDualSpace
}): BBox {
  let merged: BBox | null = null
  const add = (bbox: BBox | undefined) => {
    if (!bbox) return
    merged = merged ? unionFaceBBox(merged, bbox) : { ...bbox }
  }
  for (const faceId of params.accepted.hypothesis.faceIds) {
    if (!(faceId > 0)) continue
    add(params.dual.geom(faceId, WINDOW_SPACE_POLICY.stage4GlassBBox)?.bbox)
  }
  for (const faceId of params.accepted.evidenceFaceIds) {
    if (!(faceId > 0)) continue
    add(params.dual.geom(faceId, WINDOW_SPACE_POLICY.stage4FrameBBox)?.bbox)
  }
  return merged ? merged : { ...params.accepted.hypothesis.unionBBox }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Glas/strip faces — exclusief; framing-kozijnen (evidence) mogen gedeeld. */
function glassFaceKey(faceIds: number[], orientation: WindowAxelOrientation): string {
  return `${orientation}:${[...faceIds].sort((a, b) => a - b).join('+')}`
}

function stripStackClusterKey(entry: WindowEvidenceAcceptance): string {
  // Zonder matchedRefIndex: ref0/ref1 met dezelfde strips → 1 window.
  const faces = [...new Set(entry.evidenceFaceIds)].sort((a, b) => a - b)
  return glassFaceKey(faces, entry.hypothesis.orientation)
}

/**
 * Strip-bboxes voor full-stack maat: evidence-faces (glas+rails) via dual.
 * Fallback = hyp unionBBoxes (tests / ontbrekende dual-geom).
 */
function stripStackMeasureBBoxes(params: {
  group: WindowEvidenceAcceptance[]
  evidenceFaceIds: number[]
  dual: FaceDualSpace
}): BBox[] {
  const stripBBoxes: BBox[] = []
  for (const faceId of params.evidenceFaceIds) {
    if (!(faceId > 0)) continue
    const bbox = params.dual.geom(faceId, WINDOW_SPACE_POLICY.stage4GlassBBox)?.bbox
    if (bbox) stripBBoxes.push({ ...bbox })
  }
  if (stripBBoxes.length > 0) return stripBBoxes
  return params.group.map((entry) => ({ ...entry.hypothesis.unionBBox }))
}

function mergeStripStackGroup(params: {
  group: WindowEvidenceAcceptance[]
  orientation: WindowAxelOrientation
  dual: FaceDualSpace
  avgPxPerMm: number
  index: number
}): ResolvedWindowCandidate {
  const sorted = [...params.group].sort((a, b) => {
    if (b.hypothesis.score !== a.hypothesis.score) return b.hypothesis.score - a.hypothesis.score
    return a.hypothesis.id.localeCompare(b.hypothesis.id)
  })
  const first = sorted[0]!
  const faceIds = [...new Set(sorted.flatMap((entry) => entry.hypothesis.faceIds))].sort(
    (a, b) => a - b,
  )
  const evidenceFaceIds = [...new Set(sorted.flatMap((entry) => entry.evidenceFaceIds))].sort(
    (a, b) => a - b,
  )
  // Breedte = langste strip in de stack (niet seed-hyp / union van kortere stroken).
  const measureBBoxes = stripStackMeasureBBoxes({
    group: sorted,
    evidenceFaceIds,
    dual: params.dual,
  })
  const bbox = measureBBoxes.reduce((acc, next) => unionFaceBBox(acc, next))
  const widthPx = Math.max(
    ...measureBBoxes.map((strip) => axisSpan(strip, params.orientation)),
  )
  const heightPx = perpSpan(bbox, params.orientation)
  const score = Math.max(...sorted.map((entry) => entry.hypothesis.score))
  const id = `window:stack:${faceIds.join('+')}:${params.index}`
  return {
    id,
    sourceHypothesisId: `stack:${sorted.map((entry) => entry.hypothesis.id).join('+')}`,
    matchedRefIndex: first.hypothesis.matchedRefIndex,
    orientation: params.orientation,
    evidence: 'strip_stack',
    faceIds,
    evidenceFaceIds,
    bbox,
    centroidPx: centroidFromBBox(bbox),
    widthPx: round2(widthPx),
    widthCm: round2(toCm(widthPx, params.avgPxPerMm)),
    heightPx: round2(heightPx),
    heightCm: round2(toCm(heightPx, params.avgPxPerMm)),
    score,
  }
}

function resolveFramingEntry(params: {
  entry: WindowEvidenceAcceptance
  orientation: WindowAxelOrientation
  dual: FaceDualSpace
  avgPxPerMm: number
  index: number
}): ResolvedWindowCandidate {
  const bbox = resolveFramingBBox({
    accepted: params.entry,
    dual: params.dual,
  })
  const widthPx = axisSpan(bbox, params.orientation)
  const heightPx = perpSpan(bbox, params.orientation)
  return {
    id: `window:${params.entry.hypothesis.id}:${params.index}`,
    sourceHypothesisId: params.entry.hypothesis.id,
    matchedRefIndex: params.entry.hypothesis.matchedRefIndex,
    orientation: params.orientation,
    evidence: 'framing',
    faceIds: [...params.entry.hypothesis.faceIds].sort((a, b) => a - b),
    evidenceFaceIds: [...params.entry.evidenceFaceIds],
    bbox,
    centroidPx: centroidFromBBox(bbox),
    widthPx: round2(widthPx),
    widthCm: round2(toCm(widthPx, params.avgPxPerMm)),
    heightPx: round2(heightPx),
    heightCm: round2(toCm(heightPx, params.avgPxPerMm)),
    score: params.entry.hypothesis.score,
  }
}

/**
 * Glas-faces exclusief claimen (hoogste score eerst). Framing-kozijnen (evidenceFaceIds)
 * worden niet geclaimd — mogen gedeeld.
 */
function dedupeByExclusiveGlassFaces(
  candidates: ResolvedWindowCandidate[],
): ResolvedWindowCandidate[] {
  const claimed = new Set<number>()
  const kept: ResolvedWindowCandidate[] = []
  const ranked = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.id.localeCompare(b.id)
  })
  for (const candidate of ranked) {
    const glass = candidate.faceIds.filter((id) => id > 0)
    if (glass.some((id) => claimed.has(id))) continue
    for (const id of glass) claimed.add(id)
    kept.push(candidate)
  }
  return kept
}

/**
 * Stage 4: strip_stack-leden met dezelfde glas/strip-faces → 1 window (over refs heen);
 * framing per glas-face-set → 1 (beste score); daarna exclusieve glas-face claim.
 *
 * `dual` = pipeline FaceDualSpace (na rebind). Glas/evidence bbox via WINDOW_SPACE_POLICY.
 * strip_stack-breedte = max as-span van evidence-strips (langste rail/glas), niet seed-hyp.
 */
export function resolveWindowCandidates(params: {
  accepted: WindowEvidenceAcceptance[]
  refBands: WindowAxelRefBand[]
  dual: FaceDualSpace
  pxPerMmX: number
  pxPerMmY: number
}): ResolvedWindowCandidate[] {
  const avgPxPerMm = averagePxPerMm(params.pxPerMmX, params.pxPerMmY)

  const framingByGlass = new Map<string, WindowEvidenceAcceptance>()
  const stripStackGroups = new Map<string, WindowEvidenceAcceptance[]>()
  for (const entry of params.accepted) {
    if (entry.evidence === 'framing') {
      const key = glassFaceKey(entry.hypothesis.faceIds, entry.hypothesis.orientation)
      const existing = framingByGlass.get(key)
      if (!existing || entry.hypothesis.score > existing.hypothesis.score) {
        framingByGlass.set(key, entry)
      }
      continue
    }
    const key = stripStackClusterKey(entry)
    const list = stripStackGroups.get(key) ?? []
    list.push(entry)
    stripStackGroups.set(key, list)
  }

  const resolved: ResolvedWindowCandidate[] = []
  let index = 1
  for (const group of stripStackGroups.values()) {
    const orientation = group[0]!.hypothesis.orientation
    resolved.push(
      mergeStripStackGroup({
        group,
        orientation,
        dual: params.dual,
        avgPxPerMm,
        index,
      }),
    )
    index += 1
  }
  for (const entry of framingByGlass.values()) {
    const orientation = entry.hypothesis.orientation
    resolved.push(
      resolveFramingEntry({
        entry,
        orientation,
        dual: params.dual,
        avgPxPerMm,
        index,
      }),
    )
    index += 1
  }

  const unique = dedupeByExclusiveGlassFaces(resolved)

  return unique.sort((a, b) => {
    if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y
    if (a.bbox.x !== b.bbox.x) return a.bbox.x - b.bbox.x
    return a.id.localeCompare(b.id)
  })
}
