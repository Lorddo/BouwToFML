import {
  catalogFromLegacyLimits,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from '@/core/plan/wall-thickness-catalog'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { FloorMeta, ProjectPlanDefaults, ProjectMeta, ProjectState } from './types'

/** Project-/floor-defaults uit user settings (localStorage), anders fabriekswaarden. */
export function createDefaultFloorDefaults(): ProjectPlanDefaults {
  return { ...loadUserSettings().defaults }
}

/**
 * Alleen de muurdikte-catalogus (+ min/mid/max write-through) uit floor-defaults.
 * Geen LBE-rects, geen meetbanden, geen hoogtes — voor «Onderlegger overnemen».
 */
export function thicknessCatalogPatchFromFloorDefaults(
  defaults: Pick<
    ProjectPlanDefaults,
    'thicknessCms' | 'thicknessMinCm' | 'thicknessMidCm' | 'thicknessMaxCm'
  >,
): Pick<
  ProjectPlanDefaults,
  'thicknessCms' | 'thicknessMinCm' | 'thicknessMidCm' | 'thicknessMaxCm'
> {
  const catalog =
    Array.isArray(defaults.thicknessCms) && defaults.thicknessCms.length > 0
      ? normalizeThicknessCatalog(defaults.thicknessCms)
      : catalogFromLegacyLimits({
          minCm: defaults.thicknessMinCm,
          midCm: defaults.thicknessMidCm,
          maxCm: defaults.thicknessMaxCm,
        })
  const limits = limitsFromCatalog(catalog)
  return {
    thicknessCms: [...catalog],
    thicknessMinCm: limits.minCm,
    thicknessMidCm: limits.midCm,
    thicknessMaxCm: limits.maxCm,
  }
}

export function createProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createFloorId(): string {
  return `floor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Floor-namen blijven NL: eindgebruiker (FML), niet UI-locale. */
export const DEFAULT_FLOOR_NAME_NL = 'Begane grond'

export function floorNameIndexedNl(n: number): string {
  return `Verdieping ${n}`
}

export function createDefaultFloorMeta(partial?: Partial<FloorMeta>): FloorMeta {
  return {
    id: partial?.id ?? createFloorId(),
    name: partial?.name ?? DEFAULT_FLOOR_NAME_NL,
    level: partial?.level ?? 0,
    status: partial?.status ?? 'empty',
    defaults: partial?.defaults ? { ...partial.defaults } : createDefaultFloorDefaults(),
  }
}

export function createEmptyProjectState(meta?: Partial<ProjectMeta>): ProjectState {
  const floor = createDefaultFloorMeta()
  return {
    meta: {
      id: meta?.id ?? createProjectId(),
      name: meta?.name ?? '',
      address: meta?.address ?? '',
    },
    sourceUnderlay: null,
    sourcePdfUnderlay: null,
    floors: [floor],
    blobs: {
      [floor.id]: {
        session: null,
        generatedFloor: null,
        previewPlan: null,
        previewUnderlayLayout: null,
        planNulpuntImageCm: null,
        planOrient: null,
        sourceUnderlay: null,
        planUnderlay: null,
        sourceToWorking: null,
        pdfUnderlaySource: null,
        sourcePdfUnderlay: null,
      },
    },
    activeFloorId: floor.id,
  }
}
