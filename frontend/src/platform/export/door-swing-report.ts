import type {
  BoundDoor,
  DoorAngleRescueDiagnostic,
  DoorFillRejection,
  DoorRoomSurroundRejection,
  DoorWallTouchRejection,
  ResolvedDoorCandidate,
  DoorSizeBandPx,
  DoorSwingHypothesis,
  DoorSwingRefBand,
  DoorSwingRootDiagnostic,
} from '@/cv/doors'
import { escapeHtml, formatJson } from './examples-report-html-utils'

export function buildDoorSwingReportHtml(params: {
  drawing: string | null
  exportedAtIso: string
  pxPerMmX: number
  pxPerMmY: number
  refBands: DoorSwingRefBand[]
  sizeBandPx: DoorSizeBandPx
  stats: {
    rootCount: number
    seedCount: number
    singleAccepted: number
    clusterAccepted: number
    skippedOutsideSeedCount: number
    skippedOutOfBandCount: number
  }
  hypotheses: DoorSwingHypothesis[]
  diagnostics?: DoorSwingRootDiagnostic[]
  stage2?: {
    minRatio: number
    maxRatio: number
    acceptedIds: string[]
    rejectedCount: number
    rejectedTooFull: number
    rejectedTooEmpty: number
    rejectedSurroundedByRoom?: number
    rejectedNoWallTouch?: number
    angleRescueCount?: number
    fillRejected?: Array<{
      id: string
      faceIds: number[]
      reason: DoorFillRejection['reason']
      candidateFill: number
      refFill: number | null
      minAllowedFill: number | null
      maxAllowedFill: number | null
      unionBBox: DoorSwingHypothesis['unionBBox']
      filledAreaPx: number
    }>
    surroundRejected?: Array<{
      id: string
      faceIds: number[]
      reason: DoorRoomSurroundRejection['reason']
      unionBBox: DoorSwingHypothesis['unionBBox']
    }>
    wallTouchRejected?: Array<{
      id: string
      faceIds: number[]
      reason: DoorWallTouchRejection['reason']
      unionBBox: DoorSwingHypothesis['unionBBox']
    }>
    angleRescueDiagnostics?: DoorAngleRescueDiagnostic[]
    angleRescueAccepted?: DoorSwingHypothesis[]
  } | null
  gapsContext?: {
    demotedCount: number
    keptCount: number
    oversizedDemotedCount?: number
    maxRefFaceAreaPx?: number | null
    refFaceAreaCapPx?: number | null
  } | null
  overlayPng?: string | null
  resolvedDoors?: ResolvedDoorCandidate[]
  boundDoors?: BoundDoor[]
}): string {
  const title = `Deuren fase-1 report — ${params.drawing ?? 'onbekend'}`
  const acceptedStage2 = new Set(params.stage2?.acceptedIds ?? [])
  const angleRescueHyps = params.stage2?.angleRescueAccepted ?? []
  const allHypotheses = [...params.hypotheses, ...angleRescueHyps]
  const refRows =
    params.refBands.length > 0
      ? params.refBands
          .map(
            (ref, index) =>
              `<tr><td>${index + 1}</td><td>${ref.swingWpx}×${ref.swingHpx}</td><td>${ref.aspectRef.toFixed(3)}</td><td>${Math.round(ref.areaPx)}</td><td>${(ref.swingSpanPx ?? 0).toFixed(2)}</td><td>${(ref.framingPx ?? 0).toFixed(2)}</td><td>${(ref.ratioBlade ?? 1).toFixed(3)}</td><td>${Math.round(ref.totalRefPx ?? Math.max(ref.swingWpx, ref.swingHpx))}</td><td>${Math.round(ref.bladeRefPx ?? Math.max(ref.swingWpx, ref.swingHpx))}</td><td>${escapeHtml(ref.kind ?? '-')}</td><td>${escapeHtml(ref.fmlRefId ?? '-')}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="11">Geen draaiboog-refs gevonden.</td></tr>'
  const hypothesisRows =
    allHypotheses.length > 0
      ? allHypotheses
          .map((hyp) => {
            const ref = params.refBands[hyp.matchedRefIndex]
            const boxArea = Math.max(1, hyp.unionBBox.width * hyp.unionBBox.height)
            const candidateFill = hyp.filledAreaPx / boxArea
            const refFill =
              ref != null ? ref.areaPx / Math.max(1, ref.swingWpx * ref.swingHpx) : null
            const stage2Status = params.stage2
              ? acceptedStage2.has(hyp.id)
                ? 'accepted'
                : 'rejected'
              : '-'
            return `<tr><td>${escapeHtml(hyp.id)}</td><td>${hyp.source}</td><td>${hyp.matchedRefIndex + 1}</td><td>${hyp.faceIds.join(', ')}</td><td>${hyp.unionBBox.width}×${hyp.unionBBox.height} @ (${hyp.unionBBox.x}, ${hyp.unionBBox.y})</td><td>${hyp.score.toFixed(3)}</td><td>${hyp.filledAreaPx}</td><td>${candidateFill.toFixed(3)}</td><td>${refFill == null ? '-' : refFill.toFixed(3)}</td><td>${stage2Status}</td></tr>`
          })
          .join('')
      : '<tr><td colspan="10">Geen hypotheses.</td></tr>'
  const diagnostics = params.diagnostics ?? []
  const diagnosticRows =
    diagnostics.length > 0
      ? diagnostics
          .map(
            (row) =>
              `<tr><td>${row.root}</td><td>${row.className}</td><td>${row.bbox.width}×${row.bbox.height}</td><td>${Math.round(row.areaPx)}</td><td>${row.status}</td><td>${row.matchedRefIndex == null ? '-' : row.matchedRefIndex + 1}</td><td>${row.score == null ? '-' : row.score.toFixed(3)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="7">Geen diagnostiek beschikbaar.</td></tr>'

  const fillRejected = params.stage2?.fillRejected ?? []
  const fillRejectedRows =
    fillRejected.length > 0
      ? fillRejected
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.id)}</td><td>${row.faceIds.join(', ')}</td><td>${row.reason}</td><td>${row.candidateFill.toFixed(3)}</td><td>${row.refFill == null ? '-' : row.refFill.toFixed(3)}</td><td>${row.minAllowedFill == null ? '-' : row.minAllowedFill.toFixed(3)}</td><td>${row.maxAllowedFill == null ? '-' : row.maxAllowedFill.toFixed(3)}</td><td>${row.unionBBox.width}×${row.unionBBox.height}</td><td>${row.filledAreaPx}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="9">Geen fill-rejects.</td></tr>'

  const surroundRejected = params.stage2?.surroundRejected ?? []
  const surroundRejectedRows =
    surroundRejected.length > 0
      ? surroundRejected
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.id)}</td><td>${row.faceIds.join(', ')}</td><td>${row.reason}</td><td>${row.unionBBox.width}×${row.unionBBox.height} @ (${row.unionBBox.x}, ${row.unionBBox.y})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4">Geen surround-rejects.</td></tr>'

  const wallTouchRejected = params.stage2?.wallTouchRejected ?? []
  const wallTouchRejectedRows =
    wallTouchRejected.length > 0
      ? wallTouchRejected
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.id)}</td><td>${row.faceIds.join(', ')}</td><td>${row.reason}</td><td>${row.unionBBox.width}×${row.unionBBox.height} @ (${row.unionBBox.x}, ${row.unionBBox.y})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4">Geen wall-touch rejects.</td></tr>'

  const angleDiags = params.stage2?.angleRescueDiagnostics ?? []
  const angleDiagRows =
    angleDiags.length > 0
      ? angleDiags
          .map(
            (row) =>
              `<tr><td>${row.root}</td><td>${row.status}</td><td>${row.space}</td><td>${row.bbox.width}×${row.bbox.height} @ (${row.bbox.x}, ${row.bbox.y})</td><td>${row.areaPx}</td><td>${row.fill.toFixed(3)}</td><td>${row.depthPx}/${row.depthRefPx}</td><td>${row.longPx}/${row.wallMaxPx}</td><td>${row.matchedRefIndex == null ? '-' : row.matchedRefIndex + 1}</td><td>${row.candidateAngleDeg == null ? '-' : row.candidateAngleDeg.toFixed(1)}</td><td>${row.refAngleDeg == null ? '-' : row.refAngleDeg.toFixed(1)}</td><td>${row.angleDeltaDeg == null ? '-' : row.angleDeltaDeg.toFixed(1)}</td><td>${row.score == null ? '-' : row.score.toFixed(3)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="13">Geen angle-rescue scans (geen height-hits).</td></tr>'

  const resolvedDoors = params.resolvedDoors ?? []
  const resolvedRows =
    resolvedDoors.length > 0
      ? resolvedDoors
          .map(
            (door) =>
              `<tr><td>${escapeHtml(door.id)}</td><td>${door.matchedRefIndex + 1}</td><td>${escapeHtml(door.kind)}</td><td>${escapeHtml(door.fmlRefId)}</td><td>${door.source}</td><td>${door.widthPx.toFixed(2)}</td><td>${door.widthCm.toFixed(2)}</td><td>${door.swingSpanPx.toFixed(2)}</td><td>${door.framingPx.toFixed(2)}</td><td>${door.ratioBlade.toFixed(3)}</td><td>${door.bbox.width}×${door.bbox.height} @ (${door.bbox.x}, ${door.bbox.y})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="11">Geen stage-3 deuren.</td></tr>'
  const boundDoors = params.boundDoors ?? []
  const boundRows =
    boundDoors.length > 0
      ? boundDoors
          .map(
            (door) =>
              `<tr><td>${escapeHtml(door.doorId)}</td><td>${door.segmentIndex}</td><td>${door.junctionAId ?? '-'}</td><td>${door.junctionBId ?? '-'}</td><td>${door.t.toFixed(2)}</td><td>${door.openingAxis}</td><td>${door.outwardSign}</td><td>${door.contactScore.toFixed(3)}</td><td>${door.secondaryContactScore.toFixed(3)}</td><td>${door.snappedBBox.width.toFixed(2)}×${door.snappedBBox.height.toFixed(2)} @ (${door.snappedBBox.x.toFixed(2)}, ${door.snappedBBox.y.toFixed(2)})</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="10">Geen laag-11 muur-snap deuren.</td></tr>'

  const angleRejected = angleDiags.filter((d) => d.status !== 'accepted').length
  const angleAccepted = angleDiags.filter((d) => d.status === 'accepted').length

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
    img { max-width: min(100%, 1200px); border: 1px solid #cbd5e1; border-radius: 8px; }
    pre { background: #0b1020; color: #dbeafe; padding: 10px; border-radius: 8px; overflow: auto; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Deuren stage-1/2/3 — draaiboog candidates + maatvoering</h1>
  <p class="muted">Drawing: <strong>${escapeHtml(params.drawing ?? 'onbekend')}</strong> · Export: ${escapeHtml(params.exportedAtIso)}</p>
  <p class="muted">Schaal: ppmX=${params.pxPerMmX.toFixed(4)} · ppmY=${params.pxPerMmY.toFixed(4)} · muur-as px-band: ${params.sizeBandPx.wallMinPx}-${params.sizeBandPx.wallMaxPx} (diepte uit deur-ref)</p>

  <section class="panel">
    <h2>Samenvatting</h2>
    <p>Hypotheses: <strong>${params.hypotheses.length}</strong> (single ${params.stats.singleAccepted} · cluster ${params.stats.clusterAccepted}) · angle-rescue hyps ${angleRescueHyps.length}</p>
    <p class="muted">roots ${params.stats.rootCount} · seeds ${params.stats.seedCount} · skipped outside ${params.stats.skippedOutsideSeedCount} · skipped out-of-band ${params.stats.skippedOutOfBandCount}</p>
    ${
      params.stage2
        ? `<p class="muted">Stage 2 fill-band: ${params.stage2.minRatio.toFixed(2)}–${params.stage2.maxRatio.toFixed(2)} × ref-fill · accepted ${params.stage2.acceptedIds.length} · rejected ${params.stage2.rejectedCount} (vol ${params.stage2.rejectedTooFull}, leeg ${params.stage2.rejectedTooEmpty}, room-omringd ${params.stage2.rejectedSurroundedByRoom ?? 0}, no-wall ${params.stage2.rejectedNoWallTouch ?? 0}) · angle-rescue ${params.stage2.angleRescueCount ?? 0} (scan accept ${angleAccepted} / reject ${angleRejected})</p>`
        : ''
    }
  </section>

  ${
    params.gapsContext
      ? `<section class="panel">
    <h2>Gaten-context (input voor deuren)</h2>
    <p>demoted ${params.gapsContext.demotedCount} · kept ${params.gapsContext.keptCount}${
      params.gapsContext.oversizedDemotedCount != null
        ? ` · oversized ${params.gapsContext.oversizedDemotedCount}`
        : ''
    }</p>
    <p class="muted">ref max area ${Math.round(params.gapsContext.maxRefFaceAreaPx ?? 0)} px · area cap ${Math.round(params.gapsContext.refFaceAreaCapPx ?? 0)} px</p>
  </section>`
      : ''
  }

  <section class="panel">
    <h2>Ref-bands</h2>
    <table>
      <thead><tr><th>#</th><th>swing bbox (px)</th><th>aspectRef</th><th>areaPx</th><th>swingSpanPx</th><th>framingPx</th><th>ratioBlade</th><th>totalRefPx</th><th>bladeRefPx</th><th>kind</th><th>fmlRefId</th></tr></thead>
      <tbody>${refRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Hypotheses (stage1 + angle-rescue)</h2>
    <table>
      <thead><tr><th>id</th><th>source</th><th>ref</th><th>faceIds</th><th>unionBBox</th><th>score</th><th>filledPx</th><th>candidateFill</th><th>refFill</th><th>stage2</th></tr></thead>
      <tbody>${hypothesisRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 2 — fill rejects (reden)</h2>
    <table>
      <thead><tr><th>id</th><th>faceIds</th><th>reason</th><th>candidateFill</th><th>refFill</th><th>min</th><th>max</th><th>bbox</th><th>filledPx</th></tr></thead>
      <tbody>${fillRejectedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 2 — surround rejects (reden)</h2>
    <table>
      <thead><tr><th>id</th><th>faceIds</th><th>reason</th><th>unionBBox</th></tr></thead>
      <tbody>${surroundRejectedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 2 — wall-touch rejects (reden)</h2>
    <table>
      <thead><tr><th>id</th><th>faceIds</th><th>reason</th><th>unionBBox</th></tr></thead>
      <tbody>${wallTouchRejectedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 2 — angle-rescue diagnostics</h2>
    <p class="muted">Alleen faces die de hoogte-gate (±20% diepte, ink|white) haalden. Hoek op white. Status: accepted / rejected_too_long / rejected_fill_cap / rejected_no_hinge / rejected_angle_mismatch.</p>
    <table>
      <thead><tr><th>root</th><th>status</th><th>space</th><th>bbox</th><th>area</th><th>fill</th><th>depth/ref</th><th>long/max</th><th>ref</th><th>cand°</th><th>ref°</th><th>Δ°</th><th>score</th></tr></thead>
      <tbody>${angleDiagRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Dropped / diagnostics per root (stage 1)</h2>
    <table>
      <thead><tr><th>root</th><th>class</th><th>bbox</th><th>area</th><th>status</th><th>ref</th><th>score</th></tr></thead>
      <tbody>${diagnosticRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Stage 3 — resolved deurenlijst</h2>
    <table>
      <thead><tr><th>id</th><th>ref</th><th>kind</th><th>fmlRefId</th><th>source</th><th>widthPx</th><th>widthCm</th><th>swingSpanPx</th><th>framingPx</th><th>ratioBlade</th><th>bbox</th></tr></thead>
      <tbody>${resolvedRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Laag 11 — muur-snap</h2>
    <table>
      <thead><tr><th>doorId</th><th>segmentIndex</th><th>junctionA</th><th>junctionB</th><th>t</th><th>axis</th><th>sign</th><th>contact</th><th>second</th><th>snappedBBox</th></tr></thead>
      <tbody>${boundRows}</tbody>
    </table>
  </section>

  ${
    params.overlayPng
      ? `<section class="panel"><h2>Overlay</h2><img src="${params.overlayPng}" alt="Deuren fase-1 overlay" /></section>`
      : ''
  }

  <section class="panel">
    <h2>JSON</h2>
    <pre>${formatJson({
      drawing: params.drawing,
      exportedAtIso: params.exportedAtIso,
      scale: { pxPerMmX: params.pxPerMmX, pxPerMmY: params.pxPerMmY },
      sizeBandPx: params.sizeBandPx,
      refBands: params.refBands,
      stats: params.stats,
      hypotheses: params.hypotheses,
      diagnostics,
      stage2: params.stage2 ?? null,
      resolvedDoors,
      boundDoors,
      gapsContext: params.gapsContext,
    })}</pre>
  </section>
</body>
</html>`
}
