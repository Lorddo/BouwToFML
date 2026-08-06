import type { Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type {
  BoundWindow,
  WindowAxelStage,
  WindowBindRejection,
  ResolvedWindowCandidate,
} from '@/cv/windows'
import type { SelectionRect } from '@/platform/selection'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { WorkspaceFlowStep } from './constants'
import { downloadText } from '@/core/fml/downloadFml'
import { bwBytesToCanvas } from '@/cv/preprocess/compose-wall-bw'
import { formatCvError } from '@/cv/formatCvError'
import {
  buildDiagnosisReportHtml,
  type DiagnosisReportPayload,
} from '@/platform/export/diagnosis-report'
import { canvasLikeToHtmlCanvas } from './imageUtils'
import { exportBasename } from './workspace-export-shared'

export type WorkspaceExportDiagnosisDeps = {
  imageName: Ref<string | null>
  flowStep: Ref<WorkspaceFlowStep>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  effectiveBwUrl?: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  scale: ReturnType<typeof useHScaleCalibration>
  rects: Ref<SelectionRect[]>
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

function buildPayload(deps: WorkspaceExportDiagnosisDeps): DiagnosisReportPayload {
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
    },
    bwPng: resolveBwPng(deps),
    references: refRects.length > 0 ? refRects : null,
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
      l10SemanticWalls: compactSemanticWalls(deps.tabOutputs.value),
      l12OrientedDoors: oriented.length > 0 ? [...oriented] : null,
      l14BoundWindows: boundWindows.length > 0 ? [...boundWindows] : null,
    },
    fmlText: fmlText.trim() ? fmlText : null,
    previewPlan,
  }
}

export function createWorkspaceExportDiagnosis(deps: WorkspaceExportDiagnosisDeps) {
  async function exportDiagnosisReport() {
    deps.setLocalError(null)
    try {
      const payload = buildPayload(deps)
      const hasAnythingUseful =
        payload.bwPng != null ||
        payload.references != null ||
        payload.doors != null ||
        payload.windows != null ||
        payload.layers.l10SemanticWalls != null ||
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
