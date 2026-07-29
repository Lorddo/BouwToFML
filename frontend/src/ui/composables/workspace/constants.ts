import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessPanelLayer, TemplateTab } from '@/cv/preprocess/layer-preprocess'
import {
  WORKSPACE_PREPROCESS_LAYER_ORDER,
  WORKSPACE_TEMPLATE_LAYER_ORDER,
} from '@/cv/workspace/layer-flow'

export type WorkspaceFlowStep = 'input' | 'preprocess' | 'templates' | 'result'

/** Debounce voor live B/W-preview bij tune-wijzigingen in stap 2. */
export const PREPROCESS_PREVIEW_DEBOUNCE_MS = 220

export const WORKSPACE_FLOW_ORDER: WorkspaceFlowStep[] = ['input', 'preprocess', 'templates', 'result']

export const WORKSPACE_FLOW_LABELS: Record<WorkspaceFlowStep, string> = {
  input: '1. Onderlegger',
  preprocess: '2. Voorbewerking',
  templates: '3. Detectie',
  result: '4. Resultaat',
}

export const TEMPLATE_LAYER_TABS = WORKSPACE_TEMPLATE_LAYER_ORDER
export const PREPROCESS_LAYER_TABS = [...WORKSPACE_PREPROCESS_LAYER_ORDER] as const
export const RESULT_LAYER_TABS = ['walls', 'vector'] as const

/**
 * Gaten-tab UI (stap 2+3); pipeline/code blijft beschikbaar.
 * F — niet aanzetten in deze ronde; sticky redirects houden restore/live assigns op muren.
 */
export const GAPS_TAB_VISIBLE = false

/**
 * Sticky redirect voor verborgen preprocess-tabs.
 * OCR is alleen stap 3 (`useWorkspaceOcr`); gaps-UI uit (`GAPS_TAB_VISIBLE`).
 * DevSession restore mapt ook — deze helper is de gedeelde safety-net voor live assigns.
 */
export function stickyPreprocessTab(tab: PreprocessPanelLayer): PreprocessPanelLayer {
  if (tab === 'ocr' || tab === 'gaps') return 'walls'
  return tab
}

/** Gaps template-tab → muren zolang `GAPS_TAB_VISIBLE` false is. */
export function stickyTemplateTab(tab: TemplateTab): TemplateTab {
  if (tab === 'gaps') return 'walls'
  return tab
}

export function visiblePreprocessLayerTabs(): Array<(typeof PREPROCESS_LAYER_TABS)[number]> {
  const tabs = [...PREPROCESS_LAYER_TABS]
  return GAPS_TAB_VISIBLE ? tabs : tabs.filter((tab) => tab !== 'gaps')
}

export function visibleTemplateLayerTabs(ocrEnabled: boolean): Array<(typeof TEMPLATE_LAYER_TABS)[number]> {
  return TEMPLATE_LAYER_TABS.filter((tab) => {
    if (tab === 'ocr' && !ocrEnabled) return false
    if (tab === 'gaps' && !GAPS_TAB_VISIBLE) return false
    return true
  })
}

export function inputStepCanProceed(params: {
  imageSrc: string | null
  scaleConfirmed: boolean
}): boolean {
  return !!params.imageSrc && params.scaleConfirmed
}

/** Gate stap 2 → 3: muur-ref aanwezig (dikte wordt bij afronden gemeten). */
export function preprocessStepCanProceed(params: {
  imageSrc: string | null
  hasWallRect: boolean
  vectorCacheLoading?: boolean
}): boolean {
  return !!params.imageSrc && params.hasWallRect && !params.vectorCacheLoading
}

export const RESULT_TAB_LABELS: Record<ResultViewTab, string> = {
  walls: 'Muren',
  vector: 'Vector / FML',
}

/** Upscale-floor: langste zijde min. zoveel px (geen downscale). Compromis 3k (4k was te zwaar voor canvas). */
export const OPTIMIZATION_BASE_DIMENSION = 3000
