<script setup lang="ts">
import { proxyRefs, computed } from 'vue'
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
import WorkspaceCanvasTabs from '../components/WorkspaceCanvasTabs.vue'
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

const {
  isDev,
  templatesInitialDetectionBusy,
  templatesInitialDetectionSteps,
  faceSelectEnabled,
  ocrHitRemoveEnabled,
  layerDebugVisible,
  debugExportsVisible,
  hasUsedWallMask,
  debugSidebarVisible,
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
}>({
  startNewWorkspace,
})
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-scroll sidebar-compact">
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
          :cv-loader="ws.cvLoader"
          :image-src="ws.imageSrc"
          :eraser-enabled="ws.eraserEnabled"
          :polygon-eraser-enabled="ws.polygonEraserEnabled"
          :crop-include-enabled="ws.cropIncludeEnabled"
          :eraser-touched="ws.eraserTouched"
          :can-undo-mask="ws.canUndoMask"
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
          @reset-preview="ws.onResetPreview"
          @layer-copied="ws.onLayerTuneCopied"
          @download-preprocessed-underlay="ws.downloadPreprocessedUnderlay"
          @set-reference-draw-mode="ws.setReferenceDrawMode"
          @set-reference-pan-mode="ws.setReferencePanMode"
          @update-door-fml-ref-id="ws.onDoorFmlRefIdChange"
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
          :initial-detection-busy="templatesInitialDetectionBusy"
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
          :generated-fml-text="ws.generatedFmlText"
          :generated-stats="ws.generatedStats"
          :fml-wall-height-cm="ws.fmlWallHeightCm"
          :fml-door-height-cm="ws.fmlDoorHeightCm"
          :fml-window-height-cm="ws.fmlWindowHeightCm"
          :fml-window-sill-z-cm="ws.fmlWindowSillZCm"
          :fml-bovenlicht-default="ws.fmlBovenlichtDefault"
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
          :underlay-available="!!ws.fmlUnderlaySrc && !!ws.previewUnderlayLayout"
          @update:underlay-opacity="ws.fmlUnderlayOpacity = $event"
          @update:fml-opacity="ws.fmlContentOpacity = $event"
          @update:fml-wall-height-cm="ws.setFmlWallHeightCm"
          @update:fml-door-height-cm="ws.setFmlDoorHeightCm"
          @update:fml-window-height-cm="ws.setFmlWindowHeightCm"
          @update:fml-window-sill-z-cm="ws.setFmlWindowSillZCm"
          @update:fml-bovenlicht-default="ws.setFmlBovenlichtDefault"
          @update:fml-thickness-min-cm="ws.setFmlThicknessMinCm"
          @update:fml-thickness-mid-cm="ws.setFmlThicknessMidCm"
          @update:fml-thickness-max-cm="ws.setFmlThicknessMaxCm"
          @update:fml-band-mid-boundary-cm="ws.setFmlBandMidBoundaryCm"
          @update:fml-band-max-boundary-cm="ws.setFmlBandMaxBoundaryCm"
          @start-thickness-pick="ws.startFmlThicknessPick"
          @cancel-thickness-pick="ws.cancelFmlThicknessPick"
          @regenerate="ws.regenerateFml"
          @download-generated="ws.downloadGeneratedFml"
        />
      </div>

      <WorkspaceFlowFooter
        :flow-order="ws.flowOrder"
        :flow-step-index="ws.flowStepIndex"
        :flow-next-blocked-hint="ws.flowNextBlockedHint"
        :can-go-back="ws.canGoBack"
        :can-go-next="ws.canGoNext"
        :flow-step="ws.flowStep"
        :next-step-button-label="ws.nextStepButtonLabel"
        @back="ws.goToPreviousStep"
        @next="ws.goToNextStep"
      />
    </aside>

    <div class="canvas-area">
      <DrawingProfilePicker v-if="!ws.imageSrc" @file-input="ws.onFileInput" />

      <template v-else>
        <WorkspaceCanvasTabs
          v-model:preprocess-tab="ws.preprocessTab"
          v-model:template-tab="ws.templateTab"
          v-model:result-tab="ws.resultTab"
          v-model:show-wall-lines="ws.showWallLines"
          v-model:show-lines="ws.showLines"
          :flow-step="ws.flowStep"
          :preprocess-layer-tabs="ws.preprocessLayerTabs"
          :template-layer-tabs="ws.templateLayerTabs"
          :result-layer-tabs="ws.resultLayerTabs"
          :ocr-masked-region-count="ws.ocrMaskedRegionCount"
          :tab-output-ready="ws.tabOutputReady"
          :wall-overlay-toggles-visible="ws.wallOverlayTogglesVisible"
        />

        <div class="canvas-main">
          <WorkspaceFmlPreviewHost
            v-if="onFmlResultTab"
            :plan="ws.previewPlan"
            :underlay-src="
              ws.fmlUnderlayOpacity > 0 || ws.fmlThicknessPickTier ? ws.fmlUnderlaySrc : null
            "
            :underlay-opacity="ws.fmlUnderlayOpacity / 100"
            :content-opacity="ws.fmlContentOpacity / 100"
            :underlay-width-px="ws.fmlUnderlaySize?.width ?? 0"
            :underlay-height-px="ws.fmlUnderlaySize?.height ?? 0"
            :cm-origin="ws.previewUnderlayLayout?.origin ?? null"
            :px-per-mm-x="ws.previewUnderlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="ws.previewUnderlayLayout?.pxPerMmY ?? 1"
            :thickness-pick-tier="ws.fmlThicknessPickTier"
            :thickness-min-cm="ws.fmlThicknessMinCm"
            :thickness-mid-cm="ws.fmlThicknessMidCm"
            :thickness-max-cm="ws.fmlThicknessMaxCm"
            :bovenlicht-default="ws.fmlBovenlichtDefault"
            @plan-update="ws.updatePreviewPlan"
            @thickness-wall-pick="ws.handleFmlThicknessWallPick"
            @cancel-thickness-pick="ws.cancelFmlThicknessPick"
          />
          <WorkspaceFloorplanCanvasHost
            v-else
            :initial-detection-busy="templatesInitialDetectionBusy"
            :initial-detection-steps="templatesInitialDetectionSteps"
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
              :type-colors="ws.typeColors"
              :detection-overlays="ws.detectionOverlays"
              :segment-overlays="ws.segmentOverlays"
              :junction-overlays="ws.junctionOverlays"
              :ocr-text-overlays="ws.ocrTextOverlays"
              :ocr-hit-remove-enabled="ocrHitRemoveEnabled"
              :raster-overlay-src="ws.rasterOverlaySrc"
              :raster-overlay-revision="ws.rasterOverlayRevision"
              :show-raster-overlay="ws.showRasterOverlay"
              :face-select-enabled="faceSelectEnabled"
              :lbe-enabled="ws.lbeEnabled"
              :draw-type="ws.activeClass"
              :image-dimmed="ws.scaleLocked"
              :eraser-enabled="ws.canvasEraserEnabled"
              :eraser-radius="ws.eraserRadius"
              :polygon-tool-mode="ws.canvasPolygonToolMode"
              :polygon-draft-points="ws.polygonDraftPoints"
              :show-scale-overlay="ws.showScaleOverlay"
              :scale-state="ws.scale.state.value"
              :selected-rect-id="ws.selectedRectId"
              :ink-tool="templatesInitialDetectionBusy ? null : ws.canvasInkTool"
              :ink-brush-size="ws.brushSizePx"
              :face-tool="templatesInitialDetectionBusy ? null : ws.canvasFaceTool"
              :instruction-hint="templatesInitialDetectionBusy ? '' : ws.toolbeltCanvasHint"
              :instruction-hint-stale="ws.toolbeltCanvasHintStale"
              :relocate-tool-hints="ws.inkToolbeltVisible && !templatesInitialDetectionBusy"
              :probe-enabled="ws.probeActive"
              :probe-mode="ws.probeMode"
              @lbe-start="ws.startDraw"
              @lbe-move="ws.updateDraw"
              @lbe-end="ws.onLbeEndDraw"
              @lbe-cancel="ws.cancelDraw"
              @select-rect="ws.selectRect"
              @rect-update="ws.onRectUpdate"
              @rect-delete="ws.onRectDelete"
              @erase-stroke="ws.onEraseStroke"
              @polygon-point="ws.onPolygonPoint"
              @polygon-complete="ws.onPolygonComplete"
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
            />
          </WorkspaceFloorplanCanvasHost>
        </div>
      </template>
    </div>

    <WorkspaceDebugSidebar :visible="debugSidebarVisible">
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
        Geen debug-tools op deze stap. Open opnieuw bij voorbewerking (muren), detectie of
        resultaat.
      </p>
    </WorkspaceDebugSidebar>
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
