import { computed, ref, type Ref } from 'vue'
import { noteSwallowedError } from '@/core/diagnostics'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml } from '@/core/fml/downloadFml'
import {
  extractionToPlanWithOrigin,
  type Layer12DoorForFml,
  type Layer14WindowForFml,
} from '@/core/fml/extractionToPlan'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { toLayer12DoorForFml, toLayer14WindowForFml } from '@/core/fml/layer-openings-to-fml'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'
import type { FmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'

export function stripFileExtension(name: string | null | undefined): string {
  if (!name) return 'Detectie-export'
  return name.replace(/\.[^.]+$/i, '') || 'Detectie-export'
}

export function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^\w.\- ()]/g, '_').trim()
  return safe || 'Detectie-export'
}

export function countPlanElements(plan: FloorPlan | null): {
  walls: number
  doors: number
  windows: number
} {
  if (!plan) return { walls: 0, doors: 0, windows: 0 }
  const floor = plan.floors[0]
  if (!floor) return { walls: 0, doors: 0, windows: 0 }
  const walls = floor.walls.length
  const doors = floor.walls
    .flatMap((wall) => wall.openings)
    .filter((opening) => opening.type === 'door').length
  const windows = floor.walls
    .flatMap((wall) => wall.openings)
    .filter((opening) => opening.type === 'window').length
  return { walls, doors, windows }
}

export type WorkspaceFmlGenerateDeps = {
  imageName: Ref<string | null>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  setLocalError: (message: string | null) => void
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
}

export type WorkspaceFmlGenerateApplied = {
  appliedFmlThicknessLimits: Ref<FmlWallThicknessLimits>
  appliedFmlBandBoundaries: Ref<FmlThicknessBandBoundaries>
  appliedFmlWallHeightCm: Ref<number>
  appliedFmlDoorHeightCm: Ref<number>
  appliedFmlWindowHeightCm: Ref<number>
  appliedFmlWindowSillZCm: Ref<number>
  fmlThicknessMinCm: Ref<number>
  fmlThicknessMidCm: Ref<number>
  fmlThicknessMaxCm: Ref<number>
  fmlBandMidBoundaryCm: Ref<number>
  fmlBandMaxBoundaryCm: Ref<number>
  fmlWallHeightCm: Ref<number>
  fmlDoorHeightCm: Ref<number>
  fmlWindowHeightCm: Ref<number>
  fmlWindowSillZCm: Ref<number>
}

/**
 * Generate + preview/import/download.
 *
 * Preview priority: editedPreviewPlan > importedPlan > fmlExportPlan (harmonized generated).
 * `resetGeneratedPreview` clears only edited — bij sessie-restore kan imported nog
 * voorrang houden tot clearImportedFml; geen strikte invalidatie-contract.
 */
export function createWorkspaceFmlGenerate(
  deps: WorkspaceFmlGenerateDeps,
  applied: WorkspaceFmlGenerateApplied,
) {
  const importedPlan = ref<FloorPlan | null>(null)
  const importedWarnings = ref<ImportWarning[]>([])
  const importedFmlText = ref('')
  const editedPreviewPlan = ref<FloorPlan | null>(null)

  /** Één plan-build + cm-origin per generate-pass (geen tweede resolveGraph voor underlay). */
  const generatedBundle = computed(() => {
    if (!deps.scale.confirmed.value) return null
    const output = deps.combinedOutput.value
    if (!output) return null
    const hasSemantic = (output?.semanticWallGraph?.segments.length ?? 0) > 0
    const hasSegments = (output?.segments?.length ?? 0) > 0
    if (!hasSemantic && !hasSegments) return null
    const pxPerMmX = deps.scale.pixelsPerMillimeterX.value
    const pxPerMmY = deps.scale.pixelsPerMillimeterY.value
    if (pxPerMmX <= 0 || pxPerMmY <= 0) return null
    try {
      const layer12Doors =
        deps.orientedDoors?.value
          .map((door) => toLayer12DoorForFml(door, pxPerMmX, pxPerMmY))
          .filter((door): door is Layer12DoorForFml => !!door) ?? []
      const layer14Windows =
        deps.boundWindows?.value
          .map((window) => toLayer14WindowForFml(window))
          .filter((window): window is Layer14WindowForFml => !!window) ?? []
      const { plan, origin } = extractionToPlanWithOrigin(output, {
        pxPerMmX,
        pxPerMmY,
        planName: stripFileExtension(deps.imageName.value),
        floorName: 'Detectie',
        defaultThicknessCm: 10,
        floorHeightCm: applied.appliedFmlWallHeightCm.value,
        defaultDoorHeightCm: applied.appliedFmlDoorHeightCm.value,
        defaultWindowHeightCm: applied.appliedFmlWindowHeightCm.value,
        defaultWindowSillZCm: applied.appliedFmlWindowSillZCm.value,
        layer12Doors,
        layer14Windows,
      })
      return { plan, origin, pxPerMmX, pxPerMmY }
      // ESC:O-38 (D)
    } catch (error) {
      noteSwallowedError('O-38', 'workspace-fml-generate.generatedBundle', error, {
        effect: 'lege FML-preview zonder uitleg',
      })
      return null
    }
  })

  const generatedPlan = computed<FloorPlan | null>(() => generatedBundle.value?.plan ?? null)

  const fmlExportPlan = computed<FloorPlan | null>(() => {
    const raw = generatedPlan.value
    if (!raw) return null
    return harmonizeFmlWallThickness(
      raw,
      applied.appliedFmlThicknessLimits.value,
      applied.appliedFmlBandBoundaries.value,
    )
  })

  /** Actuele preview + export: canvas-bewerkingen > geïmporteerd > gegenereerd. */
  const previewPlan = computed(
    () => editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value,
  )

  const generatedFmlText = computed(() => {
    if (!previewPlan.value) return ''
    return buildFmlV3(previewPlan.value, { name: previewPlan.value.name })
  })

  const generatedStats = computed(() => countPlanElements(previewPlan.value))
  const importedStats = computed(() => countPlanElements(importedPlan.value))

  const previewUnderlayLayout = computed(() => {
    const bundle = generatedBundle.value
    if (!bundle) return null
    return {
      origin: bundle.origin,
      pxPerMmX: bundle.pxPerMmX,
      pxPerMmY: bundle.pxPerMmY,
    }
  })

  function syncAppliedFromDraft(): void {
    applied.appliedFmlThicknessLimits.value = {
      minCm: applied.fmlThicknessMinCm.value,
      midCm: applied.fmlThicknessMidCm.value,
      maxCm: applied.fmlThicknessMaxCm.value,
    }
    applied.appliedFmlBandBoundaries.value = {
      midBoundaryCm: applied.fmlBandMidBoundaryCm.value,
      maxBoundaryCm: applied.fmlBandMaxBoundaryCm.value,
    }
    applied.appliedFmlWallHeightCm.value = applied.fmlWallHeightCm.value
    applied.appliedFmlDoorHeightCm.value = applied.fmlDoorHeightCm.value
    applied.appliedFmlWindowHeightCm.value = applied.fmlWindowHeightCm.value
    applied.appliedFmlWindowSillZCm.value = applied.fmlWindowSillZCm.value
  }

  function updatePreviewPlan(plan: FloorPlan): void {
    editedPreviewPlan.value = plan
    if (importedPlan.value) {
      importedPlan.value = plan
    }
  }

  /** Na opnieuw afronden: toon verse detectie i.p.v. oude canvas-bewerkingen. */
  function resetGeneratedPreview(): void {
    editedPreviewPlan.value = null
  }

  function regenerateFml(): void {
    if (!generatedPlan.value) return
    syncAppliedFromDraft()
    editedPreviewPlan.value = null
  }

  function downloadGeneratedFml(): void {
    if (!generatedFmlText.value) return
    const name = sanitizeFilename(stripFileExtension(deps.imageName.value))
    downloadFml(generatedFmlText.value, `${name}.fml`)
  }

  async function copyGeneratedFml(): Promise<void> {
    if (!generatedFmlText.value) return
    try {
      await navigator.clipboard.writeText(generatedFmlText.value)
    } catch {
      deps.setLocalError('Kopieren naar klembord is niet beschikbaar in deze browser/context.')
    }
  }

  async function importFmlFile(file: File): Promise<void> {
    deps.setLocalError(null)
    try {
      const rawText = await file.text()
      const parsed = importFmlV3(rawText)
      importedPlan.value = parsed.plan
      editedPreviewPlan.value = null
      importedWarnings.value = parsed.warnings
      importedFmlText.value = rawText
    } catch (error) {
      deps.setLocalError(error instanceof Error ? error.message : 'FML import mislukt.')
    }
  }

  function clearImportedFml(): void {
    importedPlan.value = null
    editedPreviewPlan.value = null
    importedWarnings.value = []
    importedFmlText.value = ''
  }

  return {
    generatedPlan,
    fmlExportPlan,
    previewPlan: previewPlan,
    generatedFmlText,
    generatedStats,
    importedPlan,
    importedWarnings,
    importedFmlText,
    importedStats,
    previewUnderlayLayout,
    editedPreviewPlan,
    syncAppliedFromDraft,
    updatePreviewPlan,
    resetGeneratedPreview,
    regenerateFml,
    downloadGeneratedFml,
    copyGeneratedFml,
    importFmlFile,
    clearImportedFml,
  }
}

export type WorkspaceFmlGenerateApi = ReturnType<typeof createWorkspaceFmlGenerate>
