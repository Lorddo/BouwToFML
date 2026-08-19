<script setup lang="ts">
import { proxyRefs, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FloorplanCanvas from '../components/FloorplanCanvas.vue'
import DrawingUploadPanel from '../components/DrawingUploadPanel.vue'
import DrawingProfilePicker from '../components/DrawingProfilePicker.vue'
import PdfPageSelectDialog from '../components/PdfPageSelectDialog.vue'
import WorkspaceSidebarInputStep from '../components/WorkspaceSidebarInputStep.vue'
import WorkspaceSidebarPreprocessStep from '../components/WorkspaceSidebarPreprocessStep.vue'
import WorkspaceSidebarTemplatesStep from '../components/WorkspaceSidebarTemplatesStep.vue'
import LayerDebugPanel from '../components/LayerDebugPanel.vue'
import WorkspaceFmlResultPanel from '../components/WorkspaceFmlResultPanel.vue'
import WorkspaceFmlPreviewHost from '../components/WorkspaceFmlPreviewHost.vue'
import WorkspaceFloorplanCanvasHost from '../components/WorkspaceFloorplanCanvasHost.vue'
import ResultWallsLayerPanel from '../components/ResultWallsLayerPanel.vue'
import DevSessionPanel from '../components/DevSessionPanel.vue'
import WorkspaceFlowFooter from '../components/WorkspaceFlowFooter.vue'
import WorkspaceDetectionStatusPanel from '../components/WorkspaceDetectionStatusPanel.vue'
import WorkspaceDebugSidebar from '../components/WorkspaceDebugSidebar.vue'
import WorkspaceDebugExportsPanel from '../components/WorkspaceDebugExportsPanel.vue'
import WorkspaceDebugProbePanel from '../components/WorkspaceDebugProbePanel.vue'
import WorkspaceOcrDevPanel from '../components/WorkspaceOcrDevPanel.vue'
import WorkspaceFmlDevPanel from '../components/WorkspaceFmlDevPanel.vue'
import WorkspaceGapsDevPanel from '../components/WorkspaceGapsDevPanel.vue'
import WorkspaceDoorsDevPanel from '../components/WorkspaceDoorsDevPanel.vue'
import WorkspaceWindowsDevPanel from '../components/WorkspaceWindowsDevPanel.vue'
import WorkspaceDevViewPanel from '../components/WorkspaceDevViewPanel.vue'
import WorkspaceDiagnosisFab from '../components/WorkspaceDiagnosisFab.vue'
import ProjectSetupPanel from '../components/ProjectSetupPanel.vue'
import WorkspaceFloorRail from '../components/WorkspaceFloorRail.vue'
import { useWorkspace } from '../composables/useWorkspace'
import { useWorkspaceViewUi } from '../composables/workspace/useWorkspaceViewUi'

/**
 * proxyRefs unwraps top-level Refs for the template, but leaves nested APIs
 * (scale, cvLoader, preprocessPreview) intact so children can still use `.value`.
 * Do NOT use deep reactive() here — that unwraps nested refs and breaks those children.
 */
const api = useWorkspace()
const ws = proxyRefs(api)
const canvasRef = api.canvasRef
const fmlPreviewHostRef = ref<{
  applyCornerMarkerModeFromSettings: () => void
  sanitizeWalls: () => boolean
} | null>(null)
const debugSidebarOpen = ref(false)
const { t } = useI18n()

const {
  isDev,
  templatesBusyOverlay,
  templatesBusyOverlayTitle,
  templatesBusyOverlaySteps,
  faceSelectEnabled,
  ocrHitRemoveEnabled,
  layerDebugVisible,
  debugExportsVisible,
  hasUsedWallMask,
  onFmlResultTab,
  fmlDevPanelVisible,
  gapsDevPanelVisible,
  doorsDevPanelVisible,
  windowsDevPanelVisible,
  devViewPanelVisible,
  debugSidebarEmpty,
  startNewWorkspace,
} = useWorkspaceViewUi({
  flowStep: api.flowStep,
  preprocessTab: api.preprocessTab,
  templateTab: api.templateTab,
  resultTab: api.resultTab,
  roomPhase: api.roomPhase,
  finalizePhase: api.finalizePhase,
  classifyingInFlight: api.classifyingInFlight,
  doorInitialPassReady: api.doorInitialPassReady,
  windowInitialPassReady: api.windowInitialPassReady,
  ocrTextOverlays: api.ocrTextOverlays,
  showOcrText: api.showOcrText,
  combinedOutput: api.combinedOutput,
  imageSrc: api.imageSrc,
  probeVisible: api.probeVisible,
  resetWorkspace: api.resetWorkspace,
  ocrEnabled: computed(() => api.preprocess.value.ocrEnabled ?? false),
  ocrScanning: api.ocrScanning,
  ocrInitialPassReady: api.ocrInitialPassReady,
})

defineExpose<{
  startNewWorkspace: () => void
  applyUserViewerSettings: () => void
}>({
  startNewWorkspace,
  applyUserViewerSettings: () => {
    api.applyUserViewerSettings()
    fmlPreviewHostRef.value?.applyCornerMarkerModeFromSettings()
  },
})
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-scroll sidebar-compact">
        <ProjectSetupPanel
          v-if="ws.flowStep === 'project'"
          :meta="ws.projectMeta"
          :floors="ws.projectFloors"
          :active-floor-id="ws.activeFloorId"
          :active-floor-defaults="ws.activeFloorDefaults"
          :resume-candidate="ws.resumeCandidate"
          @update:meta="ws.updateProjectMeta"
          @update:floor-defaults="ws.updateActiveFloorDefaults"
          @reset-floor-defaults="ws.resetActiveFloorDefaults"
          @add-floor="ws.addFloor()"
          @remove-floor="ws.removeFloor"
          @rename-floor="(id, name) => ws.renameFloor(id, name)"
          @select-floor="ws.switchFloor"
          @move-floor="ws.reorderFloors"
          @resume-project="ws.resumePersistedProject()"
          @discard-project="ws.discardPersistedProject()"
        />

        <DrawingUploadPanel
          v-if="ws.flowStep === 'input'"
          :image-name="ws.imageName ?? ''"
          @file-input="ws.onFileInput"
        />

        <WorkspaceSidebarInputStep
          v-if="ws.flowStep === 'input'"
          v-model:preprocess="ws.preprocess"
          v-model:eraser-radius="ws.eraserRadius"
          :scale="ws.scale"
          :scale-panel-open="ws.scalePanelOpen"
          :scale-input-unit="ws.scaleInputUnit"
          :cv-loader="ws.cvLoader"
          :image-src="ws.imageSrc"
          :eraser-enabled="ws.eraserEnabled"
          :polygon-eraser-enabled="ws.polygonEraserEnabled"
          :crop-include-enabled="ws.cropIncludeEnabled"
          :eraser-touched="ws.eraserTouched"
          :can-undo-mask="ws.canUndoMask"
          :can-reuse-underlay="ws.canReuseUnderlay"
          :underlay-donor-options="ws.underlayDonorOptions"
          :can-bake-rotation="ws.canBakeInputRotation"
          :baking-rotation="ws.inputCommitBusy"
          @update-mm-x="ws.updateMmX"
          @update-mm-y="ws.updateMmY"
          @confirm-scale="ws.onConfirmScale"
          @cancel-scale="ws.onCancelScale"
          @toggle-scale-panel="ws.toggleScalePanel"
          @toggle-eraser="ws.toggleEraser"
          @toggle-polygon-eraser="ws.togglePolygonEraser"
          @toggle-crop-include="ws.toggleCropInclude"
          @reset-mask="ws.onResetMask"
          @undo="ws.undoMaskEdit"
          @download-underlay="ws.downloadUnderlay"
          @reuse-underlay="ws.reuseUnderlayFromProject"
          @bake-rotation="ws.bakeInputRotation"
        />

        <WorkspaceSidebarPreprocessStep
          v-if="ws.flowStep === 'preprocess'"
          v-model:preprocess="ws.preprocess"
          :preprocess-tab="ws.preprocessTab"
          :image-src="ws.imageSrc"
          :preprocess-preview-loading="ws.preprocessPreview.loading.value"
          :reference-wall-thickness-px="ws.referenceWallThicknessPx"
          :measuring-reference-wall="ws.measuringReferenceWall"
          :active-class="ws.activeClass"
          :counts="ws.counts"
          :scale-confirmed="ws.scale.confirmed.value"
          :rects="ws.rects"
          :wall-thickness-limits="{
            minCm: ws.fmlThicknessMinCm,
            midCm: ws.fmlThicknessMidCm,
            maxCm: ws.fmlThicknessMaxCm,
          }"
          :wall-ref-thickness-measures="ws.wallRefThicknessMeasures"
          :selected-rect-id="ws.selectedRectId"
          :can-copy-preprocess-refs="ws.canCopyPreprocessRefs"
          :preprocess-donor-options="ws.preprocessDonorOptions"
          :can-start-wall-stamp="ws.canStartWallStamp"
          :wall-stamp-active="ws.wallStampActive"
          :wall-stamp-baked="ws.wallStampBaked"
          :wall-stamp-busy="ws.wallStampBusy"
          :wall-stamp-error="ws.wallStampError"
          :wall-stamp-bands="ws.wallStampBands"
          :wall-stamp-gum-mode="ws.wallStampGumMode"
          :wall-stamp-brush-radius="ws.wallStampBrushRadius"
          :wall-stamp-donor-options="ws.wallStampDonorOptions"
          :wall-stamp-donor-floor-id="ws.wallStampDonorFloorId"
          @layer-copied="ws.onLayerTuneCopied"
          @download-preprocessed-underlay="ws.downloadPreprocessedUnderlay"
          @set-reference-draw-mode="ws.setReferenceDrawMode"
          @set-reference-pan-mode="ws.setReferencePanMode"
          @update-door-fml-ref-id="ws.onDoorFmlRefIdChange"
          @update-wall-thickness-band="ws.onWallThicknessBandChange"
          @update-wall-thickness-cm="ws.onWallThicknessCmChange"
          @select-wall-ref="ws.selectRect"
          @copy-preprocess-refs="ws.copyPreprocessAndRefsFromDonor"
          @start-wall-stamp="ws.startWallStamp"
          @set-wall-stamp-bands="ws.setWallStampBands"
          @set-wall-stamp-gum-mode="ws.setWallStampGumMode"
          @set-wall-stamp-brush-radius="ws.setWallStampBrushRadius"
          @bake-wall-stamp="ws.bakeWallStamp"
          @cancel-wall-stamp="ws.cancelWallStamp"
          @clear-wall-stamp="ws.clearWallStamp"
        />

        <WorkspaceSidebarTemplatesStep
          v-if="ws.flowStep === 'templates'"
          v-model:preprocess="ws.preprocess"
          :profile-confirmed="ws.profileConfirmed"
          :active-drawing-profile="ws.activeDrawingProfile"
          :template-tab="ws.templateTab"
          :reference-wall-thickness-px="ws.referenceWallThicknessPx"
          :has-reference-wall-rect="ws.hasReferenceWallRect"
          :classifying-in-flight="ws.classifyingInFlight"
          :initial-detection-busy="templatesBusyOverlay"
          :ocr-scanning="ws.ocrScanning"
          :image-src="ws.imageSrc"
          :ocr-candidate-count="ws.ocrCandidateCount"
          :ocr-masked-region-count="ws.ocrMaskedRegionCount"
          :ocr-hit-list="ws.ocrHitList"
          :active-class="ws.activeClass"
          :counts="ws.counts"
          :current-tab-detected="ws.currentTabDetected"
          :room-phase="ws.roomPhase"
          :room-classification-stats="ws.roomClassificationStats"
          :gaps-demote-stats="ws.gapsDemoteStats"
          :door-swing-stats="ws.doorSwingStats"
          :window-face-stats="ws.windowFaceStats"
          :ink-edit-stale="ws.inkEditStale"
          :running="ws.running"
          :signature-preview-list="ws.signaturePreviewList"
          @profile-selected="ws.onProfileSelected"
          @run-ocr-scan="ws.runOcrScan"
          @clear-ocr-candidates="ws.clearOcrCandidates"
          @bake-ocr-into-ink="ws.bakeOcrIntoInk"
          @remove-ocr-hit="ws.removeOcrHit"
          @autoclassify-walls="ws.autoclassifyWalls"
          @set-template-pan-mode="ws.setTemplatePanMode"
          @set-template-draw-mode="ws.setTemplateDrawMode"
          @clear-template-type-rects="ws.clearTemplateTypeRects"
          @finalize-wall-detection="ws.finalizeWallDetection"
          @recalculate-faces="ws.recalculateFaces"
          @update-signature="ws.applySignatureOverride"
          @redetect-render-style="ws.onRedetectRenderStyle"
        />

        <WorkspaceDetectionStatusPanel
          :flow-step="ws.flowStep"
          :template-tab="ws.templateTab"
          :profile-confirmed="ws.profileConfirmed"
          :current-tab-detected="ws.currentTabDetected"
          :room-phase="ws.roomPhase"
          :ocr-masked-region-count="ws.ocrMaskedRegionCount"
          :walls-tab-output-ready="ws.tabOutputReady('walls')"
          :running="ws.running"
          :status="ws.status"
          :hide-status="templatesBusyOverlay"
          :error="ws.error"
          :preprocess-preview-error="ws.preprocessPreview.error.value"
          :scale-locked="ws.scaleLocked"
          :last-output-summary="
            ws.lastOutput?.meta
              ? {
                  extractorId: ws.lastOutput.meta.extractorId,
                  elapsedMs: ws.lastOutput.meta.elapsedMs,
                }
              : null
          "
          :active-segment-count="
            ws.flowStep === 'result' && ws.activePipelineOutput
              ? (ws.activePipelineOutput.segments?.length ?? 0)
              : null
          "
        />

        <ResultWallsLayerPanel
          v-if="ws.flowStep === 'result' && ws.resultTab === 'walls'"
          :show-skeleton="ws.showSkeleton"
          :show-skeleton-layer-b="ws.showSkeletonLayerB"
          :show-semantic-layer-c="ws.showSemanticLayerC"
          :show-layer4="ws.showLayer4"
          :show-layer5="ws.showLayer5"
          :show-layer6="ws.showLayer6"
          :show-layer7="ws.showLayer7"
          :show-layer8="ws.showLayer8"
          :show-layer9="ws.showLayer9"
          :show-layer10="ws.showLayer10"
          :show-layer11="ws.showLayer11"
          :show-layer12="ws.showLayer12"
          :show-layer14="ws.showLayer14"
          :show-wall-lines="ws.showWallLines"
          :show-lines="ws.showLines"
          @toggle-skeleton="ws.showSkeleton = $event"
          @toggle-skeleton-layer-b="ws.showSkeletonLayerB = $event"
          @toggle-semantic-layer-c="ws.showSemanticLayerC = $event"
          @toggle-layer4="ws.showLayer4 = $event"
          @toggle-layer5="ws.showLayer5 = $event"
          @toggle-layer6="ws.showLayer6 = $event"
          @toggle-layer7="ws.showLayer7 = $event"
          @toggle-layer8="ws.showLayer8 = $event"
          @toggle-layer9="ws.showLayer9 = $event"
          @toggle-layer10="ws.showLayer10 = $event"
          @toggle-layer11="ws.showLayer11 = $event"
          @toggle-layer12="ws.showLayer12 = $event"
          @toggle-layer14="ws.showLayer14 = $event"
          @toggle-wall-lines="ws.showWallLines = $event"
          @toggle-lines="ws.showLines = $event"
        />

        <WorkspaceFmlResultPanel
          v-if="ws.flowStep === 'result' && ws.resultTab === 'vector'"
          :scale-confirmed="ws.scale.confirmed.value"
          :has-combined-output="!!ws.combinedOutput"
          :generated-stats="ws.generatedStats"
          :opening-height-overflow="ws.openingHeightOverflow"
          :floor-name="ws.activeFloor?.name ?? ''"
          :fml-wall-height-cm="ws.fmlWallHeightCm"
          :fml-door-height-cm="ws.fmlDoorHeightCm"
          :fml-window-height-cm="ws.fmlWindowHeightCm"
          :fml-window-sill-z-cm="ws.fmlWindowSillZCm"
          :fml-bovenlicht-default="ws.fmlBovenlichtDefault"
          :fml-window-bovenlicht-default="ws.fmlWindowBovenlichtDefault"
          :fml-thickness-min-cm="ws.fmlThicknessMinCm"
          :fml-thickness-mid-cm="ws.fmlThicknessMidCm"
          :fml-thickness-max-cm="ws.fmlThicknessMaxCm"
          :fml-band-mid-boundary-cm="ws.fmlBandMidBoundaryCm"
          :fml-band-max-boundary-cm="ws.fmlBandMaxBoundaryCm"
          :fml-limits-dirty="ws.fmlLimitsDirty"
          :fml-thickness-pick-tier="ws.fmlThicknessPickTier"
          :fml-thickness-pick-message="ws.fmlThicknessPickMessage"
          :fml-thickness-pick-busy="ws.fmlThicknessPickBusy"
          :imported-fml-text="ws.importedFmlText"
          :imported-stats="ws.importedStats"
          :imported-warnings="ws.importedWarnings"
          :underlay-opacity="ws.fmlUnderlayOpacity"
          :fml-opacity="ws.fmlContentOpacity"
          :hide-plan-text="ws.fmlHidePlanText"
          :underlay-available="!!ws.fmlUnderlaySrc && !!ws.previewUnderlayLayout"
          :fml-orient-flip-x="ws.fmlOrient?.flipX === true"
          :has-any-floor-fml="ws.hasAnyFloorFml"
          :project-orient-flip-x="ws.projectOrientFlipX"
          :underlay-move-mode="ws.underlayMoveMode"
          :underlay-flip-x="ws.previewUnderlayLayout?.flipX === true"
          :fml-rescale-active="ws.fmlRescaleActive"
          :fml-rescale-state="ws.fmlRescaleState"
          :fml-rescale-distance-mm-x="ws.fmlRescaleDistanceMmX"
          :fml-rescale-distance-mm-y="ws.fmlRescaleDistanceMmY"
          :scale-input-unit="ws.scaleInputUnit"
          :can-start-rescale="(ws.generatedStats?.walls ?? 0) > 0"
          @update:floor-name="(name) => ws.activeFloorId && ws.renameFloor(ws.activeFloorId, name)"
          @update:underlay-opacity="ws.fmlUnderlayOpacity = $event"
          @update:fml-opacity="ws.fmlContentOpacity = $event"
          @update:hide-plan-text="ws.fmlHidePlanText = $event"
          @update:underlay-move-mode="ws.setUnderlayMoveMode($event)"
          @update:fml-wall-height-cm="ws.setFmlWallHeightCm"
          @update:fml-door-height-cm="ws.setFmlDoorHeightCm"
          @update:fml-window-height-cm="ws.setFmlWindowHeightCm"
          @update:fml-window-sill-z-cm="ws.setFmlWindowSillZCm"
          @update:fml-bovenlicht-default="ws.setFmlBovenlichtDefault"
          @update:fml-window-bovenlicht-default="ws.setFmlWindowBovenlichtDefault"
          @update:fml-thickness-min-cm="ws.setFmlThicknessMinCm"
          @update:fml-thickness-mid-cm="ws.setFmlThicknessMidCm"
          @update:fml-thickness-max-cm="ws.setFmlThicknessMaxCm"
          @update:fml-band-mid-boundary-cm="ws.setFmlBandMidBoundaryCm"
          @update:fml-band-max-boundary-cm="ws.setFmlBandMaxBoundaryCm"
          @update:fml-rescale-distance-mm-x="ws.setFmlRescaleDistanceMmX"
          @update:fml-rescale-distance-mm-y="ws.setFmlRescaleDistanceMmY"
          @start-thickness-pick="ws.startFmlThicknessPick"
          @cancel-thickness-pick="ws.cancelFmlThicknessPick"
          @regenerate="ws.regenerateFml"
          @mirror-vertical="ws.applyFloorOrientOpToPreview('flipX')"
          @mirror-project="ws.applyProjectMirrorVertical()"
          @rotate90-cw="ws.applyFloorOrientOpToPreview('rotCw')"
          @rotate90-ccw="ws.applyFloorOrientOpToPreview('rotCcw')"
          @underlay-rotate90-cw="ws.applyUnderlayOrientOp('rotCw')"
          @underlay-rotate90-ccw="ws.applyUnderlayOrientOp('rotCcw')"
          @underlay-mirror-vertical="ws.applyUnderlayOrientOp('flipX')"
          @begin-rescale="ws.beginFmlRescale()"
          @cancel-rescale="ws.cancelFmlRescale()"
          @confirm-rescale="ws.confirmFmlRescale()"
          @sanitize="fmlPreviewHostRef?.sanitizeWalls()"
        />
      </div>

      <WorkspaceFlowFooter
        :flow-order="ws.flowOrder"
        :flow-step-index="ws.flowStepIndex"
        :flow-next-blocked-hint="ws.flowNextBlockedHint"
        :can-go-back="ws.canGoBack"
        :can-go-next="ws.canGoNext"
        :next-step-button-label="ws.nextStepButtonLabel"
        @back="ws.goToPreviousStep"
        @next="ws.goToNextStep"
      />
    </aside>

    <div class="canvas-area">
      <WorkspaceFloorRail
        v-if="ws.flowStep !== 'project'"
        :floors="ws.projectFloors"
        :active-floor-id="ws.activeFloorId"
        :busy="ws.switchingFloor"
        @select-floor="ws.switchFloor"
        @add-floor="ws.addFloor()"
      />

      <DrawingProfilePicker
        v-if="!ws.imageSrc && ws.flowStep !== 'project'"
        @file-input="ws.onFileInput"
      />

      <template v-else-if="ws.imageSrc && ws.flowStep !== 'project'">
        <div class="canvas-main">
          <WorkspaceFmlPreviewHost
            v-if="onFmlResultTab"
            ref="fmlPreviewHostRef"
            :floor-id="ws.activeFloorId"
            :plan="ws.previewPlan"
            :underlay-src="
              ws.fmlUnderlayOpacity > 0 || ws.fmlThicknessPickTier ? ws.fmlUnderlaySrc : null
            "
            :underlay-opacity="ws.fmlUnderlayOpacity / 100"
            :content-opacity="ws.fmlContentOpacity / 100"
            :labels-visible="!ws.fmlHidePlanText"
            :underlay-width-px="ws.fmlUnderlaySize?.width ?? 0"
            :underlay-height-px="ws.fmlUnderlaySize?.height ?? 0"
            :cm-origin="ws.previewUnderlayLayout?.origin ?? null"
            :px-per-mm-x="ws.previewUnderlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="ws.previewUnderlayLayout?.pxPerMmY ?? 1"
            :rotation-deg="ws.previewUnderlayLayout?.rotationDeg ?? 0"
            :flip-x="ws.previewUnderlayLayout?.flipX === true"
            :underlay-move-mode="ws.underlayMoveMode"
            :thickness-pick-tier="ws.fmlThicknessPickTier"
            :thickness-min-cm="ws.fmlThicknessMinCm"
            :thickness-mid-cm="ws.fmlThicknessMidCm"
            :thickness-max-cm="ws.fmlThicknessMaxCm"
            :bovenlicht-default="ws.fmlBovenlichtDefault"
            :window-bovenlicht-default="ws.fmlWindowBovenlichtDefault"
            :bovenlicht-height-cm="ws.fmlBovenlichtHeightCm"
            :bovenlicht-gap-cm="ws.fmlBovenlichtGapCm"
            :set-fml-nulpunt-image-cm="ws.setFmlNulpuntImageCm"
            :rescale-mode="ws.fmlRescaleActive"
            :rescale-state="ws.fmlRescaleState"
            @plan-update="ws.updatePreviewPlan"
            @thickness-wall-pick="ws.handleFmlThicknessWallPick"
            @cancel-thickness-pick="ws.cancelFmlThicknessPick"
            @update:underlay-move-mode="ws.setUnderlayMoveMode($event)"
            @update-rescale-state="ws.updateFmlRescaleState"
            @cancel-rescale="ws.cancelFmlRescale()"
          />
          <WorkspaceFloorplanCanvasHost
            v-else
            :busy-overlay="templatesBusyOverlay"
            :busy-overlay-title="templatesBusyOverlayTitle"
            :busy-overlay-steps="templatesBusyOverlaySteps"
            :face-toolbelt-visible="ws.faceToolbeltVisible"
            :ink-toolbelt-visible="ws.inkToolbeltVisible"
            :active-face-box-tool="ws.activeFaceBoxTool"
            :active-ink-tool="ws.activeInkTool"
            :ink-brush-size="ws.brushSizePx"
            :can-undo-ink-edit="ws.canUndoInkEdit"
            @update:active-face-box-tool="ws.activeFaceBoxTool = $event"
            @update:active-ink-tool="ws.activeInkTool = $event"
            @update:ink-brush-size="ws.brushSizePx = $event"
            @ink-undo="ws.undoInkEdit"
          >
            <FloorplanCanvas
              key="floorplan-canvas"
              ref="canvasRef"
              :image-src="ws.displayImageSrc"
              :rotation-preview-deg="ws.inputRotationPreviewDeg"
              :lbe-rects="ws.flowStep === 'preprocess' ? ws.rects : []"
              :preview-rect="ws.flowStep === 'preprocess' ? ws.previewRect : null"
              :wall-thickness-limits="
                ws.flowStep === 'preprocess'
                  ? {
                      minCm: ws.fmlThicknessMinCm,
                      midCm: ws.fmlThicknessMidCm,
                      maxCm: ws.fmlThicknessMaxCm,
                    }
                  : null
              "
              :type-colors="ws.typeColors"
              :detection-overlays="ws.detectionOverlays"
              :segment-overlays="ws.segmentOverlays"
              :junction-overlays="ws.junctionOverlays"
              :ocr-text-overlays="ws.ocrTextOverlays"
              :ocr-hit-remove-enabled="ocrHitRemoveEnabled"
              :raster-overlay-src="ws.rasterOverlaySrc"
              :raster-overlay-revision="ws.rasterOverlayRevision"
              :show-raster-overlay="ws.showRasterOverlay"
              :face-select-enabled="faceSelectEnabled && !ws.wallStampActive"
              :lbe-enabled="ws.lbeEnabled && !ws.wallStampActive"
              :draw-type="ws.wallStampActive ? null : ws.activeClass"
              :image-dimmed="ws.scaleLocked"
              :eraser-enabled="
                ws.wallStampCanvasEraserEnabled || (!ws.wallStampActive && ws.canvasEraserEnabled)
              "
              :eraser-radius="
                ws.wallStampCanvasEraserEnabled ? (ws.wallStampBrushRadius ?? 12) : ws.eraserRadius
              "
              :polygon-tool-mode="ws.wallStampCanvasPolygonMode ?? ws.canvasPolygonToolMode"
              :polygon-draft-points="ws.polygonDraftPoints"
              :show-scale-overlay="ws.showScaleOverlay"
              :scale-state="ws.scale.state.value"
              :selected-rect-id="ws.selectedRectId"
              :ink-tool="templatesBusyOverlay || ws.wallStampActive ? null : ws.canvasInkTool"
              :ink-brush-size="ws.brushSizePx"
              :face-tool="templatesBusyOverlay || ws.wallStampActive ? null : ws.canvasFaceTool"
              :instruction-hint="templatesBusyOverlay ? '' : ws.toolbeltCanvasHint"
              :instruction-hint-stale="ws.toolbeltCanvasHintStale"
              :relocate-tool-hints="ws.inkToolbeltVisible && !templatesBusyOverlay"
              :probe-enabled="ws.probeActive"
              :probe-mode="ws.probeMode"
              :wall-stamp-bounds="ws.wallStampActive ? ws.wallStampBounds : null"
              :wall-stamp-ghost-src="ws.wallStampActive ? ws.wallStampPreviewUrl : null"
              :wall-stamp-interactive="!!ws.wallStampActive && ws.wallStampGumMode === 'off'"
              @lbe-start="ws.startDraw"
              @lbe-move="ws.updateDraw"
              @lbe-end="ws.onLbeEndDraw"
              @lbe-cancel="ws.cancelDraw"
              @select-rect="ws.selectRect"
              @rect-update="ws.onRectUpdate"
              @rect-delete="ws.onRectDelete"
              @erase-stroke="
                (pts, radius) =>
                  ws.wallStampCanvasEraserEnabled
                    ? ws.applyWallStampBrushErase(pts)
                    : ws.onEraseStroke(pts, radius)
              "
              @polygon-point="ws.onPolygonPoint"
              @polygon-complete="
                (pts) => {
                  if (ws.wallStampCanvasPolygonMode) {
                    ws.applyWallStampPolygonErase(pts)
                    ws.onPolygonCancel()
                  } else {
                    ws.onPolygonComplete(pts)
                  }
                }
              "
              @polygon-cancel="ws.onPolygonCancel"
              @polygon-undo-point="ws.onPolygonUndoPoint"
              @move-scale-handle="ws.onMoveScaleHandle"
              @face-click="ws.onFaceClick"
              @face-box-select="ws.onFaceBoxSelect"
              @ocr-hit-remove="ws.removeOcrHit"
              @image-loaded="ws.onImageLoaded"
              @ink-brush-stroke="ws.onInkBrushStroke"
              @ink-erase-stroke="ws.onInkEraseStroke"
              @ink-line="ws.onInkLine"
              @ink-rect="ws.onInkRect"
              @probe-sample="ws.onProbeSample"
              @wall-stamp-bounds-change="ws.setWallStampBounds"
            />
          </WorkspaceFloorplanCanvasHost>
        </div>
      </template>
    </div>

    <WorkspaceDebugSidebar v-model:open="debugSidebarOpen">
      <WorkspaceDevViewPanel
        v-if="devViewPanelVisible"
        v-model:preprocess-tab="ws.preprocessTab"
        v-model:template-tab="ws.templateTab"
        v-model:result-tab="ws.resultTab"
        :flow-step="ws.flowStep"
        :ocr-enabled="ws.preprocess.ocrEnabled"
      />

      <DevSessionPanel
        v-if="isDev"
        :busy="ws.devSessionBusy"
        :message="ws.devSessionMessage"
        :has-stored="ws.hasStoredDevSession"
        :sessions="ws.devSessionOptions"
        :selected-session-id="ws.selectedDevSessionId"
        :current-step="ws.flowStep"
        :e2e-fixture-busy="ws.e2eFixtureBusy"
        :e2e-fixture-message="ws.e2eFixtureMessage"
        @select-session="ws.selectDevSession"
        @record="ws.recordDevSession()"
        @restore="ws.restoreDevSession()"
        @export-e2e-fixture="ws.exportE2eFixture()"
      />

      <LayerDebugPanel
        v-if="layerDebugVisible"
        :show-skeleton="ws.showSkeleton"
        :show-layer2="ws.showSkeletonLayerB"
        :show-layer3="ws.showSemanticLayerC"
        :show-layer4="ws.showLayer4"
        :show-layer5="ws.showLayer5"
        :show-layer6="ws.showLayer6"
        :show-layer7="ws.showLayer7"
        :show-layer8="ws.showLayer8"
        :show-layer9="ws.showLayer9"
        :show-layer10="ws.showLayer10"
        :show-layer11="ws.showLayer11"
        :show-layer12="ws.showLayer12"
        :show-layer14="ws.showLayer14"
        :show-lines="ws.showLines"
        :show-ocr-text="ws.showOcrText"
        :wall-pipeline-version="ws.wallPipelineVersion"
        :pipeline-debug="ws.activePipelineOutput?.pipelineV3Debug"
        @toggle-skeleton="ws.showSkeleton = $event"
        @toggle-layer2="ws.showSkeletonLayerB = $event"
        @toggle-layer3="ws.showSemanticLayerC = $event"
        @toggle-layer4="ws.showLayer4 = $event"
        @toggle-layer5="ws.showLayer5 = $event"
        @toggle-layer6="ws.showLayer6 = $event"
        @toggle-layer7="ws.showLayer7 = $event"
        @toggle-layer8="ws.showLayer8 = $event"
        @toggle-layer9="ws.showLayer9 = $event"
        @toggle-layer10="ws.showLayer10 = $event"
        @toggle-layer11="ws.showLayer11 = $event"
        @toggle-layer12="ws.showLayer12 = $event"
        @toggle-layer14="ws.showLayer14 = $event"
        @toggle-lines="ws.showLines = $event"
        @toggle-ocr-text="ws.showOcrText = $event"
      />

      <WorkspaceDebugExportsPanel
        v-if="debugExportsVisible"
        :can-export-report="ws.canExportReport"
        :has-used-wall-mask="hasUsedWallMask"
        :can-export-reference-analysis="
          (ws.counts.wall ?? 0) + (ws.counts.door ?? 0) + (ws.counts.window ?? 0) > 0
        "
        :can-export-door-swing-report="
          (ws.counts.door ?? 0) > 0 && (ws.wallsClassifyReadyForDoors ?? false)
        "
        :can-export-window-face-report="
          (ws.counts.window ?? 0) > 0 && (ws.wallsClassifyReadyForWindows ?? false)
        "
        @export-report="ws.exportExamplesReport"
        @download-used-wall-mask="ws.downloadUsedWallMask"
        @export-reference-analysis="ws.exportReferenceAnalysis"
        @export-door-swing-report="ws.exportDoorSwingReport"
        @export-window-face-report="ws.exportWindowFaceReport"
      />

      <WorkspaceFmlDevPanel
        v-if="fmlDevPanelVisible"
        :enabled="ws.scale.confirmed.value && !!ws.combinedOutput"
        :fml-band-mid-boundary-cm="ws.fmlBandMidBoundaryCm"
        :fml-band-max-boundary-cm="ws.fmlBandMaxBoundaryCm"
        :fml-band-dirty="ws.fmlBandDirty"
        @update:fml-band-mid-boundary-cm="ws.setFmlBandMidBoundaryCm"
        @update:fml-band-max-boundary-cm="ws.setFmlBandMaxBoundaryCm"
      />

      <WorkspaceGapsDevPanel
        v-if="gapsDevPanelVisible"
        v-model:gaps-ink-mode="ws.gapsInkMode"
        :gaps-ink-mode-manual="ws.gapsInkModeManual"
        @set-manual="ws.setGapsInkModeManual"
      />

      <WorkspaceDoorsDevPanel
        v-if="doorsDevPanelVisible"
        v-model:door-swing-stage="ws.doorSwingStage"
        :door-swing-stats="ws.doorSwingStats"
        :resolved-doors="ws.resolvedDoors"
        :bound-doors="ws.boundDoors"
        :oriented-doors="ws.orientedDoors"
      />

      <WorkspaceWindowsDevPanel
        v-if="windowsDevPanelVisible"
        v-model:window-axel-stage="ws.windowAxelStage"
        :window-face-stats="ws.windowFaceStats"
        :resolved-windows="ws.resolvedWindows"
        :bound-windows="ws.boundWindows"
        :window-bind-rejections="ws.windowBindRejections"
        :stage1-rejections="ws.stage1WindowRejections"
        :stage1-candidate-evals="ws.stage1WindowCandidateEvals"
      />

      <WorkspaceOcrDevPanel
        v-if="ws.flowStep === 'templates' && ws.templateTab === 'ocr'"
        v-model:preprocess="ws.preprocess"
      />

      <WorkspaceDebugProbePanel
        v-if="ws.probeVisible"
        :enabled="ws.probeEnabled"
        :active="ws.probeActive"
        :canvas-available="ws.probeCanvasAvailable"
        :mode="ws.probeMode"
        :last-result="ws.lastResult"
        :clipboard-status="ws.clipboardStatus"
        @toggle="ws.toggleProbe"
        @set-mode="ws.setProbeMode"
        @copy="ws.copyProbeToClipboard"
      />

      <p v-if="debugSidebarEmpty" class="debug-empty-hint">
        {{ t('app.debugEmptyHint') }}
      </p>
    </WorkspaceDebugSidebar>

    <WorkspaceDiagnosisFab
      :visible="!!ws.imageSrc && ws.flowStep !== 'project'"
      :export-diagnosis-report="ws.exportDiagnosisReport"
    />
  </div>

  <PdfPageSelectDialog
    v-model:open="ws.showPdfPageDialog"
    :file="ws.pendingPdfFile"
    :confirm-busy="ws.pdfPageConfirmBusy"
    :confirm-error="ws.pdfPageConfirmError"
    @confirm="ws.confirmPdfPage"
    @cancel="ws.cancelPdfPage"
  />
</template>

<style scoped>
.layout {
  display: flex;
  height: calc(100vh - 56px);
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.canvas-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f1f5f9;
}

.canvas-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.canvas-main :deep(.canvas-wrap),
.canvas-main :deep(.fml-preview-wrap) {
  flex: 1;
  min-height: 0;
}

.debug-empty-hint {
  margin: 0;
  padding: 16px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}
</style>
