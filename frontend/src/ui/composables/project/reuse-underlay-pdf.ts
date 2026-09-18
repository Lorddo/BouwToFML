import type { SourceToWorkingTransform } from '@/core/plan/source-underlay-transform'
import type { PdfUnderlaySource } from '@/platform/upload'

/** Persisted PDF page identity (no bytes). */
export type PdfUnderlayMeta = {
  pageNumber: number
  fileName: string
  pageRenderScale: number
  pageWidthPx: number
  pageHeightPx: number
}

/** Stap-1 rotatie die bij de bronscan hoort (preview of ná «Rotatie vastzetten»). */
export type UnderlayInputRotation = {
  rotationDeg: number
  rotate180: boolean
  autoRotationDeg?: number
}

/**
 * `source` = linialen op de bronplaat (typisch: schaal vóór bake).
 * `working` = linialen op de gebakken werkplaat (schaal ná rotatie-bake).
 */
export type SourceUnderlayScaleSpace = 'source' | 'working'

export type ReuseUnderlayLoadOptions = {
  inputRotation?: UnderlayInputRotation | null
  scaleSpace?: SourceUnderlayScaleSpace
}

const ROTATION_EPS_DEG = 0.001

function hasInputRotation(rot: UnderlayInputRotation | null | undefined): boolean {
  if (!rot) return false
  return (
    Math.abs(rot.rotationDeg) >= ROTATION_EPS_DEG ||
    rot.rotate180 === true ||
    Math.abs(rot.autoRotationDeg ?? 0) >= ROTATION_EPS_DEG
  )
}

export function compactInputRotation(
  rot: {
    rotationDeg?: number
    rotate180?: boolean
    autoRotationDeg?: number
  } | null | undefined,
): UnderlayInputRotation | null {
  if (!rot) return null
  const next: UnderlayInputRotation = {
    rotationDeg: rot.rotationDeg ?? 0,
    rotate180: rot.rotate180 === true,
    ...(Math.abs(rot.autoRotationDeg ?? 0) >= ROTATION_EPS_DEG
      ? { autoRotationDeg: rot.autoRotationDeg }
      : {}),
  }
  return hasInputRotation(next) ? next : null
}

/**
 * Schaal-bevestigen en rotatie zijn losse acties: een snapshot mag een
 * gebakken/opgeslagen hoek niet wissen als de slider al op 0 staat.
 *
 * Volgorde: bake-transform → live slider → eerder opgeslagen hoek.
 * `working` = linialen op de rechtgetrokken plaat (ná «Rotatie vastzetten»).
 */
export function snapshotSourceUnderlayReuse(params: {
  preprocess: { rotationDeg?: number; rotate180?: boolean; autoRotationDeg?: number }
  sourceToWorking?: Pick<SourceToWorkingTransform, 'rotationDeg' | 'rotate180'> | null
  storedInputRotation?: UnderlayInputRotation | null
}): { inputRotation: UnderlayInputRotation | null; scaleSpace: SourceUnderlayScaleSpace } {
  const fromBake = compactInputRotation(params.sourceToWorking)
  if (fromBake) {
    return { scaleSpace: 'working', inputRotation: fromBake }
  }
  const pending = compactInputRotation(params.preprocess)
  if (pending) {
    return { scaleSpace: 'source', inputRotation: pending }
  }
  const stored = compactInputRotation(params.storedInputRotation)
  if (stored) {
    return { scaleSpace: 'working', inputRotation: stored }
  }
  return { scaleSpace: 'source', inputRotation: null }
}

/** Schaal-schrijven mag een bestaande hoek niet leegvegen. */
export function keepSourceUnderlayRotation(
  incoming: UnderlayInputRotation | null | undefined,
  stored: UnderlayInputRotation | null | undefined,
): UnderlayInputRotation | null {
  return compactInputRotation(incoming) ?? compactInputRotation(stored)
}

export function resolveReuseInputRotation(params: {
  source?: { inputRotation?: UnderlayInputRotation | null } | null
  transform?: Pick<SourceToWorkingTransform, 'rotationDeg' | 'rotate180'> | null
  sessionPreprocess?: {
    rotationDeg?: number
    rotate180?: boolean
    autoRotationDeg?: number
  } | null
}): UnderlayInputRotation | null {
  const stored = compactInputRotation(params.source?.inputRotation)
  if (stored) return stored
  const fromBake = compactInputRotation(params.transform)
  if (fromBake) return fromBake
  return compactInputRotation(params.sessionPreprocess)
}

export function pdfMetaFromSource(source: PdfUnderlaySource): PdfUnderlayMeta {
  return {
    pageNumber: source.pageNumber,
    fileName: source.fileName,
    pageRenderScale: source.pageRenderScale,
    pageWidthPx: source.pageWidthPx,
    pageHeightPx: source.pageHeightPx,
  }
}

function pdfBytesUsable(source?: PdfUnderlaySource | null): source is PdfUnderlaySource {
  if (!source) return false
  try {
    return source.bytes.byteLength > 0
  } catch {
    return false
  }
}

export function resolveReusePdfBytes(params: {
  sessionPdf?: PdfUnderlaySource | null
  donorPdf?: PdfUnderlaySource | null
  projectPdf?: PdfUnderlaySource | null
}): PdfUnderlaySource | null {
  if (pdfBytesUsable(params.sessionPdf)) return params.sessionPdf
  if (pdfBytesUsable(params.donorPdf)) return params.donorPdf
  if (pdfBytesUsable(params.projectPdf)) return params.projectPdf
  return null
}
