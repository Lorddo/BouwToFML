import { ref, type Ref } from 'vue'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { ResolvedDoorCandidate } from '@/cv/doors'
import type { ResolvedWindowCandidate } from '@/cv/windows'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { FmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { downloadText } from '@/core/fml/downloadFml'
import {
  binaryMaskRleToPngBlob,
  buildE2eFixture,
  layer1FromPipelineDebug,
  slugFromImageName,
} from '@/platform/e2e-fixture'

export type UseWorkspaceE2eFixtureExportDeps = {
  imageName: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  scale: ReturnType<typeof useHScaleCalibration>
  referenceWallThicknessPx: Ref<number | null>
  resolvedDoors: Ref<ResolvedDoorCandidate[]>
  resolvedWindows: Ref<ResolvedWindowCandidate[]>
  appliedFmlThicknessLimits: Ref<FmlWallThicknessLimits>
  appliedFmlBandBoundaries: Ref<FmlThicknessBandBoundaries>
  appliedFmlWallHeightCm?: Ref<number>
  appliedFmlDoorHeightCm?: Ref<number>
  appliedFmlWindowHeightCm?: Ref<number>
  appliedFmlWindowSillZCm?: Ref<number>
  setLocalError: (message: string | null) => void
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function useWorkspaceE2eFixtureExport(deps: UseWorkspaceE2eFixtureExportDeps) {
  const e2eFixtureBusy = ref(false)
  const e2eFixtureMessage = ref<string | null>(null)

  async function exportE2eFixture(): Promise<void> {
    if (e2eFixtureBusy.value) return
    e2eFixtureBusy.value = true
    e2eFixtureMessage.value = null
    deps.setLocalError(null)

    try {
      const walls = deps.tabOutputs.value.walls
      const maskRle = walls?.roomWallMaskRle
      const layer1Debug = walls?.pipelineV3Debug?.layers.layer1
      const state = walls?.meta?.roomClassifyState
      const refPx = deps.referenceWallThicknessPx.value
      const pxPerMmX = deps.scale.pixelsPerMillimeterX.value
      const pxPerMmY = deps.scale.pixelsPerMillimeterY.value

      if (!maskRle) {
        throw new Error('Geen roomWallMaskRle — eerst muren afronden.')
      }
      if (!layer1Debug?.faces?.length) {
        throw new Error(
          'Geen layer-1 faces in pipeline-debug — opnieuw afronden met huidige build.',
        )
      }
      if (!state?.labelsData) {
        throw new Error('Geen roomClassifyState.labelsData.')
      }
      if (!(refPx != null && refPx > 0)) {
        throw new Error('Geen referenceWallThicknessPx.')
      }
      if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) {
        throw new Error('Schaal (px/mm) ontbreekt — bevestig schaal in stap 1.')
      }

      const labelsData =
        state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData)
      const rawSource = state.rawLabelsData ?? state.labelsData
      const rawLabelsData = rawSource instanceof Int32Array ? rawSource : new Int32Array(rawSource)

      const slug = slugFromImageName(deps.imageName.value)
      const fixture = buildE2eFixture({
        slug,
        maskRle,
        layer1: layer1FromPipelineDebug({
          faces: layer1Debug.faces,
          segments: layer1Debug.segments,
          junctions: layer1Debug.junctions,
        }),
        labelsData,
        rawLabelsData,
        width: state.width,
        height: state.height,
        parentMap: state.parentMap.map(([a, b]) => [a, b]),
        classificationByLabel: state.classificationByLabel.map(([a, b]) => [a, b]),
        resolvedDoors: deps.resolvedDoors.value,
        stage4ResolvedWindows: deps.resolvedWindows.value,
        pxPerMmX,
        pxPerMmY,
        referenceWallThicknessPx: refPx,
        fml: {
          thicknessLimits: { ...deps.appliedFmlThicknessLimits.value },
          bandBoundaries: { ...deps.appliedFmlBandBoundaries.value },
          wallHeightCm: deps.appliedFmlWallHeightCm?.value ?? DEFAULT_FML_WALL_HEIGHT_CM,
          doorHeightCm: deps.appliedFmlDoorHeightCm?.value ?? DEFAULT_FML_DOOR_HEIGHT_CM,
          windowHeightCm: deps.appliedFmlWindowHeightCm?.value ?? DEFAULT_FML_WINDOW_HEIGHT_CM,
          windowSillZCm: deps.appliedFmlWindowSillZCm?.value ?? DEFAULT_FML_WINDOW_SILL_Z_CM,
        },
      })

      // Altijd samen: JSON + PNG in één actie.
      const pngBlob = await binaryMaskRleToPngBlob(fixture.maskRle)
      downloadText(JSON.stringify(fixture, null, 2), `${slug}.fixture.json`, 'application/json')
      downloadBlob(pngBlob, `${slug}.mask.png`)

      e2eFixtureMessage.value = `E2E-fixture gedownload: ${slug}.fixture.json + ${slug}.mask.png (${fixture.resolvedDoors.length} deuren, ${fixture.stage4ResolvedWindows.length} ramen)`
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      e2eFixtureMessage.value = message
      deps.setLocalError(message)
    } finally {
      e2eFixtureBusy.value = false
    }
  }

  return {
    e2eFixtureBusy,
    e2eFixtureMessage,
    exportE2eFixture,
  }
}
