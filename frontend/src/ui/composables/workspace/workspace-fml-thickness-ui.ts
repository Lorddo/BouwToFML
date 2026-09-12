import { computed, ref, watch, type Ref } from 'vue'
import {
  applyFmlThicknessPick,
  type FmlThicknessPickTier,
} from '@/core/fml/apply-fml-thickness-pick'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extractionToPlan'
import {
  FML_THICKNESS_PICK_SEARCH_CM,
  measureWallThicknessCmOnUnderlay,
} from '@/core/fml/measure-underlay-wall-thickness'
import {
  DEFAULT_FML_BAND_BOUNDARIES,
  bandBoundariesCmToPx,
  deriveFmlBandBoundariesFromCatalogExtrema,
  loadFmlThicknessBandBoundaries,
  saveFmlThicknessBandBoundaries,
  type FmlThicknessBandBoundaries,
} from '@/core/fml/fml-wall-thickness-tiers'
import type { WallRefThicknessMeasure } from '@/platform/selection/wall-thickness-ref'
import type { WallThicknessBandBoundariesPx } from '@/core/fml/wall-thickness-chain'
import {
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from '@/core/fml/fml-wall-thickness-catalog'
import {
  DEFAULT_FML_WALL_THICKNESS_LIMITS,
  loadFmlWallThicknessLimits,
  saveFmlWallThicknessLimits,
  type FmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'
import type { FloorPlan } from '@/core/fml/types'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import { tGlobal } from '@/ui/i18n'

const THICKNESS_PICK_LABELS: Record<FmlThicknessPickTier, string> = {
  min: 'min',
  max: 'max',
}

export type WorkspaceFmlThicknessUiDeps = {
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

export type WorkspaceFmlThicknessPreview = {
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

export function createWorkspaceFmlThicknessUi(deps: WorkspaceFmlThicknessUiDeps) {
  const storedLimits = loadFmlWallThicknessLimits()
  const storedBandBoundaries = loadFmlThicknessBandBoundaries()
  const fmlThicknessCms = ref(
    normalizeThicknessCatalog(
      storedLimits.thicknessCms ?? [storedLimits.minCm, storedLimits.midCm, storedLimits.maxCm],
    ),
  )
  const fmlThicknessMinCm = ref(storedLimits.minCm)
  const fmlThicknessMidCm = ref(storedLimits.midCm)
  const fmlThicknessMaxCm = ref(storedLimits.maxCm)
  const fmlBandMidBoundaryCm = ref(storedBandBoundaries.midBoundaryCm)
  const fmlBandMaxBoundaryCm = ref(storedBandBoundaries.maxBoundaryCm)
  const fmlWallHeightCm = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const fmlDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
  const fmlWindowHeightCm = ref(DEFAULT_FML_WINDOW_HEIGHT_CM)
  const fmlWindowSillZCm = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
  /** Export-only: bovenlicht op alle deuren tenzij per-deur override. Start vanuit user/project defaults. */
  const fmlBovenlichtDefault = ref(loadUserSettings().defaults.bovenlichtDefault === true)
  /** Export-only: bovenlicht op alle ramen tenzij per-raam override. */
  const fmlWindowBovenlichtDefault = ref(
    loadUserSettings().defaults.windowBovenlichtDefault === true,
  )
  const fmlBovenlichtHeightCm = ref(
    loadUserSettings().defaults.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM,
  )
  const fmlBovenlichtGapCm = ref(loadUserSettings().defaults.bovenlichtGapCm ?? BOVENLICHT_GAP_CM)
  const appliedFmlThicknessLimits = ref<FmlWallThicknessLimits>({ ...storedLimits })
  const appliedFmlBandBoundaries = ref<FmlThicknessBandBoundaries>({ ...storedBandBoundaries })
  const appliedFmlWallHeightCm = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const appliedFmlDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
  const appliedFmlWindowHeightCm = ref(DEFAULT_FML_WINDOW_HEIGHT_CM)
  const appliedFmlWindowSillZCm = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
  const fmlThicknessPickTier = ref<FmlThicknessPickTier | null>(null)
  const fmlThicknessPickMessage = ref<string | null>(null)
  const fmlThicknessPickBusy = ref(false)

  function syncLegacyFromCatalog(cms: number[]): FmlWallThicknessLimits {
    const catalog = normalizeThicknessCatalog(cms)
    const limits = limitsFromCatalog(catalog)
    fmlThicknessMinCm.value = limits.minCm
    fmlThicknessMidCm.value = limits.midCm
    fmlThicknessMaxCm.value = limits.maxCm
    return { ...limits, thicknessCms: catalog }
  }

  watch(
    fmlThicknessCms,
    (cms) => {
      saveFmlWallThicknessLimits(syncLegacyFromCatalog(cms))
    },
    { deep: true },
  )

  watch([fmlBandMidBoundaryCm, fmlBandMaxBoundaryCm], () => {
    saveFmlThicknessBandBoundaries({
      midBoundaryCm: fmlBandMidBoundaryCm.value,
      maxBoundaryCm: fmlBandMaxBoundaryCm.value,
    })
  })

  const fmlLimitsDirty = computed(
    () =>
      fmlThicknessCms.value.join() !==
        (appliedFmlThicknessLimits.value.thicknessCms ?? []).join() ||
      fmlThicknessMinCm.value !== appliedFmlThicknessLimits.value.minCm ||
      fmlThicknessMidCm.value !== appliedFmlThicknessLimits.value.midCm ||
      fmlThicknessMaxCm.value !== appliedFmlThicknessLimits.value.maxCm ||
      fmlBandMidBoundaryCm.value !== appliedFmlBandBoundaries.value.midBoundaryCm ||
      fmlBandMaxBoundaryCm.value !== appliedFmlBandBoundaries.value.maxBoundaryCm,
  )

  const fmlBandDirty = computed(
    () =>
      fmlBandMidBoundaryCm.value !== appliedFmlBandBoundaries.value.midBoundaryCm ||
      fmlBandMaxBoundaryCm.value !== appliedFmlBandBoundaries.value.maxBoundaryCm,
  )

  function applyBandBoundariesFromReferenceWall(
    _referenceWallThicknessPx: number,
    pxPerMmX: number,
    pxPerMmY: number,
    _measures?: WallRefThicknessMeasure[],
  ): void {
    const limits = limitsFromCatalog(fmlThicknessCms.value)
    const derived = deriveFmlBandBoundariesFromCatalogExtrema({
      smallestCm: limits.minCm,
      largestCm: limits.maxCm,
    })
    fmlBandMidBoundaryCm.value = derived.midBoundaryCm
    fmlBandMaxBoundaryCm.value = derived.maxBoundaryCm
    appliedFmlBandBoundaries.value = { ...derived }
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
          fmlThicknessCms.value.join(),
        ] as const,
      ([refPx, confirmed, pxX, pxY, restoring]) => {
        if (restoring) return
        if (!confirmed || pxX <= 0 || pxY <= 0) return
        applyBandBoundariesFromReferenceWall(refPx ?? 1, pxX, pxY)
      },
    )
  }

  /** Reset export- en banddefaults bij nieuwe onderlegger (geen vorig-project geheugen). */
  function resetFmlSessionDefaults(): void {
    fmlThicknessCms.value = [...FACTORY_THICKNESS_CMS]
    fmlThicknessMinCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm
    fmlThicknessMidCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm
    fmlThicknessMaxCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm
    fmlBandMidBoundaryCm.value = DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm
    fmlBandMaxBoundaryCm.value = DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm
    fmlWallHeightCm.value = DEFAULT_FML_WALL_HEIGHT_CM
    fmlDoorHeightCm.value = DEFAULT_FML_DOOR_HEIGHT_CM
    fmlWindowHeightCm.value = DEFAULT_FML_WINDOW_HEIGHT_CM
    fmlWindowSillZCm.value = DEFAULT_FML_WINDOW_SILL_Z_CM
    // Niet hard false: onderlegger-reset wist anders project-/settings-bovenlicht tot sync.
    fmlBovenlichtDefault.value = loadUserSettings().defaults.bovenlichtDefault === true
    fmlWindowBovenlichtDefault.value = loadUserSettings().defaults.windowBovenlichtDefault === true
    fmlBovenlichtHeightCm.value =
      loadUserSettings().defaults.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM
    fmlBovenlichtGapCm.value = loadUserSettings().defaults.bovenlichtGapCm ?? BOVENLICHT_GAP_CM
    appliedFmlThicknessLimits.value = {
      ...DEFAULT_FML_WALL_THICKNESS_LIMITS,
      thicknessCms: [...FACTORY_THICKNESS_CMS],
    }
    appliedFmlBandBoundaries.value = { ...DEFAULT_FML_BAND_BOUNDARIES }
    appliedFmlWallHeightCm.value = DEFAULT_FML_WALL_HEIGHT_CM
    appliedFmlDoorHeightCm.value = DEFAULT_FML_DOOR_HEIGHT_CM
    appliedFmlWindowHeightCm.value = DEFAULT_FML_WINDOW_HEIGHT_CM
    appliedFmlWindowSillZCm.value = DEFAULT_FML_WINDOW_SILL_Z_CM
    saveFmlWallThicknessLimits(DEFAULT_FML_WALL_THICKNESS_LIMITS)
    saveFmlThicknessBandBoundaries(DEFAULT_FML_BAND_BOUNDARIES)
  }

  function setFmlThicknessCms(cms: number[]): void {
    fmlThicknessCms.value = normalizeThicknessCatalog(cms)
  }

  function setFmlThicknessMinCm(value: number): void {
    const next = [...fmlThicknessCms.value]
    next[0] = value
    setFmlThicknessCms(next)
  }

  function setFmlThicknessMidCm(value: number): void {
    const next = [...fmlThicknessCms.value]
    next[Math.floor((next.length - 1) / 2)] = value
    setFmlThicknessCms(next)
  }

  function setFmlThicknessMaxCm(value: number): void {
    const next = [...fmlThicknessCms.value]
    next[next.length - 1] = value
    setFmlThicknessCms(next)
  }

  function setFmlWallHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    fmlWallHeightCm.value = Math.round(value)
  }

  function setFmlDoorHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    fmlDoorHeightCm.value = Math.round(value)
  }

  function setFmlWindowHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    fmlWindowHeightCm.value = Math.round(value)
  }

  function setFmlWindowSillZCm(value: number): void {
    if (!Number.isFinite(value) || value < 0) return
    fmlWindowSillZCm.value = Math.round(value)
  }

  function setFmlBovenlichtDefault(value: boolean): void {
    fmlBovenlichtDefault.value = value === true
  }

  function setFmlWindowBovenlichtDefault(value: boolean): void {
    fmlWindowBovenlichtDefault.value = value === true
  }

  function setFmlBovenlichtHeightCm(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return
    fmlBovenlichtHeightCm.value = Math.round(value)
  }

  function setFmlBovenlichtGapCm(value: number): void {
    if (!Number.isFinite(value) || value < 0) return
    fmlBovenlichtGapCm.value = Math.round(value)
  }

  function setFmlBandMidBoundaryCm(value: number): void {
    fmlBandMidBoundaryCm.value = value
  }

  function setFmlBandMaxBoundaryCm(value: number): void {
    fmlBandMaxBoundaryCm.value = value
  }

  function startFmlThicknessPick(tier: FmlThicknessPickTier): void {
    if (!deps.scale.confirmed.value || !deps.combinedOutput.value) return
    if (!deps.underlaySrc.value || !deps.underlaySize.value) {
      deps.setLocalError(tGlobal('result.thicknessPick.noUnderlay'))
      return
    }
    if (!deps.getBaseWallBw()) {
      deps.setLocalError(tGlobal('result.thicknessPick.noWallBw'))
      return
    }
    fmlThicknessPickTier.value = tier
    if (deps.underlayOpacity.value <= 0) deps.underlayOpacity.value = 25
    fmlThicknessPickMessage.value = tGlobal('result.thicknessPick.clickWall', {
      tier: THICKNESS_PICK_LABELS[tier],
    })
    deps.setLocalError(null)
  }

  function cancelFmlThicknessPick(): void {
    fmlThicknessPickTier.value = null
    fmlThicknessPickMessage.value = null
    fmlThicknessPickBusy.value = false
  }

  function createHandleFmlThicknessWallPick(preview: WorkspaceFmlThicknessPreview) {
    return async function handleFmlThicknessWallPick(wallId: string): Promise<void> {
      const tier = fmlThicknessPickTier.value
      if (!tier || fmlThicknessPickBusy.value) return

      const plan = preview.previewPlan.value ?? preview.generatedPlan.value
      const wall = plan?.floors[0]?.walls.find((item) => item.id === wallId)
      const layout = preview.previewUnderlayLayout.value
      const wallBw = deps.getBaseWallBw()
      if (!wall || !layout || !wallBw) {
        deps.setLocalError(tGlobal('result.thicknessPick.measureFailed'))
        return
      }

      fmlThicknessPickBusy.value = true
      fmlThicknessPickMessage.value = tGlobal('result.thicknessPick.measuring')
      try {
        const measuredCm = measureWallThicknessCmOnUnderlay({
          wallBw,
          wall,
          origin: layout.origin,
          pxPerMmX: layout.pxPerMmX,
          pxPerMmY: layout.pxPerMmY,
          maxSearchCm: FML_THICKNESS_PICK_SEARCH_CM[tier],
        })
        const applied = applyFmlThicknessPick(tier, measuredCm, {
          limits: {
            minCm: fmlThicknessMinCm.value,
            midCm: fmlThicknessMidCm.value,
            maxCm: fmlThicknessMaxCm.value,
          },
          bandBoundaries: {
            midBoundaryCm: fmlBandMidBoundaryCm.value,
            maxBoundaryCm: fmlBandMaxBoundaryCm.value,
          },
        })
        fmlBandMidBoundaryCm.value = applied.bandBoundaries.midBoundaryCm
        fmlBandMaxBoundaryCm.value = applied.bandBoundaries.maxBoundaryCm
        fmlThicknessPickMessage.value = tGlobal('result.thicknessPick.applied', {
          tier: THICKNESS_PICK_LABELS[tier],
          length: formatScaleInputLabel(applied.measuredCm, loadUserSettings().scaleInputUnit),
          cm: formatScaleInputLabel(applied.measuredCm, loadUserSettings().scaleInputUnit),
        })
        fmlThicknessPickTier.value = null
      } catch (error) {
        deps.setLocalError(
          error instanceof Error
            ? error.message
            : tGlobal('result.thicknessPick.measureFailedGeneric'),
        )
        fmlThicknessPickMessage.value = tGlobal('result.thicknessPick.retry', {
          tier: THICKNESS_PICK_LABELS[tier],
        })
      } finally {
        fmlThicknessPickBusy.value = false
      }
    }
  }

  return {
    fmlThicknessCms,
    fmlThicknessMinCm,
    fmlThicknessMidCm,
    fmlThicknessMaxCm,
    fmlBandMidBoundaryCm,
    fmlBandMaxBoundaryCm,
    fmlWallHeightCm,
    fmlDoorHeightCm,
    fmlWindowHeightCm,
    fmlWindowSillZCm,
    fmlBovenlichtDefault,
    fmlWindowBovenlichtDefault,
    fmlBovenlichtHeightCm,
    fmlBovenlichtGapCm,
    appliedFmlThicknessLimits,
    appliedFmlBandBoundaries,
    appliedFmlWallHeightCm,
    appliedFmlDoorHeightCm,
    appliedFmlWindowHeightCm,
    appliedFmlWindowSillZCm,
    fmlLimitsDirty,
    fmlBandDirty,
    fmlThicknessPickTier,
    fmlThicknessPickMessage,
    fmlThicknessPickBusy,
    applyBandBoundariesFromReferenceWall,
    resetFmlSessionDefaults,
    setFmlThicknessCms,
    setFmlThicknessMinCm,
    setFmlThicknessMidCm,
    setFmlThicknessMaxCm,
    setFmlWallHeightCm,
    setFmlDoorHeightCm,
    setFmlWindowHeightCm,
    setFmlWindowSillZCm,
    setFmlBovenlichtDefault,
    setFmlWindowBovenlichtDefault,
    setFmlBovenlichtHeightCm,
    setFmlBovenlichtGapCm,
    setFmlBandMidBoundaryCm,
    setFmlBandMaxBoundaryCm,
    startFmlThicknessPick,
    cancelFmlThicknessPick,
    createHandleFmlThicknessWallPick,
  }
}

export type WorkspaceFmlThicknessUiApi = ReturnType<typeof createWorkspaceFmlThicknessUi>
