import { escapeHtml, formatJson } from './examples-report-html-utils'

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
}

export type DiagnosisReportPayload = {
  meta: DiagnosisReportMeta
  /** Effective or base wall B/W as PNG data-URL. */
  bwPng: string | null
  /** Live reference boxes (no OpenCV re-analysis). */
  references: unknown | null
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
    l10SemanticWalls: unknown | null
    l12OrientedDoors: unknown[] | null
    l14BoundWindows: unknown[] | null
  }
  fmlText: string | null
  previewPlan: unknown | null
}

function unavailable(label: string): string {
  return `<p class="muted">${escapeHtml(label)}: nog niet beschikbaar.</p>`
}

function section(id: string, title: string, body: string): string {
  return `<section id="${escapeHtml(id)}" class="diag-section">
  <h2>${escapeHtml(title)}</h2>
  ${body}
</section>`
}

function jsonBlock(value: unknown, emptyLabel: string): string {
  if (value == null) return unavailable(emptyLabel)
  if (Array.isArray(value) && value.length === 0) {
    return `<p class="muted">${escapeHtml(emptyLabel)}: leeg.</p>`
  }
  return `<details open>
  <summary>JSON</summary>
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
    ['App version', meta.appVersion ?? '—'],
  ]
  return `<dl class="meta">
${rows.map(([k, v]) => `  <dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('\n')}
</dl>`
}

function figureBw(png: string | null): string {
  if (!png) return unavailable('B/W onderlegger')
  return `<figure class="bw-figure">
  <img src="${png}" alt="B/W wall underlay" />
  <figcaption>Effective / base wall B/W</figcaption>
</figure>`
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
)}`
}

function layersBody(layers: DiagnosisReportPayload['layers']): string {
  const parts: string[] = []
  parts.push('<h3>L10 — semantic walls</h3>')
  parts.push(
    layers.l10SemanticWalls
      ? jsonBlock(layers.l10SemanticWalls, 'L10')
      : unavailable('L10 semantic walls'),
  )
  parts.push('<h3>L12 — oriented doors</h3>')
  parts.push(
    layers.l12OrientedDoors
      ? jsonBlock(layers.l12OrientedDoors, 'L12')
      : unavailable('L12 oriented doors'),
  )
  parts.push('<h3>L14 — bound windows</h3>')
  parts.push(
    layers.l14BoundWindows
      ? jsonBlock(layers.l14BoundWindows, 'L14')
      : unavailable('L14 bound windows'),
  )
  return parts.join('\n')
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
  <a href="#bw">B/W</a>
  <a href="#refs">Referenties</a>
  <a href="#doors">Deuren</a>
  <a href="#windows">Ramen</a>
  <a href="#layers">Lagen</a>
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
    pre.json { overflow: auto; max-height: 480px; padding: 12px; background: #0f172a; color: #e2e8f0; border-radius: 8px; font-size: 12px; }
    details { margin-top: 8px; }
    summary { cursor: pointer; font-size: 13px; color: #334155; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Best-effort live snapshot. Missing sections mean that step was not finished yet — not an export error.</p>
  ${toc}
  ${section('meta', 'Meta', metaList(payload.meta))}
  ${section('bw', 'B/W onderlegger', figureBw(payload.bwPng))}
  ${section(
    'refs',
    'Referenties',
    payload.references != null
      ? jsonBlock(payload.references, 'Referenties')
      : unavailable('Referenties'),
  )}
  ${section('doors', 'Deuren', doorsBody(payload.doors))}
  ${section('windows', 'Ramen', windowsBody(payload.windows))}
  ${section('layers', 'Lagen (L10 / L12 / L14)', layersBody(payload.layers))}
  ${section('fml', 'FML', fmlBody(payload.fmlText, payload.previewPlan))}
</body>
</html>`
}
