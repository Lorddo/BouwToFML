import { watch, type Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import { createWorkspacePlanGenerate } from './workspace/workspace-plan-generate'
import type { WorkspaceStampInject } from './workspace/workspace-plan-generate'
import { createWorkspaceThicknessUi } from './workspace/workspace-plan-thickness-ui'

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
  getStampVectorInject?: () => WorkspaceStampInject | null
  /** Test/override voor stap-4 hoogte overwrite-confirm. */
  confirmOverwrite?: (message: string) => boolean | Promise<boolean>
}) {
  const thickness = createWorkspaceThicknessUi({
    scale: deps.scale,
    underlaySrc: deps.underlaySrc,
    underlaySize: deps.underlaySize,
    underlayOpacity: deps.underlayOpacity,
    setLocalError: deps.setLocalError,
    combinedOutput: deps.combinedOutput,
    getBaseWallBw: deps.getBaseWallBw,
    referenceWallBandSync: deps.referenceWallBandSync,
  })

  const generate = createWorkspacePlanGenerate(
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
      appliedThicknessLimits: thickness.appliedThicknessLimits,
      appliedBandBoundaries: thickness.appliedBandBoundaries,
      appliedWallHeightCm: thickness.appliedWallHeightCm,
      appliedDoorHeightCm: thickness.appliedDoorHeightCm,
      appliedWindowHeightCm: thickness.appliedWindowHeightCm,
      appliedWindowSillZCm: thickness.appliedWindowSillZCm,
      planThicknessCms: thickness.planThicknessCms,
      planThicknessMinCm: thickness.planThicknessMinCm,
      planThicknessMidCm: thickness.planThicknessMidCm,
      planThicknessMaxCm: thickness.planThicknessMaxCm,
      planBandMidBoundaryCm: thickness.planBandMidBoundaryCm,
      planBandMaxBoundaryCm: thickness.planBandMaxBoundaryCm,
      planWallHeightCm: thickness.planWallHeightCm,
      planDoorHeightCm: thickness.planDoorHeightCm,
      planWindowHeightCm: thickness.planWindowHeightCm,
      planWindowSillZCm: thickness.planWindowSillZCm,
      planBovenlichtDefault: thickness.planBovenlichtDefault,
      planWindowBovenlichtDefault: thickness.planWindowBovenlichtDefault,
      planBovenlichtHeightCm: thickness.planBovenlichtHeightCm,
      planBovenlichtGapCm: thickness.planBovenlichtGapCm,
    },
  )

  watch(generate.generatedPlan, (plan) => {
    if (!plan) return
    generate.syncAppliedFromDraft()
  })

  const handleThicknessWallPick = thickness.createHandleThicknessWallPick({
    previewPlan: generate.previewPlan,
    generatedPlan: generate.generatedPlan,
    previewUnderlayLayout: generate.previewUnderlayLayout,
  })

  async function setPlanWallHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('wallHeightCm', value)
  }

  async function setPlanDoorHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('doorHeightCm', value)
  }

  async function setPlanWindowHeightCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('windowHeightCm', value)
  }

  async function setPlanWindowSillZCm(value: number): Promise<boolean> {
    return generate.applyPreviewDefault('windowSillZCm', value)
  }

  async function setPlanBovenlichtDefault(value: boolean): Promise<boolean> {
    return generate.applyPreviewDefault('bovenlichtDefault', value === true)
  }

  async function setPlanWindowBovenlichtDefault(value: boolean): Promise<boolean> {
    return generate.applyPreviewDefault('windowBovenlichtDefault', value === true)
  }

  return {
    planThicknessCms: thickness.planThicknessCms,
    planThicknessMinCm: thickness.planThicknessMinCm,
    planThicknessMidCm: thickness.planThicknessMidCm,
    planThicknessMaxCm: thickness.planThicknessMaxCm,
    planBandMidBoundaryCm: thickness.planBandMidBoundaryCm,
    planBandMaxBoundaryCm: thickness.planBandMaxBoundaryCm,
    planWallHeightCm: thickness.planWallHeightCm,
    planDoorHeightCm: thickness.planDoorHeightCm,
    planWindowHeightCm: thickness.planWindowHeightCm,
    planWindowSillZCm: thickness.planWindowSillZCm,
    planBovenlichtDefault: thickness.planBovenlichtDefault,
    planWindowBovenlichtDefault: thickness.planWindowBovenlichtDefault,
    planBovenlichtHeightCm: thickness.planBovenlichtHeightCm,
    planBovenlichtGapCm: thickness.planBovenlichtGapCm,
    appliedThicknessLimits: thickness.appliedThicknessLimits,
    appliedBandBoundaries: thickness.appliedBandBoundaries,
    appliedWallHeightCm: thickness.appliedWallHeightCm,
    appliedDoorHeightCm: thickness.appliedDoorHeightCm,
    appliedWindowHeightCm: thickness.appliedWindowHeightCm,
    appliedWindowSillZCm: thickness.appliedWindowSillZCm,
    planLimitsDirty: thickness.planLimitsDirty,
    planBandDirty: thickness.planBandDirty,
    applyBandBoundariesFromReferenceWall: thickness.applyBandBoundariesFromReferenceWall,
    resetPlanSessionDefaults: thickness.resetPlanSessionDefaults,
    syncAppliedFromDraft: generate.syncAppliedFromDraft,
    setPlanThicknessCms: thickness.setPlanThicknessCms,
    setPlanThicknessMinCm: thickness.setPlanThicknessMinCm,
    setPlanThicknessMidCm: thickness.setPlanThicknessMidCm,
    setPlanThicknessMaxCm: thickness.setPlanThicknessMaxCm,
    /** Silent UI hydrate (floor-defaults) — geen overwrite-confirm. */
    hydratePlanWallHeightCm: thickness.setPlanWallHeightCm,
    hydratePlanDoorHeightCm: thickness.setPlanDoorHeightCm,
    hydratePlanWindowHeightCm: thickness.setPlanWindowHeightCm,
    hydratePlanWindowSillZCm: thickness.setPlanWindowSillZCm,
    hydratePlanBovenlichtDefault: thickness.setPlanBovenlichtDefault,
    hydratePlanWindowBovenlichtDefault: thickness.setPlanWindowBovenlichtDefault,
    setPlanWallHeightCm,
    setPlanDoorHeightCm,
    setPlanWindowHeightCm,
    setPlanWindowSillZCm,
    setPlanBovenlichtDefault,
    setPlanWindowBovenlichtDefault,
    setPlanBovenlichtHeightCm: thickness.setPlanBovenlichtHeightCm,
    setPlanBovenlichtGapCm: thickness.setPlanBovenlichtGapCm,
    setPlanBandMidBoundaryCm: thickness.setPlanBandMidBoundaryCm,
    setPlanBandMaxBoundaryCm: thickness.setPlanBandMaxBoundaryCm,
    thicknessPickTier: thickness.thicknessPickTier,
    thicknessPickMessage: thickness.thicknessPickMessage,
    thicknessPickBusy: thickness.thicknessPickBusy,
    startThicknessPick: thickness.startThicknessPick,
    cancelThicknessPick: thickness.cancelThicknessPick,
    handleThicknessWallPick,
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
    applyNulpuntAtPlanCm: generate.applyNulpuntAtPlanCm,
    clearLivePlanCanvas: generate.clearLivePlanCanvas,
    resetGeneratedPreview: generate.resetGeneratedPreview,
    regeneratePlan: generate.regeneratePlan,
    rescaleActive: generate.rescaleActive,
    rescaleState: generate.rescaleState,
    rescaleDistanceMmX: generate.rescaleDistanceMmX,
    rescaleDistanceMmY: generate.rescaleDistanceMmY,
    beginPlanRescale: generate.beginPlanRescale,
    cancelPlanRescale: generate.cancelPlanRescale,
    updatePlanRescaleState: generate.updatePlanRescaleState,
    setPlanRescaleDistanceMmX: generate.setPlanRescaleDistanceMmX,
    setPlanRescaleDistanceMmY: generate.setPlanRescaleDistanceMmY,
    confirmPlanRescale: generate.confirmPlanRescale,
    rescalePlanFromRulers: generate.rescalePlanFromRulers,
    clearImportedFml: generate.clearImportedFml,
  }
}
