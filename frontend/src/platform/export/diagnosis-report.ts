import { escapeHtml, formatJson } from './examples-report-html-utils'
import type { LayerDebugReport, LayerDebugWallTransition } from './layer-debug-report/types'

export type DiagnosisReportMeta = {
  exportedAtIso: string
  projectName: string | null
  floorId: string | null
  floorName: string | null
  floorLevel: number | null
  imageName: string | null
  flowStep: string | null
  pxPerMmX: number | null
  pxPerMmY: number | null
  appVersion: string | null
  /** Stap-1 working underlay size (after rotation/crop/gum), if available. */
  originalWidth?: number | null
  originalHeight?: number | null
}

/** REF end-result image for diagnosis (wall face-overlay or opening grouped contours). */
export type DiagnosisRefImage = {
  id: string
  kind: 'wall' | 'door' | 'window'
  wallThicknessBand?: 'min' | 'mid' | 'max'
  /** PNG data-URL */
  png: string
  /** Which pipeline image this is. */
  imageKind: 'faceOverlay' | 'groupedPolygonClean' | 'straightened' | 'bwCrop'
}

/** @deprecated Use DiagnosisRefImage */
export type DiagnosisRefGroupedContour = DiagnosisRefImage & {
  kind: 'door' | 'window'
  groupedPolygonCleanPng?: string
}

export type DiagnosisReportPayload = {
  meta: DiagnosisReportMeta
  /**
   * Stap-1 colour underlay (rotation/crop/gum baked) as JPEG/PNG data-URL.
   * JPEG is used at export to keep the HTML shareable.
   */
  originalPng: string | null
  /** Effective or base wall B/W as PNG data-URL. */
  bwPng: string | null
  /** Live reference boxes (rect metadata). */
  references: unknown | null
  /**
   * REF end-result images: wall face-overlay (+ band) and opening
   * «Gegroepeerde contouren los».
   */
  referenceRefImages: DiagnosisRefImage[] | null
  /** @deprecated Prefer referenceRefImages */
  referenceGroupedContours?: DiagnosisRefImage[] | null
  doors: {
    resolved: unknown[]
    bound: unknown[]
    oriented: unknown[]
  } | null
  windows: {
    resolved: unknown[]
    bound: unknown[]
    bindRejections: unknown[]
    axelStage: string | null
  } | null
  layers: {
    /**
     * Full wall pipeline L1–L10 + wallTransitions + L11/L12/L14 openings
     * (same payload as the dedicated layer-debug export).
     */
    layerDebug: LayerDebugReport | null
    /** Semantic graph with thickness (FML source; not identical to layer10). */
    semanticWallGraph: unknown | null
  }
  /** Human-readable layer-debug markdown (when layerDebug is present). */
  layerDebugMarkdown: string | null
  fmlText: string | null
  previewPlan: unknown | null
}

const WALL_LAYER_KEYS = [
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
] as const

function unavailable(label: string): string {
  return `<p class="muted">${escapeHtml(label)}: nog niet beschikbaar.</p>`
}

function section(id: string, title: string, body: string): string {
  return `<section id="${escapeHtml(id)}" class="diag-section">
  <h2>${escapeHtml(title)}</h2>
  ${body}
</section>`
}

function jsonBlock(
  value: unknown,
  emptyLabel: string,
  opts?: { open?: boolean; summary?: string },
): string {
  if (value == null) return unavailable(emptyLabel)
  if (Array.isArray(value) && value.length === 0) {
    return `<p class="muted">${escapeHtml(emptyLabel)}: leeg.</p>`
  }
  const openAttr = opts?.open === false ? '' : ' open'
  const summary = opts?.summary ?? 'JSON'
  return `<details${openAttr}>
  <summary>${escapeHtml(summary)}</summary>
  <pre class="json">${formatJson(value)}</pre>
</details>`
}

function metaList(meta: DiagnosisReportMeta): string {
  const rows: Array<[string, string]> = [
    ['Exported at', meta.exportedAtIso],
    ['Project', meta.projectName ?? '—'],
    ['Floor', meta.floorName ?? meta.floorId ?? '—'],
    ['Floor level', meta.floorLevel == null ? '—' : String(meta.floorLevel)],
    ['Image', meta.imageName ?? '—'],
    ['Flow step', meta.flowStep ?? '—'],
    [
      'Scale px/mm',
      meta.pxPerMmX != null && meta.pxPerMmY != null
        ? `${meta.pxPerMmX.toFixed(4)} × ${meta.pxPerMmY.toFixed(4)}`
        : '—',
    ],
    [
      'Original size',
      meta.originalWidth != null && meta.originalHeight != null
        ? `${meta.originalWidth} × ${meta.originalHeight} px`
        : '—',
    ],
    ['App version', meta.appVersion ?? '—'],
  ]
  return `<dl class="meta">
${rows.map(([k, v]) => `  <dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('\n')}
</dl>`
}

function figureUnderlay(
  png: string | null,
  emptyLabel: string,
  alt: string,
  caption: string,
): string {
  if (!png) return unavailable(emptyLabel)
  return `<figure class="bw-figure">
  <img src="${png}" alt="${escapeHtml(alt)}" />
  <figcaption>${escapeHtml(caption)}</figcaption>
</figure>`
}

function figureOriginal(png: string | null, meta: DiagnosisReportMeta): string {
  const size =
    meta.originalWidth != null && meta.originalHeight != null
      ? ` · ${meta.originalWidth}×${meta.originalHeight} px`
      : ''
  return figureUnderlay(
    png,
    'Originele onderlegger',
    'Step 1 colour underlay',
    `Stap 1 kleur-onderlegger (na rotatie/crop/gum; JPEG volle resolutie)${size}`,
  )
}

function figureBw(png: string | null): string {
  return figureUnderlay(
    png,
    'B/W onderlegger',
    'B/W wall underlay',
    'Stap 2 effective / base wall B/W',
  )
}

function referencesBody(references: unknown | null, refImages: DiagnosisRefImage[] | null): string {
  const parts: string[] = []
  if (refImages && refImages.length > 0) {
    parts.push(
      '<p class="muted">REF-eindbeelden: muur = face-overlay (buiten grijs); deur/raam = «Gegroepeerde contouren los» (wit: cyaan=as, oranje=boven, roze=onder).</p>',
    )
    parts.push(
      `<div class="ref-img-grid">${refImages
        .map((item) => {
          const band =
            item.kind === 'wall' && item.wallThicknessBand
              ? ` · ${escapeHtml(item.wallThicknessBand)}`
              : ''
          const kindLabel = item.kind === 'wall' ? 'wall' : item.kind === 'door' ? 'door' : 'window'
          const imageHint =
            item.imageKind === 'groupedPolygonClean'
              ? 'contouren'
              : item.imageKind === 'faceOverlay'
                ? 'face-overlay'
                : item.imageKind
          return `<figure class="ref-contour-figure">
  <img src="${item.png}" alt="REF ${escapeHtml(kindLabel)} ${escapeHtml(item.id)}" />
  <figcaption>${escapeHtml(kindLabel)}${band} · ${escapeHtml(item.id)} · ${escapeHtml(imageHint)}</figcaption>
</figure>`
        })
        .join('\n')}</div>`,
    )
  } else if (references != null) {
    parts.push(
      unavailable('REF-beelden (geen muur/deur/raam-REF of ontleding leverde geen beelden)'),
    )
  }
  if (references != null) {
    parts.push(jsonBlock(references, 'Referenties', { open: false, summary: 'REF-vakken JSON' }))
  } else {
    parts.push(unavailable('Referenties'))
  }
  return parts.join('\n')
}

function doorsBody(doors: DiagnosisReportPayload['doors']): string {
  if (!doors) return unavailable('Deuren')
  const counts = `resolved ${doors.resolved.length} · bound ${doors.bound.length} · oriented (L12) ${doors.oriented.length}`
  return `<p class="muted">${escapeHtml(counts)}</p>
${jsonBlock(
  {
    resolved: doors.resolved,
    bound: doors.bound,
    oriented: doors.oriented,
  },
  'Deuren',
  { open: false },
)}`
}

function windowsBody(windows: DiagnosisReportPayload['windows']): string {
  if (!windows) return unavailable('Ramen')
  const counts = `resolved ${windows.resolved.length} · bound (L14) ${windows.bound.length} · bind rejections ${windows.bindRejections.length} · axel stage ${windows.axelStage ?? '—'}`
  return `<p class="muted">${escapeHtml(counts)}</p>
${jsonBlock(
  {
    resolved: windows.resolved,
    bound: windows.bound,
    bindRejections: windows.bindRejections,
    axelStage: windows.axelStage,
  },
  'Ramen',
  { open: false },
)}`
}

function shortLayerKey(key: string): string {
  return key.replace(/^layer/, 'L')
}

function layerCountRow(
  key: (typeof WALL_LAYER_KEYS)[number],
  report: LayerDebugReport,
): { key: string; segments: number | null; junctions: number | null } {
  const layer = report.layers[key]
  return {
    key: shortLayerKey(key),
    segments: layer ? layer.segments.length : null,
    junctions: layer ? layer.junctions.length : null,
  }
}

function wallLayerCountsTable(report: LayerDebugReport): string {
  const rows = WALL_LAYER_KEYS.map((key) => layerCountRow(key, report))
  const body = rows
    .map((row) => {
      const seg = row.segments == null ? '—' : String(row.segments)
      const junc = row.junctions == null ? '—' : String(row.junctions)
      return `  <tr><td>${escapeHtml(row.key)}</td><td>${seg}</td><td>${junc}</td></tr>`
    })
    .join('\n')
  return `<table class="diag-table">
  <thead><tr><th>Laag</th><th>Segmenten</th><th>Junctions</th></tr></thead>
  <tbody>
${body}
  </tbody>
</table>`
}

function wallTransitionsTable(transitions: LayerDebugWallTransition[]): string {
  if (transitions.length === 0) return ''
  const body = transitions
    .map((t) => {
      const s = t.summary
      return `  <tr>
    <td>${escapeHtml(shortLayerKey(t.from))}→${escapeHtml(shortLayerKey(t.to))}</td>
    <td>${s.prevSegmentCount}→${s.nextSegmentCount}</td>
    <td>${s.kept}</td>
    <td>${s.moved}</td>
    <td>${s.merged}</td>
    <td>${s.dropped}</td>
    <td>${s.added}</td>
    <td>${s.junctionDropped}</td>
    <td>${s.junctionAdded}</td>
    <td>${s.junctionShifted}</td>
  </tr>`
    })
    .join('\n')
  return `<h3>Wall transitions</h3>
<table class="diag-table">
  <thead><tr>
    <th>Overgang</th><th>prev→next</th><th>kept</th><th>moved</th><th>merged</th>
    <th>dropped</th><th>added</th><th>junc↓</th><th>junc↑</th><th>junc↔</th>
  </tr></thead>
  <tbody>
${body}
  </tbody>
</table>
${jsonBlock(transitions, 'Wall transitions detail', {
  open: false,
  summary: 'Transition detail JSON (dropped segments/junctions)',
})}`
}

function openingsSummaryBlock(report: LayerDebugReport): string {
  const os = report.openingsSummary
  if (!os) return ''
  const bits: string[] = []
  if (os.layer11) {
    bits.push(`L11 bound ${os.layer11.bound} · unbound ${os.layer11.unbound}`)
  }
  if (os.layer12) {
    bits.push(`L12 oriented ${os.layer12.oriented} · skipped ${os.layer12.skipped}`)
  }
  if (os.layer14) {
    bits.push(`L14 bound ${os.layer14.bound} · rejected ${os.layer14.rejected}`)
  }
  if (bits.length === 0) return ''
  return `<p class="muted">${escapeHtml(bits.join(' · '))}</p>`
}

function layersBody(
  layers: DiagnosisReportPayload['layers'],
  layerDebugMarkdown: string | null,
): string {
  const parts: string[] = []
  const report = layers.layerDebug

  if (!report) {
    parts.push(unavailable('Pipeline lagen L1–L10 (finalize muren eerst)'))
  } else {
    const summaryBits = [
      `pipeline ${report.pipelineVersion}`,
      report.roomPipelinePhase ? `phase ${report.roomPipelinePhase}` : null,
      report.summary?.completedThroughLayer != null
        ? `through L${report.summary.completedThroughLayer}`
        : null,
      report.summary?.fmlReady != null ? `fmlReady=${report.summary.fmlReady}` : null,
      report.journal?.degraded ? 'journal degraded' : null,
    ].filter(Boolean)
    parts.push(`<p class="muted">${escapeHtml(summaryBits.join(' · '))}</p>`)
    parts.push('<h3>L1–L10 counts</h3>')
    parts.push(wallLayerCountsTable(report))
    if (report.wallTransitions && report.wallTransitions.length > 0) {
      parts.push(wallTransitionsTable(report.wallTransitions))
    }

    parts.push('<h3>Per-laag geometrie (L1–L10)</h3>')
    parts.push(
      '<p class="muted">Lagen staan dichtgeklapt — open de laag die je wilt inspecteren. L10 = laatste wall-pipeline vóór semantic/FML.</p>',
    )
    for (const key of WALL_LAYER_KEYS) {
      const layer = report.layers[key]
      const label = shortLayerKey(key)
      if (!layer) {
        parts.push(`<p class="muted">${escapeHtml(label)}: ontbreekt.</p>`)
        continue
      }
      const open = key === 'layer10'
      parts.push(
        jsonBlock(layer, label, {
          open,
          summary: `${label} — ${layer.segments.length} segments · ${layer.junctions.length} junctions`,
        }),
      )
    }

    parts.push('<h3>Openingen L11 / L12 / L14</h3>')
    parts.push(openingsSummaryBlock(report))
    if (report.openings?.layer11) {
      parts.push(
        jsonBlock(report.openings.layer11, 'L11', {
          open: false,
          summary: `L11 bound/unbound — ${report.openings.layer11.bound.length} bound · ${report.openings.layer11.unbound.length} unbound`,
        }),
      )
    } else {
      parts.push(unavailable('L11'))
    }
    if (report.openings?.layer12) {
      parts.push(
        jsonBlock(report.openings.layer12, 'L12', {
          open: false,
          summary: `L12 oriented/skipped — ${report.openings.layer12.oriented.length} oriented · ${report.openings.layer12.skipped.length} skipped`,
        }),
      )
    } else {
      parts.push(unavailable('L12'))
    }
    if (report.openings?.layer14) {
      parts.push(
        jsonBlock(report.openings.layer14, 'L14', {
          open: false,
          summary: `L14 bound/rejected — ${report.openings.layer14.bound.length} bound · ${report.openings.layer14.rejected.length} rejected`,
        }),
      )
    } else {
      parts.push(unavailable('L14'))
    }

    if (report.summary) {
      parts.push('<h3>Pipeline summary</h3>')
      parts.push(jsonBlock(report.summary, 'Pipeline summary', { open: false }))
    }
    if (report.journal) {
      parts.push('<h3>Escalation journal</h3>')
      parts.push(jsonBlock(report.journal, 'Journal', { open: false }))
    }
    parts.push('<h3>Volledige layer-debug JSON</h3>')
    parts.push(
      jsonBlock(report, 'layer-debug', {
        open: false,
        summary: 'Complete layer-debug report (zelfde als *-layer-debug.json)',
      }),
    )
  }

  parts.push('<h3>Semantic wall graph (FML-bron, met dikte)</h3>')
  parts.push(semanticThicknessSummaryHtml(layers.semanticWallGraph))
  parts.push(
    layers.semanticWallGraph
      ? jsonBlock(layers.semanticWallGraph, 'Semantic walls', {
          open: false,
          summary: 'semanticWallGraph segments/junctions/meta',
        })
      : unavailable('Semantic wall graph'),
  )

  if (layerDebugMarkdown) {
    parts.push('<h3>Layer-debug markdown</h3>')
    parts.push(`<details>
  <summary>Leesbare samenvatting (markdown)</summary>
  <pre class="json">${escapeHtml(layerDebugMarkdown)}</pre>
</details>`)
  }

  return parts.join('\n')
}

function semanticThicknessSummaryHtml(graph: unknown | null): string {
  if (!graph || typeof graph !== 'object') return ''
  const segments = (graph as { segments?: unknown }).segments
  if (!Array.isArray(segments) || segments.length === 0) return ''
  const rows: string[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i] as {
      thicknessPxMax?: number
      thicknessPxTypical?: number
      thicknessPxP90?: number
      balancePx?: number
      facePlusPx?: number
      faceMinusPx?: number
      a?: { x: number; y: number }
      b?: { x: number; y: number }
    }
    const len = seg.a && seg.b ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) : Number.NaN
    rows.push(
      `<tr>
        <td>${i}</td>
        <td>${Number.isFinite(len) ? len.toFixed(1) : '—'}</td>
        <td>${fmtPx(seg.thicknessPxTypical)}</td>
        <td>${fmtPx(seg.thicknessPxMax)}</td>
        <td>${fmtPx(seg.thicknessPxP90)}</td>
        <td>${fmtPx(seg.facePlusPx)}</td>
        <td>${fmtPx(seg.faceMinusPx)}</td>
        <td>${seg.balancePx != null && Number.isFinite(seg.balancePx) ? seg.balancePx.toFixed(2) : '—'}</td>
      </tr>`,
    )
  }
  return `<details open>
  <summary>Dikte-samenvatting (typical / max / p90 / faces) — ${segments.length} segmenten</summary>
  <table class="meta">
    <thead><tr>
      <th>#</th><th>len px</th><th>typical</th><th>max</th><th>p90</th>
      <th>face+</th><th>face−</th><th>balance</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</details>`
}

function fmtPx(value: number | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : '—'
}

function fmlBody(fmlText: string | null, previewPlan: unknown | null): string {
  if (!fmlText && previewPlan == null) return unavailable('FML')
  const parts: string[] = []
  if (fmlText) {
    parts.push(`<details open>
  <summary>Generated FML text</summary>
  <pre class="json">${escapeHtml(fmlText)}</pre>
</details>`)
  }
  if (previewPlan != null) {
    parts.push(`<details>
  <summary>previewPlan JSON</summary>
  <pre class="json">${formatJson(previewPlan)}</pre>
</details>`)
  }
  return parts.join('\n')
}

/** Self-contained HTML diagnosis package for support (live workspace snapshot). */
export function buildDiagnosisReportHtml(payload: DiagnosisReportPayload): string {
  const title = `BouwToFML diagnosis — ${payload.meta.projectName ?? payload.meta.imageName ?? 'untitled'}`
  const toc = `<nav class="toc">
  <a href="#meta">Meta</a>
  <a href="#original">Origineel</a>
  <a href="#bw">B/W</a>
  <a href="#refs">Referenties</a>
  <a href="#doors">Deuren</a>
  <a href="#windows">Ramen</a>
  <a href="#layers">Lagen L1–L14</a>
  <a href="#fml">FML</a>
</nav>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #0f172a; background: #f8fafc; line-height: 1.45; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    h3 { margin: 16px 0 8px; font-size: 15px; }
    .muted { color: #64748b; font-size: 13px; }
    .toc { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 12px 0 24px; padding: 10px 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
    .toc a { color: #2563eb; text-decoration: none; font-size: 13px; }
    .diag-section { margin: 0 0 28px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }
    .meta { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; margin: 0; }
    .meta dt { color: #64748b; font-size: 13px; }
    .meta dd { margin: 0; font-size: 13px; }
    .bw-figure { margin: 0; }
    .bw-figure img { max-width: min(100%, 960px); height: auto; border: 1px solid #e2e8f0; background: #fff; }
    .bw-figure figcaption { margin-top: 6px; font-size: 12px; color: #64748b; }
    .ref-img-grid { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0 12px; }
    .ref-contour-figure { margin: 0; max-width: min(100%, 420px); }
    .ref-contour-figure img { display: block; max-width: 100%; height: auto; border: 1px solid #e2e8f0; background: #fff; }
    .ref-contour-figure figcaption { margin-top: 6px; font-size: 12px; color: #64748b; }
    .diag-table { border-collapse: collapse; font-size: 12px; margin: 8px 0 12px; background: #fff; }
    .diag-table th, .diag-table td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
    .diag-table th { background: #f1f5f9; color: #334155; font-weight: 600; }
    .diag-table td { font-variant-numeric: tabular-nums; }
    pre.json { overflow: auto; max-height: 480px; padding: 12px; background: #0f172a; color: #e2e8f0; border-radius: 8px; font-size: 12px; }
    details { margin-top: 8px; }
    summary { cursor: pointer; font-size: 13px; color: #334155; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Best-effort live snapshot. Missing sections mean that step was not finished yet — not an export error. Wall layers include the full L1–L10 pipeline (not only L10). Origineel = stap 1 kleur-scan; B/W = stap 2 muur-onderlegger.</p>
  ${toc}
  ${section('meta', 'Meta', metaList(payload.meta))}
  ${section('original', 'Originele onderlegger (stap 1)', figureOriginal(payload.originalPng, payload.meta))}
  ${section('bw', 'B/W onderlegger', figureBw(payload.bwPng))}
  ${section(
    'refs',
    'Referenties',
    referencesBody(
      payload.references,
      payload.referenceRefImages ?? payload.referenceGroupedContours ?? null,
    ),
  )}
  ${section('doors', 'Deuren', doorsBody(payload.doors))}
  ${section('windows', 'Ramen', windowsBody(payload.windows))}
  ${section(
    'layers',
    'Lagen (L1–L10 + L11/L12/L14)',
    layersBody(payload.layers, payload.layerDebugMarkdown),
  )}
  ${section('fml', 'FML', fmlBody(payload.fmlText, payload.previewPlan))}
</body>
</html>`
}
