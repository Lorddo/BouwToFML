import { computed, ref, watch, type Ref } from 'vue'
import { noteSwallowedError } from '@/core/diagnostics'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml } from '@/core/fml/downloadFml'
import { extractionToPlanWithOrigin, type Layer12DoorForFml } from '@/core/fml/extractionToPlan'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { toLayer12DoorForFml, toLayer14WindowsForFml } from '@/core/fml/layer-openings-to-fml'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  cloneUnderlayOriginLayout,
  copyUnderlayDisplayOrient,
} from '@/core/fml/drawing-to-underlay-layout'
import { applyNulpunt, reapplyNulpuntImageCm } from '@/core/fml/translate-floor-plan'
import { scaleFloorPlan, scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import {
  applyFloorOrientFromCanonical,
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  isIdentityFloorOrient,
  type FloorOrientOp,
  type FloorOrientState,
} from '@/core/fml/floor-plan-orient'
import type { FloorPlan, ImportWarning, Point2D } from '@/core/fml/types'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
  type OpeningHeightOverflowSummary,
} from '@/core/fml/opening-height-overflow'
import type { FmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration, HScaleState } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import type { FloorOrientPersist, PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { regeneratePlanAreas } from '@/ui/composables/fml-preview/regenerate-floor-areas'
import { FML_AREA_SURFACE_EDIT_VISIBLE } from '@/ui/composables/workspace/constants'
import {
  measuredCmFromRescaleState,
  resolveFmlRescaleState,
  resolveRescaleFactorsFromRulers,
  scaleNulpuntImageCm,
} from '@/ui/composables/workspace/fml-rescale-from-measure'
import { factoryRoomTypeColor } from '@/core/fml/roomtype-catalog'
import { tGlobal } from '@/ui/i18n'

export function stripFileExtension(name: string | null | undefined): string {
  const fallback = tGlobal('result.defaultExportName')
  if (!name) return fallback
  return name.replace(/\.[^.]+$/i, '') || fallback
}

export function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^\w.\- ()]/g, '_').trim()
  return safe || tGlobal('result.defaultExportName')
}

export function countPlanElements(plan: FloorPlan | null): {
  walls: number
  doors: number
  windows: number
} {
  if (!plan) return { walls: 0, doors: 0, windows: 0 }
  let walls = 0
  let doors = 0
  let windows = 0
  for (const floor of plan.floors) {
    walls += floor.walls.length
    for (const wall of floor.walls) {
      for (const opening of wall.openings) {
        if (opening.type === 'door') doors += 1
        else if (opening.type === 'window') windows += 1
      }
    }
  }
  return { walls, doors, windows }
}

export type WorkspaceFmlGenerateDeps = {
  imageName: Ref<string | null>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  setLocalError: (message: string | null) => void
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  /** Twin→double_wide bij FML-conversie (X-10). */
  mergeDoubleDoors?: Ref<boolean>
  /** Pair/triple-merge bij FML-conversie (R-27). */
  mergeMultiWindows?: Ref<boolean>
  /** Project/floor meta voor export-naamgeving. */
  planName?: Ref<string | null>
  floorName?: Ref<string | null>
  floorLevel?: Ref<number | null>
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
  fmlBovenlichtDefault: Ref<boolean>
  fmlWindowBovenlichtDefault: Ref<boolean>
  fmlBovenlichtHeightCm: Ref<number>
  fmlBovenlichtGapCm: Ref<number>
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
  /** Layout bij snelle floor-restore (zonder live generatedBundle). */
  const persistedUnderlayLayout = ref<PreviewUnderlayLayout | null>(null)
  /** Gebruikers-nulpunt in scant-cm; overleeft regenerate. */
  const fmlNulpuntImageCm = ref<Point2D | null>(null)
  /** FML D4-oriëntatie t.o.v. canonieke generate; overleeft regenerate. */
  const fmlOrient = ref<FloorOrientState>(defaultFloorOrient())
  /** Sidebar: onderlegger verslepen. */
  const underlayMoveMode = ref(false)
  /** Stap-4 Herschalen: H/V-linialen op FML-preview. */
  const fmlRescaleActive = ref(false)
  const fmlRescaleState = ref<HScaleState | null>(null)
  const fmlRescaleDistanceMmX = ref(0)
  const fmlRescaleDistanceMmY = ref(0)

  function persistOrientState(): FloorOrientPersist | null {
    if (isIdentityFloorOrient(fmlOrient.value)) return null
    return {
      quarterTurnsCw: fmlOrient.value.quarterTurnsCw,
      flipX: fmlOrient.value.flipX,
    }
  }

  function setFmlOrient(state: FloorOrientPersist | FloorOrientState | null | undefined): void {
    if (!state) {
      fmlOrient.value = defaultFloorOrient()
      return
    }
    fmlOrient.value = {
      quarterTurnsCw: state.quarterTurnsCw,
      flipX: state.flipX,
    }
  }

  function applyOrientAndPreserveUnderlayDisplay(
    plan: FloorPlan,
    layoutAfterNulpunt: PreviewUnderlayLayout,
    previousLayout: PreviewUnderlayLayout | null,
  ): { plan: FloorPlan; layout: PreviewUnderlayLayout } {
    const oriented = applyFloorOrientFromCanonical(plan, fmlOrient.value, 0)
    const layout = copyUnderlayDisplayOrient(
      cloneUnderlayOriginLayout(layoutAfterNulpunt),
      previousLayout,
    )
    return { plan: oriented, layout }
  }

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
      const layer14Windows = toLayer14WindowsForFml(deps.boundWindows?.value ?? [], {
        mergeMultiWindows: deps.mergeMultiWindows?.value !== false,
        doors: deps.orientedDoors?.value ?? [],
      })
      const { plan, origin, faceEvidenceById } = extractionToPlanWithOrigin(output, {
        pxPerMmX,
        pxPerMmY,
        planName: deps.planName?.value?.trim() || stripFileExtension(deps.imageName.value),
        floorName: deps.floorName?.value?.trim() || 'Detectie',
        level: deps.floorLevel?.value ?? 0,
        defaultThicknessCm: 10,
        floorHeightCm: applied.appliedFmlWallHeightCm.value,
        defaultDoorHeightCm: applied.appliedFmlDoorHeightCm.value,
        defaultWindowHeightCm: applied.appliedFmlWindowHeightCm.value,
        defaultWindowSillZCm: applied.appliedFmlWindowSillZCm.value,
        mergeDoubleDoors: deps.mergeDoubleDoors?.value !== false,
        layer12Doors,
        layer14Windows,
      })
      return { plan, origin, pxPerMmX, pxPerMmY, faceEvidenceById }
      // ESC:O-38 (D)
    } catch (error) {
      noteSwallowedError('O-38', 'workspace-fml-generate.generatedBundle', error, {
        effect: 'lege FML-preview zonder uitleg',
      })
      return null
    }
  })

  const generatedPlan = computed<FloorPlan | null>(() => generatedBundle.value?.plan ?? null)

  function harmonizePlan(plan: FloorPlan): FloorPlan {
    return harmonizeFmlWallThickness(
      plan,
      applied.appliedFmlThicknessLimits.value,
      applied.appliedFmlBandBoundaries.value,
      generatedBundle.value?.faceEvidenceById,
    )
  }

  const fmlExportPlan = computed<FloorPlan | null>(() => {
    const raw = generatedPlan.value
    if (!raw) return null
    return regeneratePlanAreas(harmonizePlan(raw))
  })

  /** Actuele preview + export: canvas-bewerkingen > geïmporteerd > gegenereerd. */
  const previewPlan = computed(
    () => editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value,
  )

  const generatedFmlText = computed(() => {
    if (!previewPlan.value) return ''
    return buildFmlV3(previewPlan.value, {
      name: previewPlan.value.name,
      bovenlichtDefault: applied.fmlBovenlichtDefault.value,
      windowBovenlichtDefault: applied.fmlWindowBovenlichtDefault.value,
      bovenlichtHeightCm: applied.fmlBovenlichtHeightCm.value,
      bovenlichtGapCm: applied.fmlBovenlichtGapCm.value,
      ...(FML_AREA_SURFACE_EDIT_VISIBLE ? {} : { forceAreaFillColor: factoryRoomTypeColor(0) }),
    })
  })

  const generatedStats = computed(() => countPlanElements(previewPlan.value))
  const importedStats = computed(() => countPlanElements(importedPlan.value))

  const openingHeightOverflow = computed((): OpeningHeightOverflowSummary | null => {
    const floor = previewPlan.value?.floors[0]
    if (!floor) return null
    return summarizeOpeningHeightOverflows(
      findOpeningHeightOverflows(floor, {
        doorBovenlichtDefault: applied.fmlBovenlichtDefault.value,
        windowBovenlichtDefault: applied.fmlWindowBovenlichtDefault.value,
        bovenlichtHeightCm: applied.fmlBovenlichtHeightCm.value,
        bovenlichtGapCm: applied.fmlBovenlichtGapCm.value,
      }),
    )
  })

  function applyStoredNulpuntToPlan(
    plan: FloorPlan,
    baseLayout: PreviewUnderlayLayout,
  ): { plan: FloorPlan; layout: PreviewUnderlayLayout } | null {
    const nulpunt = fmlNulpuntImageCm.value
    if (!nulpunt) return null
    return reapplyNulpuntImageCm(plan, baseLayout, nulpunt)
  }

  watch(
    generatedBundle,
    (bundle) => {
      if (!bundle) return
      // Canvas-/floor-restore plan is leidend — niet layout herschrijven t.o.v. raw bundle
      // (dat desynct origin t.o.v. al-vertaalde muren, o.a. na nulpunt of floor-switch).
      if (editedPreviewPlan.value) return
      const prevDisplay = persistedUnderlayLayout.value
      const baseLayout: PreviewUnderlayLayout = {
        origin: { ...bundle.origin },
        pxPerMmX: bundle.pxPerMmX,
        pxPerMmY: bundle.pxPerMmY,
      }
      const nulpunt = fmlNulpuntImageCm.value
      if (nulpunt) {
        const appliedNulpunt = reapplyNulpuntImageCm(
          regeneratePlanAreas(harmonizePlan(bundle.plan)),
          baseLayout,
          nulpunt,
        )
        const oriented = applyOrientAndPreserveUnderlayDisplay(
          appliedNulpunt.plan,
          appliedNulpunt.layout,
          prevDisplay,
        )
        editedPreviewPlan.value = oriented.plan
        persistedUnderlayLayout.value = oriented.layout
      } else {
        const oriented = applyOrientAndPreserveUnderlayDisplay(
          harmonizePlan(bundle.plan),
          baseLayout,
          prevDisplay,
        )
        editedPreviewPlan.value = isIdentityFloorOrient(fmlOrient.value) ? null : oriented.plan
        persistedUnderlayLayout.value = oriented.layout
      }
    },
    { flush: 'sync' },
  )

  const previewUnderlayLayout = computed((): PreviewUnderlayLayout | null => {
    if (persistedUnderlayLayout.value) return persistedUnderlayLayout.value
    const bundle = generatedBundle.value
    if (bundle) {
      return {
        origin: bundle.origin,
        pxPerMmX: bundle.pxPerMmX,
        pxPerMmY: bundle.pxPerMmY,
      }
    }
    return null
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

  function updatePreviewPlan(plan: FloorPlan, layout?: PreviewUnderlayLayout | null): void {
    // Altijd clonen — hydrate geeft vaak blob.previewPlan; gedeelde refs muteren anders de blob.
    editedPreviewPlan.value = JSON.parse(JSON.stringify(plan)) as FloorPlan
    if (layout !== undefined) {
      persistedUnderlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
    }
    if (importedPlan.value) {
      importedPlan.value = JSON.parse(JSON.stringify(plan)) as FloorPlan
    }
  }

  function setPreviewUnderlayLayout(layout: PreviewUnderlayLayout | null): void {
    persistedUnderlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
  }

  function setFmlNulpuntImageCm(point: Point2D | null): void {
    fmlNulpuntImageCm.value = point ? { x: point.x, y: point.y } : null
  }

  /**
   * Nulpunt-drop op de actuele preview (workspace source of truth — niet canvas-localPlan).
   * Zet plan + layout + nulpuntImageCm atomisch.
   * @param layoutOverride canvas-layout (getUnderlayLayout) — voorkomt mismatch met null previewUnderlayLayout
   */
  function applyNulpuntAtFmlCm(
    dropCm: Point2D,
    layoutOverride?: PreviewUnderlayLayout | null,
    planOverride?: FloorPlan | null,
  ): {
    plan: FloorPlan
    layout: PreviewUnderlayLayout
    nulpuntImageCm: Point2D
  } | null {
    const plan =
      planOverride ?? editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
    const layout = layoutOverride ?? previewUnderlayLayout.value
    if (!plan || !layout) return null
    if (Math.hypot(dropCm.x, dropCm.y) < 0.05) return null
    const applied = applyNulpunt(plan, layout, dropCm)
    editedPreviewPlan.value = applied.plan
    persistedUnderlayLayout.value = cloneUnderlayOriginLayout(applied.layout)
    fmlNulpuntImageCm.value = { ...applied.nulpuntImageCm }
    return {
      plan: applied.plan,
      layout: persistedUnderlayLayout.value,
      nulpuntImageCm: fmlNulpuntImageCm.value,
    }
  }

  /** Wis live FML-preview (na capture, vóór floor-id wissel) — voorkomt remount met vorige plan. */
  function clearLiveFmlPreview(): void {
    editedPreviewPlan.value = null
    importedPlan.value = null
    importedWarnings.value = []
    importedFmlText.value = ''
    persistedUnderlayLayout.value = null
    fmlNulpuntImageCm.value = null
    fmlOrient.value = defaultFloorOrient()
    underlayMoveMode.value = false
    cancelFmlRescale()
  }

  function rebuildPreviewFromCanonical(preserveUnderlayDisplay: boolean): void {
    const bundle = generatedBundle.value
    if (!bundle) return
    const prevDisplay = preserveUnderlayDisplay ? persistedUnderlayLayout.value : null
    const baseLayout: PreviewUnderlayLayout = {
      origin: { ...bundle.origin },
      pxPerMmX: bundle.pxPerMmX,
      pxPerMmY: bundle.pxPerMmY,
    }
    const appliedNulpunt = applyStoredNulpuntToPlan(harmonizePlan(bundle.plan), baseLayout)
    if (appliedNulpunt) {
      const oriented = applyOrientAndPreserveUnderlayDisplay(
        appliedNulpunt.plan,
        appliedNulpunt.layout,
        prevDisplay,
      )
      editedPreviewPlan.value = oriented.plan
      persistedUnderlayLayout.value = oriented.layout
    } else {
      const oriented = applyOrientAndPreserveUnderlayDisplay(
        harmonizePlan(bundle.plan),
        baseLayout,
        prevDisplay,
      )
      editedPreviewPlan.value = isIdentityFloorOrient(fmlOrient.value) ? null : oriented.plan
      persistedUnderlayLayout.value = oriented.layout
    }
  }

  /** Na opnieuw afronden: toon verse detectie i.p.v. oude canvas-bewerkingen. */
  function resetGeneratedPreview(): void {
    editedPreviewPlan.value = null
    rebuildPreviewFromCanonical(true)
  }

  function regenerateFml(): void {
    if (!generatedPlan.value) return
    syncAppliedFromDraft()
    editedPreviewPlan.value = null
    rebuildPreviewFromCanonical(true)
  }

  /**
   * Stap-4: anisotrope H/V-schaal van het **huidige** plan (edits blijven).
   * Geen muurdikte-schaal; underlay per as; kalibratie alleen als schaal confirmed.
   */
  function rescaleFmlFromRulers(params: {
    measuredCmX: number
    measuredCmY: number
    trueMmX: number
    trueMmY: number
  }): boolean {
    const factors = resolveRescaleFactorsFromRulers(params)
    if (factors == null) return false
    const plan = editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
    if (!plan) return false
    const layout = previewUnderlayLayout.value

    // Eerst plan/layout zetten — anders overschrijft generatedBundle-watch (sync) vóór
    // applyAxisGeometryFactors met een verse generate (dubbele schaal of edits kwijt).
    const scaledPlan = scaleFloorPlan(plan, factors, 0)
    editedPreviewPlan.value = scaledPlan
    if (importedPlan.value) {
      importedPlan.value = scaledPlan
    }
    if (layout) {
      persistedUnderlayLayout.value = scaleUnderlayLayout(layout, factors)
    }
    const nulpunt = fmlNulpuntImageCm.value
    if (nulpunt) {
      fmlNulpuntImageCm.value = scaleNulpuntImageCm(nulpunt, factors)
    }
    if (deps.scale.confirmed.value) {
      if (
        !deps.scale.applyAxisGeometryFactors(factors.x, factors.y, {
          distanceMmX: params.trueMmX,
          distanceMmY: params.trueMmY,
        })
      ) {
        return false
      }
    } else {
      // Resume zonder confirmed kalibratie: maten wel bijwerken voor volgende sessie.
      if (params.trueMmX > 0) deps.scale.distanceMmX.value = params.trueMmX
      if (params.trueMmY > 0) deps.scale.distanceMmY.value = params.trueMmY
    }
    return true
  }

  function beginFmlRescale(): boolean {
    const plan = editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
    const walls = plan?.floors[0]?.walls ?? []
    const state = resolveFmlRescaleState({
      walls,
      imageState: deps.scale.state.value,
      layout: previewUnderlayLayout.value,
    })
    if (!state) return false
    const measured = measuredCmFromRescaleState(state)
    fmlRescaleState.value = state
    const mmX = deps.scale.distanceMmX.value
    const mmY = deps.scale.distanceMmY.value
    fmlRescaleDistanceMmX.value = mmX > 0 ? mmX : measured.x * 10
    fmlRescaleDistanceMmY.value = mmY > 0 ? mmY : measured.y * 10
    underlayMoveMode.value = false
    fmlRescaleActive.value = true
    return true
  }

  function cancelFmlRescale(): void {
    fmlRescaleActive.value = false
    fmlRescaleState.value = null
  }

  function updateFmlRescaleState(next: HScaleState): void {
    if (!fmlRescaleActive.value) return
    fmlRescaleState.value = { ...next }
  }

  function setFmlRescaleDistanceMmX(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    fmlRescaleDistanceMmX.value = mm
  }

  function setFmlRescaleDistanceMmY(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    fmlRescaleDistanceMmY.value = mm
  }

  function confirmFmlRescale(): boolean {
    const state = fmlRescaleState.value
    if (!state || !fmlRescaleActive.value) return false
    const measured = measuredCmFromRescaleState(state)
    const ok = rescaleFmlFromRulers({
      measuredCmX: measured.x,
      measuredCmY: measured.y,
      trueMmX: fmlRescaleDistanceMmX.value,
      trueMmY: fmlRescaleDistanceMmY.value,
    })
    if (ok) cancelFmlRescale()
    return ok
  }

  function applyFloorOrientOpToPreview(op: FloorOrientOp): boolean {
    const plan = editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
    if (!plan) return false
    fmlOrient.value = composeFloorOrient(fmlOrient.value, op)
    editedPreviewPlan.value = applyFloorOrientOp(plan, op, 0)
    underlayMoveMode.value = false
    return true
  }

  function applyUnderlayOrientOp(op: 'rotCw' | 'rotCcw' | 'flipX'): PreviewUnderlayLayout | null {
    const layout = previewUnderlayLayout.value
    if (!layout) return null
    const next = cloneUnderlayOriginLayout(layout)
    if (op === 'flipX') {
      next.flipX = !next.flipX
      if (!next.flipX) delete next.flipX
    } else {
      const delta = op === 'rotCw' ? 90 : -90
      const current = next.rotationDeg ?? 0
      let rotationDeg = current + delta
      // Normaliseer naar (−180, 180]
      while (rotationDeg > 180) rotationDeg -= 360
      while (rotationDeg <= -180) rotationDeg += 360
      if (Math.abs(rotationDeg) < 0.001) delete next.rotationDeg
      else next.rotationDeg = rotationDeg
    }
    persistedUnderlayLayout.value = next
    return next
  }

  function setUnderlayMoveMode(on: boolean): void {
    underlayMoveMode.value = on
  }

  function downloadGeneratedFml(): void {
    if (!generatedFmlText.value) {
      deps.setLocalError(tGlobal('project.errors.noFloorReadyForFml'))
      return
    }
    const name = sanitizeFilename(stripFileExtension(deps.imageName.value))
    downloadFml(generatedFmlText.value, `${name}.fml`)
  }

  async function copyGeneratedFml(): Promise<void> {
    if (!generatedFmlText.value) return
    try {
      await navigator.clipboard.writeText(generatedFmlText.value)
    } catch {
      deps.setLocalError(tGlobal('result.clipboardUnavailable'))
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
    clearLiveFmlPreview()
  }

  return {
    generatedPlan,
    fmlExportPlan,
    previewPlan: previewPlan,
    generatedFmlText,
    generatedStats,
    openingHeightOverflow,
    importedPlan,
    importedWarnings,
    importedFmlText,
    importedStats,
    previewUnderlayLayout,
    editedPreviewPlan,
    fmlNulpuntImageCm,
    fmlOrient,
    underlayMoveMode,
    syncAppliedFromDraft,
    updatePreviewPlan,
    setPreviewUnderlayLayout,
    setFmlNulpuntImageCm,
    setFmlOrient,
    persistOrientState,
    applyFloorOrientOpToPreview,
    applyUnderlayOrientOp,
    setUnderlayMoveMode,
    applyNulpuntAtFmlCm,
    clearLiveFmlPreview,
    resetGeneratedPreview,
    regenerateFml,
    fmlRescaleActive,
    fmlRescaleState,
    fmlRescaleDistanceMmX,
    fmlRescaleDistanceMmY,
    beginFmlRescale,
    cancelFmlRescale,
    updateFmlRescaleState,
    setFmlRescaleDistanceMmX,
    setFmlRescaleDistanceMmY,
    confirmFmlRescale,
    rescaleFmlFromRulers,
    downloadGeneratedFml,
    copyGeneratedFml,
    importFmlFile,
    clearImportedFml,
  }
}

export type WorkspaceFmlGenerateApi = ReturnType<typeof createWorkspaceFmlGenerate>
