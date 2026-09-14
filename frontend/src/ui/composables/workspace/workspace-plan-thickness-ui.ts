import { computed, ref, watch, type Ref } from 'vue'
import {
  applyThicknessPick,
  type ThicknessPickTier,
} from '@/core/plan/apply-thickness-pick'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/plan/bovenlicht'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WALL_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/core/plan/extractionToPlan'
import {
  THICKNESS_PICK_SEARCH_CM,
  measureWallThicknessCmOnUnderlay,
} from '@/core/plan/measure-underlay-wall-thickness'
import {
  DEFAULT_THICKNESS_BAND_BOUNDARIES,
  bandBoundariesCmToPx,
  deriveBandBoundariesFromCatalogExtrema,
  loadThicknessBandBoundaries,
  saveThicknessBandBoundaries,
  type ThicknessBandBoundaries,
} from '@/core/plan/wall-thickness-tiers'
import type { WallRefThicknessMeasure } from '@/platform/selection/wall-thickness-ref'
import type { WallThicknessBandBoundariesPx } from '@/core/plan/wall-thickness-chain'
import {
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from '@/core/plan/wall-thickness-catalog'
import {
  DEFAULT_WALL_THICKNESS_LIMITS,
  loadWallThicknessLimits,
  saveWallThicknessLimits,
  type WallThicknessLimits,
} from '@/core/plan/wall-thickness-limits'
import type { FloorPlan } from '@/core/plan/types'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import { tGlobal } from '@/ui/i18n'

const THICKNESS_PICK_LABELS: Record<ThicknessPickTier, string> = {
  min: 'min',
  max: 'max',
}

export type WorkspaceThicknessUiDeps = {
  scale: ReturnType<typeof useHScaleCalibration>
  underlaySrc: Ref<string | null>
  underlaySize: Ref<{ width: number; height: number } | null>
  /** 0 = uit, 100 = volledig opaque. */
  underlayOpacity: Ref<number>
  setLocalError: (message: string | null) => void
  combinedOutput: Ref<ExtractionOutput | null>
  /** Canonieke muur-B/W (0 = inkt) voor band-pick meting. */
  getBaseWallBw: () => { data: Uint8Array; width: number; height: number } | null
  referenceWallBandSync?: {
    referenceWallThicknessPx: Ref<number | null>
    wallRefThicknessMeasures?: Ref<WallRefThicknessMeasure[]>
    wallThicknessBandBoundariesPx?: Ref<WallThicknessBandBoundariesPx | null>
    devSessionRestoring: Ref<boolean>
  }
}

export type WorkspaceThicknessPreview = {
  previewPlan: Ref<FloorPlan | null> | { readonly value: FloorPlan | null }
  generatedPlan: Ref<FloorPlan | null> | { readonly value: FloorPlan | null }
  previewUnderlayLayout: {
    readonly value: {
      origin: { x: number; y: number }
      pxPerMmX: number
      pxPerMmY: number
    } | null
  }
}

export function createWorkspaceThicknessUi(deps: WorkspaceThicknessUiDeps) {
  const storedLimits = loadWallThicknessLimits()
  const storedBandBoundaries = loadThicknessBandBoundaries()
  const planThicknessCms = ref(
    normalizeThicknessCatalog(
      storedLimits.thicknessCms ?? [storedLimits.minCm, storedLimits.midCm, storedLimits.maxCm],
    ),
  )
  const planThicknessMinCm = ref(storedLimits.minCm)
  const planThicknessMidCm = ref(storedLimits.midCm)
  const planThicknessMaxCm = ref(storedLimits.maxCm)
  const planBandMidBoundaryCm = ref(storedBandBoundaries.midBoundaryCm)
  const planBandMaxBoundaryCm = ref(storedBandBoundaries.maxBoundaryCm)
  const planWallHeightCm = ref(DEFAULT_WALL_HEIGHT_CM)
  const planDoorHeightCm = ref(DEFAULT_DOOR_HEIGHT_CM)
  const planWindowHeightCm = ref(DEFAULT_WINDOW_HEIGHT_CM)
  const planWindowSillZCm = ref(DEFAULT_WINDOW_SILL_Z_CM)
  /** Export-only: bovenlicht op alle deuren tenzij per-deur override. Start vanuit user/project defaults. */
  const planBovenlichtDefault = ref(loadUserSettings().defaults.bovenlichtDefault === true)
  /** Export-only: bovenlicht op alle ramen tenzij per-raam override. */
  const planWindowBovenlichtDefault = ref(
    loadUserSettings().defaults.windowBovenlichtDefault === true,
  )
  const planBovenlichtHeightCm = ref(
    loadUserSettings().defaults.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM,
  )
  const planBovenlichtGapCm = ref(loadUserSettings().defaults.bovenlichtGapCm ?? BOVENLICHT_GAP_CM)
  const appliedThicknessLimits = ref<WallThicknessLimits>({ ...storedLimits })
  const appliedBandBoundaries = ref<ThicknessBandBoundaries>({ ...storedBandBoundaries })
  const appliedWallHeightCm = ref(DEFAULT_WALL_HEIGHT_CM)
  const appliedDoorHeightCm = ref(DEFAULT_DOOR_HEIGHT_CM)
  const appliedWindowHeightCm = ref(DEFAULT_WINDOW_HEIGHT_CM)
  const appliedWindowSillZCm = ref(DEFAULT_WINDOW_SILL_Z_CM)
  const thicknessPickTier = ref<ThicknessPickTier | null>(null)
  const thicknessPickMessage = ref<string | null>(null)
  const thicknessPickBusy = ref(false)

  function syncLegacyFromCatalog(cms: number[]): WallThicknessLimits {
    const catalog = normalizeThicknessCatalog(cms)
    const limits = limitsFromCatalog(catalog)
    planThicknessMinCm.value = limits.minCm
    planThicknessMidCm.value = limits.midCm
    planThicknessMaxCm.value = limits.maxCm
    return { ...limits, thicknessCms: catalog }
  }

  watch(
    planThicknessCms,
    (cms) => {
      saveWallThicknessLimits(syncLegacyFromCatalog(cms))
    },
    { deep: true },
  )

  watch([planBandMidBoundaryCm, planBandMaxBoundaryCm], () => {
    saveThicknessBandBoundaries({
      midBoundaryCm: planBandMidBoundaryCm.value,
      maxBoundaryCm: planBandMaxBoundaryCm.value,
    })
  })

  const planLimitsDirty = computed(
    () =>
      planThicknessCms.value.join() !==
        (appliedThicknessLimits.value.thicknessCms ?? []).join() ||
      planThicknessMinCm.value !== appliedThicknessLimits.value.minCm ||
      planThicknessMidCm.value !== appliedThicknessLimits.value.midCm ||
      planThicknessMaxCm.value !== appliedThicknessLimits.value.maxCm ||
      planBandMidBoundaryCm.value !== appliedBandBoundaries.value.midBoundaryCm ||
      planBandMaxBoundaryCm.value !== appliedBandBoundaries.value.maxBoundaryCm,
  )

  const planBandDirty = computed(
    () =>
      planBandMidBoundaryCm.value !== appliedBandBoundaries.value.midBoundaryCm ||
      planBandMaxBoundaryCm.value !== appliedBandBoundaries.value.maxBoundaryCm,
  )

  function applyBandBoundariesFromReferenceWall(
    _referenceWallThicknessPx: number,
    pxPerMmX: number,
    pxPerMmY: number,
    _measures?: WallRefThicknessMeasure[],
  ): void {
    const limits = limitsFromCatalog(planThicknessCms.value)
    const derived = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: limits.minCm,
      largestCm: limits.maxCm,
    })
    planBandMidBoundaryCm.value = derived.midBoundaryCm
    planBandMaxBoundaryCm.value = derived.maxBoundaryCm
    appliedBandBoundaries.value = { ...derived }
    const pxBounds = bandBoundariesCmToPx(derived, pxPerMmX, pxPerMmY)
    if (deps.referenceWallBandSync?.wallThicknessBandBoundariesPx) {
      deps.referenceWallBandSync.wallThicknessBandBoundariesPx.value = pxBounds
    }
  }

  if (deps.referenceWallBandSync) {
    watch(
      () =>
        [
          deps.referenceWallBandSync!.referenceWallThicknessPx.value,
          deps.scale.confirmed.value,
          deps.scale.pixelsPerMillimeterX.value,
          deps.scale.pixelsPerMillimeterY.value,
          deps.referenceWallBandSync!.devSessionRestoring.value,
          planThicknessCms.value.join(),
        ] as const,
      ([refPx, confirmed, pxX, pxY, restoring]) => {
        if (restoring) return
        if (!confirmed || pxX <= 0 || pxY <= 0) return
        applyBandBoundariesFromReferenceWall(refPx ?? 1, pxX, pxY)
      },
    )
  }

  /** Reset export- en banddefaults bij nieuwe onderlegger (geen vorig-project geheugen). */
  function resetPlanSessionDefaults(): void {
    planThicknessCms.value = [...FACTORY_THICKNESS_CMS]
    planThicknessMinCm.value = DEFAULT_WALL_THICKNESS_LIMITS.minCm
    planThicknessMidCm.value = DEFAULT_WALL_THICKNESS_LIMITS.midCm
    planThicknessMaxCm.value = DEFAULT_WALL_THICKNESS_LIMITS.maxCm
    planBandMidBoundaryCm.value = DEFAULT_THICKNESS_BAND_BOUNDARIES.midBoundaryCm
    planBandMaxBoundaryCm.value = DEFAULT_THICKNESS_BAND_BOUNDARIES.maxBoundaryCm
    planWallHeightCm.value = DEFAULT_WALL_HEIGHT_CM
    planDoorHeightCm.value = DEFAULT_DOOR_HEIGHT_CM
    planWindowHeightCm.value = DEFAULT_WINDOW_HEIGHT_CM
    planWindowSillZCm.value = DEFAULT_WINDOW_SILL_Z_CM
    // Niet hard false: onderlegger-reset wist anders project-/settings-bovenlicht tot sync.
    planBovenlichtDefault.value = loadUserSettings().defaults.bovenlichtDefault === true
    planWindowBovenlichtDefault.value = loadUserSettings().defaults.windowBovenlichtDefault === true
    planBovenlichtHeightCm.value =
      loadUserSettings().defaults.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM
    planBovenlichtGapCm.value = loadUserSettings().defaults.bovenlichtGapCm ?? BOVENLICHT_GAP_CM
    appliedThicknessLimits.value = {
      ...DEFAULT_WALL_THICKNESS_LIMITS,
      thicknessCms: [...FACTORY_THICKNESS_CMS],
    }
    appliedBandBoundaries.value = { ...DEFAULT_THICKNESS_BAND_BOUNDARIES }
    appliedWallHeightCm.value = DEFAULT_WALL_HEIGHT_CM
    appliedDoorHeightCm.value = DEFAULT_DOOR_HEIGHT_CM
    appliedWindowHeightCm.value = DEFAULT_WINDOW_HEIGHT_CM
    appliedWindowSillZCm.value = DEFAULT_WINDOW_SILL_Z_CM
    saveWallThicknessLimits(DEFAULT_WALL_THICKNESS_LIMITS)
    saveThicknessBandBoundaries(DEFAULT_THICKNESS_BAND_BOUNDARIES)
  }

  function setPlanThicknessCms(cms: number[]): void {
    planThicknessCms.value = normalizeThicknessCatalog(cms)
  }

  function setPlanThicknessMinCm(value: number): void {
    const next = [...planThicknessCms.value]
    next[0] = value
    setPlanThicknessCms(next)
  }

  function setPlanThicknessMidCm(value: number): void {
    const next = [...planThicknessCms.value]
    next[Math.floor((next.length - 1) / 2)] = value
    setPlanThicknessCms(next)
  }

  function setPlanThicknessMaxCm(value: number): void {
    const next = [...planThicknessCms.value]
    next[next.length - 1] = value
    setPlanThicknessCms(next)
  }

  function setPlanWallHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    planWallHeightCm.value = Math.round(value)
  }

  function setPlanDoorHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    planDoorHeightCm.value = Math.round(value)
  }

  function setPlanWindowHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    planWindowHeightCm.value = Math.round(value)
  }

  function setPlanWindowSillZCm(value: number): void {
    if (!Number.isFinite(value) || value < 0) return
    planWindowSillZCm.value = Math.round(value)
  }

  function setPlanBovenlichtDefault(value: boolean): void {
    planBovenlichtDefault.value = value === true
  }

  function setPlanWindowBovenlichtDefault(value: boolean): void {
    planWindowBovenlichtDefault.value = value === true
  }

  function setPlanBovenlichtHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    planBovenlichtHeightCm.value = Math.round(value)
  }

  function setPlanBovenlichtGapCm(value: number): void {
    if (!Number.isFinite(value) || value < 0) return
    planBovenlichtGapCm.value = Math.round(value)
  }

  function setPlanBandMidBoundaryCm(value: number): void {
    planBandMidBoundaryCm.value = value
  }

  function setPlanBandMaxBoundaryCm(value: number): void {
    planBandMaxBoundaryCm.value = value
  }

  function startThicknessPick(tier: ThicknessPickTier): void {
    if (!deps.scale.confirmed.value || !deps.combinedOutput.value) return
    if (!deps.underlaySrc.value || !deps.underlaySize.value) {
      deps.setLocalError(tGlobal('result.thicknessPick.noUnderlay'))
      return
    }
    if (!deps.getBaseWallBw()) {
      deps.setLocalError(tGlobal('result.thicknessPick.noWallBw'))
      return
    }
    thicknessPickTier.value = tier
    if (deps.underlayOpacity.value <= 0) deps.underlayOpacity.value = 25
    thicknessPickMessage.value = tGlobal('result.thicknessPick.clickWall', {
      tier: THICKNESS_PICK_LABELS[tier],
    })
    deps.setLocalError(null)
  }

  function cancelThicknessPick(): void {
    thicknessPickTier.value = null
    thicknessPickMessage.value = null
    thicknessPickBusy.value = false
  }

  function createHandleThicknessWallPick(preview: WorkspaceThicknessPreview) {
    return async function handleThicknessWallPick(wallId: string): Promise<void> {
      const tier = thicknessPickTier.value
      if (!tier || thicknessPickBusy.value) return

      const plan = preview.previewPlan.value ?? preview.generatedPlan.value
      const wall = plan?.floors[0]?.walls.find((item) => item.id === wallId)
      const layout = preview.previewUnderlayLayout.value
      const wallBw = deps.getBaseWallBw()
      if (!wall || !layout || !wallBw) {
        deps.setLocalError(tGlobal('result.thicknessPick.measureFailed'))
        return
      }

      thicknessPickBusy.value = true
      thicknessPickMessage.value = tGlobal('result.thicknessPick.measuring')
      try {
        const measuredCm = measureWallThicknessCmOnUnderlay({
          wallBw,
          wall,
          origin: layout.origin,
          pxPerMmX: layout.pxPerMmX,
          pxPerMmY: layout.pxPerMmY,
          maxSearchCm: THICKNESS_PICK_SEARCH_CM[tier],
        })
        const applied = applyThicknessPick(tier, measuredCm, {
          limits: {
            minCm: planThicknessMinCm.value,
            midCm: planThicknessMidCm.value,
            maxCm: planThicknessMaxCm.value,
          },
          bandBoundaries: {
            midBoundaryCm: planBandMidBoundaryCm.value,
            maxBoundaryCm: planBandMaxBoundaryCm.value,
          },
        })
        planBandMidBoundaryCm.value = applied.bandBoundaries.midBoundaryCm
        planBandMaxBoundaryCm.value = applied.bandBoundaries.maxBoundaryCm
        thicknessPickMessage.value = tGlobal('result.thicknessPick.applied', {
          tier: THICKNESS_PICK_LABELS[tier],
          length: formatScaleInputLabel(applied.measuredCm, loadUserSettings().scaleInputUnit),
          cm: formatScaleInputLabel(applied.measuredCm, loadUserSettings().scaleInputUnit),
        })
        thicknessPickTier.value = null
      } catch (error) {
        deps.setLocalError(
          error instanceof Error
            ? error.message
            : tGlobal('result.thicknessPick.measureFailedGeneric'),
        )
        thicknessPickMessage.value = tGlobal('result.thicknessPick.retry', {
          tier: THICKNESS_PICK_LABELS[tier],
        })
      } finally {
        thicknessPickBusy.value = false
      }
    }
  }

  return {
    planThicknessCms,
    planThicknessMinCm,
    planThicknessMidCm,
    planThicknessMaxCm,
    planBandMidBoundaryCm,
    planBandMaxBoundaryCm,
    planWallHeightCm,
    planDoorHeightCm,
    planWindowHeightCm,
    planWindowSillZCm,
    planBovenlichtDefault,
    planWindowBovenlichtDefault,
    planBovenlichtHeightCm,
    planBovenlichtGapCm,
    appliedThicknessLimits,
    appliedBandBoundaries,
    appliedWallHeightCm,
    appliedDoorHeightCm,
    appliedWindowHeightCm,
    appliedWindowSillZCm,
    planLimitsDirty,
    planBandDirty,
    thicknessPickTier,
    thicknessPickMessage,
    thicknessPickBusy,
    applyBandBoundariesFromReferenceWall,
    resetPlanSessionDefaults,
    setPlanThicknessCms,
    setPlanThicknessMinCm,
    setPlanThicknessMidCm,
    setPlanThicknessMaxCm,
    setPlanWallHeightCm,
    setPlanDoorHeightCm,
    setPlanWindowHeightCm,
    setPlanWindowSillZCm,
    setPlanBovenlichtDefault,
    setPlanWindowBovenlichtDefault,
    setPlanBovenlichtHeightCm,
    setPlanBovenlichtGapCm,
    setPlanBandMidBoundaryCm,
    setPlanBandMaxBoundaryCm,
    startThicknessPick,
    cancelThicknessPick,
    createHandleThicknessWallPick,
  }
}

export type WorkspaceThicknessUiApi = ReturnType<typeof createWorkspaceThicknessUi>
