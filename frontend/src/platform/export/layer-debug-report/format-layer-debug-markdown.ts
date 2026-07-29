import type { LayerDebugReport, LayerDebugWallTransition } from './types'

const TOP_DROPPED = 25

function formatBBox(bbox: { x: number; y: number; width: number; height: number }): string {
  return `${bbox.x.toFixed(1)},${bbox.y.toFixed(1)} ${bbox.width.toFixed(1)}×${bbox.height.toFixed(1)}`
}

function formatPoint(point: { x: number; y: number }): string {
  return `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`
}

function shortLayer(key: string): string {
  return key.replace(/^layer/, 'L')
}

function formatWallTransitions(transitions: LayerDebugWallTransition[]): string[] {
  const lines: string[] = []
  lines.push('## Wall transitions (drops)')
  lines.push('')
  lines.push('| Overgang | prev→next | kept | moved | merged | dropped | added | junc↓ |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const t of transitions) {
    const s = t.summary
    lines.push(
      `| ${shortLayer(t.from)}→${shortLayer(t.to)} | ${s.prevSegmentCount}→${s.nextSegmentCount} | ${s.kept} | ${s.moved} | ${s.merged} | ${s.dropped} | ${s.added} | ${s.junctionDropped} |`,
    )
  }
  lines.push('')

  for (const t of transitions) {
    if (t.summary.dropped <= 0 && t.summary.junctionDropped <= 0) continue
    lines.push(`### ${shortLayer(t.from)} → ${shortLayer(t.to)} drops`)
    lines.push('')
    if (t.droppedSegments.length > 0) {
      const dropped = [...t.droppedSegments]
        .sort((a, b) => b.lengthPx - a.lengthPx)
        .slice(0, TOP_DROPPED)
      lines.push(`**Segments dropped** (${t.summary.dropped})`)
      lines.push('')
      for (let i = 0; i < dropped.length; i += 1) {
        const item = dropped[i]!
        const hint = item.dropReasonHint !== 'unmatched' ? ` _(${item.dropReasonHint})_` : ''
        lines.push(
          `${i + 1}. #${item.prevIndex} len=${item.lengthPx} (${item.a.x},${item.a.y})→(${item.b.x},${item.b.y}) mid ${item.mid.x},${item.mid.y}${hint}`,
        )
      }
      if (t.droppedSegments.length > TOP_DROPPED) {
        lines.push(`_… +${t.droppedSegments.length - TOP_DROPPED} meer in JSON_`)
      }
      lines.push('')
    }
    if (t.droppedJunctions.length > 0) {
      lines.push(`**Junctions dropped** (${t.summary.junctionDropped})`)
      lines.push('')
      for (const item of t.droppedJunctions.slice(0, TOP_DROPPED)) {
        lines.push(`- #${item.prevIndex} ${item.kind} @ (${item.x}, ${item.y})`)
      }
      lines.push('')
    }
  }
  return lines
}

function formatOpeningDrops(report: LayerDebugReport): string[] {
  const lines: string[] = []
  const openings = report.openings
  if (!openings) return lines

  const unbound = openings.layer11?.unbound ?? []
  const skipped = openings.layer12?.skipped ?? []
  const rejected = openings.layer14?.rejected ?? []
  if (unbound.length === 0 && skipped.length === 0 && rejected.length === 0) return lines

  lines.push('## Opening drops')
  lines.push('')
  if (unbound.length > 0) {
    lines.push(`### L11 unbound (${unbound.length})`)
    lines.push('')
    for (const door of unbound) {
      lines.push(
        `- ${door.doorId}: ${door.reason} · ${door.kind} · centroid ${formatPoint(door.centroidPx)} · bbox ${formatBBox(door.bbox)}`,
      )
    }
    lines.push('')
  }
  if (skipped.length > 0) {
    lines.push(`### L12 skipped (${skipped.length})`)
    lines.push('')
    for (const door of skipped) {
      lines.push(`- ${door.doorId} @ seg ${door.segmentIndex}: ${door.reason}`)
    }
    lines.push('')
  }
  if (rejected.length > 0) {
    lines.push(`### L14 rejected (${rejected.length})`)
    lines.push('')
    for (const window of rejected) {
      lines.push(
        `- ${window.windowId}: ${window.reason} · ${window.evidence} · bbox ${formatBBox(window.bbox)}`,
      )
    }
    lines.push('')
  }
  return lines
}

export function formatLayerDebugMarkdown(report: LayerDebugReport): string {
  const lines: string[] = []
  lines.push('# Layer Debug V2')
  lines.push('')
  lines.push(`- Drawing: ${report.drawing ?? 'onbekend'}`)
  lines.push(`- Exported at: ${report.exportedAt}`)
  lines.push(`- Pipeline: ${report.pipelineVersion}`)
  if (report.roomPipelinePhase) {
    lines.push(`- Room phase: ${report.roomPipelinePhase}`)
  }
  lines.push('')
  lines.push('## Layers (muren L1–L10)')
  lines.push('')

  const order: Array<keyof NonNullable<LayerDebugReport['layers']>> = [
    'layer1',
    'layer2',
    'layer3',
    'layer4',
    'layer5',
    'layer6',
    'layer7',
    'layer8',
    'layer9',
    'layer10',
  ]
  let sawLayer10 = false
  for (const key of order) {
    const layer = report.layers[key]
    if (!layer) continue
    if (key === 'layer10') sawLayer10 = true
    const kindCounts = report.summary?.junctionKindCounts?.[key]
    lines.push(`### ${key}`)
    lines.push(`- segments: ${layer.segments.length}`)
    lines.push(`- junctions: ${layer.junctions.length}`)
    if (kindCounts) {
      lines.push(`- junction_kinds: I=${kindCounts.I}, L=${kindCounts.L}, T=${kindCounts.T}, X=${kindCounts.X}`)
    }
    lines.push('')
  }
  if (!sawLayer10) {
    lines.push('_layer10 ontbreekt — finalize muur-detectie opnieuw voor FML-input._')
    lines.push('')
  }

  if (report.wallTransitions && report.wallTransitions.length > 0) {
    lines.push(...formatWallTransitions(report.wallTransitions))
  }

  lines.push(...formatOpeningDrops(report))

  lines.push('## Openings (L11/L12/L14)')
  lines.push('')
  lines.push('- L13: niet in gebruik (overslaan)')
  lines.push('')

  const openings = report.openings
  const openingsSummary = report.openingsSummary

  if (!openings?.layer11 && !openings?.layer12 && !openings?.layer14) {
    lines.push('_Geen L11/L12/L14 data — rond deuren/ramen af of exporteer na snap/bind._')
    lines.push('')
  } else {
    if (openings.layer11) {
      const summary = openingsSummary?.layer11
      lines.push('### layer11 — Door-wall snap')
      lines.push(`- bound: ${summary?.bound ?? openings.layer11.bound.length}`)
      lines.push(`- unbound (geen segment): ${summary?.unbound ?? openings.layer11.unbound.length}`)
      lines.push('')
      if (openings.layer11.bound.length > 0) {
        lines.push('| doorId | seg | t | axis | contact | snappedBBox |')
        lines.push('|---|---:|---:|---|---:|---|')
        for (const door of openings.layer11.bound) {
          lines.push(
            `| ${door.doorId} | ${door.segmentIndex} | ${door.t.toFixed(3)} | ${door.openingAxis}/${door.outwardSign} | ${door.contactScore.toFixed(2)} | ${formatBBox(door.snappedBBox)} |`,
          )
        }
        lines.push('')
      }
      if (openings.layer11.unbound.length > 0) {
        lines.push('**Unbound (snap mislukt)**')
        lines.push('')
        lines.push('| doorId | reason | kind | centroid | bbox |')
        lines.push('|---|---|---|---|---|')
        for (const door of openings.layer11.unbound) {
          lines.push(
            `| ${door.doorId} | ${door.reason} | ${door.kind} | ${formatPoint(door.centroidPx)} | ${formatBBox(door.bbox)} |`,
          )
        }
        lines.push('')
      }
    }

    if (openings.layer12) {
      const summary = openingsSummary?.layer12
      lines.push('### layer12 — Deur swing orient')
      lines.push(`- oriented: ${summary?.oriented ?? openings.layer12.oriented.length}`)
      lines.push(`- skipped (orient failed): ${summary?.skipped ?? openings.layer12.skipped.length}`)
      lines.push('')
      if (openings.layer12.oriented.length > 0) {
        lines.push('| doorId | seg | t | kind | mirrored | hinge | opening |')
        lines.push('|---|---:|---:|---|---|---|---|')
        for (const door of openings.layer12.oriented) {
          lines.push(
            `| ${door.doorId} | ${door.segmentIndex} | ${door.t.toFixed(3)} | ${door.kind} | [${door.mirrored.join(',')}] | ${formatPoint(door.hingePx)} | ${formatPoint(door.openingStartPx)}→${formatPoint(door.openingEndPx)} |`,
          )
        }
        lines.push('')
      }
      if (openings.layer12.skipped.length > 0) {
        lines.push('**Skipped**')
        lines.push('')
        for (const door of openings.layer12.skipped) {
          lines.push(`- ${door.doorId} @ seg ${door.segmentIndex}: ${door.reason}`)
        }
        lines.push('')
      }
    }

    if (openings.layer14) {
      const summary = openingsSummary?.layer14
      const byReason = summary?.rejectedByReason
      const reasonParts = byReason
        ? Object.entries(byReason)
            .filter(([, count]) => (count ?? 0) > 0)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(', ')
        : ''
      lines.push('### layer14 — Raam segment-bind')
      lines.push(`- bound: ${summary?.bound ?? openings.layer14.bound.length}`)
      lines.push(
        `- rejected: ${summary?.rejected ?? openings.layer14.rejected.length}${reasonParts ? ` (${reasonParts})` : ''}`,
      )
      lines.push('')
      if (openings.layer14.bound.length > 0) {
        lines.push('| windowId | seg | t | axis | widthPx | evidence | fmlRefId | bbox |')
        lines.push('|---|---:|---:|---|---:|---|---|---|')
        for (const window of openings.layer14.bound) {
          lines.push(
            `| ${window.windowId} | ${window.segmentIndex} | ${window.t.toFixed(3)} | ${window.openingAxis} | ${window.widthPx.toFixed(1)} | ${window.evidence} | ${window.fmlRefId} | ${formatBBox(window.openingBBox)} |`,
          )
        }
        lines.push('')
      }
      if (openings.layer14.rejected.length > 0) {
        lines.push('**Rejected**')
        lines.push('')
        lines.push('| windowId | reason | evidence | widthPx | bbox |')
        lines.push('|---|---|---|---:|---|')
        for (const window of openings.layer14.rejected) {
          lines.push(
            `| ${window.windowId} | ${window.reason} | ${window.evidence} | ${window.widthPx.toFixed(1)} | ${formatBBox(window.bbox)} |`,
          )
        }
        lines.push('')
      }
    }
  }

  if (report.summary?.incompleteLayers?.length) {
    lines.push('## Incomplete')
    lines.push('')
    lines.push(`- layers: ${report.summary.incompleteLayers.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}
