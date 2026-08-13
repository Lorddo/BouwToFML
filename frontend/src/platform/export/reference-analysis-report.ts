import { escapeHtml, formatJson } from './examples-report-html-utils'
import {
  aggregateGeneralCategoryMetrics,
  type UnitGeneralCategoryMetrics,
} from '@/cv/refs/ref-general-categories'
import type {
  KozijnFaceMetrics,
  OpeningRefProfile,
  OpeningRefUnitProfile,
  ReferenceAnalysisReport,
  WallRefProfile,
} from '@/cv/refs/types'

function figure(png: string | undefined, caption: string): string {
  if (!png) return ''
  return `<figure><img src="${png}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`
}

function fmtPx(value: number): string {
  return `${value.toFixed(1)}px`
}

function fmtPx2(value: number): string {
  return `${value.toFixed(1)}px²`
}

function rangeLine(label: string, values: number[], unit: 'px' | 'px²' | ''): string {
  if (values.length === 0) {
    return `<p class="muted">${escapeHtml(label)}: niet aanwezig (kopeinde vereist)</p>`
  }
  const fmt = unit === 'px²' ? fmtPx2 : unit === 'px' ? fmtPx : (v: number) => `${v}`
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`
  return `<p class="muted">${escapeHtml(label)}: ${spread}</p>`
}

function kozijnMetricLines(title: string, faces: KozijnFaceMetrics[]): string {
  if (faces.length === 0) {
    return `<p class="muted">${escapeHtml(title)}: niet aanwezig (kopeinde vereist)</p>`
  }
  const widths = faces.map((f) => f.widthPx)
  const heights = faces.map((f) => f.heightPx)
  const areas = faces.map((f) => f.areaPx)
  return `<p class="muted">${escapeHtml(title)}: breedte ${fmtPx(Math.min(...widths))}–${fmtPx(Math.max(...widths))} · hoogte ${fmtPx(Math.min(...heights))}–${fmtPx(Math.max(...heights))} · opp ${fmtPx2(Math.min(...areas))}–${fmtPx2(Math.max(...areas))}</p>`
}

function buildGeneralCategoriesSection(report: ReferenceAnalysisReport): string {
  const unitMetrics: UnitGeneralCategoryMetrics[] = report.openings.flatMap((opening) =>
    opening.units.map((unit) => ({
      kopeinde: unit.primitives.kopeinde,
      kozijnLinks: unit.primitives.kozijnLinks,
      kozijnRechts: unit.primitives.kozijnRechts,
      kozijnTotaalOppervlakPx: unit.primitives.kozijnTotaalOppervlakPx,
      draaicirkel: opening.kind === 'door' ? (unit.primitives.draaicirkel ?? false) : null,
      middenlijn:
        opening.kind === 'door' && unit.primitives.draaicirkel === false
          ? (unit.primitives.middenlijn ?? false)
          : undefined,
      middenlijnSpanPx:
        opening.kind === 'door' && unit.primitives.draaicirkel === false
          ? (unit.primitives.middenlijnSpanPx ?? null)
          : undefined,
    })),
  )
  const agg = aggregateGeneralCategoryMetrics(unitMetrics)

  return `<article class="ref-card summary">
    <h2>Algemene categorieën</h2>
    <p class="muted">Bron: <strong>wit vlak</strong> op rechte face-crop (zelfde als figuur «Rechte face-crop»). Maten = bbox + hart (centroid). Eenheid: px op rechte face-crop.</p>
    ${kozijnMetricLines('Kozijn links (meest linkse vlak)', agg.kozijnLinks)}
    ${kozijnMetricLines('Kozijn rechts (meest rechtse vlak)', agg.kozijnRechts)}
    ${rangeLine('Kozijn totaal oppervlak (links + rechts)', agg.kozijnTotaalOppervlakPx, 'px²')}
    <p class="muted">Draaicirkel aanwezig: ja=${agg.draaicirkelJa} · nee=${agg.draaicirkelNee}</p>
    <p class="muted">Middenlijn (deur zonder draaicirkel): ja=${agg.middenlijnJa} · nee=${agg.middenlijnNee}</p>
  </article>`
}

function imageGrid(
  images: {
    originalCropPng: string
    bwCropPng: string
    faceOverlayPng: string
    faceCropPng: string
    lineOverlayPng: string
    straightenedPng: string
    facePolygonOverlayPng?: string
    combinedPolygonOverlayPng?: string
    groupedPolygonCleanPng?: string
    swingHingeOverlayPng?: string
  },
  bwCaption = 'B/W',
): string {
  return `<div class="img-grid">
    ${figure(images.originalCropPng, 'Originele crop')}
    ${figure(images.bwCropPng, bwCaption)}
    ${figure(images.faceOverlayPng, 'Vlakken (buiten grijs)')}
    ${figure(images.faceCropPng, 'Face-crop (alleen gesloten vlakken + omringende inkt)')}
    ${figure(images.lineOverlayPng, 'Vectorlijnen (raw op face-crop)')}
    ${figure(images.straightenedPng, 'Rechte face-crop (zonder lijnen)')}
    ${figure(images.facePolygonOverlayPng, 'Face-polygonen (per vlak, interior/head)')}
    ${figure(images.combinedPolygonOverlayPng, 'Gegroepeerde contouren op faces')}
    ${figure(images.groupedPolygonCleanPng, 'Gegroepeerde contouren los (wit: cyaan=as, oranje=boven, roze=onder)')}
    ${figure(images.swingHingeOverlayPng, 'Scharnierpunt (assen + groene cirkel)')}
  </div>`
}

const GROUPED_ZONE_STROKE: Record<string, string> = {
  on_axis: '#06b6d4',
  above: '#f59e0b',
  below: '#ec4899',
}

function renderUnitFacePolygonFigure(unit: OpeningRefUnitProfile): string {
  const facePolygons = unit.facePolygons ?? []
  if (facePolygons.length === 0) {
    return '<p class="muted">Face-polygonen: geen interior/head-vlakken voor deze unit.</p>'
  }
  const bbox = unit.unit.bbox
  const viewW = Math.max(1, Math.round(bbox.width))
  const viewH = Math.max(1, Math.round(bbox.height))
  const polygons = facePolygons
    .map((face, index) => {
      const hue = (face.label * 57 + index * 17) % 360
      const points = face.approxPolygon
        .map((point) => `${(point.x - bbox.x).toFixed(1)},${(point.y - bbox.y).toFixed(1)}`)
        .join(' ')
      return `<polygon points="${points}" fill="none" stroke="hsl(${hue} 80% 45%)" stroke-width="1.5" />`
    })
    .join('')
  return `<figure>
    <svg viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Face-polygonen unit ${unit.unit.index}">
      <rect x="0" y="0" width="${viewW}" height="${viewH}" fill="#fff" />
      ${polygons}
    </svg>
    <figcaption>Face-polygonen unit #${unit.unit.index} (${facePolygons.length})</figcaption>
  </figure>`
}

function renderGroupedFacePolygonFigure(opening: OpeningRefProfile): string {
  const parts = opening.combinedFacePolygonParts ?? []
  const usable = parts.filter((part) => part.polygon.length >= 3)
  if (usable.length === 0) {
    return '<p class="muted">Gegroepeerde contouren: geen kopeinde-as-delen.</p>'
  }
  const viewW = Math.max(1, opening.cropWidth)
  const viewH = Math.max(1, opening.cropHeight)
  const polygons = usable
    .map((part) => {
      const stroke = GROUPED_ZONE_STROKE[part.zone] ?? '#06b6d4'
      const points = part.polygon
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' ')
      return `<polygon points="${points}" fill="none" stroke="${stroke}" stroke-width="1.5" />`
    })
    .join('')
  const counts = {
    on_axis: usable.filter((p) => p.zone === 'on_axis').length,
    above: usable.filter((p) => p.zone === 'above').length,
    below: usable.filter((p) => p.zone === 'below').length,
  }
  return `<figure>
    <svg viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gegroepeerde kopeinde-as contouren">
      <rect x="0" y="0" width="${viewW}" height="${viewH}" fill="#fff" />
      ${polygons}
    </svg>
    <figcaption>Gegroepeerde contouren los (as=${counts.on_axis} · boven=${counts.above} · onder=${counts.below})</figcaption>
  </figure>`
}

function unitBlock(unit: OpeningRefUnitProfile, kind: 'door' | 'window'): string {
  const prim = unit.primitives
  const facePolygons = unit.facePolygons ?? []
  const kozijnSummary =
    prim.kopeinde && prim.kozijnLinks && prim.kozijnRechts
      ? `kozijn L ${prim.kozijnLinks.widthPx}×${prim.kozijnLinks.heightPx}px hart@(${prim.kozijnLinks.centroidX},${prim.kozijnLinks.centroidY}) · kozijn R ${prim.kozijnRechts.widthPx}×${prim.kozijnRechts.heightPx}px hart@(${prim.kozijnRechts.centroidX},${prim.kozijnRechts.centroidY}) · opp totaal ${prim.kozijnTotaalOppervlakPx}px²`
      : `kopeinde=${prim.kopeinde}`
  const hingeSummary =
    kind === 'door' && prim.draaicirkel === true
      ? prim.scharnierPunt
        ? ` · scharnier=(${prim.scharnierPunt.x.toFixed(1)},${prim.scharnierPunt.y.toFixed(1)})${
            prim.scharnierGraden != null ? ` · assenhoek=${prim.scharnierGraden.toFixed(1)}°` : ''
          }`
        : ' · scharnier=onbekend'
      : ''
  const doorSummary =
    kind === 'door'
      ? ` · draaicirkel=${prim.draaicirkel ? 'ja' : 'nee'}${
          prim.draaicirkel === false
            ? ` · middenlijn=${prim.middenlijn ? 'ja' : 'nee'}${
                prim.middenlijn && prim.middenlijnSpanPx != null
                  ? ` (${prim.middenlijnSpanPx}px)`
                  : ''
              }`
            : ''
        }${hingeSummary}`
      : ''
  const facePolygonSummary =
    facePolygons.length > 0
      ? facePolygons
          .map((face) => `label ${face.label} (${face.role}) — ${face.approxPolygon.length} punten`)
          .join(' · ')
      : 'geen'

  return `<section class="unit">
    <h4>Unit #${unit.unit.index} <span class="muted">(${unit.unit.source}${unit.unit.includesBothHeads ? ', kozijn→kozijn' : ''})</span></h4>
    <p><strong>Algemene categorieën:</strong> ${escapeHtml(kozijnSummary + doorSummary)}</p>
    <p class="muted"><strong>Face-polygonen:</strong> ${escapeHtml(facePolygonSummary)}</p>
    <p class="muted">bbox ${unit.unit.bbox.width}×${unit.unit.bbox.height} @ (${unit.unit.bbox.x},${unit.unit.bbox.y})</p>
    ${renderUnitFacePolygonFigure(unit)}
    <details>
      <summary>Unit JSON</summary>
      <pre class="json">${formatJson({
        unit: unit.unit,
        primitives: unit.primitives,
        facePolygons,
        faceProfile: unit.faceProfile,
      })}</pre>
    </details>
  </section>`
}

function wallSection(wall: WallRefProfile, index: number, total: number): string {
  const bwLabel = wall.bwMode === 'otsu' ? 'B/W (Otsu)' : 'B/W (adaptief)'
  const bandLabel = wall.wallThicknessBand
    ? ` <span class="muted">(${wall.wallThicknessBand})</span>`
    : ''
  const title =
    total > 1 ? `Muur-referentie #${index + 1}${bandLabel}` : `Muur-referentie${bandLabel}`
  return `<article class="ref-card wall">
    <h2>${title}</h2>
    <p><strong>Stijl:</strong> ${escapeHtml(wall.renderStyleLabel)} <span class="muted">(${wall.renderStyle}, conf ${wall.renderStyleConfidence.toFixed(2)})</span>
      · dikte ${wall.thicknessPx ?? '—'}px
      · oriëntatie ${wall.orientation}
      · as-align ${wall.skewCorrectedDeg.toFixed(2)}°
      · ${escapeHtml(bwLabel)}
      ${wall.parallelLineCount != null ? `· parallelCount ${wall.parallelLineCount}` : ''}
    </p>
    <p class="muted">Stijl uit face-count (border-seal, buiten meegerekend): ≤5 = solid, &gt;5 = details · faces ${wall.faceProfile.faceCount}</p>
    <p class="muted">Scores: solid ${wall.renderStyleScores.solid.toFixed(2)}, parallel ${wall.renderStyleScores.parallel_lines.toFixed(2)}, arcering/details ${wall.renderStyleScores.details.toFixed(2)}</p>
    ${imageGrid(wall.images, bwLabel)}
    <p class="muted">lijnen ${wall.lineProfile.lines.length} · blobs/units ${wall.units.length}</p>
    <details open>
      <summary>Muur JSON</summary>
      <pre class="json">${formatJson({
        wallThicknessBand: wall.wallThicknessBand ?? null,
        rect: wall.rect,
        bwMode: wall.bwMode,
        skewCorrectedDeg: wall.skewCorrectedDeg,
        thicknessPx: wall.thicknessPx,
        renderStyle: wall.renderStyle,
        renderStyleLabel: wall.renderStyleLabel,
        renderStyleConfidence: wall.renderStyleConfidence,
        renderStyleScores: wall.renderStyleScores,
        parallelLineCount: wall.parallelLineCount,
        primaryBlob: wall.primaryBlob,
        units: wall.units,
        lineProfile: wall.lineProfile,
        faceProfile: wall.faceProfile,
      })}</pre>
    </details>
  </article>`
}

function openingSection(opening: OpeningRefProfile, index: number): string {
  const title = opening.kind === 'door' ? 'Deur' : 'Raam'
  const bwLabel = opening.bwMode === 'otsu' ? 'B/W (Otsu)' : 'B/W (adaptief)'
  return `<article class="ref-card ${opening.kind}">
    <h2>${title}-referentie #${index + 1}</h2>
    <p class="muted">LBE ${opening.rect.width.toFixed(0)}×${opening.rect.height.toFixed(0)} · originele crop ${opening.sourceCropWidth}×${opening.sourceCropHeight} · rechte crop ${opening.cropWidth}×${opening.cropHeight} · ${opening.orientation} · units ${opening.units.length} · as-align ${opening.skewCorrectedDeg.toFixed(2)}° · ${escapeHtml(bwLabel)}</p>
    ${imageGrid(opening.images, bwLabel)}
    ${opening.units.map((u) => unitBlock(u, opening.kind)).join('\n')}
    <div class="contour-figures">
      ${renderGroupedFacePolygonFigure(opening)}
    </div>
    <details>
      <summary>Volledige opening JSON</summary>
      <pre class="json">${formatJson({
        kind: opening.kind,
        bwMode: opening.bwMode,
        skewCorrectedDeg: opening.skewCorrectedDeg,
        rect: opening.rect,
        orientation: opening.orientation,
        primaryBlob: opening.primaryBlob,
        combinedFacePolygon: opening.combinedFacePolygon,
        combinedFacePolygons: opening.combinedFacePolygons,
        combinedFacePolygonParts: opening.combinedFacePolygonParts,
        units: opening.units,
      })}</pre>
    </details>
  </article>`
}

/** Self-contained HTML met embedded PNG data-URLs voor stap-1 referentie-analyse. */
export function buildReferenceAnalysisHtml(report: ReferenceAnalysisReport): string {
  const categoriesHtml = buildGeneralCategoriesSection(report)
  const wallList =
    report.walls && report.walls.length > 0 ? report.walls : report.wall ? [report.wall] : []
  const wallHtml =
    wallList.length > 0
      ? wallList.map((w, i) => wallSection(w, i, wallList.length)).join('\n')
      : '<p class="muted">Geen muur-referentie.</p>'
  const openingsHtml =
    report.openings.length > 0
      ? report.openings.map((o, i) => openingSection(o, i)).join('\n')
      : '<p class="muted">Geen deur-/raam-referenties.</p>'

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>Referentie-analyse${report.drawing ? ` — ${escapeHtml(report.drawing)}` : ''}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #0f172a; background: #f8fafc; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    h4 { margin: 12px 0 6px; font-size: 14px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    .muted { color: #64748b; font-size: 12px; }
    .ref-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .ref-card.door { border-left: 4px solid #2563eb; }
    .ref-card.window { border-left: 4px solid #7c3aed; }
    .ref-card.wall { border-left: 4px solid #0f172a; }
    .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 140px)); gap: 8px; margin: 12px 0; }
    figure { margin: 0; }
    figure img { display: block; width: 100%; max-height: 96px; object-fit: contain; border: 1px solid #e2e8f0; background: #fff; image-rendering: pixelated; }
    figure svg { display: block; width: 100%; max-height: 140px; border: 1px solid #e2e8f0; background: #fff; }
    figcaption { font-size: 11px; color: #64748b; margin-top: 4px; }
    .unit { border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 8px; }
    .contour-figures { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 280px)); gap: 12px; margin-top: 10px; }
    .contour-figures svg { max-height: 160px; }
    details { margin-top: 10px; }
    pre.json { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow: auto; font-size: 11px; max-height: 420px; }
  </style>
</head>
<body>
  <h1>Referentie-analyse</h1>
  <p class="meta">
    ${escapeHtml(report.drawing ?? '(geen bestandsnaam)')}
    · ${escapeHtml(report.exportedAt)}
    · extract-only (geen detectie)
  </p>
  ${categoriesHtml}
  ${wallHtml}
  ${openingsHtml}
</body>
</html>`
}
