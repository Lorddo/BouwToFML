import type { LayerDebugReport, LayerTransitionDiff } from './types.ts'
import { formatSegmentLine } from './segment-geometry.ts'

const TOP_N = 25

function junctionLine(j: { x: number; y: number; kind: string; angleDeg?: number }): string {
  const angle = j.angleDeg != null ? ` ∠${j.angleDeg}°` : ''
  return `(${j.x},${j.y}) ${j.kind}${angle}`
}

function formatTransitionSummaryTable(transitions: LayerTransitionDiff[]): string {
  const header =
    '| Overgang | prev | next | ✓imp | ✗reg | merged | dropped | moved | added |'
  const sep = '|---|--:|--:|--:|--:|--:|--:|--:|--:|'
  const rows = transitions.map((t) => {
    const s = t.summary
    const imp = s.improvements ?? t.effects?.summary.improvements ?? '—'
    const reg = s.regressions ?? t.effects?.summary.regressions ?? '—'
    return `| ${t.from}→${t.to} | ${s.prevSegmentCount} | ${s.nextSegmentCount} | ${imp} | ${reg} | ${s.merged} | ${s.dropped} | ${s.moved} | ${s.added} |`
  })
  return [header, sep, ...rows].join('\n')
}

function formatEffectsList(
  effects: LayerTransitionDiff['effects'],
  kind: 'improvement' | 'regression',
  topN: number,
): string {
  if (!effects) return '_Niet geclassificeerd._\n'
  const list = kind === 'improvement' ? effects.improvements : effects.regressions
  if (list.length === 0) {
    return kind === 'improvement' ? '_Geen verbeteringen gedetecteerd._\n' : '_Geen regressies gedetecteerd._\n'
  }
  return list
    .slice(0, topN)
    .map((item, i) => {
      const at = item.at ? ` @ ${item.at.x},${item.at.y}` : ''
      const line = item.line ? ` — ${item.line}` : ''
      return `${i + 1}. **${item.category}** — ${item.detail}${at}${line}`
    })
    .join('\n')
}

function formatLayerCountsTable(report: LayerDebugReport): string {
  const ids = ['A', 'B', 'C', 'D', 'E'] as const
  const header = '| Laag | segmenten | junctions | L | T | X | I |'
  const sep = '|---|--:|--:|--:|--:|--:|--:|'
  const rows = ids
    .filter((id) => report.layerCounts[id])
    .map((id) => {
      const c = report.layerCounts[id]!
      const k = c.junctionKinds
      return `| ${id} | ${c.segmentCount} | ${c.junctionCount} | ${k.L} | ${k.T} | ${k.X} | ${k.I} |`
    })
  return rows.length ? [header, sep, ...rows].join('\n') : '_Geen laagdata_'
}

function formatDroppedList(transition: LayerTransitionDiff): string {
  const dropped = [...transition.segments.dropped]
    .sort((a, b) => b.prev.lengthPx - a.prev.lengthPx)
    .slice(0, TOP_N)
  if (dropped.length === 0) return '_Geen dropped segmenten._\n'
  return dropped
    .map((item, i) => {
      const hint = item.dropReasonHint !== 'unmatched' ? ` _(${item.dropReasonHint})_` : ''
      return `${i + 1}. #${item.prevIndex} ${formatSegmentLine(item.prev)} @ mid ${item.prev.mid.x},${item.prev.mid.y}${hint}`
    })
    .join('\n')
}

function formatMovedList(transition: LayerTransitionDiff): string {
  const moved = [...transition.segments.moved]
    .sort((a, b) => b.endpointErrorPx - a.endpointErrorPx)
    .slice(0, TOP_N)
  if (moved.length === 0) return '_Geen verschoven segmenten._\n'
  return moved
    .map((item, i) => {
      return `${i + 1}. Δ=${item.endpointErrorPx}px #${item.prevIndex}→#${item.nextIndex} ${formatSegmentLine(item.prev)} → ${formatSegmentLine(item.next)}`
    })
    .join('\n')
}

function formatMergedSummary(transition: LayerTransitionDiff): string {
  if (transition.segments.merged.length === 0) return '_Geen merges._\n'
  const top = transition.segments.merged
    .sort((a, b) => b.prev.length - a.prev.length)
    .slice(0, 10)
  return top
    .map((item, i) => {
      const totalPrevLen = item.prev.reduce((sum, s) => sum + s.lengthPx, 0)
      return `${i + 1}. ${item.prev.length}→1 (~${totalPrevLen}px) → ${formatSegmentLine(item.next)}`
    })
    .join('\n')
}

function formatJunctionShifts(transition: LayerTransitionDiff): string {
  const shifted = [...transition.junctions.shifted]
    .sort((a, b) => b.shiftPx - a.shiftPx)
    .slice(0, TOP_N)
  if (shifted.length === 0) return '_Geen junction-verschuivingen._\n'
  return shifted
    .map((item, i) => {
      const kindNote = item.kindChanged
        ? ` kind ${item.prev.kind}→${item.next.kind}`
        : ''
      return `${i + 1}. Δ=${item.shiftPx}px ${junctionLine(item.prev)} → ${junctionLine(item.next)}${kindNote}`
    })
    .join('\n')
}

export function formatLayerDebugMarkdown(report: LayerDebugReport): string {
  const lines: string[] = []
  lines.push('# Layer debug rapport')
  lines.push('')
  lines.push(`- **Tekening:** ${report.drawing ?? '—'}`)
  lines.push(`- **Export:** ${report.exportedAt}`)
  if (report.planSize) {
    lines.push(`- **Plan:** ${report.planSize.width}×${report.planSize.height}px`)
  }
  if (report.pipelineSummary?.elapsedMs != null) {
    lines.push(`- **Detectietijd:** ${report.pipelineSummary.elapsedMs} ms`)
  }
  if (report.pipelineSummary?.semanticUsedLayerBFallback) {
    lines.push('- **⚠ Laag C leeg — semantic fallback op Laag B**')
  }
  lines.push('')
  lines.push('## Segmenten per laag')
  lines.push('')
  lines.push(formatLayerCountsTable(report))
  lines.push('')
  lines.push('## Overgangen (samenvatting)')
  lines.push('')
  lines.push('_✓imp = verbeteringen (merge, snap, prune, verleng) · ✗reg = regressies (verloren segment, drift)_')
  lines.push('')
  lines.push(formatTransitionSummaryTable(report.transitions))
  lines.push('')
  if (report.layers.A?.segments.length) {
    lines.push(
      `- **Laag A geometrie:** ${report.layers.A.segments.length} segmenten + ${report.layers.A.junctions.length} junctions in JSON`,
    )
    lines.push('')
  }

  for (const transition of report.transitions) {
    lines.push(`## ${transition.from} → ${transition.to}`)
    lines.push('')
    const s = transition.summary
    const eff = transition.effects?.summary
    lines.push(
      `_${s.prevSegmentCount} → ${s.nextSegmentCount} segmenten · kept ${s.kept} · moved ${s.moved} · merged ${s.merged} · dropped ${s.dropped} · added ${s.added}${eff ? ` · ✓${eff.improvements} verbeteringen · ✗${eff.regressions} regressies` : ''}_`,
    )
    lines.push('')
    if (transition.effects) {
      lines.push(`### Verbeteringen (top ${TOP_N})`)
      lines.push('')
      lines.push(formatEffectsList(transition.effects, 'improvement', TOP_N))
      lines.push('')
      lines.push(`### Regressies (top ${TOP_N})`)
      lines.push('')
      lines.push(formatEffectsList(transition.effects, 'regression', TOP_N))
      lines.push('')
    }
    if (s.merged > 0) {
      lines.push('### Merges (top 10)')
      lines.push('')
      lines.push(formatMergedSummary(transition))
      lines.push('')
    }
    if (s.moved > 0) {
      lines.push(`### Verschoven segmenten (top ${TOP_N})`)
      lines.push('')
      lines.push(formatMovedList(transition))
      lines.push('')
    }
    if (s.dropped > 0) {
      lines.push(`### Dropped segmenten (top ${TOP_N})`)
      lines.push('')
      lines.push(formatDroppedList(transition))
      lines.push('')
    }
    if (s.junctionShifted > 0 || s.junctionDropped > 0) {
      lines.push(`### Junction-verschuivingen (top ${TOP_N})`)
      lines.push('')
      lines.push(formatJunctionShifts(transition))
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function formatRunComparisonMarkdown(
  baseline: LayerDebugReport,
  candidate: LayerDebugReport,
): string {
  const lines: string[] = []
  lines.push('# Layer debug — run vergelijking')
  lines.push('')
  lines.push(`- **Baseline:** ${baseline.drawing ?? '—'} @ ${baseline.exportedAt}`)
  lines.push(`- **Candidate:** ${candidate.drawing ?? '—'} @ ${candidate.exportedAt}`)
  lines.push('')
  lines.push('## Segment counts')
  lines.push('')
  lines.push('| Laag | baseline | candidate | Δ |')
  lines.push('|---|--:|--:|--:|')
  for (const id of ['A', 'B', 'C', 'D', 'E'] as const) {
    const b = baseline.layerCounts[id]?.segmentCount
    const c = candidate.layerCounts[id]?.segmentCount
    if (b == null && c == null) continue
    const delta = (c ?? 0) - (b ?? 0)
    const sign = delta > 0 ? `+${delta}` : String(delta)
    lines.push(`| ${id} | ${b ?? '—'} | ${c ?? '—'} | ${sign} |`)
  }
  lines.push('')
  lines.push('## Overgang-deltas (dropped)')
  lines.push('')
  lines.push('| Overgang | baseline dropped | candidate dropped | Δ |')
  lines.push('|---|--:|--:|--:|')
  for (const baseT of baseline.transitions) {
    const candT = candidate.transitions.find(
      (t) => t.from === baseT.from && t.to === baseT.to,
    )
    if (!candT) continue
    const delta = candT.summary.dropped - baseT.summary.dropped
    const sign = delta > 0 ? `+${delta}` : String(delta)
    lines.push(
      `| ${baseT.from}→${baseT.to} | ${baseT.summary.dropped} | ${candT.summary.dropped} | ${sign} |`,
    )
  }
  return lines.join('\n')
}
