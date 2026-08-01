import type {
  ResolvedWindowCandidate,
  WindowAxelStage,
  WindowAxelCandidateEval,
  WindowAxelHypothesis,
  WindowAxelRefBand,
  WindowAxelRejection,
  WindowAxelRefMatchStats,
  WindowDoorArcRejection,
  WindowEvidenceAcceptance,
  WindowEvidenceRejection,
} from '@/cv/windows'
import { escapeHtml, formatJson } from './examples-report-html-utils'

function formatRejectedByReason(rejected: WindowAxelRefMatchStats['rejectedByReason']): string {
  const keys = Object.keys(rejected)
  if (keys.length <= 0) return '-'
  return keys.map((key) => `${key}: ${rejected[key as keyof typeof rejected] ?? 0}`).join(' | ')
}

function formatBBox(bbox: { x: number; y: number; width: number; height: number }): string {
  return `${bbox.width}×${bbox.height} @ (${bbox.x}, ${bbox.y})`
}

export function buildWindowFaceReportHtml(params: {
  drawing: string | null
  exportedAtIso: string
  activeStage: WindowAxelStage
  refBands: WindowAxelRefBand[]
  stage1Stats: {
    refBandCount: number
    candidateRootCount: number
    acceptedCount: number
    rejectedCount: number
    byRef: WindowAxelRefMatchStats[]
  }
  stage2Stats: {
    acceptedCount: number
    rejectedShare: number
    rejectedAdjacent: number
    rejectedDirectional: number
  }
  stage3Stats: {
    acceptedCount: number
    acceptedByFraming: number
    acceptedByStripStack: number
    rejectedNoEvidence: number
    stripStackFailedBeforeFraming?: number
  }
  hypotheses: {
    stage1: WindowAxelHypothesis[]
    stage2: WindowAxelHypothesis[]
    stage3: WindowAxelHypothesis[]
    active: WindowAxelHypothesis[]
  }
  rejections: WindowAxelRejection[]
  candidateEvals?: WindowAxelCandidateEval[]
  stage2DoorframeCandidates: WindowDoorArcRejection[]
  stage3Accepted: WindowEvidenceAcceptance[]
  stage3Rejections: WindowEvidenceRejection[]
  stage3DoorframesAccepted?: WindowEvidenceAcceptance[]
  stage4Resolved: ResolvedWindowCandidate[]
  stage4Doorframes?: ResolvedWindowCandidate[]
  refProbes: Array<{
    refIndex: number
    rect: { x: number; y: number; width: number; height: number }
    hasRefBand: boolean
    intersectingRoots: number
    candidateRoots: number
    matchedHypotheses: number
    rejectedClusters: number
  }>
  overlayPng?: string | null
}): string {
  const title = `Ramen stage-1+2+3+4 report — ${params.drawing ?? 'onbekend'}`
  const candidateEvals = params.candidateEvals ?? []
  const eligibleCount = candidateEvals.filter((row) => row.eligible).length
  const prefilterRejectCount = candidateEvals.length - eligibleCount
  const refRows =
    params.refBands.length > 0
      ? params.refBands
          .map(
            (ref) =>
              `<tr><td>${ref.refIndex + 1}</td><td>${ref.orientation}</td><td>${ref.stripCount}</td><td>${ref.fullStripCount}</td><td>${ref.targetStripHeightPx.toFixed(2)}</td><td>${ref.axisBandHeightPx.toFixed(2)}</td><td>${ref.stripHeightsPx.map((h) => h.toFixed(1)).join(', ')}</td><td>${ref.fullStripHeightsPx.map((h) => h.toFixed(1)).join(', ')}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="8">Geen bruikbare raam-axel-refs gevonden.</td></tr>'
  const refStatsRows =
    params.stage1Stats.byRef.length > 0
      ? params.stage1Stats.byRef
          .map(
            (row) =>
              `<tr><td>${row.refIndex + 1}</td><td>${row.effectiveTargetStripHeightPx.toFixed(2)}</td><td>${row.candidateRoots}</td><td>${row.clusterCount}</td><td>${row.acceptedCount}</td><td>${row.rejectedCount}</td><td>${escapeHtml(formatRejectedByReason(row.rejectedByReason))}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="7">Geen per-ref stats.</td></tr>'
  const hypothesisRows =
    params.hypotheses.active.length > 0
      ? params.hypotheses.active
          .map(
            (hyp) =>
              `<tr><td>${escapeHtml(hyp.id)}</td><td>${hyp.matchedRefIndex + 1}</td><td>${hyp.faceIds.join(', ')}</td><td>${formatBBox(hyp.unionBBox)}</td><td>${hyp.axisSpanPx.toFixed(2)}</td><td>${hyp.score.toFixed(3)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6">Geen accepted hypotheses.</td></tr>'
  const candidateEvalRows =
    candidateEvals.length > 0
      ? candidateEvals
          .map(
            (row) =>
              `<tr class="${row.eligible ? '' : 'reject'}"><td>${row.faceId}</td><td>${row.refIndex + 1}</td><td>${row.orientation}</td><td>${row.spanPx.toFixed(1)}</td><td>${row.stripHeightPx.toFixed(1)}</td><td>${row.minSpanPx.toFixed(1)}</td><td>${row.maxStripHeightPx.toFixed(1)}</td><td>${row.eligible ? 'ja' : 'nee'}</td><td>${row.rejectReason ?? '-'}</td><td>${formatBBox(row.bbox)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="10">Geen face-evals (lege Stage 1).</td></tr>'
  const rejectionRows =
    params.rejections.length > 0
      ? params.rejections
          .map(
            (rej) =>
              `<tr><td>${rej.refIndex + 1}</td><td>${rej.orientation}</td><td>${rej.faceIds.join(', ')}</td><td>${rej.reason}</td><td>${rej.expectedStripCount}</td><td>${rej.actualStripCount}</td><td>${rej.expectedStripHeightPx.toFixed(2)}</td><td>${rej.actualStripHeightsPx.map((h) => h.toFixed(1)).join(', ') || '-'}</td><td>${rej.axisSpanPx.toFixed(2)}</td><td>${rej.minSpanPx?.toFixed(1) ?? '-'}</td><td>${rej.maxStripHeightPx?.toFixed(1) ?? '-'}</td><td>${formatBBox(rej.unionBBox)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="12">Geen rejected clusters / pre-filter.</td></tr>'
  const stage2DoorframeRows =
    params.stage2DoorframeCandidates.length > 0
      ? params.stage2DoorframeCandidates
          .map(
            (rej) =>
              `<tr><td>${escapeHtml(rej.hypothesis.id)}</td><td>${rej.hypothesis.matchedRefIndex + 1}</td><td>${rej.hypothesis.faceIds.join(', ')}</td><td>${rej.reason}</td><td>${formatBBox(rej.hypothesis.unionBBox)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5">Geen doorframe-kandidaten in stage 2.</td></tr>'
  const stage4DoorframeRows =
    (params.stage4Doorframes?.length ?? 0) > 0
      ? (params.stage4Doorframes ?? [])
          .map(
            (entry) =>
              `<tr><td>${escapeHtml(entry.id)}</td><td>${entry.matchedRefIndex + 1}</td><td>${entry.evidence}</td><td>${entry.widthPx.toFixed(2)}</td><td>${entry.widthCm.toFixed(2)}</td><td>${entry.heightPx.toFixed(2)}</td><td>${entry.heightCm.toFixed(2)}</td><td>${formatBBox(entry.bbox)}</td><td>(${entry.centroidPx.x.toFixed(2)}, ${entry.centroidPx.y.toFixed(2)})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="9">Geen stage-4 resolved doorframes.</td></tr>'
  const stage3AcceptedRows =
    params.stage3Accepted.length > 0
      ? params.stage3Accepted
          .map(
            (entry) =>
              `<tr><td>${escapeHtml(entry.hypothesis.id)}</td><td>${entry.hypothesis.matchedRefIndex + 1}</td><td>${entry.evidence}</td><td>${entry.evidenceFaceIds.join(', ') || '-'}</td><td>${entry.hypothesis.faceIds.join(', ')}</td><td>${formatBBox(entry.hypothesis.unionBBox)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6">Geen stage-3 accepts.</td></tr>'
  const stage3RejectionRows =
    params.stage3Rejections.length > 0
      ? params.stage3Rejections
          .map(
            (entry) =>
              `<tr><td>${escapeHtml(entry.hypothesis.id)}</td><td>${entry.hypothesis.matchedRefIndex + 1}</td><td>${entry.reason}</td><td>${entry.hypothesis.faceIds.join(', ')}</td><td>${formatBBox(entry.hypothesis.unionBBox)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5">Geen stage-3 rejects.</td></tr>'
  const stage4ResolvedRows =
    params.stage4Resolved.length > 0
      ? params.stage4Resolved
          .map(
            (entry) =>
              `<tr><td>${escapeHtml(entry.id)}</td><td>${entry.matchedRefIndex + 1}</td><td>${entry.evidence}</td><td>${entry.widthPx.toFixed(2)}</td><td>${entry.widthCm.toFixed(2)}</td><td>${entry.heightPx.toFixed(2)}</td><td>${entry.heightCm.toFixed(2)}</td><td>${formatBBox(entry.bbox)}</td><td>(${entry.centroidPx.x.toFixed(2)}, ${entry.centroidPx.y.toFixed(2)})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="9">Geen stage-4 resolved windows.</td></tr>'
  const probeRows =
    params.refProbes.length > 0
      ? params.refProbes
          .map(
            (probe) =>
              `<tr><td>${probe.refIndex + 1}</td><td>${probe.rect.width}×${probe.rect.height} @ (${probe.rect.x}, ${probe.rect.y})</td><td>${probe.hasRefBand ? 'ja' : 'nee'}</td><td>${probe.intersectingRoots}</td><td>${probe.candidateRoots}</td><td>${probe.matchedHypotheses}</td><td>${probe.rejectedClusters}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="7">Geen ref probes.</td></tr>'

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 16px; color: #0f172a; }
    h1,h2 { margin: 0 0 10px; }
    p { margin: 4px 0; }
    .muted { color: #475569; }
    .panel { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; margin: 10px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    tr.reject td { background: #fef2f2; color: #7f1d1d; }
    img { max-width: min(100%, 1200px); border: 1px solid #cbd5e1; border-radius: 8px; }
    pre { background: #0b1020; color: #dbeafe; padding: 10px; border-radius: 8px; overflow: auto; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Ramen stage-1+2+3+4 — axel face-pattern report</h1>
  <p class="muted">Drawing: <strong>${escapeHtml(params.drawing ?? 'onbekend')}</strong> · Export: ${escapeHtml(params.exportedAtIso)}</p>

  <section class="panel">
    <h2>Samenvatting</h2>
    <p>Actieve stage: <strong>${params.activeStage}</strong></p>
    <p>Refs: <strong>${params.stage1Stats.refBandCount}</strong> · candidate roots: <strong>${params.stage1Stats.candidateRootCount}</strong></p>
    <p>Stage 1 face-evals: <strong>${candidateEvals.length}</strong> · eligible: <strong>${eligibleCount}</strong> · pre-filter reject: <strong>${prefilterRejectCount}</strong></p>
    <p>Stage 1 accepted: <strong>${params.stage1Stats.acceptedCount}</strong> · Stage 1 rejected: <strong>${params.stage1Stats.rejectedCount}</strong></p>
    <p>Stage 2 accepted (windows): <strong>${params.stage2Stats.acceptedCount}</strong> · doorframe candidates shared: <strong>${params.stage2Stats.rejectedShare}</strong> · adjacent: <strong>${params.stage2Stats.rejectedAdjacent}</strong> · directional: <strong>${params.stage2Stats.rejectedDirectional}</strong></p>
    <p>Stage 3 accepted: <strong>${params.stage3Stats.acceptedCount}</strong> · framing: <strong>${params.stage3Stats.acceptedByFraming}</strong> · strip-stack: <strong>${params.stage3Stats.acceptedByStripStack}</strong> · strip-fail→framing: <strong>${params.stage3Stats.stripStackFailedBeforeFraming ?? 0}</strong> · no-evidence reject: <strong>${params.stage3Stats.rejectedNoEvidence}</strong></p>
    <p>Stage 4 resolved windows: <strong>${params.stage4Resolved.length}</strong> · doorframes: <strong>${params.stage4Doorframes?.length ?? 0}</strong></p>
  </section>

  <section class="panel">
    <h2>Ref-bands</h2>
    <table>
      <thead><tr><th>ref</th><th>ori</th><th>stripCount</th><th>fullStripCount</th><th>targetH</th><th>axisBandH</th><th>stripHeights</th><th>fullStripHeights</th></tr></thead>
      <tbody>${refRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Per-ref matchstats</h2>
    <table>
      <thead><tr><th>ref</th><th>targetH(px, effectief)</th><th>candidates</th><th>clusters</th><th>accepted</th><th>rejected</th><th>reasons</th></tr></thead>
      <tbody>${refStatsRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Reference self-check</h2>
    <p class="muted">Gebruik dit om te zien waarom zelfs de ref-regio geen hit gaf.</p>
    <table>
      <thead><tr><th>ref</th><th>rect</th><th>hasBand</th><th>intersectingRoots</th><th>candidateRoots</th><th>matched</th><th>rejectedClusters</th></tr></thead>
      <tbody>${probeRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 1 kandidaten (alle face-evals vóór clustering)</h2>
    <p class="muted">Per ref×ori: span/hoogte vs minSpan/maxH. Rood = pre-filter afgewezen.</p>
    <table>
      <thead><tr><th>face</th><th>ref</th><th>ori</th><th>span</th><th>H</th><th>minSpan</th><th>maxH</th><th>eligible</th><th>reason</th><th>bbox</th></tr></thead>
      <tbody>${candidateEvalRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Accepted hypotheses</h2>
    <p class="muted">Getoond volgens actieve stage (${params.activeStage}).</p>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>faceIds</th><th>bbox</th><th>axisSpan</th><th>score</th></tr></thead>
      <tbody>${hypothesisRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 2 doorframe-kandidaten</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>faceIds</th><th>reason</th><th>bbox</th></tr></thead>
      <tbody>${stage2DoorframeRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 3 accepted evidence</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>evidence</th><th>evidenceFaceIds</th><th>hypothesisFaceIds</th><th>bbox</th></tr></thead>
      <tbody>${stage3AcceptedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 3 rejected</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>reason</th><th>faceIds</th><th>bbox</th></tr></thead>
      <tbody>${stage3RejectionRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 4 resolved windows</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>evidence</th><th>width px</th><th>width cm</th><th>height px</th><th>height cm</th><th>bbox</th><th>centroid</th></tr></thead>
      <tbody>${stage4ResolvedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 4 resolved doorframes</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>evidence</th><th>width px</th><th>width cm</th><th>height px</th><th>height cm</th><th>bbox</th><th>centroid</th></tr></thead>
      <tbody>${stage4DoorframeRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 1 rejected (pre-filter + clusters) + reason</h2>
    <table>
      <thead><tr><th>ref</th><th>ori</th><th>faceIds</th><th>reason</th><th>exp strips</th><th>act strips</th><th>exp H</th><th>act H list</th><th>axis span</th><th>minSpan</th><th>maxH</th><th>bbox</th></tr></thead>
      <tbody>${rejectionRows}</tbody>
    </table>
  </section>

  ${
    params.overlayPng
      ? `<section class="panel"><h2>Overlay</h2><img src="${params.overlayPng}" alt="Ramen stage-1 overlay" /></section>`
      : ''
  }

  <section class="panel">
    <h2>JSON</h2>
    <pre>${formatJson({
      drawing: params.drawing,
      exportedAtIso: params.exportedAtIso,
      activeStage: params.activeStage,
      refBands: params.refBands,
      stage1Stats: params.stage1Stats,
      stage2Stats: params.stage2Stats,
      stage3Stats: params.stage3Stats,
      refProbes: params.refProbes,
      candidateEvals,
      hypotheses: params.hypotheses,
      rejections: params.rejections,
      stage2DoorframeCandidates: params.stage2DoorframeCandidates,
      stage3Accepted: params.stage3Accepted,
      stage3Rejections: params.stage3Rejections,
      stage3DoorframesAccepted: params.stage3DoorframesAccepted,
      stage4Resolved: params.stage4Resolved,
      stage4Doorframes: params.stage4Doorframes,
    })}</pre>
  </section>
</body>
</html>`
}
