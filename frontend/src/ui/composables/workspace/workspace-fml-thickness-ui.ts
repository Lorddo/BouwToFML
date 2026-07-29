import { computed, ref, watch, type Ref } from 'vue'
import {
  applyFmlThicknessPick,
  type FmlThicknessPickTier,
} from '@/core/fml/apply-fml-thickness-pick'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extractionToPlan'
import { measureWallThicknessCmOnUnderlay } from '@/core/fml/measure-underlay-wall-thickness'
import {
  DEFAULT_FML_BAND_BOUNDARIES,
  deriveFmlBandBoundariesCmFromRefPx,
  loadFmlThicknessBandBoundaries,
  saveFmlThicknessBandBoundaries,
  type FmlThicknessBandBoundaries,
} from '@/core/fml/fml-wall-thickness-tiers'
import {
  DEFAULT_FML_WALL_THICKNESS_LIMITS,
  loadFmlWallThicknessLimits,
  saveFmlWallThicknessLimits,
  type FmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'
import type { FloorPlan } from '@/core/fml/types'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'

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
  referenceWallBandSync?: {
    referenceWallThicknessPx: Ref<number | null>
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
  const fmlThicknessMinCm = ref(storedLimits.minCm)
  const fmlThicknessMidCm = ref(storedLimits.midCm)
  const fmlThicknessMaxCm = ref(storedLimits.maxCm)
  const fmlBandMidBoundaryCm = ref(storedBandBoundaries.midBoundaryCm)
  const fmlBandMaxBoundaryCm = ref(storedBandBoundaries.maxBoundaryCm)
  const fmlWallHeightCm = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const fmlDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
  const fmlWindowHeightCm = ref(DEFAULT_FML_WINDOW_HEIGHT_CM)
  const fmlWindowSillZCm = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
  const appliedFmlThicknessLimits = ref<FmlWallThicknessLimits>({ ...storedLimits })
  const appliedFmlBandBoundaries = ref<FmlThicknessBandBoundaries>({ ...storedBandBoundaries })
  const appliedFmlWallHeightCm = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const appliedFmlDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
  const appliedFmlWindowHeightCm = ref(DEFAULT_FML_WINDOW_HEIGHT_CM)
  const appliedFmlWindowSillZCm = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
  const fmlThicknessPickTier = ref<FmlThicknessPickTier | null>(null)
  const fmlThicknessPickMessage = ref<string | null>(null)
  const fmlThicknessPickBusy = ref(false)

  watch([fmlThicknessMinCm, fmlThicknessMidCm, fmlThicknessMaxCm], () => {
    saveFmlWallThicknessLimits({
      minCm: fmlThicknessMinCm.value,
      midCm: fmlThicknessMidCm.value,
      maxCm: fmlThicknessMaxCm.value,
    })
  })

  watch([fmlBandMidBoundaryCm, fmlBandMaxBoundaryCm], () => {
    saveFmlThicknessBandBoundaries({
      midBoundaryCm: fmlBandMidBoundaryCm.value,
      maxBoundaryCm: fmlBandMaxBoundaryCm.value,
    })
  })

  const fmlLimitsDirty = computed(
    () =>
      fmlThicknessMinCm.value !== appliedFmlThicknessLimits.value.minCm ||
      fmlThicknessMidCm.value !== appliedFmlThicknessLimits.value.midCm ||
      fmlThicknessMaxCm.value !== appliedFmlThicknessLimits.value.maxCm ||
      fmlBandMidBoundaryCm.value !== appliedFmlBandBoundaries.value.midBoundaryCm ||
      fmlBandMaxBoundaryCm.value !== appliedFmlBandBoundaries.value.maxBoundaryCm ||
      fmlWallHeightCm.value !== appliedFmlWallHeightCm.value ||
      fmlDoorHeightCm.value !== appliedFmlDoorHeightCm.value ||
      fmlWindowHeightCm.value !== appliedFmlWindowHeightCm.value ||
      fmlWindowSillZCm.value !== appliedFmlWindowSillZCm.value,
  )

  const fmlBandDirty = computed(
    () =>
      fmlBandMidBoundaryCm.value !== appliedFmlBandBoundaries.value.midBoundaryCm ||
      fmlBandMaxBoundaryCm.value !== appliedFmlBandBoundaries.value.maxBoundaryCm,
  )

  function applyBandBoundariesFromReferenceWall(
    referenceWallThicknessPx: number,
    pxPerMmX: number,
    pxPerMmY: number,
  ): void {
    const derived = deriveFmlBandBoundariesCmFromRefPx(
      referenceWallThicknessPx,
      pxPerMmX,
      pxPerMmY,
    )
    fmlBandMidBoundaryCm.value = derived.midBoundaryCm
    fmlBandMaxBoundaryCm.value = derived.maxBoundaryCm
    appliedFmlBandBoundaries.value = { ...derived }
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
        ] as const,
      ([refPx, confirmed, pxX, pxY, restoring]) => {
        if (restoring) return
        if (!confirmed || refPx == null || refPx <= 0 || pxX <= 0 || pxY <= 0) return
        applyBandBoundariesFromReferenceWall(refPx, pxX, pxY)
      },
    )
  }

  /** Reset export- en banddefaults bij nieuwe onderlegger (geen vorig-project geheugen). */
  function resetFmlSessionDefaults(): void {
    fmlThicknessMinCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm
    fmlThicknessMidCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm
    fmlThicknessMaxCm.value = DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm
    fmlBandMidBoundaryCm.value = DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm
    fmlBandMaxBoundaryCm.value = DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm
    fmlWallHeightCm.value = DEFAULT_FML_WALL_HEIGHT_CM
    fmlDoorHeightCm.value = DEFAULT_FML_DOOR_HEIGHT_CM
    fmlWindowHeightCm.value = DEFAULT_FML_WINDOW_HEIGHT_CM
    fmlWindowSillZCm.value = DEFAULT_FML_WINDOW_SILL_Z_CM
    appliedFmlThicknessLimits.value = { ...DEFAULT_FML_WALL_THICKNESS_LIMITS }
    appliedFmlBandBoundaries.value = { ...DEFAULT_FML_BAND_BOUNDARIES }
    appliedFmlWallHeightCm.value = DEFAULT_FML_WALL_HEIGHT_CM
    appliedFmlDoorHeightCm.value = DEFAULT_FML_DOOR_HEIGHT_CM
    appliedFmlWindowHeightCm.value = DEFAULT_FML_WINDOW_HEIGHT_CM
    appliedFmlWindowSillZCm.value = DEFAULT_FML_WINDOW_SILL_Z_CM
    saveFmlWallThicknessLimits(DEFAULT_FML_WALL_THICKNESS_LIMITS)
    saveFmlThicknessBandBoundaries(DEFAULT_FML_BAND_BOUNDARIES)
  }

  function setFmlThicknessMinCm(value: number): void {
    fmlThicknessMinCm.value = value
  }

  function setFmlThicknessMidCm(value: number): void {
    fmlThicknessMidCm.value = value
  }

  function setFmlThicknessMaxCm(value: number): void {
    fmlThicknessMaxCm.value = value
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

  function setFmlBandMidBoundaryCm(value: number): void {
    fmlBandMidBoundaryCm.value = value
  }

  function setFmlBandMaxBoundaryCm(value: number): void {
    fmlBandMaxBoundaryCm.value = value
  }

  function startFmlThicknessPick(tier: FmlThicknessPickTier): void {
    if (!deps.scale.confirmed.value || !deps.combinedOutput.value) return
    if (!deps.underlaySrc.value || !deps.underlaySize.value) {
      deps.setLocalError('Onderlegger ontbreekt — upload en bevestig schaal vóór meten.')
      return
    }
    fmlThicknessPickTier.value = tier
    if (deps.underlayOpacity.value <= 0) deps.underlayOpacity.value = 25
    fmlThicknessPickMessage.value = `Klik een muur om de ${THICKNESS_PICK_LABELS[tier]}-meetband te bepalen (±10%).`
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
      const underlaySrc = deps.underlaySrc.value
      const underlaySize = deps.underlaySize.value
      if (!wall || !layout || !underlaySrc || !underlaySize) {
        deps.setLocalError('Meten mislukt — onderlegger of muur niet beschikbaar.')
        return
      }

      fmlThicknessPickBusy.value = true
      fmlThicknessPickMessage.value = 'Meten op onderlegger…'
      try {
        const measuredCm = await measureWallThicknessCmOnUnderlay({
          imageSrc: underlaySrc,
          imageWidthPx: underlaySize.width,
          imageHeightPx: underlaySize.height,
          wall,
          origin: layout.origin,
          pxPerMmX: layout.pxPerMmX,
          pxPerMmY: layout.pxPerMmY,
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
        fmlThicknessPickMessage.value = `${THICKNESS_PICK_LABELS[tier]}-band: ${applied.measuredCm} cm (±10%) — klik Regenereren.`
        fmlThicknessPickTier.value = null
      } catch (error) {
        deps.setLocalError(error instanceof Error ? error.message : 'Muurdiktemeting mislukt.')
        fmlThicknessPickMessage.value = `Klik opnieuw een muur voor de ${THICKNESS_PICK_LABELS[tier]}-meetband.`
      } finally {
        fmlThicknessPickBusy.value = false
      }
    }
  }

  return {
    fmlThicknessMinCm,
    fmlThicknessMidCm,
    fmlThicknessMaxCm,
    fmlBandMidBoundaryCm,
    fmlBandMaxBoundaryCm,
    fmlWallHeightCm,
    fmlDoorHeightCm,
    fmlWindowHeightCm,
    fmlWindowSillZCm,
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
    setFmlThicknessMinCm,
    setFmlThicknessMidCm,
    setFmlThicknessMaxCm,
    setFmlWallHeightCm,
    setFmlDoorHeightCm,
    setFmlWindowHeightCm,
    setFmlWindowSillZCm,
    setFmlBandMidBoundaryCm,
    setFmlBandMaxBoundaryCm,
    startFmlThicknessPick,
    cancelFmlThicknessPick,
    createHandleFmlThicknessWallPick,
  }
}

export type WorkspaceFmlThicknessUiApi = ReturnType<typeof createWorkspaceFmlThicknessUi>
