import type { Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import type { ExtractionOutput } from '@/core/extraction'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type {
  BoundWindow,
  WindowAxelStage,
  WindowBindRejection,
  ResolvedWindowCandidate,
} from '@/cv/windows'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { SelectionRect } from '@/platform/selection'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { WorkspaceFlowStep } from './constants'
import { downloadText } from '@/core/fml/downloadFml'
import { bwBytesToCanvas } from '@/cv/preprocess/compose-wall-bw'
import { formatCvError } from '@/cv/formatCvError'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { analyzeAllReferenceRects } from '@/cv/refs/analyze-all-refs'
import {
  buildDiagnosisReportHtml,
  type DiagnosisRefImage,
  type DiagnosisReportPayload,
  type DiagnosisScaleOverlay,
} from '@/platform/export/diagnosis-report'
import {
  buildLayerDebugReport,
  formatLayerDebugMarkdown,
} from '@/platform/export/layer-debug-report'
import { canvasLikeToHtmlCanvas, imageDimensions, imageSourceToCanvas } from './imageUtils'
import { exportBasename } from './workspace-export-shared'

export type WorkspaceExportDiagnosisDeps = {
  imageName: Ref<string | null>
  flowStep: Ref<WorkspaceFlowStep>
  preprocess: Ref<PreprocessConfig>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  effectiveBwUrl?: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  rects: Ref<SelectionRect[]>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  preprocessMaskArgs: () => PreprocessMaskInput
  setLocalError: (message: string | null) => void
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  boundDoors?: Ref<BoundDoor[]>
  resolvedDoors?: Ref<ResolvedDoorCandidate[]>
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  resolvedWindows?: Ref<ResolvedWindowCandidate[]>
  windowBindRejections?: Ref<WindowBindRejection[]>
  windowAxelStage?: Ref<WindowAxelStage>
  projectName?: Ref<string | null>
  floorId?: Ref<string | null>
  floorName?: Ref<string | null>
  floorLevel?: Ref<number | null>
  getPreviewPlan?: () => FloorPlan | null
  getGeneratedFmlText?: () => string
  appVersion?: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function stampLocal(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

function slugPart(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/\s+/g, '-')
  return cleaned || fallback
}

/** JPEG quality for the colour stap-1 underlay — keeps diagnosis HTML shareable. */
const ORIGINAL_UNDERLAY_JPEG_QUALITY = 0.85

type OriginalUnderlaySnapshot = {
  dataUrl: string
  width: number
  height: number
}

async function resolveOriginalUnderlay(
  deps: WorkspaceExportDiagnosisDeps,
): Promise<OriginalUnderlaySnapshot | null> {
  try {
    const img = await deps.getImageEl()
    const { width, height } = imageDimensions(img)
    if (width <= 0 || height <= 0) return null
    const canvas = imageSourceToCanvas(img)
    const dataUrl = canvas.toDataURL('image/jpeg', ORIGINAL_UNDERLAY_JPEG_QUALITY)
    if (!dataUrl.startsWith('data:image/')) return null
    return { dataUrl, width, height }
  } catch (e) {
    console.warn('[exportDiagnosisReport] original underlay skipped', e)
    return null
  }
}

function resolveScaleOverlay(deps: WorkspaceExportDiagnosisDeps): DiagnosisScaleOverlay | null {
  const state = deps.scale.state.value
  if (!state) return null
  return {
    state: { ...state },
    distanceMmX: deps.scale.distanceMmX.value,
    distanceMmY: deps.scale.distanceMmY.value,
    pxDistanceX: deps.scale.pxDistanceX.value,
    pxDistanceY: deps.scale.pxDistanceY.value,
    pxPerMmX: deps.scale.pixelsPerMillimeterX.value,
    pxPerMmY: deps.scale.pixelsPerMillimeterY.value,
    confirmed: deps.scale.confirmed.value,
    axisMismatchPct: deps.scale.axisMismatchPct.value,
  }
}

function resolveBwPng(deps: WorkspaceExportDiagnosisDeps): string | null {
  const fromUrl = deps.effectiveBwUrl?.value ?? deps.preprocessPreview.previewUrl.value
  if (fromUrl) return fromUrl
  const base = deps.getBaseWallBw?.() ?? null
  if (!base || base.width <= 0 || base.height <= 0) return null
  try {
    const canvas = canvasLikeToHtmlCanvas(bwBytesToCanvas(base.data, base.width, base.height))
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function compactSemanticWalls(tabOutputs: TabDetectionOutputs): unknown | null {
  const graph = tabOutputs.walls?.semanticWallGraph
  if (!graph) return null
  return {
    segments: graph.segments,
    junctions: graph.junctions,
    meta: graph.meta,
  }
}

function hasAnyWallLayer(report: ReturnType<typeof buildLayerDebugReport>): boolean {
  const layers = report.layers
  return WALL_LAYER_KEYS.some((key) => layers[key] != null)
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

/**
 * Best-effort: same REF pipeline as «Exporteer referentie-analyse».
 * Walls → faceOverlay (buiten grijs); openings → Gegroepeerde contouren los.
 */
async function resolveReferenceRefImages(
  deps: WorkspaceExportDiagnosisDeps,
): Promise<DiagnosisRefImage[] | null> {
  const refRects = deps.rects.value.filter(
    (r) => r.type === 'wall' || r.type === 'door' || r.type === 'window',
  )
  if (refRects.length === 0) return null

  try {
    const img = await deps.getImageEl()
    const cv = await waitForOpenCV()
    const report = await analyzeAllReferenceRects({
      cv,
      image: img,
      drawing: deps.imageName.value,
      preprocess: deps.preprocess.value,
      eraserMask: deps.preprocessMaskArgs().eraserMask ?? undefined,
      baseBw: deps.getBaseWallBw?.() ?? undefined,
      rects: refRects.map((r) => ({
        id: r.id,
        type: r.type as 'wall' | 'door' | 'window',
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        ...(r.type === 'wall' && r.wallThicknessBand
          ? { wallThicknessBand: r.wallThicknessBand }
          : {}),
      })),
    })

    const out: DiagnosisRefImage[] = []
    const walls = report.walls?.length ? report.walls : report.wall ? [report.wall] : []
    for (const wall of walls) {
      const png =
        wall.images.faceOverlayPng || wall.images.straightenedPng || wall.images.bwCropPng || ''
      if (!png) continue
      const imageKind = wall.images.faceOverlayPng
        ? ('faceOverlay' as const)
        : wall.images.straightenedPng
          ? ('straightened' as const)
          : ('bwCrop' as const)
      out.push({
        id: wall.rect.id ?? `wall-${out.length + 1}`,
        kind: 'wall',
        ...(wall.wallThicknessBand ? { wallThicknessBand: wall.wallThicknessBand } : {}),
        png,
        imageKind,
      })
    }
    for (const opening of report.openings) {
      const png = opening.images.groupedPolygonCleanPng
      if (!png) continue
      out.push({
        id: opening.rect.id ?? `${opening.kind}-${out.length + 1}`,
        kind: opening.kind,
        png,
        imageKind: 'groupedPolygonClean',
      })
    }
    return out.length > 0 ? out : null
  } catch (e) {
    console.warn('[exportDiagnosisReport] REF images skipped', e)
    return null
  }
}

async function buildPayload(deps: WorkspaceExportDiagnosisDeps): Promise<DiagnosisReportPayload> {
  const resolved = deps.resolvedDoors?.value ?? []
  const boundDoors = deps.boundDoors?.value ?? []
  const oriented = deps.orientedDoors?.value ?? []
  const boundWindows = deps.boundWindows?.value ?? []
  const resolvedWindows = deps.resolvedWindows?.value ?? []
  const bindRejections = deps.windowBindRejections?.value ?? []
  const hasDoorData = resolved.length > 0 || boundDoors.length > 0 || oriented.length > 0
  const hasWindowData =
    boundWindows.length > 0 || resolvedWindows.length > 0 || bindRejections.length > 0

  const refRects = deps.rects.value
    .filter((r) => r.type === 'wall' || r.type === 'door' || r.type === 'window')
    .map((r) => ({
      id: r.id,
      type: r.type,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      fmlRefId: r.fmlRefId ?? null,
    }))

  const pxX = deps.scale.pixelsPerMillimeterX.value
  const pxY = deps.scale.pixelsPerMillimeterY.value
  const fmlText = deps.getGeneratedFmlText?.() ?? ''
  const previewPlan = deps.getPreviewPlan?.() ?? null

  const wallOutput = deps.tabOutputs.value.walls ?? deps.combinedOutput.value
  const layerDebug = buildLayerDebugReport({
    drawing: deps.imageName.value,
    output: wallOutput,
    openings: {
      resolvedDoors: resolved,
      boundDoors,
      orientedDoors: oriented,
      boundWindows,
      windowBindRejections: bindRejections,
    },
  })
  const layerDebugUseful =
    hasAnyWallLayer(layerDebug) ||
    layerDebug.openings != null ||
    (layerDebug.wallTransitions?.length ?? 0) > 0

  const referenceRefImages = await resolveReferenceRefImages(deps)
  const originalUnderlay = await resolveOriginalUnderlay(deps)
  const scaleOverlay = resolveScaleOverlay(deps)

  return {
    meta: {
      exportedAtIso: new Date().toISOString(),
      projectName: deps.projectName?.value ?? null,
      floorId: deps.floorId?.value ?? null,
      floorName: deps.floorName?.value ?? null,
      floorLevel: deps.floorLevel?.value ?? null,
      imageName: deps.imageName.value,
      flowStep: deps.flowStep.value,
      pxPerMmX: pxX > 0 ? pxX : null,
      pxPerMmY: pxY > 0 ? pxY : null,
      appVersion: deps.appVersion ?? null,
      originalWidth: originalUnderlay?.width ?? null,
      originalHeight: originalUnderlay?.height ?? null,
    },
    originalPng: originalUnderlay?.dataUrl ?? null,
    scaleOverlay,
    bwPng: resolveBwPng(deps),
    references: refRects.length > 0 ? refRects : null,
    referenceRefImages,
    doors: hasDoorData
      ? { resolved: [...resolved], bound: [...boundDoors], oriented: [...oriented] }
      : null,
    windows: hasWindowData
      ? {
          resolved: [...resolvedWindows],
          bound: [...boundWindows],
          bindRejections: [...bindRejections],
          axelStage: deps.windowAxelStage?.value ?? null,
        }
      : null,
    layers: {
      layerDebug: layerDebugUseful ? layerDebug : null,
      semanticWallGraph: compactSemanticWalls(deps.tabOutputs.value),
    },
    layerDebugMarkdown: layerDebugUseful ? formatLayerDebugMarkdown(layerDebug) : null,
    fmlText: fmlText.trim() ? fmlText : null,
    previewPlan,
  }
}

export function createWorkspaceExportDiagnosis(deps: WorkspaceExportDiagnosisDeps) {
  async function exportDiagnosisReport() {
    deps.setLocalError(null)
    try {
      const payload = await buildPayload(deps)
      const hasAnythingUseful =
        payload.originalPng != null ||
        payload.bwPng != null ||
        payload.references != null ||
        payload.referenceRefImages != null ||
        payload.doors != null ||
        payload.windows != null ||
        payload.layers.layerDebug != null ||
        payload.layers.semanticWallGraph != null ||
        payload.fmlText != null ||
        payload.previewPlan != null ||
        payload.meta.imageName != null ||
        payload.meta.pxPerMmX != null

      if (!hasAnythingUseful) {
        throw new Error('Nothing to export yet — load an underlay or continue the flow first.')
      }

      const html = buildDiagnosisReportHtml(payload)
      const project = slugPart(payload.meta.projectName, 'project')
      const floor = slugPart(payload.meta.floorName ?? payload.meta.imageName, 'floor')
      const base = exportBasename(`${project}-${floor}`, 'diagnosis')
      downloadText(html, `diagnosis-${base}-${stampLocal()}.html`, 'text/html')
    } catch (e) {
      console.error('[exportDiagnosisReport]', e)
      deps.setLocalError(formatCvError(e))
    }
  }

  return { exportDiagnosisReport }
}
