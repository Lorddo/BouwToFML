import { pointToSegmentDistancePx } from '@/platform/export/layer-debug/segment-geometry'
import type { RoomJunctionRecord, SegmentRecord } from '@/platform/export/examples-report'
import type { FlatProbeLayer, FlattenedProbeLayers, ProbeLayerKey } from './flatten-output-layers'
import { formatProbeLayerLabel, probeLayerJsonPath } from './flatten-output-layers'
import type { ProbeFaceHit } from './probe-faces'

export type ProbeSampleKind = 'point' | 'region'

export interface ProbePoint {
  x: number
  y: number
}

export interface ProbeRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ProbeSegmentHit {
  layer: ProbeLayerKey
  index: number
  segment: SegmentRecord
  distancePx: number
}

export interface ProbeJunctionHit {
  layer: ProbeLayerKey
  junction: RoomJunctionRecord
  distancePx: number
}

export interface ProbeResult {
  kind: ProbeSampleKind
  point: ProbePoint
  region?: ProbeRegion
  pipelineVersion: FlattenedProbeLayers['pipelineVersion']
  segments: ProbeSegmentHit[]
  junctions: ProbeJunctionHit[]
  /**
   * @deprecated Gebruik wallInkFaces — blijft gevuld als alias voor wall-ink.
   */
  faces: ProbeFaceHit[]
  /** Post-ink labels (wall-ink ruimte). */
  wallInkFaces: ProbeFaceHit[]
  /** Pre-ink raw white CCs (opening-wit ruimte). */
  openingWhiteFaces: ProbeFaceHit[]
  /** true = geen roomClassifyState/cache beschikbaar (niet: lege regio). */
  faceSourceMissing?: boolean
}

const V2_LAYER_ORDER: ProbeLayerKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function resolveLayerOrder(flattened: FlattenedProbeLayers): ProbeLayerKey[] {
  if (flattened.layerOrder.length > 0) return flattened.layerOrder
  return V2_LAYER_ORDER
}

function dist(a: ProbePoint, b: ProbePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function segmentMid(seg: SegmentRecord): ProbePoint {
  return {
    x: Math.round((seg.a.x + seg.b.x) / 2),
    y: Math.round((seg.a.y + seg.b.y) / 2),
  }
}

function segmentInRegion(seg: SegmentRecord, region: ProbeRegion): boolean {
  const left = region.x
  const top = region.y
  const right = region.x + region.width
  const bottom = region.y + region.height
  const points = [seg.a, seg.b, segmentMid(seg)]
  return points.some((p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)
}

function junctionInRegion(junction: RoomJunctionRecord, region: ProbeRegion): boolean {
  return (
    junction.x >= region.x &&
    junction.x <= region.x + region.width &&
    junction.y >= region.y &&
    junction.y <= region.y + region.height
  )
}

function formatSegment(seg: SegmentRecord): string {
  return `(${seg.a.x},${seg.a.y})→(${seg.b.x},${seg.b.y}) L=${seg.lengthPx}px`
}

function probeLayer(
  layerId: ProbeLayerKey,
  layer: FlatProbeLayer,
  options: {
    maxHits: number
    matchSegment: (segment: SegmentRecord, index: number) => boolean
    segmentDistance: (segment: SegmentRecord) => number
    matchJunction: (junction: RoomJunctionRecord) => boolean
    junctionDistance: (junction: RoomJunctionRecord) => number
  },
): { segments: ProbeSegmentHit[]; junctions: ProbeJunctionHit[] } {
  const segHits: ProbeSegmentHit[] = []
  for (let index = 0; index < layer.segments.length; index += 1) {
    const segment = layer.segments[index]!
    if (!options.matchSegment(segment, index)) continue
    segHits.push({
      layer: layerId,
      index,
      segment,
      distancePx: options.segmentDistance(segment),
    })
  }
  segHits.sort((a, b) => a.distancePx - b.distancePx)

  const juncHits: ProbeJunctionHit[] = []
  for (const junction of layer.junctions) {
    if (!options.matchJunction(junction)) continue
    juncHits.push({
      layer: layerId,
      junction,
      distancePx: options.junctionDistance(junction),
    })
  }
  juncHits.sort((a, b) => a.distancePx - b.distancePx)

  return {
    segments: segHits.slice(0, options.maxHits),
    junctions: juncHits.slice(0, options.maxHits),
  }
}

export function probeLayersAtPoint(
  flattened: FlattenedProbeLayers,
  point: ProbePoint,
  options?: { radiusPx?: number; maxHitsPerLayer?: number },
): ProbeResult {
  const radiusPx = options?.radiusPx ?? 48
  const maxHits = options?.maxHitsPerLayer ?? 3
  const segments: ProbeSegmentHit[] = []
  const junctions: ProbeJunctionHit[] = []

  for (const layerId of resolveLayerOrder(flattened)) {
    const layer = flattened.layers[layerId]
    if (!layer) continue
    const hits = probeLayer(layerId, layer, {
      maxHits,
      matchSegment: () => true,
      segmentDistance: (segment) => pointToSegmentDistancePx(point, segment),
      matchJunction: () => true,
      junctionDistance: (junction) => dist(point, junction),
    })
    segments.push(...hits.segments.filter((hit) => hit.distancePx <= radiusPx))
    junctions.push(...hits.junctions.filter((hit) => hit.distancePx <= radiusPx))
  }

  return {
    kind: 'point',
    point,
    pipelineVersion: flattened.pipelineVersion,
    segments,
    junctions,
    faces: [],
    wallInkFaces: [],
    openingWhiteFaces: [],
  }
}

export function probeLayersInRegion(
  flattened: FlattenedProbeLayers,
  region: ProbeRegion,
  options?: { maxHitsPerLayer?: number },
): ProbeResult {
  const maxHits = options?.maxHitsPerLayer ?? 8
  const point: ProbePoint = {
    x: Math.round(region.x + region.width / 2),
    y: Math.round(region.y + region.height / 2),
  }
  const segments: ProbeSegmentHit[] = []
  const junctions: ProbeJunctionHit[] = []

  for (const layerId of resolveLayerOrder(flattened)) {
    const layer = flattened.layers[layerId]
    if (!layer) continue
    const hits = probeLayer(layerId, layer, {
      maxHits,
      matchSegment: (segment) => segmentInRegion(segment, region),
      segmentDistance: (segment) => pointToSegmentDistancePx(point, segment),
      matchJunction: (junction) => junctionInRegion(junction, region),
      junctionDistance: (junction) => dist(point, junction),
    })
    segments.push(...hits.segments)
    junctions.push(...hits.junctions)
  }

  return {
    kind: 'region',
    point,
    region,
    pipelineVersion: flattened.pipelineVersion,
    segments,
    junctions,
    faces: [],
    wallInkFaces: [],
    openingWhiteFaces: [],
  }
}

function formatFaceLines(title: string, faces: ProbeFaceHit[]): string[] {
  const lines: string[] = [`### ${title}`]
  if (faces.length <= 0) {
    lines.push('_Geen faces in dit gebied._')
    return lines
  }
  for (const face of faces) {
    const b = face.bbox
    lines.push(
      `- FaceID ${face.faceId} · ${face.className} · ${face.pixelCount}px` +
        ` · bbox ${b.width}×${b.height} @ (${b.x},${b.y})` +
        (face.rawLabel !== face.faceId ? ` · rawLabel ${face.rawLabel}` : ''),
    )
  }
  return lines
}

export function formatProbeClipboardText(args: {
  imageName?: string | null
  planSize?: { width: number; height: number } | null
  flowStep?: string
  result: ProbeResult
}): string {
  const { imageName, planSize, flowStep, result } = args
  const lines: string[] = ['## Debug-probe (BouwToFML)']

  if (imageName) lines.push(`- Tekening: ${imageName}`)
  if (planSize) lines.push(`- Plan: ${planSize.width}×${planSize.height}px`)
  if (flowStep) lines.push(`- Stap: ${flowStep}`)
  lines.push(`- Pipeline: ${result.pipelineVersion}`)

  if (result.kind === 'point') {
    lines.push(`- Punt: (${result.point.x}, ${result.point.y})`)
  } else if (result.region) {
    const r = result.region
    lines.push(
      `- Gebied: (${Math.round(r.x)},${Math.round(r.y)}) ${Math.round(r.width)}×${Math.round(r.height)}px`,
    )
    lines.push(`- Midden: (${result.point.x}, ${result.point.y})`)
  }

  lines.push('')

  const wallInkFaces = result.wallInkFaces ?? result.faces
  const openingWhiteFaces = result.openingWhiteFaces ?? []
  const hasFaces = wallInkFaces.length > 0 || openingWhiteFaces.length > 0
  const hasGeometry = result.segments.length > 0 || result.junctions.length > 0

  if (result.faceSourceMissing) {
    lines.push(
      '_Geen face-labels beschikbaar — eerst Muren classificeren (roomClassifyState). Deuren/Ramen delen diezelfde labels._',
    )
    lines.push('')
  } else if (hasFaces) {
    lines.push(...formatFaceLines('Wall-ink faces', wallInkFaces))
    lines.push('')
    lines.push(...formatFaceLines('Opening-wit faces', openingWhiteFaces))
    lines.push('')
  } else {
    lines.push('_Geen faces in dit gebied (labels wel geladen)._')
    lines.push('')
  }

  if (!hasGeometry && !hasFaces) {
    if (!result.faceSourceMissing) {
      lines.push('_Geen segmenten of junctions in bereik — vergroot gebied of zoom dichterbij._')
    }
    return lines.join('\n')
  }

  if (!hasGeometry && hasFaces) {
    lines.push('_Geen muur-segmenten/junctions in bereik (wel faces hierboven)._')
    return lines.join('\n')
  }

  if (result.segments.length > 0) {
    lines.push('### Segmenten')
    for (const hit of result.segments) {
      const label = formatProbeLayerLabel(hit.layer)
      const jsonPath = probeLayerJsonPath(hit.layer)
      const jsonHint = jsonPath ? ` · JSON: ${jsonPath}[${hit.index}]` : ''
      lines.push(
        `- ${label} #${hit.index}: ${formatSegment(hit.segment)} (afstand ${Math.round(hit.distancePx)}px)${jsonHint}`,
      )
    }
  }

  if (result.junctions.length > 0) {
    lines.push('')
    lines.push('### Junctions')
    for (const hit of result.junctions) {
      const j = hit.junction
      const label = formatProbeLayerLabel(hit.layer)
      const jsonPath =
        hit.layer === '1'
          ? 'layers.layer1.junctions'
          : hit.layer === '2'
            ? 'layers.layer2.junctions'
            : hit.layer === '3'
              ? 'layers.layer3.junctions'
              : hit.layer === '4'
                ? 'layers.layer4.junctions'
                : hit.layer === '5'
                  ? 'layers.layer5.junctions'
                  : hit.layer === '6'
                    ? 'layers.layer6.junctions'
                    : hit.layer === '7'
                      ? 'layers.layer7.junctions'
                      : hit.layer === '8'
                        ? 'layers.layer8.junctions'
                        : hit.layer === '9'
                          ? 'layers.layer9.junctions'
                          : null
      const jsonHint = jsonPath ? ` · JSON: ${jsonPath}` : ''
      lines.push(
        `- ${label}: ${j.kind} @ (${j.x},${j.y}) angle=${Math.round(j.angleDeg)}° (afstand ${Math.round(hit.distancePx)}px)${jsonHint}`,
      )
    }
  }

  lines.push('')
  lines.push(
    '_Plak dit bij een layer-debug.json — segment #n = layers.layer1–layer10.segments[n]._',
  )
  return lines.join('\n')
}
