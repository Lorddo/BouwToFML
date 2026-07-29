import { watch, type Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import { createWorkspaceFmlGenerate } from './workspace/workspace-fml-generate'
import { createWorkspaceFmlThicknessUi } from './workspace/workspace-fml-thickness-ui'

export function useWorkspaceFml(deps: {
  imageName: Ref<string | null>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  underlaySrc: Ref<string | null>
  underlaySize: Ref<{ width: number; height: number } | null>
  /** 0 = uit, 100 = volledig opaque. */
  underlayOpacity: Ref<number>
  setLocalError: (message: string | null) => void
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  referenceWallBandSync?: {
    referenceWallThicknessPx: Ref<number | null>
    devSessionRestoring: Ref<boolean>
  }
}) {
  const thickness = createWorkspaceFmlThicknessUi({
    scale: deps.scale,
    underlaySrc: deps.underlaySrc,
    underlaySize: deps.underlaySize,
    underlayOpacity: deps.underlayOpacity,
    setLocalError: deps.setLocalError,
    combinedOutput: deps.combinedOutput,
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
    },
    {
      appliedFmlThicknessLimits: thickness.appliedFmlThicknessLimits,
      appliedFmlBandBoundaries: thickness.appliedFmlBandBoundaries,
      appliedFmlWallHeightCm: thickness.appliedFmlWallHeightCm,
      appliedFmlDoorHeightCm: thickness.appliedFmlDoorHeightCm,
      appliedFmlWindowHeightCm: thickness.appliedFmlWindowHeightCm,
      appliedFmlWindowSillZCm: thickness.appliedFmlWindowSillZCm,
      fmlThicknessMinCm: thickness.fmlThicknessMinCm,
      fmlThicknessMidCm: thickness.fmlThicknessMidCm,
      fmlThicknessMaxCm: thickness.fmlThicknessMaxCm,
      fmlBandMidBoundaryCm: thickness.fmlBandMidBoundaryCm,
      fmlBandMaxBoundaryCm: thickness.fmlBandMaxBoundaryCm,
      fmlWallHeightCm: thickness.fmlWallHeightCm,
      fmlDoorHeightCm: thickness.fmlDoorHeightCm,
      fmlWindowHeightCm: thickness.fmlWindowHeightCm,
      fmlWindowSillZCm: thickness.fmlWindowSillZCm,
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

  return {
    generatedPlan: generate.generatedPlan,
    fmlExportPlan: generate.fmlExportPlan,
    fmlThicknessMinCm: thickness.fmlThicknessMinCm,
    fmlThicknessMidCm: thickness.fmlThicknessMidCm,
    fmlThicknessMaxCm: thickness.fmlThicknessMaxCm,
    fmlBandMidBoundaryCm: thickness.fmlBandMidBoundaryCm,
    fmlBandMaxBoundaryCm: thickness.fmlBandMaxBoundaryCm,
    fmlWallHeightCm: thickness.fmlWallHeightCm,
    fmlDoorHeightCm: thickness.fmlDoorHeightCm,
    fmlWindowHeightCm: thickness.fmlWindowHeightCm,
    fmlWindowSillZCm: thickness.fmlWindowSillZCm,
    fmlLimitsDirty: thickness.fmlLimitsDirty,
    fmlBandDirty: thickness.fmlBandDirty,
    applyBandBoundariesFromReferenceWall: thickness.applyBandBoundariesFromReferenceWall,
    resetFmlSessionDefaults: thickness.resetFmlSessionDefaults,
    regenerateFml: generate.regenerateFml,
    setFmlThicknessMinCm: thickness.setFmlThicknessMinCm,
    setFmlThicknessMidCm: thickness.setFmlThicknessMidCm,
    setFmlThicknessMaxCm: thickness.setFmlThicknessMaxCm,
    setFmlWallHeightCm: thickness.setFmlWallHeightCm,
    setFmlDoorHeightCm: thickness.setFmlDoorHeightCm,
    setFmlWindowHeightCm: thickness.setFmlWindowHeightCm,
    setFmlWindowSillZCm: thickness.setFmlWindowSillZCm,
    setFmlBandMidBoundaryCm: thickness.setFmlBandMidBoundaryCm,
    setFmlBandMaxBoundaryCm: thickness.setFmlBandMaxBoundaryCm,
    fmlThicknessPickTier: thickness.fmlThicknessPickTier,
    fmlThicknessPickMessage: thickness.fmlThicknessPickMessage,
    fmlThicknessPickBusy: thickness.fmlThicknessPickBusy,
    startFmlThicknessPick: thickness.startFmlThicknessPick,
    cancelFmlThicknessPick: thickness.cancelFmlThicknessPick,
    handleFmlThicknessWallPick,
    generatedFmlText: generate.generatedFmlText,
    generatedStats: generate.generatedStats,
    importedPlan: generate.importedPlan,
    importedWarnings: generate.importedWarnings,
    importedFmlText: generate.importedFmlText,
    importedStats: generate.importedStats,
    previewPlan: generate.previewPlan,
    previewUnderlayLayout: generate.previewUnderlayLayout,
    updatePreviewPlan: generate.updatePreviewPlan,
    resetGeneratedPreview: generate.resetGeneratedPreview,
    downloadGeneratedFml: generate.downloadGeneratedFml,
    copyGeneratedFml: generate.copyGeneratedFml,
    importFmlFile: generate.importFmlFile,
    clearImportedFml: generate.clearImportedFml,
  }
}
