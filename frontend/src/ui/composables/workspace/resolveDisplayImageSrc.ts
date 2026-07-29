import {
  usesWallBwUnderlay,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { WorkspaceFlowStep } from './constants'

export type DisplayImageSrcInput = {
  flowStep: WorkspaceFlowStep
  preprocessTab: PreprocessPanelLayer
  templateTab: TemplateTab
  resultTab: ResultViewTab
  optimizationBaseSrc: string | null
  imageSrc: string | null
  ocrPreviewUrl: string | null | undefined
  preprocessPreviewUrl: string | null | undefined
  effectiveBwUrl: string | null | undefined
  eraserTouched: boolean
  maskedWorkingSrc: string | null
}

/** Tab/flow underlay choice for canvas — not load/commit (those stay in useWorkspaceImage). */
export function resolveDisplayImageSrc(input: DisplayImageSrcInput): string | undefined {
  const onOcrTab =
    (input.flowStep === 'preprocess' && input.preprocessTab === 'ocr') ||
    (input.flowStep === 'templates' && input.templateTab === 'ocr')

  const allowColorFallback = input.flowStep === 'input' || input.flowStep === 'preprocess'
  const colorFallback = input.optimizationBaseSrc ?? input.imageSrc ?? undefined

  if (onOcrTab) {
    return input.ocrPreviewUrl ?? (allowColorFallback ? colorFallback : undefined)
  }

  // Int muur (Otsu) + Gaten: eigen preview op kleur-origineel — niet effectiveBw.
  if (
    input.flowStep === 'preprocess' &&
    (input.preprocessTab === 'inkWall' || input.preprocessTab === 'gaps')
  ) {
    return (
      input.preprocessPreviewUrl ??
      (allowColorFallback ? colorFallback : undefined) ??
      input.imageSrc ??
      undefined
    )
  }

  const onComposedWallBw =
    (input.flowStep === 'preprocess' && input.preprocessTab === 'walls') ||
    (input.flowStep === 'templates' && usesWallBwUnderlay(input.templateTab)) ||
    (input.flowStep === 'result' && input.resultTab !== 'vector')

  if (onComposedWallBw) {
    return (
      input.effectiveBwUrl ??
      input.preprocessPreviewUrl ??
      (allowColorFallback ? colorFallback : undefined) ??
      input.imageSrc ??
      undefined
    )
  }

  if (input.eraserTouched && input.maskedWorkingSrc) {
    return input.maskedWorkingSrc
  }
  return input.optimizationBaseSrc ?? input.imageSrc ?? undefined
}
