import { tally } from '@/core/diagnostics'
import type { PreprocessPanelLayer, TemplateTab } from '@/cv/preprocess/layer-preprocess'
import {
  WORKSPACE_PREPROCESS_LAYER_ORDER,
  WORKSPACE_TEMPLATE_LAYER_ORDER,
} from '@/cv/workspace/layer-flow'

export type WorkspaceFlowStep = 'project' | 'input' | 'preprocess' | 'templates' | 'result'

/** Debounce voor live B/W-preview bij tune-wijzigingen in stap 2. */
export const PREPROCESS_PREVIEW_DEBOUNCE_MS = 220

export const WORKSPACE_FLOW_ORDER: WorkspaceFlowStep[] = [
  'project',
  'input',
  'preprocess',
  'templates',
  'result',
]

export { WORKSPACE_FLOW_LABELS, RESULT_TAB_LABELS } from '@/ui/i18n/labels'

export const TEMPLATE_LAYER_TABS = WORKSPACE_TEMPLATE_LAYER_ORDER
export const PREPROCESS_LAYER_TABS = [...WORKSPACE_PREPROCESS_LAYER_ORDER] as const
export const RESULT_LAYER_TABS = ['walls', 'vector'] as const

/**
 * Gaten-tab UI (stap 2+3); pipeline/code blijft beschikbaar.
 * F — niet aanzetten in deze ronde; sticky redirects houden restore/live assigns op muren.
 */
// ESC:O-46 (B)
export const GAPS_TAB_VISIBLE = false

/**
 * Canvas-tabs verborgen voor productie; bereikbaar via Dev-view switcher
 * (zet intern nog steeds preprocessTab / templateTab / resultTab).
 * Geen sticky-redirect voor deze tabs — anders kan Dev niet op de view blijven.
 * Gaps wél sticky (zie sticky* hieronder).
 */
export const INK_WALL_TAB_VISIBLE = false
export const DOORS_TAB_VISIBLE = false
export const WINDOWS_TAB_VISIBLE = false
export const OCR_TAB_VISIBLE = false
export const RESULT_WALLS_TAB_VISIBLE = false

/**
 * Sticky redirect voor verborgen preprocess-tabs.
 * OCR is alleen stap 3 (`useWorkspaceOcr`); gaps-UI uit (`GAPS_TAB_VISIBLE`).
 * inkWall blijft bereikbaar via Dev (geen redirect).
 * DevSession restore mapt ook — deze helper is de gedeelde safety-net voor live assigns.
 */
// ESC:O-13 (D)
export function stickyPreprocessTab(tab: PreprocessPanelLayer): PreprocessPanelLayer {
  if (tab === 'ocr' || tab === 'gaps') {
    tally('O-13', 'redirect_walls')
    return 'walls'
  }
  return tab
}

/**
 * Gaps template-tab → muren zolang `GAPS_TAB_VISIBLE` false is.
 * doors/windows/ocr blijven bereikbaar via Dev (geen redirect).
 */
export function stickyTemplateTab(tab: TemplateTab): TemplateTab {
  if (tab === 'gaps') return 'walls'
  return tab
}

export function visiblePreprocessLayerTabs(): Array<(typeof PREPROCESS_LAYER_TABS)[number]> {
  const tabs = [...PREPROCESS_LAYER_TABS]
  if (!GAPS_TAB_VISIBLE) tally('O-46', 'gaps_hidden')
  return tabs.filter((tab) => {
    if (tab === 'gaps' && !GAPS_TAB_VISIBLE) return false
    if (tab === 'inkWall' && !INK_WALL_TAB_VISIBLE) return false
    return true
  })
}

export function visibleTemplateLayerTabs(
  _ocrEnabled: boolean,
): Array<(typeof TEMPLATE_LAYER_TABS)[number]> {
  return TEMPLATE_LAYER_TABS.filter((tab) => {
    // OCR-canvas-tab uit; Dev-view zet intern `templateTab = 'ocr'` als ocrEnabled.
    if (tab === 'ocr' && !OCR_TAB_VISIBLE) return false
    if (tab === 'gaps' && !GAPS_TAB_VISIBLE) return false
    if (tab === 'doors' && !DOORS_TAB_VISIBLE) return false
    if (tab === 'windows' && !WINDOWS_TAB_VISIBLE) return false
    return true
  })
}

export function visibleResultLayerTabs(): Array<(typeof RESULT_LAYER_TABS)[number]> {
  return RESULT_LAYER_TABS.filter((tab) => {
    if (tab === 'walls' && !RESULT_WALLS_TAB_VISIBLE) return false
    return true
  })
}

export function projectStepCanProceed(params: {
  name: string
  address: string
  floorCount: number
  activeFloorId: string | null
}): boolean {
  return params.name.trim().length > 0 && params.floorCount >= 1 && !!params.activeFloorId
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

/** Upscale-floor: langste zijde min. zoveel px (geen downscale). Compromis 3k (4k was te zwaar voor canvas). */
export const OPTIMIZATION_BASE_DIMENSION = 3000
