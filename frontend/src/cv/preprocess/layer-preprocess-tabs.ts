/** Lagen met eigen B/W-tune in PreprocessConfig. */
export type PreprocessLayerId = 'walls' | 'ocr' | 'gaps'
/** Detectietabs met pipeline-output (zonder OCR/gaten/openingen). */
export type WallTechniqueTab = 'walls'
export type DetectionLayerId = WallTechniqueTab
/** Opening-tabs op stap 3 (overlay-gedreven, geen eigen geometry-extractor). */
export type OpeningTemplateTab = 'doors' | 'windows'
/** Stap-2 canvas-tabs: tune-lagen + read-only Int muur. */
export type PreprocessPanelLayer = PreprocessLayerId | 'inkWall'
export type TemplateTab = 'ocr' | WallTechniqueTab | 'gaps' | OpeningTemplateTab

export const TEMPLATE_TAB_LABELS: Record<TemplateTab, string> = {
  ocr: 'OCR / Tekst',
  walls: 'Muren',
  gaps: 'Gaten',
  doors: 'Deuren',
  windows: 'Ramen',
}

export const PREPROCESS_TAB_LABELS: Record<PreprocessPanelLayer, string> = {
  ocr: 'OCR / Tekst',
  walls: 'Voorbewerking',
  inkWall: 'Int muur',
  gaps: 'Gaten',
}

export function isPreprocessLayerId(layer: string): layer is PreprocessLayerId {
  return layer === 'walls' || layer === 'ocr' || layer === 'gaps'
}

export function templateTabToElementClass(tab: TemplateTab): 'wall' | null {
  if (tab === 'walls') return 'wall'
  return null
}

/** Muur-techniek tab met eigen detectie-pipeline (niet gaten-mirror). */
export function isWallTechniqueTab(tab: TemplateTab): tab is WallTechniqueTab {
  return tab === 'walls'
}

/**
 * Stap 3: muur-B/W als canvas-onderlegger.
 * Gaten/Deuren gebruiken dezelfde muur-onderlegger als Muren; gapsLayer wordt
 * alleen tegenaan gehouden voor demote (zoals Int muur/Otsu bij classify).
 */
export function usesWallBwUnderlay(tab: TemplateTab): boolean {
  return tab === 'walls' || tab === 'gaps' || tab === 'doors' || tab === 'windows'
}

/** Stap 3: face-demote overlay op gaten-pipeline. */
export function usesGapsFaceOverlay(tab: TemplateTab): boolean {
  return tab === 'gaps'
}

/** Stap 3: eigen Deuren-overlay met draaiboog-hypotheses. */
export function usesDoorSwingOverlay(tab: TemplateTab): boolean {
  return tab === 'doors'
}

/** Stap 3: eigen Ramen-overlay met axel-pattern hypotheses. */
export function usesWindowOverlay(tab: TemplateTab): boolean {
  return tab === 'windows'
}

/** Muur face/segment-overlays — alleen Muren-tab (niet Gaten residual). */
export function usesWallDetectionOverlays(tab: TemplateTab): boolean {
  return tab === 'walls'
}
