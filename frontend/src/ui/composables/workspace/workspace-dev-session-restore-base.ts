import type { Ref } from 'vue'
import type { OcrTextCandidate } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { useWorkspaceScale } from './useWorkspaceScale'
import {
  clonePlain,
  decodeMaskBase64,
  isSessionV2,
  type DevWorkspaceSession,
  type DevOpeningReferenceRect,
  type DevWallReferenceRect,
} from '@/platform/dev-workspace'
import {
  normalizeStoredPreprocess,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import { storeProfileId, type DrawingProfileId } from '@/platform/profile'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import { stickyPreprocessTab, stickyTemplateTab } from './constants'

export type WorkspaceDevSessionRestoreBaseDeps = {
  setImageSource: (src: string, name: string) => void
  preprocess: Ref<PreprocessConfig>
  drawingProfileId: Ref<DrawingProfileId>
  wallPipelineVersion: Ref<WallPipelineVersion>
  scaleUi: Pick<
    ReturnType<typeof useWorkspaceScale>,
    'resetScaleFull' | 'restoreFromSessionSnapshot'
  >
  resetInkEdit: () => void
  hydrateInkOverlay: (runs: number[] | null | undefined, width: number, height: number) => void
  hydrateWallStamp: (
    data: import('./useWallStamp').WallStampSerialized | null | undefined,
    width: number,
    height: number,
  ) => void
  rebuildBaseWallBw: (options?: { force?: boolean }) => Promise<boolean>
  composeWallBwPublish: () => Promise<void>
  hydrateMaskState: (args: {
    width: number
    height: number
    eraserMaskBytes?: Uint8Array
    eraserTouched: boolean
    ocrMaskBytes?: Uint8Array
    ocrMaskedRegions?: OcrTextCandidate[]
  }) => void
  loadExactWorkingImage: (dataUrl: string) => Promise<HTMLImageElement>
  prepareExactImageSrcLoad: () => void
  templateTab: Ref<TemplateTab>
  preprocessTab: Ref<PreprocessPanelLayer>
  resultTab: Ref<ResultViewTab>
  profileConfirmed: Ref<boolean>
  clearWorkspaceForSession: () => void
  refreshMaskedWorkingImage: () => void
  clearPreprocessPreview: () => void
  restoreOcrFromRegions: (regions: OcrTextCandidate[]) => void
  referenceWallThicknessPx: Ref<number | null>
  restoreWallReferenceRect: (rect: DevWallReferenceRect) => void
  restoreOpeningReferenceRects: (rects: DevOpeningReferenceRect[]) => void
  setLocalError: (message: string | null) => void
  resetAutoDoorPassGate: () => void
}

export function createWorkspaceDevSessionRestoreBase(deps: WorkspaceDevSessionRestoreBaseDeps) {
  async function restoreBaseSession(session: DevWorkspaceSession): Promise<void> {
    deps.setLocalError(null)
    deps.clearWorkspaceForSession()
    deps.resetAutoDoorPassGate()
    deps.clearPreprocessPreview()
    deps.scaleUi.resetScaleFull()

    deps.prepareExactImageSrcLoad()
    deps.setImageSource(session.workingImagePng, session.imageName)
    const img = await deps.loadExactWorkingImage(session.workingImagePng)
    deps.scaleUi.restoreFromSessionSnapshot(session.scale)

    if (img.naturalWidth !== session.imageWidth || img.naturalHeight !== session.imageHeight) {
      throw new Error(
        `Afbeelding-dimensies komen niet overeen (${img.naturalWidth}×${img.naturalHeight} vs ${session.imageWidth}×${session.imageHeight}).`,
      )
    }

    deps.preprocess.value = normalizeStoredPreprocess(clonePlain(session.preprocess))
    deps.drawingProfileId.value = session.drawingProfileId
    storeProfileId(session.drawingProfileId)

    const pixelCount = session.imageWidth * session.imageHeight
    deps.hydrateMaskState({
      width: session.imageWidth,
      height: session.imageHeight,
      eraserMaskBytes: session.eraserMaskBase64
        ? decodeMaskBase64(session.eraserMaskBase64, pixelCount)
        : undefined,
      eraserTouched: session.eraserTouched,
      ocrMaskBytes: session.ocrMaskBase64
        ? decodeMaskBase64(session.ocrMaskBase64, pixelCount)
        : undefined,
      ocrMaskedRegions: session.ocrMaskedRegions,
    })
    deps.resetInkEdit()
    deps.hydrateInkOverlay(session.inkOverlayRle, session.imageWidth, session.imageHeight)
    deps.hydrateWallStamp(session.wallStamp, session.imageWidth, session.imageHeight)
    if (session.ocrMaskedRegions?.length) {
      deps.restoreOcrFromRegions(session.ocrMaskedRegions)
    } else {
      deps.restoreOcrFromRegions([])
    }
    deps.refreshMaskedWorkingImage()
    void deps.rebuildBaseWallBw({ force: true }).then(() => deps.composeWallBwPublish())

    if (session.referenceWallThicknessPx != null && session.referenceWallThicknessPx > 0) {
      deps.referenceWallThicknessPx.value = session.referenceWallThicknessPx
    }
    if (session.referenceWallRect) {
      deps.restoreWallReferenceRect(session.referenceWallRect)
    }
    if (session.openingRects?.length) {
      deps.restoreOpeningReferenceRects(session.openingRects)
    }
  }

  function applyFlowUiFromSession(session: DevWorkspaceSession): void {
    if (isSessionV2(session)) {
      if (session.flow.preprocessTab) {
        const tab = session.flow.preprocessTab
        // Alleen inkWall/walls blijven; ocr/gaps → walls via stickyPreprocessTab.
        deps.preprocessTab.value = stickyPreprocessTab(tab === 'inkWall' ? 'inkWall' : 'walls')
      }
      if (session.flow.templateTab) {
        const tab = session.flow.templateTab
        deps.templateTab.value = stickyTemplateTab(
          tab === 'ocr' || tab === 'walls' || tab === 'gaps' || tab === 'doors' || tab === 'windows'
            ? tab
            : 'walls',
        )
      }
      if (session.flow.resultTab) deps.resultTab.value = session.flow.resultTab
      deps.profileConfirmed.value = session.flow.profileConfirmed
      deps.wallPipelineVersion.value = 'v3'
    } else {
      deps.templateTab.value = 'walls'
      deps.preprocessTab.value = 'walls'
      deps.profileConfirmed.value = true
      deps.wallPipelineVersion.value = 'v3'
    }
  }

  return {
    restoreBaseSession,
    applyFlowUiFromSession,
  }
}
