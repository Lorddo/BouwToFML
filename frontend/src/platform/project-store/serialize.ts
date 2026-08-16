import { toStorableDevSession } from '@/platform/dev-workspace/storable'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type {
  FloorWorkspaceBlob,
  ProjectSourceUnderlay,
  ProjectState,
} from '@/ui/composables/project/types'
import {
  PERSISTED_PROJECT_SCHEMA_VERSION,
  type PersistedDevSession,
  type PersistedFloorBlob,
  type PersistedProject,
  type PersistedProjectIndexEntry,
  type PersistedSourceUnderlay,
  type PersistedWallStamp,
} from './types'

const DATA_URL_PNG_PREFIX = 'data:image/png;base64,'

/** data:image/png;base64,… → raw PNG bytes. Niet-data-URL → null (niet persistent). */
export function dataUrlToPngBytes(src: string): Uint8Array | null {
  if (!src.startsWith('data:image/')) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const header = src.slice(0, comma)
  const payload = src.slice(comma + 1)
  try {
    const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

export function pngBytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `${DATA_URL_PNG_PREFIX}${btoa(binary)}`
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

type RuntimeWallStamp = {
  donorFloorId: string
  bands: unknown
  baseBounds: unknown
  bounds: unknown
  wallsCm: unknown
  sourceWallsCm?: unknown
  originCm: unknown
  eraseMaskBase64?: string
  stampBwBase64?: string
  stampMaskBase64?: string
  baked: boolean
}

function persistWallStamp(stamp: RuntimeWallStamp): PersistedWallStamp {
  return {
    donorFloorId: stamp.donorFloorId,
    bands: stamp.bands,
    baseBounds: stamp.baseBounds,
    bounds: stamp.bounds,
    wallsCm: stamp.wallsCm,
    sourceWallsCm: stamp.sourceWallsCm,
    originCm: stamp.originCm,
    eraseMaskBytes: stamp.eraseMaskBase64 ? base64ToBytes(stamp.eraseMaskBase64) : undefined,
    stampBwBytes: stamp.stampBwBase64 ? base64ToBytes(stamp.stampBwBase64) : undefined,
    stampMaskBytes: stamp.stampMaskBase64 ? base64ToBytes(stamp.stampMaskBase64) : undefined,
    baked: stamp.baked,
  }
}

function restoreWallStamp(stamp: PersistedWallStamp): RuntimeWallStamp {
  return {
    donorFloorId: stamp.donorFloorId,
    bands: stamp.bands,
    baseBounds: stamp.baseBounds,
    bounds: stamp.bounds,
    wallsCm: stamp.wallsCm,
    sourceWallsCm: stamp.sourceWallsCm,
    originCm: stamp.originCm,
    eraseMaskBase64: stamp.eraseMaskBytes ? bytesToBase64(stamp.eraseMaskBytes) : undefined,
    stampBwBase64: stamp.stampBwBytes ? bytesToBase64(stamp.stampBwBytes) : undefined,
    stampMaskBase64: stamp.stampMaskBytes ? bytesToBase64(stamp.stampMaskBytes) : undefined,
    baked: stamp.baked,
  }
}

export type PersistProjectOptions = {
  /**
   * Result-floors met previewPlan: sla detectionExact/Replay niet op.
   * FML komt uit previewPlan; image/schaal/refs/preprocess blijven in de session.
   * Scheelt tientallen MB face-rasters per afgeronde verdieping (quota).
   */
  omitResultDetection?: boolean
  /**
   * Strip labelsData / rawLabelsData / baselineWallBwData uit roomClassifyState.
   * Face-raster moet na restore opnieuw geclassificeerd worden.
   */
  stripClassifyRasters?: boolean
  /** Geen project-level sourceUnderlay wanneer floors al een bron hebben. */
  omitLegacyProjectSource?: boolean
}

/** Quota-slim: drop face-raster buffers (tientallen MB) — classify opnieuw na restore. */
function stripClassifyRastersFromSession(session: DevWorkspaceSession): DevWorkspaceSession {
  if (session.schemaVersion !== 2 || !session.detectionExact?.tabOutputs) return session
  const tabOutputs = { ...session.detectionExact.tabOutputs }
  for (const key of Object.keys(tabOutputs) as Array<keyof typeof tabOutputs>) {
    const output = tabOutputs[key]
    if (!output?.meta?.roomClassifyState) continue
    const { roomClassifyState: _rcs, ...metaRest } = output.meta
    tabOutputs[key] = {
      ...output,
      meta: metaRest,
    }
  }
  return {
    ...session,
    detectionExact: {
      ...session.detectionExact,
      tabOutputs,
    },
  }
}

function sessionForPersist(
  session: DevWorkspaceSession,
  blob: FloorWorkspaceBlob,
  options?: PersistProjectOptions,
): DevWorkspaceSession {
  let next = session
  if (
    options?.omitResultDetection !== false &&
    next.schemaVersion === 2 &&
    next.flow.targetFlowStep === 'result' &&
    blob.previewPlan
  ) {
    const { detectionExact: _de, detectionReplay: _dr, ...rest } = next
    next = rest
  }
  if (options?.stripClassifyRasters) {
    next = stripClassifyRastersFromSession(next)
  }
  return next
}

function persistSession(session: DevWorkspaceSession): PersistedDevSession | null {
  const pngBytes = dataUrlToPngBytes(session.workingImagePng)
  if (!pngBytes) return null

  const base = session
  const { workingImagePng: _png, eraserMaskBase64, ocrMaskBase64, wallStamp, ...rest } = base

  const persisted: PersistedDevSession = {
    ...(toStorableDevSession(rest) as Omit<
      DevWorkspaceSession,
      'workingImagePng' | 'eraserMaskBase64' | 'ocrMaskBase64' | 'wallStamp'
    >),
    workingImagePngBytes: pngBytes,
  }
  if (eraserMaskBase64) persisted.eraserMaskBytes = base64ToBytes(eraserMaskBase64)
  if (ocrMaskBase64) persisted.ocrMaskBytes = base64ToBytes(ocrMaskBase64)
  if (wallStamp) persisted.wallStamp = persistWallStamp(wallStamp)
  return persisted
}

function restoreSession(persisted: PersistedDevSession): DevWorkspaceSession {
  const { workingImagePngBytes, eraserMaskBytes, ocrMaskBytes, wallStamp, ...rest } = persisted

  const session = {
    ...rest,
    workingImagePng: pngBytesToDataUrl(workingImagePngBytes),
    ...(eraserMaskBytes ? { eraserMaskBase64: bytesToBase64(eraserMaskBytes) } : {}),
    ...(ocrMaskBytes ? { ocrMaskBase64: bytesToBase64(ocrMaskBytes) } : {}),
    ...(wallStamp ? { wallStamp: restoreWallStamp(wallStamp) } : {}),
  }
  return session as DevWorkspaceSession
}

function persistBlob(
  blob: FloorWorkspaceBlob,
  options?: PersistProjectOptions,
): PersistedFloorBlob {
  const session = blob.session ? sessionForPersist(blob.session, blob, options) : null
  return {
    session: session ? persistSession(session) : null,
    generatedFloor: blob.generatedFloor ? toStorableDevSession(blob.generatedFloor) : null,
    previewPlan: blob.previewPlan ? toStorableDevSession(blob.previewPlan) : null,
    previewUnderlayLayout: blob.previewUnderlayLayout
      ? toStorableDevSession(blob.previewUnderlayLayout)
      : null,
    fmlNulpuntImageCm: blob.fmlNulpuntImageCm
      ? toStorableDevSession(blob.fmlNulpuntImageCm)
      : (blob.fmlNulpuntImageCm ?? null),
    fmlOrient: blob.fmlOrient ? toStorableDevSession(blob.fmlOrient) : (blob.fmlOrient ?? null),
    sourceUnderlay: blob.sourceUnderlay ? persistSourceUnderlay(blob.sourceUnderlay) : null,
  }
}

function restoreBlob(blob: PersistedFloorBlob): FloorWorkspaceBlob {
  return {
    session: blob.session ? restoreSession(blob.session) : null,
    generatedFloor: blob.generatedFloor,
    previewPlan: blob.previewPlan,
    previewUnderlayLayout: blob.previewUnderlayLayout,
    fmlNulpuntImageCm: blob.fmlNulpuntImageCm ?? null,
    fmlOrient: blob.fmlOrient ?? null,
    sourceUnderlay: blob.sourceUnderlay ? restoreSourceUnderlay(blob.sourceUnderlay) : null,
  }
}

function persistSourceUnderlay(underlay: ProjectSourceUnderlay): PersistedSourceUnderlay | null {
  const pngBytes = dataUrlToPngBytes(underlay.src)
  if (!pngBytes) return null
  return {
    pngBytes,
    name: underlay.name,
    scale: underlay.scale ? toStorableDevSession(underlay.scale) : undefined,
  }
}

function restoreSourceUnderlay(underlay: PersistedSourceUnderlay): ProjectSourceUnderlay {
  return {
    src: pngBytesToDataUrl(underlay.pngBytes),
    name: underlay.name,
    scale: underlay.scale,
  }
}

export function toPersistedProject(
  state: ProjectState,
  updatedAt = new Date().toISOString(),
  options?: PersistProjectOptions,
): PersistedProject {
  const blobs: Record<string, PersistedFloorBlob> = {}
  for (const [id, blob] of Object.entries(state.blobs)) {
    blobs[id] = persistBlob(blob, options)
  }
  const hasFloorSource = Object.values(state.blobs).some((b) => !!b.sourceUnderlay)
  const omitLegacy = options?.omitLegacyProjectSource !== false && hasFloorSource
  return {
    schemaVersion: PERSISTED_PROJECT_SCHEMA_VERSION,
    id: state.meta.id,
    updatedAt,
    meta: toStorableDevSession(state.meta),
    floors: toStorableDevSession(state.floors),
    activeFloorId: state.activeFloorId,
    sourceUnderlay:
      omitLegacy || !state.sourceUnderlay ? null : persistSourceUnderlay(state.sourceUnderlay),
    blobs,
  }
}

export function fromPersistedProject(record: PersistedProject): ProjectState {
  const blobs: Record<string, FloorWorkspaceBlob> = {}
  for (const [id, blob] of Object.entries(record.blobs)) {
    blobs[id] = restoreBlob(blob)
  }
  return {
    meta: record.meta,
    floors: record.floors,
    activeFloorId: record.activeFloorId,
    sourceUnderlay: record.sourceUnderlay ? restoreSourceUnderlay(record.sourceUnderlay) : null,
    blobs,
  }
}

export function toProjectIndexEntry(project: PersistedProject): PersistedProjectIndexEntry {
  return {
    id: project.id,
    name: project.meta.name,
    address: project.meta.address,
    floorCount: project.floors.length,
    updatedAt: project.updatedAt,
  }
}

export function isPersistedProject(value: unknown): value is PersistedProject {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.schemaVersion === PERSISTED_PROJECT_SCHEMA_VERSION &&
    typeof v.id === 'string' &&
    typeof v.updatedAt === 'string' &&
    !!v.meta &&
    Array.isArray(v.floors) &&
    typeof v.activeFloorId === 'string' &&
    !!v.blobs &&
    typeof v.blobs === 'object'
  )
}
