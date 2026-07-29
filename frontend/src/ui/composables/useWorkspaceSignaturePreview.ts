import { ref, computed, type ComputedRef, type Ref } from 'vue'
import type { GeometricSignature, WallRenderStyle } from '@/core/extraction/geometric-signature'
import type { ExampleSample } from '@/core/extraction'
import type { SelectionRect } from '@/platform/selection'
import type { PreprocessConfig } from '@/platform/image'
import { createWorkCanvas, scaleBoxesToWork } from '@/platform/image'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { runPreprocessLayer } from '@/cv/layers/preprocess-layer'
import { buildSignatureLibrary } from '@/cv/lbe/signature-library'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import { preparePreprocessMasks, type PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'

import type { WorkspaceFlowStep } from './workspace/constants'

export type SignatureExtractOptions =
  | {
      expectedWallStyles?: WallRenderStyle[]
    }
  | undefined

function scaleSignature(signature: GeometricSignature, factor: number): GeometricSignature {
  if (signature.wall) {
    return {
      ...signature,
      wall: {
        ...signature.wall,
        thicknessPx: Math.max(1, Math.round(signature.wall.thicknessPx * factor)),
        parallelSpacingPx: signature.wall.parallelSpacingPx
          ? Math.max(1, Math.round(signature.wall.parallelSpacingPx * factor))
          : undefined,
        minLengthPx: Math.max(1, Math.round(signature.wall.minLengthPx * factor)),
        closeKernelPx: signature.wall.closeKernelPx
          ? Math.max(1, Math.round(signature.wall.closeKernelPx * factor))
          : undefined,
        lineFingerprint: signature.wall.lineFingerprint
          ? {
              ...signature.wall.lineFingerprint,
              medianLengthPx: Math.max(
                1,
                Math.round(signature.wall.lineFingerprint.medianLengthPx * factor),
              ),
              spacingPx: signature.wall.lineFingerprint.spacingPx
                ? Math.max(1, Math.round(signature.wall.lineFingerprint.spacingPx * factor))
                : undefined,
            }
          : undefined,
      },
    }
  }
  return signature
}

export function useWorkspaceSignaturePreview(deps: {
  rects: Ref<SelectionRect[]>
  flowStep: Ref<WorkspaceFlowStep>
  templateElementClass: ComputedRef<'wall' | null>
  preprocess: Ref<PreprocessConfig>
  signatureExtractOptions: ComputedRef<SignatureExtractOptions>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  imageDimensions: (img: HTMLImageElement | HTMLCanvasElement) => { width: number; height: number }
  preprocessMaskArgs: () => PreprocessMaskInput
}) {
  const signaturePreview = ref<Record<string, GeometricSignature>>({})

  const signaturePreviewList = computed<GeometricSignature[]>(() =>
    deps.rects.value
      .filter((rect) => {
        if (deps.flowStep.value !== 'templates') return true
        const cls = deps.templateElementClass.value
        return cls != null && rect.type === cls
      })
      .map((rect) => rect.signature ?? signaturePreview.value[rect.id])
      .filter((sig): sig is GeometricSignature => !!sig),
  )

  function examplesWithSignatures(): ExampleSample[] {
    return deps.rects.value.map((r) => ({
      id: r.id,
      type: r.type,
      bbox: { x: r.x, y: r.y, width: r.width, height: r.height },
      signature: r.signature ?? signaturePreview.value[r.id],
    }))
  }

  function applySignatureOverride(sourceExampleId: string, signature: GeometricSignature) {
    const idx = deps.rects.value.findIndex((rect) => rect.id === sourceExampleId)
    if (idx < 0) return
    const next = [...deps.rects.value]
    next[idx] = {
      ...next[idx],
      signature: { ...signature, sourceExampleId },
    }
    deps.rects.value = next
    signaturePreview.value = {
      ...signaturePreview.value,
      [sourceExampleId]: { ...signature, sourceExampleId },
    }
  }

  function onRedetectRenderStyle(sourceExampleId: string) {
    const idx = deps.rects.value.findIndex((rect) => rect.id === sourceExampleId)
    if (idx >= 0 && deps.rects.value[idx].signature?.wall) {
      const next = [...deps.rects.value]
      next[idx] = {
        ...next[idx],
        signature: {
          ...next[idx].signature!,
          wall: {
            ...next[idx].signature!.wall!,
            renderStyleSource: 'auto',
          },
        },
      }
      deps.rects.value = next
    }
    void refreshSignaturePreview()
  }

  function clearSignatureForRect(id: string) {
    const idx = deps.rects.value.findIndex((rect) => rect.id === id)
    if (idx >= 0 && deps.rects.value[idx].signature) {
      const next = [...deps.rects.value]
      const { signature: _sig, ...rest } = next[idx]
      next[idx] = rest
      deps.rects.value = next
    }
    const { [id]: _removed, ...restPreview } = signaturePreview.value
    signaturePreview.value = restPreview
  }

  function pruneSignaturePreview() {
    signaturePreview.value = Object.fromEntries(
      Object.entries(signaturePreview.value).filter(([id]) => {
        const rect = deps.rects.value.find((item) => item.id === id)
        return !!rect
      }),
    )
  }

  async function refreshSignaturePreview() {
    if (deps.rects.value.length === 0 || deps.flowStep.value !== 'templates') {
      signaturePreview.value = {}
      return
    }
    try {
      const img = await deps.getImageEl()
      const { width, height } = deps.imageDimensions(img)
      const cv = await waitForOpenCV()
      const work = createWorkCanvas(img)
      const scaledExamples = deps.rects.value.map((rect) => ({
        id: rect.id,
        type: rect.type,
        bbox: scaleBoxesToWork([{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }], work.scale)[0],
        signature: rect.signature ? scaleSignature(rect.signature, work.scale) : undefined,
      }))
      const masks = preparePreprocessMasks({
        ...deps.preprocessMaskArgs(),
        includeOcrMask: true,
        srcWidth: width,
        srcHeight: height,
        dstWidth: work.workWidth,
        dstHeight: work.workHeight,
      })
      const layerCtx = {
        cv,
        image: work.canvas,
        examples: scaledExamples,
        eraserMask: masks.eraserMask,
      }
      const wallPre = runPreprocessLayer({
        ...layerCtx,
        preprocess: resolveLayerPreprocess(deps.preprocess.value, 'walls'),
      })
      const wallSigs = buildSignatureLibrary(
        cv,
        wallPre.mat,
        scaledExamples.filter((e) => e.type === 'wall'),
        deps.signatureExtractOptions.value,
      ).all
      wallPre.mat.delete()
      const signatures = [...wallSigs]
      const factor = work.scale >= 1 ? 1 : 1 / work.scale
      signaturePreview.value = Object.fromEntries(
        signatures.map((signature) => [
          signature.sourceExampleId,
          factor === 1 ? signature : scaleSignature(signature, factor),
        ]),
      )
    } catch {
      signaturePreview.value = {}
    }
  }

  function resetSignaturePreview() {
    signaturePreview.value = {}
  }

  return {
    signaturePreview,
    signaturePreviewList,
    examplesWithSignatures,
    applySignatureOverride,
    onRedetectRenderStyle,
    clearSignatureForRect,
    pruneSignaturePreview,
    refreshSignaturePreview,
    resetSignaturePreview,
  }
}
