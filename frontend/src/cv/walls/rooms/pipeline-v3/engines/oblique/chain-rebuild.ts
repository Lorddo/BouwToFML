/**
 * V3 keten-herbouw — zet een trap terug tot rechte schuine segmenten.
 *
 * Laag 4 trekt een schuine gevel naar H/V en laat een zaagtand achter. Hier
 * wordt die zaagtand vervangen door één segment per ankerpaar op de as, waarbij
 * ankers de plekken zijn waar een vreemde muur op de gevel uitkomt. Die vreemde
 * takken schuiven mee, zodat de graaf dezelfde knopen met dezelfde graad houdt.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import type { ObliquePolicy } from '../policy-types'
import {
  buildEndpointIndex,
  cloneSegments,
  dropZeroLengthSegments,
  incidentAtIndexed,
  pointsNear,
} from '../segment-ops'
import type { ObliqueAxis } from './axis-inventory'
import {
  intersectWithSegmentLine,
  projectOnto,
  projectT,
  signedOffset,
  type AxisLine,
  type Point2,
} from './axis-line'

const ENDPOINT_EPS_PX = 1

/**
 * Een segment tot deze lengte is numeriek restant, geen muur: `incidentAtIndexed`
 * met eps 1 ziet zijn twee eindpunten als één plek. In de guard-graaf levert het
 * juist wél twee knopen — een schijn-T plus een losse I — en die twee laten een
 * verder correcte herbouw terugdraaien. Vandaar dezelfde grens hier en in laag 10.
 */
export const OBLIQUE_STUB_MAX_PX = ENDPOINT_EPS_PX

export type ObliqueRebuildStats = {
  axesApplied: number
  axesRejected: number
  chainsRebuilt: number
  segmentsRemoved: number
  segmentsCreated: number
  anchorsMoved: number
}

type Anchor = {
  point: Point2
  target: Point2
  t: number
  foreign: number[]
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isInsideBand(seg: Segment, line: AxisLine, bandPx: number): boolean {
  return (
    Math.abs(signedOffset(line, seg.a)) <= bandPx && Math.abs(signedOffset(line, seg.b)) <= bandPx
  )
}

/**
 * Segmenten die in de band rond de as liggen en via gedeelde eindpunten aan de
 * bewijsspan hangen. De band is een halve muurdikte: een trap blijft altijd
 * binnen zijn eigen muur, een buurmuur komt er niet in.
 */
function collectMembers(segments: Segment[], axis: ObliqueAxis, policy: ObliquePolicy): number[] {
  const inBand = new Set<number>()
  for (let index = 0; index < segments.length; index += 1) {
    if (isInsideBand(segments[index], axis.line, policy.captureBandPx)) inBand.add(index)
  }

  const stack: number[] = []
  for (const index of inBand) {
    const ta = projectT(axis.line, segments[index].a)
    const tb = projectT(axis.line, segments[index].b)
    if (Math.max(ta, tb) >= axis.tMin && Math.min(ta, tb) <= axis.tMax) stack.push(index)
  }

  const endpointIndex = buildEndpointIndex(segments, ENDPOINT_EPS_PX)
  const members = new Set<number>(stack)
  while (stack.length > 0) {
    const index = stack.pop()!
    const seg = segments[index]
    for (const point of [seg.a, seg.b]) {
      for (const incident of incidentAtIndexed(segments, endpointIndex, point, ENDPOINT_EPS_PX)) {
        if (members.has(incident.segIndex) || !inBand.has(incident.segIndex)) continue
        members.add(incident.segIndex)
        stack.push(incident.segIndex)
      }
    }
  }
  return [...members]
}

/**
 * De projectie van een samenhangend pad op een lijn is een interval, dus per
 * component is de dekking langs de as sluitend en kan de herbouw geen gat
 * overbruggen dat in de tekening een opening is.
 */
function splitIntoConnectedComponents(segments: Segment[], memberIndices: number[]): number[][] {
  const memberSet = new Set(memberIndices)
  const endpointIndex = buildEndpointIndex(segments, ENDPOINT_EPS_PX)
  const seen = new Set<number>()
  const components: number[][] = []
  for (const start of memberIndices) {
    if (seen.has(start)) continue
    const component: number[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const index = stack.pop()!
      component.push(index)
      const seg = segments[index]
      for (const point of [seg.a, seg.b]) {
        for (const incident of incidentAtIndexed(segments, endpointIndex, point, ENDPOINT_EPS_PX)) {
          if (!memberSet.has(incident.segIndex) || seen.has(incident.segIndex)) continue
          seen.add(incident.segIndex)
          stack.push(incident.segIndex)
        }
      }
    }
    components.push(component)
  }
  return components
}

/**
 * Ideaal blijft de vreemde tak op zijn eigen lijn liggen: dan is het snijpunt
 * met de as het nieuwe knooppunt en krijgt die tak geen knik. Loopt de tak
 * bijna parallel, dan schiet het snijpunt weg en valt het anker terug op de
 * loodrechte projectie.
 */
function resolveAnchorTarget(params: {
  point: Point2
  foreign: Segment[]
  line: AxisLine
  policy: ObliquePolicy
}): Point2 | null {
  if (params.foreign.length === 1) {
    const arm = params.foreign[0]
    const hit = intersectWithSegmentLine(params.line, arm)
    const shift = hit ? distance(hit, params.point) : Number.POSITIVE_INFINITY
    // Het snijpunt mag de tak niet omklappen, dus nooit voorbij zijn halve lengte.
    if (hit && shift <= params.policy.maxAnchorShiftPx && shift <= segmentLength(arm) * 0.5) {
      return hit
    }
  }
  const projected = projectOnto(params.line, params.point)
  if (distance(projected, params.point) > params.policy.maxAnchorShiftPx) return null
  return projected
}

function collectAnchors(params: {
  segments: Segment[]
  component: number[]
  axis: ObliqueAxis
  policy: ObliquePolicy
}): Anchor[] | null {
  const memberSet = new Set(params.component)
  const endpointIndex = buildEndpointIndex(params.segments, ENDPOINT_EPS_PX)
  const anchors: Anchor[] = []

  for (const index of params.component) {
    const seg = params.segments[index]
    for (const point of [seg.a, seg.b]) {
      if (anchors.some((anchor) => pointsNear(anchor.point, point, ENDPOINT_EPS_PX))) continue
      const incident = incidentAtIndexed(params.segments, endpointIndex, point, ENDPOINT_EPS_PX)
      const foreign = incident
        .filter((entry) => !memberSet.has(entry.segIndex))
        .map((entry) => entry.segIndex)
      const memberCount = incident.length - foreign.length
      const isTerminus = memberCount <= 1
      if (foreign.length === 0 && !isTerminus) continue

      const target = resolveAnchorTarget({
        point,
        foreign: foreign.map((foreignIndex) => params.segments[foreignIndex]),
        line: params.axis.line,
        policy: params.policy,
      })
      if (!target) {
        tally('W-55', 'anchor_shift_too_large')
        return null
      }
      anchors.push({
        point: { ...point },
        target,
        t: projectT(params.axis.line, target),
        foreign,
      })
    }
  }

  anchors.sort((a, b) => a.t - b.t)
  return anchors.length >= 2 ? anchors : null
}

// ESC:W-55 (B) — keten-herbouw; laag 10 draait terug als de graaf niet overleeft.
export function rebuildObliqueChains(params: {
  segments: Segment[]
  axes: ObliqueAxis[]
  policy: ObliquePolicy
}): { segments: Segment[]; stats: ObliqueRebuildStats } {
  const stats: ObliqueRebuildStats = {
    axesApplied: 0,
    axesRejected: 0,
    chainsRebuilt: 0,
    segmentsRemoved: 0,
    segmentsCreated: 0,
    anchorsMoved: 0,
  }
  if (params.axes.length === 0) return { segments: cloneSegments(params.segments), stats }

  let working = cloneSegments(params.segments)

  for (const axis of params.axes) {
    const members = collectMembers(working, axis, params.policy)
    if (members.length < 2) {
      tally('W-55', 'no_chain')
      stats.axesRejected += 1
      continue
    }

    const removals = new Set<number>()
    const created: Segment[] = []
    const moves: Array<{ from: Point2; to: Point2 }> = []
    let rebuiltHere = 0

    for (const component of splitIntoConnectedComponents(working, members)) {
      if (component.length < 2) continue
      const anchors = collectAnchors({ segments: working, component, axis, policy: params.policy })
      if (!anchors) continue

      const template = component.reduce((longest, index) =>
        segmentLength(working[index]) > segmentLength(working[longest]) ? index : longest,
      )
      const templateIndex = working[template].templateIndex

      for (let i = 0; i + 1 < anchors.length; i += 1) {
        created.push({
          a: { ...anchors[i].target },
          b: { ...anchors[i + 1].target },
          ...(templateIndex != null ? { templateIndex } : {}),
        })
      }
      for (const index of component) removals.add(index)
      for (const anchor of anchors) {
        if (distance(anchor.point, anchor.target) <= 1e-9) continue
        moves.push({ from: anchor.point, to: anchor.target })
      }
      rebuiltHere += 1
    }

    if (rebuiltHere === 0) {
      tally('W-55', 'no_anchors')
      stats.axesRejected += 1
      continue
    }

    const next: Segment[] = []
    for (let index = 0; index < working.length; index += 1) {
      if (removals.has(index)) continue
      next.push(working[index])
    }
    // Vreemde takken volgen hun knooppunt, anders valt de graaf open.
    for (const move of moves) {
      for (const seg of next) {
        if (pointsNear(seg.a, move.from, ENDPOINT_EPS_PX)) seg.a = { ...move.to }
        if (pointsNear(seg.b, move.from, ENDPOINT_EPS_PX)) seg.b = { ...move.to }
      }
    }
    next.push(...created)

    const pruned = dropZeroLengthSegments(next, OBLIQUE_STUB_MAX_PX)
    working = pruned.segments
    stats.axesApplied += 1
    stats.chainsRebuilt += rebuiltHere
    stats.segmentsRemoved += removals.size + pruned.removed
    stats.segmentsCreated += created.length
    stats.anchorsMoved += moves.length
    tally('W-55', 'rebuilt')
  }

  return { segments: working, stats }
}
