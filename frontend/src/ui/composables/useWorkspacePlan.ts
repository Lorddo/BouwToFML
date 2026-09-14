import { watch, type Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import { createWorkspaceFmlGenerate } from './workspace/workspace-plan-generate'
import type { WorkspaceFmlStampInject } from './workspace/workspace-plan-generate'
import { createWorkspaceFmlThicknessUi } from './workspace/workspace-plan-thickness-ui'

export function useWorkspacePlan(deps: {
  imageName: Ref<string | null>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  underlaySrc: Ref<string | null>
  underlaySize: Ref<{ width: number; height: number } | null>
  /** 0 = uit, 100 = volledig opaque. */
  underlayOpacity: Ref<number>
  setLocalError: (message: string | null) => void
  getBaseWallBw: () => { data: Uint8Array; width: number; height: number } | null
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  mergeDoubleDoors?: Ref<boolean>
  mergeMultiWindows?: Ref<boolean>
  referenceWallBandSync?: {
    referenceWallThicknessPx: Ref<number | null>
    wallRefThicknessMeasures?: Ref<
      import('@/platform/selection/wall-thickness-ref').WallRefThicknessMeasure[]
    >
    wallThicknessBandBoundariesPx?: Ref<{
      midBoundaryPx: number
      maxBoundaryPx: number
    } | null>
    devSessionRestoring: Ref<boolean>
  }
  planName?: Ref<string | null>
  floorName?: Ref<string | null>
  floorLevel?: Ref<number | null>
  getStampVectorInject?: () => WorkspaceFmlStampInject | null
  /** Test/override voor stap-4 hoogte overwrite-confirm. */
  confirmOverwrite?: (message: string) => boolean | Promise<boolean>
}) {
  const thickness = createWorkspaceFmlThicknessUi({
    scale: deps.scale,
    underlaySrc: deps.underlaySrc,
    underlaySize: deps.underlaySize,
    underlayOpacity: deps.underlayOpacity,
    setLocalError: deps.setLocalError,
    combinedOutput: deps.combinedOutput,
    getBaseWallBw: deps.getBaseWallBw,
    referenceWallBandSync: deps.referenceWallBandSync,
  })

  const generate = createWorkspaceFmlGenerate(
    {
      imageName: deps.imageName,
      combinedOutput: deps.combinedOutput,
      scale: deps.scale,
      setLocalError: deps.setLocalError,
      orientedDoors: deps.orientedDoors,
      boundWindows: deps.boundWindows,
      mergeDoubleDoors: deps.mergeDoubleDoors,
      mergeMultiWindows: deps.mergeMultiWindows,
      planName: deps.planName,
      floorName: deps.floorName,
      floorLevel: deps.floorLevel,
      getStampVectorInject: deps.getStampVectorInject,
      confirmOverwrite: deps.confirmOverwrite,
    },
    {
      appliedFmlThicknessLimits: thickness.appliedFmlThicknessLimits,
      appliedFmlBandBoundaries: thickness.appliedFmlBandBoundaries,
      appliedFmlWallHeightCm: thickness.appliedFmlWallHeightCm,
      appliedFmlDoorHeightCm: thickness.appliedFmlDoorHeightCm,
      appliedFmlWindowHeightCm: thickness.appliedFmlWindowHeightCm,
      appliedFmlWindowSillZCm: thickness.appliedFmlWindowSillZCm,
      planThicknessCms: thickness.planThicknessCms,
      fmlThicknessMinCm: thickness.fmlThicknessMinCm,
      fmlThicknessMidCm: thickness.fmlThicknessMidCm,
      fmlThicknessMaxCm: thickness.fmlThicknessMaxCm,
      fmlBandMidBoundaryCm: thickness.fmlBandMidBoundaryCm,
      fmlBandMaxBoundaryCm: thickness.fmlBandMaxBoundaryCm,
      fmlWallHeightCm: thickness.fmlWallHeightCm,
      fmlDoorHeightCm: thickness.fmlDoorHeightCm,
      fmlWindowHeightCm: thickness.fmlWindowHeightCm,
      fmlWindowSillZCm: thickness.fmlWindowSillZCm,
      fmlBovenlichtDefault: thickness.fmlBovenlichtDefault,
      fmlWindowBovenlichtDefault: thickness.fmlWindowBovenlichtDefault,
      fmlBovenlichtHeightCm: thickness.fmlBovenlichtHeightCm,
      fmlBovenlichtGapCm: thickness.fmlBovenlichtGapCm,
    },
  )

  watch(generate.generatedPlan, (plan) => {
    if (!plan) return
    generate.syncAppliedFromDraft()
  })

  const handleFmlThicknessWallPick = thickness.createHandleFmlThicknessWallPick({
    previewPlan: generate.previewPlan,
    generatedPlan: generate.generatedPlan,
    previewUnderlayLayout: generate.previewUnderlayLayout,
  })

  async function setFmlWallHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('wallHeightCm', value)
  }

  async function setFmlDoorHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('doorHeightCm', value)
  }

  async function setFmlWindowHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('windowHeightCm', value)
  }

  async function setFmlWindowSillZCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('windowSillZCm', value)
  }

  async function setFmlBovenlichtDefault(value: boolean): Promise<boolean> {
    return generate.applyPreviewDefault('bovenlichtDefault', value === true)
  }

  async function setFmlWindowBovenlichtDefault(value: boolean): Promise<boolean> {
    return generate.applyPreviewDefault('windowBovenlichtDefault', value === true)
  }

  return {
    planThicknessCms: thickness.planThicknessCms,
    fmlThicknessMinCm: thickness.fmlThicknessMinCm,
    fmlThicknessMidCm: thickness.fmlThicknessMidCm,
    fmlThicknessMaxCm: thickness.fmlThicknessMaxCm,
    fmlBandMidBoundaryCm: thickness.fmlBandMidBoundaryCm,
    fmlBandMaxBoundaryCm: thickness.fmlBandMaxBoundaryCm,
    fmlWallHeightCm: thickness.fmlWallHeightCm,
    fmlDoorHeightCm: thickness.fmlDoorHeightCm,
    fmlWindowHeightCm: thickness.fmlWindowHeightCm,
    fmlWindowSillZCm: thickness.fmlWindowSillZCm,
    fmlBovenlichtDefault: thickness.fmlBovenlichtDefault,
    fmlWindowBovenlichtDefault: thickness.fmlWindowBovenlichtDefault,
    fmlBovenlichtHeightCm: thickness.fmlBovenlichtHeightCm,
    fmlBovenlichtGapCm: thickness.fmlBovenlichtGapCm,
    appliedFmlThicknessLimits: thickness.appliedFmlThicknessLimits,
    appliedFmlBandBoundaries: thickness.appliedFmlBandBoundaries,
    appliedFmlWallHeightCm: thickness.appliedFmlWallHeightCm,
    appliedFmlDoorHeightCm: thickness.appliedFmlDoorHeightCm,
    appliedFmlWindowHeightCm: thickness.appliedFmlWindowHeightCm,
    appliedFmlWindowSillZCm: thickness.appliedFmlWindowSillZCm,
    planLimitsDirty: thickness.planLimitsDirty,
    fmlBandDirty: thickness.fmlBandDirty,
    applyBandBoundariesFromReferenceWall: thickness.applyBandBoundariesFromReferenceWall,
    resetFmlSessionDefaults: thickness.resetFmlSessionDefaults,
    syncAppliedFromDraft: generate.syncAppliedFromDraft,
    setPlanThicknessCms: thickness.setPlanThicknessCms,
    setFmlThicknessMinCm: thickness.setFmlThicknessMinCm,
    setFmlThicknessMidCm: thickness.setFmlThicknessMidCm,
    setFmlThicknessMaxCm: thickness.setFmlThicknessMaxCm,
    /** Silent UI hydrate (floor-defaults) — geen overwrite-confirm. */
    hydrateFmlWallHeightCm: thickness.setFmlWallHeightCm,
    hydrateFmlDoorHeightCm: thickness.setFmlDoorHeightCm,
    hydrateFmlWindowHeightCm: thickness.setFmlWindowHeightCm,
    hydrateFmlWindowSillZCm: thickness.setFmlWindowSillZCm,
    hydrateFmlBovenlichtDefault: thickness.setFmlBovenlichtDefault,
    hydrateFmlWindowBovenlichtDefault: thickness.setFmlWindowBovenlichtDefault,
    setFmlWallHeightCm,
    setFmlDoorHeightCm,
    setFmlWindowHeightCm,
    setFmlWindowSillZCm,
    setFmlBovenlichtDefault,
    setFmlWindowBovenlichtDefault,
    setFmlBovenlichtHeightCm: thickness.setFmlBovenlichtHeightCm,
    setFmlBovenlichtGapCm: thickness.setFmlBovenlichtGapCm,
    setFmlBandMidBoundaryCm: thickness.setFmlBandMidBoundaryCm,
    setFmlBandMaxBoundaryCm: thickness.setFmlBandMaxBoundaryCm,
    fmlThicknessPickTier: thickness.fmlThicknessPickTier,
    fmlThicknessPickMessage: thickness.fmlThicknessPickMessage,
    fmlThicknessPickBusy: thickness.fmlThicknessPickBusy,
    startFmlThicknessPick: thickness.startFmlThicknessPick,
    cancelFmlThicknessPick: thickness.cancelFmlThicknessPick,
    handleFmlThicknessWallPick,
    buildGeneratedFmlText: generate.buildGeneratedFmlText,
    generatedStats: generate.generatedStats,
    openingHeightOverflow: generate.openingHeightOverflow,
    importedWarnings: generate.importedWarnings,
    importedFmlText: generate.importedFmlText,
    importedStats: generate.importedStats,
    previewPlan: generate.previewPlan,
    previewUnderlayLayout: generate.previewUnderlayLayout,
    planNulpuntImageCm: generate.planNulpuntImageCm,
    planOrient: generate.planOrient,
    underlayMoveMode: generate.underlayMoveMode,
    updatePreviewPlan: generate.updatePreviewPlan,
    setPreviewUnderlayLayout: generate.setPreviewUnderlayLayout,
    setPlanNulpuntImageCm: generate.setPlanNulpuntImageCm,
    setPlanOrient: generate.setPlanOrient,
    persistOrientState: generate.persistOrientState,
    applyFloorOrientOpToPreview: generate.applyFloorOrientOpToPreview,
    applyUnderlayOrientOp: generate.applyUnderlayOrientOp,
    setUnderlayMoveMode: generate.setUnderlayMoveMode,
    applyNulpuntAtFmlCm: generate.applyNulpuntAtFmlCm,
    clearLivePlanCanvas: generate.clearLivePlanCanvas,
    resetGeneratedPreview: generate.resetGeneratedPreview,
    regenerateFml: generate.regenerateFml,
    fmlRescaleActive: generate.fmlRescaleActive,
    fmlRescaleState: generate.fmlRescaleState,
    fmlRescaleDistanceMmX: generate.fmlRescaleDistanceMmX,
    fmlRescaleDistanceMmY: generate.fmlRescaleDistanceMmY,
    beginPlanRescale: generate.beginPlanRescale,
    cancelPlanRescale: generate.cancelPlanRescale,
    updatePlanRescaleState: generate.updatePlanRescaleState,
    setPlanRescaleDistanceMmX: generate.setPlanRescaleDistanceMmX,
    setPlanRescaleDistanceMmY: generate.setPlanRescaleDistanceMmY,
    confirmPlanRescale: generate.confirmPlanRescale,
    rescaleFmlFromRulers: generate.rescaleFmlFromRulers,
    clearImportedFml: generate.clearImportedFml,
  }
}
