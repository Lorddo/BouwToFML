import type { LayerDebugReport, LayerId } from './types.ts'
import type {
  RoomJunctionRecord,
  SegmentRecord,
  SemanticWallGraphRecord,
} from '../examples-report.ts'
import { compareAllLayerTransitions } from './compare-layer-transition.ts'
import { enrichTransitionsWithEffects } from './classify-transition-effects.ts'
import { layerCountsFromLayers } from './flatten-layers.ts'
import { LAYER_DEBUG_VERSION } from './types.ts'

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractJsonBlock(html: string, layerId: LayerId): string | null {
  const marker = `<summary>JSON — Laag ${layerId}</summary><pre class="json">`
  const start = html.indexOf(marker)
  if (start < 0) return null
  const jsonStart = start + marker.length
  const jsonEnd = html.indexOf('</pre>', jsonStart)
  if (jsonEnd < 0) return null
  return unescapeHtml(html.slice(jsonStart, jsonEnd))
}

function flattenFaceJson(data: unknown): { segments: SegmentRecord[]; junctions: RoomJunctionRecord[] } {
  if (!Array.isArray(data)) {
    const obj = data as { segments?: SegmentRecord[]; junctions?: RoomJunctionRecord[] }
    return {
      segments: obj.segments ?? [],
      junctions: obj.junctions ?? [],
    }
  }
  return {
    segments: data.flatMap((face) => (face as { segments?: SegmentRecord[] }).segments ?? []),
    junctions: data.flatMap((face) => (face as { junctions?: RoomJunctionRecord[] }).junctions ?? []),
  }
}

function parseMetaLine(html: string): Partial<LayerDebugReport['pipelineSummary']> {
  const meta = html.match(
    /Laag A \(WASM\): <strong>(\d+)<\/strong> seg · Laag B: <strong>(\d+)<\/strong> seg · Laag C: <strong>(\d+)<\/strong> seg · Laag D: <strong>(\d+)<\/strong> seg(?: \/ <strong>(\d+)<\/strong> junctions)?/,
  )
  if (!meta) return {}
  return {
    roomWallSkeletonWasmSegmentCount: Number(meta[1]),
    roomWallSkeletonFilteredSegmentCount: Number(meta[2]),
    roomWallSkeletonLayerCSegmentCount: Number(meta[3]),
    semanticWallSegmentCount: Number(meta[4]),
    semanticWallJunctionCount: meta[5] ? Number(meta[5]) : undefined,
  }
}

function parseLegacyHtmlReport(html: string): LayerDebugReport {
  const title = html.match(/<title>BouwToFML voorbeelden — ([^<]+)<\/title>/)
  const exportedAt = html.match(/Geëxporteerd: ([^<]+)/)
  const layers: LayerDebugReport['layers'] = {}

  for (const id of ['A', 'B', 'C', 'D'] as const) {
    const jsonText = extractJsonBlock(html, id)
    if (!jsonText) continue
    const data = JSON.parse(jsonText) as unknown
    if (id === 'D') {
      const sem = data as SemanticWallGraphRecord
      layers.D = {
        segments: sem.segments ?? [],
        junctions: (sem.junctions ?? []).map((junction) => ({
          x: junction.x,
          y: junction.y,
          kind: junction.kind,
          angleDeg: junction.anglesDeg?.[0] ?? 0,
        })),
        semanticMeta: sem.meta,
      }
    } else {
      const flat = flattenFaceJson(data)
      layers[id] = flat
    }
  }

  const layerCounts = layerCountsFromLayers(layers)
  const transitions = enrichTransitionsWithEffects(compareAllLayerTransitions(layers))
  for (const t of transitions) {
    if (t.effects) {
      t.summary.improvements = t.effects.summary.improvements
      t.summary.regressions = t.effects.summary.regressions
      t.summary.neutral = t.effects.summary.neutral
    }
  }

  return {
    version: LAYER_DEBUG_VERSION,
    drawing: title?.[1]?.trim() ?? null,
    exportedAt: exportedAt?.[1]?.trim() ?? new Date().toISOString(),
    pipelineSummary: parseMetaLine(html),
    layerCounts,
    layers,
    transitions,
  }
}

export function loadLayerDebugReport(raw: string): LayerDebugReport {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as LayerDebugReport
    if (!parsed.transitions?.length && parsed.layers) {
      parsed.transitions = enrichTransitionsWithEffects(compareAllLayerTransitions(parsed.layers))
    }
    return parsed
  }
  if (trimmed.includes('<!DOCTYPE html') || trimmed.includes('<summary>JSON — Laag')) {
    return parseLegacyHtmlReport(trimmed)
  }
  throw new Error('Onbekend formaat: verwacht layer-debug.json of legacy HTML-rapport')
}
