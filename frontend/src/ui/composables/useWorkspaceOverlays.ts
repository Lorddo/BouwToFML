import { computed, type ComputedRef, type Ref } from 'vue'

import type { ExtractionOutput, OcrTextCandidate } from '@/core/extraction'
import type { CanvasLike } from '@/cv/port/canvasEnv'

import type {
  DetectionOverlay,
  JunctionOverlay,
  OcrTextOverlay,
  SegmentOverlay,
} from '@/platform/canvas'

import {
  usesDoorSwingOverlay,
  usesWindowOverlay,
  usesWallDetectionOverlays,
  usesGapsFaceOverlay,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'

import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'

import type { PreprocessVectorCache } from '@/cv/preprocess/preprocess-vector-cache'
import type { BoundDoor, OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'

import type { WorkspaceFlowStep } from './workspace/constants'

import { ocrHitKey } from '@/cv/port/ocrHitKey'

import type { RoomPhase } from './workspace/useWorkspaceRoomFaces'

export type RasterOverlaySource = CanvasImageSource | CanvasLike | string | null

export function useWorkspaceOverlays(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  templateElementClass: ComputedRef<'wall' | null>
  activePipelineOutput: ComputedRef<ExtractionOutput | null>
  preprocessVectorCache: Ref<PreprocessVectorCache | null>
  ocrPreviewCandidates: Ref<OcrTextCandidate[]>
  ocrMaskedRegions: Ref<OcrTextCandidate[]>
  showTemplates: Ref<boolean>
  showWallLines: Ref<boolean>
  showLines: Ref<boolean>
  showSkeleton: Ref<boolean>
  showSkeletonLayerB?: Ref<boolean>
  showSemanticLayerC?: Ref<boolean>
  showLayer4?: Ref<boolean>
  showLayer5?: Ref<boolean>
  showLayer6?: Ref<boolean>
  showLayer7?: Ref<boolean>
  showLayer8?: Ref<boolean>
  showLayer9?: Ref<boolean>
  showLayer10?: Ref<boolean>
  showLayer11?: Ref<boolean>
  showLayer12?: Ref<boolean>
  showLayer14?: Ref<boolean>
  showOcrText: Ref<boolean>
  roomPreviewMaskCanvas?: Ref<CanvasLike | null>
  roomPreviewMaskRevision?: Ref<number>
  gapsPreviewMaskCanvas?: Ref<CanvasLike | null>
  doorSwingPreviewMaskCanvas?: Ref<CanvasLike | null>
  doorSwingPreviewMaskRevision?: Ref<number>
  doorSwingPreviewMaskUrl?: Ref<string | null>
  windowPreviewMaskCanvas?: Ref<CanvasLike | null>
  windowPreviewMaskRevision?: Ref<number>
  boundDoors?: Ref<BoundDoor[]>
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  roomPhase?: Ref<RoomPhase>
}) {
  const showWallGeometry = computed(() => {
    if (deps.flowStep.value === 'templates') return usesWallDetectionOverlays(deps.templateTab.value)
    if (deps.flowStep.value === 'result') {
      return deps.resultTab.value !== 'vector'
    }
    return false
  })

  const vectorDebugLayersAllowed = computed(() => {
    if (deps.flowStep.value === 'preprocess') {
      return deps.preprocessTab.value === 'walls'
    }
    if (deps.flowStep.value === 'result') {
      return deps.resultTab.value !== 'vector'
    }
    if (deps.flowStep.value === 'templates') {
      return usesWallDetectionOverlays(deps.templateTab.value)
    }
    return false
  })

  const wallOverlayTogglesVisible = computed(() => {
    if (!showWallGeometry.value) return false
    const output = deps.activePipelineOutput.value
    return !!(
      output?.semanticWallGraph?.segments.length ||
      output?.segments?.length ||
      output?.wallMatches?.length
    )
  })

  const onRoomTab = computed(() => {
    if (deps.flowStep.value === 'templates') {
      return (
        usesWallDetectionOverlays(deps.templateTab.value) ||
        usesGapsFaceOverlay(deps.templateTab.value) ||
        usesDoorSwingOverlay(deps.templateTab.value) ||
        usesWindowOverlay(deps.templateTab.value)
      )
    }
    if (deps.flowStep.value === 'result') return deps.resultTab.value === 'walls'
    return false
  })

  /** Resultaat/Muren: alleen B/W-onderlegger (geen gekleurde face-overlay). */
  const onResultWallsTab = computed(
    () => deps.flowStep.value === 'result' && deps.resultTab.value === 'walls',
  )

  const onGapsFaceOverlayTab = computed(
    () => deps.flowStep.value === 'templates' && usesGapsFaceOverlay(deps.templateTab.value),
  )
  const onDoorSwingOverlayTab = computed(
    () => deps.flowStep.value === 'templates' && usesDoorSwingOverlay(deps.templateTab.value),
  )
  const onWindowOverlayTab = computed(
    () => deps.flowStep.value === 'templates' && usesWindowOverlay(deps.templateTab.value),
  )

  const rasterOverlaySrc = computed<RasterOverlaySource>(() => {
    if (!onRoomTab.value) return null

    if (onResultWallsTab.value) return null

    if (onGapsFaceOverlayTab.value) {
      return deps.gapsPreviewMaskCanvas?.value ?? null
    }
    if (onDoorSwingOverlayTab.value) {
      return deps.doorSwingPreviewMaskCanvas?.value ?? deps.doorSwingPreviewMaskUrl?.value ?? null
    }
    if (onWindowOverlayTab.value) {
      return deps.windowPreviewMaskCanvas?.value ?? null
    }

    const phase = deps.roomPhase?.value ?? 'idle'
    const livePreview = deps.roomPreviewMaskCanvas?.value ?? null
    if (
      phase === 'review' ||
      phase === 'recalculating' ||
      phase === 'finalizing' ||
      phase === 'done'
    ) {
      return livePreview
    }
    return null
  })

  const rasterOverlayRevision = computed(() => {
    if (onGapsFaceOverlayTab.value) return 0
    if (onDoorSwingOverlayTab.value) return deps.doorSwingPreviewMaskRevision?.value ?? 0
    if (onWindowOverlayTab.value) return deps.windowPreviewMaskRevision?.value ?? 0
    return deps.roomPreviewMaskRevision?.value ?? 0
  })

  /** Detectie: face-kleuren overlay; Gaten: demoted faces; Resultaat/Muren: uit. */
  const showRasterOverlay = computed(() => {
    if (!onRoomTab.value) return false
    if (onResultWallsTab.value) return false

    if (onGapsFaceOverlayTab.value) {
      return !!(deps.gapsPreviewMaskCanvas?.value ?? rasterOverlaySrc.value)
    }
    if (onDoorSwingOverlayTab.value) {
      return !!(
        deps.doorSwingPreviewMaskCanvas?.value ??
        deps.doorSwingPreviewMaskUrl?.value ??
        rasterOverlaySrc.value
      )
    }
    if (onWindowOverlayTab.value) {
      return !!(deps.windowPreviewMaskCanvas?.value ?? rasterOverlaySrc.value)
    }

    const phase = deps.roomPhase?.value ?? 'idle'
    if (
      phase === 'review' ||
      phase === 'recalculating' ||
      phase === 'finalizing' ||
      phase === 'done'
    ) {
      return !!(
        deps.roomPreviewMaskCanvas?.value ??
        rasterOverlaySrc.value
      )
    }
    return !!rasterOverlaySrc.value
  })

  const detectionOverlays = computed<DetectionOverlay[]>(() => {
    const output = deps.activePipelineOutput.value
    if (!output || !deps.showTemplates.value) return []
    if (deps.flowStep.value !== 'templates' && deps.flowStep.value !== 'result') return []

    let candidates = output.candidates ?? []

    if (deps.flowStep.value === 'templates') {
      const cls = deps.templateElementClass.value
      if (!cls) return []
      candidates = candidates.filter((c) => c.type === cls)
    } else if (deps.resultTab.value !== 'vector') {
      candidates = []
    }

    return candidates.map((c) => ({
      kind: c.type,
      x: c.bbox.x,
      y: c.bbox.y,
      width: c.bbox.width,
      height: c.bbox.height,
      confidence: c.confidence,
    }))
  })

  const segmentOverlays = computed<SegmentOverlay[]>(() => {
    const output = deps.activePipelineOutput.value
    const cache = deps.preprocessVectorCache.value
    const overlays: SegmentOverlay[] = []
    const onDetectStep = deps.flowStep.value === 'templates' || deps.flowStep.value === 'result'

    if (onDetectStep && deps.showWallLines.value && showWallGeometry.value) {
      const layers =
        output?.pipelineV3Debug?.layers
      const layer1Segments = layers?.layer1?.segments ?? []
      const layer2Segments = layers?.layer2?.segments ?? []
      const layer3Segments = layers?.layer3?.segments ?? []
      const layer4Segments = layers?.layer4?.segments ?? []
      const layer5Segments = layers?.layer5?.segments ?? []
      const layer6Segments = layers?.layer6?.segments ?? []
      const layer7Segments = layers?.layer7?.segments ?? []
      const layer8Segments = layers?.layer8?.segments ?? []
      const layer9Segments = layers?.layer9?.segments ?? []
      const layer10Segments = layers?.layer10?.segments ?? []

      const pushLayerSegments = (
        segments: typeof layer1Segments,
        color: string,
        dashed: boolean,
      ) => {
        if (segments.length === 0) return
        overlays.push(
          ...(segments.map((seg) => ({
            a: seg.a,
            b: seg.b,
            color,
            dashed,
          })) as SegmentOverlay[]),
        )
      }

      if (deps.showSkeleton.value) pushLayerSegments(layer1Segments, '#a855f7', true)
      if (deps.showSkeletonLayerB?.value) pushLayerSegments(layer2Segments, '#f97316', true)
      if (deps.showSemanticLayerC?.value) pushLayerSegments(layer3Segments, '#06b6d4', true)
      if (deps.showLayer4?.value) pushLayerSegments(layer4Segments, '#22c55e', true)
      if (deps.showLayer5?.value) pushLayerSegments(layer5Segments, '#eab308', true)
      if (deps.showLayer6?.value) pushLayerSegments(layer6Segments, '#ef4444', true)
      if (deps.showLayer7?.value) pushLayerSegments(layer7Segments, '#8b5cf6', true)
      if (deps.showLayer8?.value) pushLayerSegments(layer8Segments, '#14b8a6', true)
      if (deps.showLayer9?.value) pushLayerSegments(layer9Segments, '#ec4899', true)
      if (deps.showLayer10?.value) pushLayerSegments(layer10Segments, '#f43f5e', false)
      if (deps.showLayer11?.value) {
        const boundDoors = deps.boundDoors?.value ?? []
        for (const door of boundDoors) {
          const x0 = door.snappedBBox.x
          const y0 = door.snappedBBox.y
          const x1 = x0 + door.snappedBBox.width
          const y1 = y0 + door.snappedBBox.height
          if (!(door.snappedBBox.width > 0) || !(door.snappedBBox.height > 0)) continue
          overlays.push(
            { a: { x: x0, y: y0 }, b: { x: x1, y: y0 }, color: '#38bdf8', dashed: false },
            { a: { x: x1, y: y0 }, b: { x: x1, y: y1 }, color: '#38bdf8', dashed: false },
            { a: { x: x1, y: y1 }, b: { x: x0, y: y1 }, color: '#38bdf8', dashed: false },
            { a: { x: x0, y: y1 }, b: { x: x0, y: y0 }, color: '#38bdf8', dashed: false },
          )
          if (door.openingAxis === 'v') {
            const sx = door.outwardSign < 0 ? x0 : x1
            overlays.push({
              a: { x: sx, y: y0 },
              b: { x: sx, y: y1 },
              color: '#f97316',
              dashed: false,
            })
          } else {
            const sy = door.outwardSign < 0 ? y0 : y1
            overlays.push({
              a: { x: x0, y: sy },
              b: { x: x1, y: sy },
              color: '#f97316',
              dashed: false,
            })
          }
        }
      }
      if (deps.showLayer12?.value) {
        const orientedDoors = deps.orientedDoors?.value ?? []
        const pushPolyline = (points: number[], color: string, dashed: boolean) => {
          if (points.length < 4) return
          for (let i = 0; i + 3 < points.length; i += 2) {
            overlays.push({
              a: { x: points[i]!, y: points[i + 1]! },
              b: { x: points[i + 2]!, y: points[i + 3]! },
              color,
              dashed,
            })
          }
        }
        for (const door of orientedDoors) {
          overlays.push({
            a: door.displayStartPx,
            b: door.displayEndPx,
            color: '#38bdf8',
            dashed: false,
          })
          // FML-span (kozijn-tot-kozijn) als dunne dashed referentie
          overlays.push({
            a: door.openingStartPx,
            b: door.openingEndPx,
            color: '#7dd3fc',
            dashed: true,
          })
          for (const line of door.leafLines) {
            if (line.length < 4) continue
            overlays.push({
              a: { x: line[0]!, y: line[1]! },
              b: { x: line[2]!, y: line[3]! },
              color: '#16a34a',
              dashed: false,
            })
          }
          for (const arc of door.arcPoints) {
            pushPolyline(arc, '#84cc16', true)
          }
          for (const arrow of door.arrowPoints) {
            pushPolyline(arrow, '#0ea5e9', false)
          }
          const hx = door.hingePx.x
          const hy = door.hingePx.y
          overlays.push(
            { a: { x: hx, y: hy - 3 }, b: { x: hx + 3, y: hy }, color: '#22c55e', dashed: false },
            { a: { x: hx + 3, y: hy }, b: { x: hx, y: hy + 3 }, color: '#22c55e', dashed: false },
            { a: { x: hx, y: hy + 3 }, b: { x: hx - 3, y: hy }, color: '#22c55e', dashed: false },
            { a: { x: hx - 3, y: hy }, b: { x: hx, y: hy - 3 }, color: '#22c55e', dashed: false },
          )
        }
      }
      if (deps.showLayer14?.value) {
        const boundWindows = deps.boundWindows?.value ?? []
        for (const window of boundWindows) {
          const x0 = window.openingBBox.x
          const y0 = window.openingBBox.y
          const x1 = x0 + window.openingBBox.width
          const y1 = y0 + window.openingBBox.height
          if (!(window.openingBBox.width > 0) || !(window.openingBBox.height > 0)) continue
          overlays.push(
            { a: { x: x0, y: y0 }, b: { x: x1, y: y0 }, color: '#22d3ee', dashed: false },
            { a: { x: x1, y: y0 }, b: { x: x1, y: y1 }, color: '#22d3ee', dashed: false },
            { a: { x: x1, y: y1 }, b: { x: x0, y: y1 }, color: '#22d3ee', dashed: false },
            { a: { x: x0, y: y1 }, b: { x: x0, y: y0 }, color: '#22d3ee', dashed: false },
          )
          overlays.push({
            a: window.openingStartPx,
            b: window.openingEndPx,
            color: '#067f8a',
            dashed: false,
          })
        }
      }
    }

    if (!vectorDebugLayersAllowed.value || !cache) return overlays

    if (deps.showLines.value) {
      overlays.push(
        ...(cache.rawInk.map((seg) => ({
          a: seg.a,
          b: seg.b,
          color: '#f59e0b',
        })) as SegmentOverlay[]),
      )
    }

    if (deps.showSkeleton.value && !onRoomTab.value) {
      overlays.push(
        ...(cache.skeleton.map((seg) => ({
          a: seg.a,
          b: seg.b,
          color: '#a855f7',
          dashed: true,
        })) as SegmentOverlay[]),
      )
    }
    return overlays
  })

  const junctionOverlays = computed<JunctionOverlay[]>(() => {
    const output = deps.activePipelineOutput.value
    const onDetectStep = deps.flowStep.value === 'templates' || deps.flowStep.value === 'result'
    if (!onDetectStep || !deps.showWallLines.value || !showWallGeometry.value) return []

    const layers = output?.pipelineV3Debug?.layers
    if (!layers) return []

    const overlays: JunctionOverlay[] = []
    const pushLayerJunctions = (
      enabled: boolean | undefined,
      junctions: Array<{ x: number; y: number; kind: JunctionOverlay['kind'] }> | undefined,
    ) => {
      if (!enabled || !junctions?.length) return
      for (const junction of junctions) {
        overlays.push({
          x: junction.x,
          y: junction.y,
          kind: junction.kind,
        })
      }
    }

    pushLayerJunctions(deps.showSkeleton.value, layers.layer1?.junctions)
    pushLayerJunctions(deps.showSkeletonLayerB?.value, layers.layer2?.junctions)
    pushLayerJunctions(deps.showSemanticLayerC?.value, layers.layer3?.junctions)
    pushLayerJunctions(deps.showLayer4?.value, layers.layer4?.junctions)
    pushLayerJunctions(deps.showLayer5?.value, layers.layer5?.junctions)
    pushLayerJunctions(deps.showLayer6?.value, layers.layer6?.junctions)
    pushLayerJunctions(deps.showLayer7?.value, layers.layer7?.junctions)
    pushLayerJunctions(deps.showLayer8?.value, layers.layer8?.junctions)
    pushLayerJunctions(deps.showLayer9?.value, layers.layer9?.junctions)
    pushLayerJunctions(deps.showLayer10?.value, layers.layer10?.junctions)

    return overlays
  })

  const ocrTextOverlays = computed<OcrTextOverlay[]>(() => {
    const onOcrTab =
      (deps.flowStep.value === 'preprocess' && deps.preprocessTab.value === 'ocr') ||
      (deps.flowStep.value === 'templates' && deps.templateTab.value === 'ocr')
    if (!onOcrTab && !deps.showOcrText.value) return []

    const regions =
      deps.ocrMaskedRegions.value.length > 0
        ? deps.ocrMaskedRegions.value
        : deps.ocrPreviewCandidates.value
    if (regions.length === 0) return []

    return regions.map((ocr) => ({
      x: ocr.x,
      y: ocr.y,
      width: ocr.width,
      height: ocr.height,
      text: ocr.text,
      confidence: ocr.confidence,
      key: ocrHitKey(ocr),
    }))
  })

  return {
    showWallGeometry,
    wallOverlayTogglesVisible,
    rasterOverlaySrc,
    rasterOverlayRevision,
    showRasterOverlay,
    detectionOverlays,
    segmentOverlays,
    junctionOverlays,
    ocrTextOverlays,
  }
}
