import { computed, ref, watch, type Ref } from 'vue'
import { noteSwallowedError } from '@/core/diagnostics'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml } from '@/core/fml/downloadFml'
import { extractionToPlanWithOrigin, type Layer12DoorForFml } from '@/core/fml/extractionToPlan'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { toLayer12DoorForFml, toLayer14WindowsForFml } from '@/core/fml/layer-openings-to-fml'
import { pruneFacadeGroups, stripFacadeGroupsFromPlan } from '@/core/fml/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { applyJunctionSanitizeToPlan } from '@/core/fml/materialize-wall-junctions'
import {
  cloneUnderlayOriginLayout,
  copyUnderlayDisplayOrient,
} from '@/core/fml/drawing-to-underlay-layout'
import { applyNulpunt, reapplyNulpuntImageCm } from '@/core/fml/translate-floor-plan'
import { scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import {
  applyFloorOrientFromCanonical,
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  isIdentityFloorOrient,
  type FloorOrientOp,
  type FloorOrientState,
} from '@/core/fml/floor-plan-orient'
import { injectStampWallsIntoPlan } from '@/core/fml/apply-stamp-to-floor'
import { collectStampOwnedWallIds } from '@/core/fml/stamp-owned'
import { resolveStampOwnership } from '@/core/fml/resolve-stamp-ownership'
import { resolveStampInjectOffsetCm } from '@/core/fml/stamp-nulpunt'
import type { FloorPlan, ImportWarning, Point2D, Wall } from '@/core/fml/types'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
  type OpeningHeightOverflowSummary,
} from '@/core/fml/opening-height-overflow'
import {
  countPlanOpenings,
  countPlanWalls,
  overwritePlanDoorBovenlicht,
  overwritePlanDoorHeights,
  overwritePlanWallHeights,
  overwritePlanWindowBovenlicht,
  overwritePlanWindowHeights,
  overwritePlanWindowSills,
} from '@/core/fml/wall-endpoint-height'
import type { FmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { ExtractionOutput } from '@/core/extraction'
import type { useHScaleCalibration, HScaleState } from '@/platform/calibration'
import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import type { FloorOrientPersist, PreviewUnderlayLayout } from '@/ui/composables/project/types'
import {
  regeneratePlanAreas,
  scaleFloorPlanAndRegenAreas,
} from '@/ui/composables/plan-canvas/regenerate-floor-areas'
import { PLAN_AREA_SURFACE_EDIT_VISIBLE } from '@/ui/composables/workspace/constants'
import {
  measuredCmFromRescaleState,
  resolvePlanRescaleState,
  resolveRescaleFactorsFromRulers,
  scaleNulpuntImageCm,
} from '@/ui/composables/plan-canvas/plan-canvas-rescale-from-measure'
import { factoryRoomTypeColor } from '@/core/fml/roomtype-catalog'
import { tGlobal } from '@/ui/i18n'
import { seedPlanFromUserSettings } from '@/ui/composables/editor/seed-plan-stack-defaults'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import { confirmPlanChrome } from '@/ui/composables/plan-chrome-dialog'

/** Stap-4 defaults die de live plattegrond muteren (niet hergenereren). */
export type WorkspacePreviewDefaultField =
  | 'wallHeightCm'
  | 'doorHeightCm'
  | 'windowHeightCm'
  | 'windowSillZCm'
  | 'bovenlichtDefault'
  | 'windowBovenlichtDefault'

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

export type WorkspaceFmlStampInject = {
  walls: Wall[]
  bakeNulpuntImageCm: Point2D
  facadeLookupPlan?: FloorPlan | null
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
  /**
   * Stempelset vector-inject (stap 2 bake). null = geen inject.
   * bakeNulpunt zaait fmlNulpuntImageCm als die leeg is.
   */
  getStampVectorInject?: () => WorkspaceFmlStampInject | null
  /** Test/override: zelfde seam als useEditorSessionDefaults.confirmOverwrite. */
  confirmOverwrite?: (message: string) => boolean | Promise<boolean>
}

export type WorkspaceFmlGenerateApplied = {
  appliedFmlThicknessLimits: Ref<FmlWallThicknessLimits>
  appliedFmlBandBoundaries: Ref<FmlThicknessBandBoundaries>
  appliedFmlWallHeightCm: Ref<number>
  appliedFmlDoorHeightCm: Ref<number>
  appliedFmlWindowHeightCm: Ref<number>
  appliedFmlWindowSillZCm: Ref<number>
  planThicknessCms: Ref<number[]>
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

  /**
   * Hoogtes voor extractionToPlan — plain object, géén refs.
   * Zo invalideert een stap-4 hoogtewijziging `generatedBundle` niet (D6).
   * Seed wordt gezet bij syncApplied / applyPreviewDefault / regenerate.
   */
  const extractionHeightSeed = {
    wallHeightCm: applied.appliedFmlWallHeightCm.value,
    doorHeightCm: applied.appliedFmlDoorHeightCm.value,
    windowHeightCm: applied.appliedFmlWindowHeightCm.value,
    windowSillZCm: applied.appliedFmlWindowSillZCm.value,
  }

  function syncExtractionHeightSeedFromApplied(): void {
    extractionHeightSeed.wallHeightCm = applied.appliedFmlWallHeightCm.value
    extractionHeightSeed.doorHeightCm = applied.appliedFmlDoorHeightCm.value
    extractionHeightSeed.windowHeightCm = applied.appliedFmlWindowHeightCm.value
    extractionHeightSeed.windowSillZCm = applied.appliedFmlWindowSillZCm.value
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
        floorHeightCm: extractionHeightSeed.wallHeightCm,
        defaultDoorHeightCm: extractionHeightSeed.doorHeightCm,
        defaultWindowHeightCm: extractionHeightSeed.windowHeightCm,
        defaultWindowSillZCm: extractionHeightSeed.windowSillZCm,
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

  function resolveStampInject(): WorkspaceFmlStampInject | null {
    return deps.getStampVectorInject?.() ?? null
  }

  function ensureNulpuntSeededFromStamp(stamp: WorkspaceFmlStampInject | null): Point2D | null {
    if (fmlNulpuntImageCm.value) return fmlNulpuntImageCm.value
    if (!stamp) return null
    fmlNulpuntImageCm.value = { ...stamp.bakeNulpuntImageCm }
    return fmlNulpuntImageCm.value
  }

  /**
   * Na nulpunt-frame: inject stempelset + harmonize (pinned dikte) + areas.
   * Inject-offset = bakeNulpunt − currentNulpunt zodat scan-pixels vast blijven.
   */
  function finalizePlanInNulpuntFrame(
    plan: FloorPlan,
    faceEvidenceById?: Map<string, import('@/core/fml/wall-face-step-evidence').WallFaceExtentsCm>,
  ): FloorPlan {
    const stamp = resolveStampInject()
    let next = plan
    if (stamp && stamp.walls.length > 0) {
      const current = fmlNulpuntImageCm.value ?? stamp.bakeNulpuntImageCm
      const offsetCm = resolveStampInjectOffsetCm(stamp.bakeNulpuntImageCm, current)
      const injected = injectStampWallsIntoPlan(next, 0, stamp.walls, {
        offsetCm,
        replaceOverlap: false,
        facadeLookupPlan: stamp.facadeLookupPlan ?? null,
      })
      next = injected.plan
      const owned = resolveStampOwnership(next.floors[0]?.walls ?? [])
      next = {
        ...next,
        floors: next.floors.map((f, i) => (i === 0 ? { ...f, walls: owned.walls } : f)),
      }
    }
    const pinnedWallIds = collectStampOwnedWallIds(next.floors[0]?.walls ?? [])
    return seedPlanFromUserSettings(
      regeneratePlanAreas(
        harmonizeFmlWallThickness(
          next,
          applied.appliedFmlThicknessLimits.value,
          applied.appliedFmlBandBoundaries.value,
          faceEvidenceById,
          pinnedWallIds,
          applied.appliedFmlThicknessLimits.value.thicknessCms,
        ),
      ),
    )
  }

  function buildPreviewFromRawBundle(
    bundle: {
      plan: FloorPlan
      origin: Point2D
      pxPerMmX: number
      pxPerMmY: number
      faceEvidenceById?: Map<string, import('@/core/fml/wall-face-step-evidence').WallFaceExtentsCm>
    },
    options?: { seedNulpunt?: boolean },
  ): { plan: FloorPlan; layout: PreviewUnderlayLayout } {
    const stamp = resolveStampInject()
    const seed = options?.seedNulpunt !== false
    let nulpunt = fmlNulpuntImageCm.value
    if (!nulpunt && stamp) {
      nulpunt = seed ? ensureNulpuntSeededFromStamp(stamp) : { ...stamp.bakeNulpuntImageCm }
    }
    const baseLayout: PreviewUnderlayLayout = {
      origin: { ...bundle.origin },
      pxPerMmX: bundle.pxPerMmX,
      pxPerMmY: bundle.pxPerMmY,
    }
    if (nulpunt) {
      const appliedNulpunt = reapplyNulpuntImageCm(bundle.plan, baseLayout, nulpunt)
      return {
        plan: finalizePlanInNulpuntFrame(appliedNulpunt.plan, bundle.faceEvidenceById),
        layout: appliedNulpunt.layout,
      }
    }
    return {
      plan: finalizePlanInNulpuntFrame(bundle.plan, bundle.faceEvidenceById),
      layout: baseLayout,
    }
  }

  const fmlExportPlan = computed<FloorPlan | null>(() => {
    const bundle = generatedBundle.value
    if (!bundle) return null
    return buildPreviewFromRawBundle(bundle, { seedNulpunt: false }).plan
  })

  /** Actuele preview + export: canvas-bewerkingen > geïmporteerd > gegenereerd. */
  const previewPlan = computed(
    () => editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value,
  )

  /** Live keten op aanroeptijd — geen gecachte FML-string (D5). */
  function resolveLivePreviewPlan(): FloorPlan | null {
    return editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
  }

  function buildGeneratedFmlText(): string {
    const plan = resolveLivePreviewPlan()
    if (!plan) return ''
    const planForExport = stripFacadeGroupsFromPlan(plan)
    return buildFmlV3(planForExport, {
      name: plan.name,
      bovenlichtDefault: applied.fmlBovenlichtDefault.value,
      windowBovenlichtDefault: applied.fmlWindowBovenlichtDefault.value,
      bovenlichtHeightCm: applied.fmlBovenlichtHeightCm.value,
      bovenlichtGapCm: applied.fmlBovenlichtGapCm.value,
      useMetric: loadUserSettings().unitSystem === 'metric',
      ...(PLAN_AREA_SURFACE_EDIT_VISIBLE ? {} : { forceAreaFillColor: factoryRoomTypeColor(0) }),
    })
  }

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

  function writePreviewDefaultRefs(field: WorkspacePreviewDefaultField, raw: number | boolean): void {
    if (field === 'bovenlichtDefault') {
      applied.fmlBovenlichtDefault.value = Boolean(raw)
      return
    }
    if (field === 'windowBovenlichtDefault') {
      applied.fmlWindowBovenlichtDefault.value = Boolean(raw)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    if (field === 'wallHeightCm') {
      const cm = Math.max(1, Math.round(n))
      applied.fmlWallHeightCm.value = cm
      applied.appliedFmlWallHeightCm.value = cm
      extractionHeightSeed.wallHeightCm = cm
      return
    }
    if (field === 'doorHeightCm') {
      const cm = Math.max(1, Math.round(n))
      applied.fmlDoorHeightCm.value = cm
      applied.appliedFmlDoorHeightCm.value = cm
      extractionHeightSeed.doorHeightCm = cm
      return
    }
    if (field === 'windowHeightCm') {
      const cm = Math.max(1, Math.round(n))
      applied.fmlWindowHeightCm.value = cm
      applied.appliedFmlWindowHeightCm.value = cm
      extractionHeightSeed.windowHeightCm = cm
      return
    }
    const cm = Math.max(0, Math.round(n))
    applied.fmlWindowSillZCm.value = cm
    applied.appliedFmlWindowSillZCm.value = cm
    extractionHeightSeed.windowSillZCm = cm
  }

  function readPreviewDefault(field: WorkspacePreviewDefaultField): number | boolean {
    switch (field) {
      case 'wallHeightCm':
        return applied.fmlWallHeightCm.value
      case 'doorHeightCm':
        return applied.fmlDoorHeightCm.value
      case 'windowHeightCm':
        return applied.fmlWindowHeightCm.value
      case 'windowSillZCm':
        return applied.fmlWindowSillZCm.value
      case 'bovenlichtDefault':
        return applied.fmlBovenlichtDefault.value
      case 'windowBovenlichtDefault':
        return applied.fmlWindowBovenlichtDefault.value
    }
  }

  function overwriteKeyForField(field: WorkspacePreviewDefaultField): string {
    switch (field) {
      case 'wallHeightCm':
        return 'viewer.defaultsOverwriteWallFloor'
      case 'doorHeightCm':
        return 'viewer.defaultsOverwriteDoorFloor'
      case 'windowHeightCm':
        return 'viewer.defaultsOverwriteWindowFloor'
      case 'windowSillZCm':
        return 'viewer.defaultsOverwriteSillFloor'
      case 'bovenlichtDefault':
        return 'viewer.defaultsOverwriteBovenlichtDoorsFloor'
      case 'windowBovenlichtDefault':
        return 'viewer.defaultsOverwriteBovenlichtWindowsFloor'
    }
  }

  function countForPreviewDefault(field: WorkspacePreviewDefaultField, plan: FloorPlan): number {
    if (field === 'wallHeightCm') return countPlanWalls(plan, 0)
    if (field === 'doorHeightCm' || field === 'bovenlichtDefault') {
      return countPlanOpenings(plan, 'door', 0)
    }
    return countPlanOpenings(plan, 'window', 0)
  }

  function overwriteLivePlan(
    field: WorkspacePreviewDefaultField,
    plan: FloorPlan,
    next: number | boolean,
  ): FloorPlan {
    if (field === 'wallHeightCm') return overwritePlanWallHeights(plan, Number(next), 0)
    if (field === 'doorHeightCm') return overwritePlanDoorHeights(plan, Number(next), 0)
    if (field === 'windowHeightCm') return overwritePlanWindowHeights(plan, Number(next), 0)
    if (field === 'windowSillZCm') return overwritePlanWindowSills(plan, Number(next), 0)
    if (field === 'bovenlichtDefault') {
      return overwritePlanDoorBovenlicht(plan, Boolean(next), 0)
    }
    return overwritePlanWindowBovenlicht(plan, Boolean(next), 0)
  }

  /**
   * Stap-4: hoogtes/bovenlicht muteren de live plattegrond (zoals rescale/orient).
   * Hergebruikt dezelfde overwrite-all-confirm als Settings-defaults / Gevels
   * (`confirmPlanChrome` + `viewer.defaultsOverwrite*`).
   */
  async function applyPreviewDefault(
    field: WorkspacePreviewDefaultField,
    raw: number | boolean,
  ): Promise<boolean> {
    const current = readPreviewDefault(field)
    let next: number | boolean
    if (field === 'bovenlichtDefault' || field === 'windowBovenlichtDefault') {
      next = Boolean(raw)
    } else if (field === 'windowSillZCm') {
      const n = Number(raw)
      if (!Number.isFinite(n)) return false
      next = Math.max(0, Math.round(n))
    } else {
      const n = Number(raw)
      if (!Number.isFinite(n)) return false
      next = Math.max(1, Math.round(n))
    }
    if (next === current) return false

    const plan = resolveLivePreviewPlan()
    if (!plan) {
      writePreviewDefaultRefs(field, next)
      return true
    }

    const count = countForPreviewDefault(field, plan)
    const enabled = Boolean(next)
    const lengthLabel =
      typeof next === 'number'
        ? formatScaleInputLabel(next, loadUserSettings().scaleInputUnit)
        : next
    const ok = deps.confirmOverwrite
      ? await deps.confirmOverwrite(
          tGlobal(overwriteKeyForField(field), {
            count,
            length: lengthLabel,
            cm: lengthLabel,
            state: enabled ? tGlobal('viewer.defaultsOn') : tGlobal('viewer.defaultsOff'),
          }),
        )
      : await confirmPlanChrome({
          title: tGlobal('viewer.defaultsOverwriteTitle'),
          message: tGlobal(overwriteKeyForField(field), {
            count,
            length: lengthLabel,
            cm: lengthLabel,
            state: enabled ? tGlobal('viewer.defaultsOn') : tGlobal('viewer.defaultsOff'),
          }),
          confirmLabel: tGlobal('common.apply'),
          cancelLabel: tGlobal('common.cancel'),
        })
    if (!ok) return false

    const nextPlan = overwriteLivePlan(field, plan, next)
    editedPreviewPlan.value = nextPlan
    if (importedPlan.value) {
      importedPlan.value = nextPlan
    }
    writePreviewDefaultRefs(field, next)
    return true
  }

  function rebuildPreviewFromCanonical(preserveUnderlayDisplay: boolean): void {
    const bundle = generatedBundle.value
    if (!bundle) return
    const prevDisplay = preserveUnderlayDisplay ? persistedUnderlayLayout.value : null
    const built = buildPreviewFromRawBundle(bundle)
    const oriented = applyOrientAndPreserveUnderlayDisplay(built.plan, built.layout, prevDisplay)
    const stamp = resolveStampInject()
    const hasNulpunt = fmlNulpuntImageCm.value != null || stamp != null
    editedPreviewPlan.value =
      hasNulpunt || !isIdentityFloorOrient(fmlOrient.value) ? oriented.plan : null
    persistedUnderlayLayout.value = oriented.layout
  }

  watch(
    generatedBundle,
    (bundle) => {
      if (!bundle) return
      // Canvas-/floor-restore plan is leidend — niet layout herschrijven t.o.v. raw bundle
      // (dat desynct origin t.o.v. al-vertaalde muren, o.a. na nulpunt of floor-switch).
      // Afronden wist edited via resetGeneratedPreview ná semantic, zodat stamp
      // + sanitize op de definitieve graph landen i.p.v. een bevroren pre-semantic plan.
      if (editedPreviewPlan.value) return
      const prevDisplay = persistedUnderlayLayout.value
      const built = buildPreviewFromRawBundle(bundle)
      const oriented = applyOrientAndPreserveUnderlayDisplay(built.plan, built.layout, prevDisplay)
      const stamp = resolveStampInject()
      const hasNulpunt = fmlNulpuntImageCm.value != null || stamp != null
      editedPreviewPlan.value =
        hasNulpunt || !isIdentityFloorOrient(fmlOrient.value) ? oriented.plan : null
      persistedUnderlayLayout.value = oriented.layout
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
      thicknessCms: [...applied.planThicknessCms.value],
    }
    applied.appliedFmlBandBoundaries.value = {
      midBoundaryCm: applied.fmlBandMidBoundaryCm.value,
      maxBoundaryCm: applied.fmlBandMaxBoundaryCm.value,
    }
    applied.appliedFmlWallHeightCm.value = applied.fmlWallHeightCm.value
    applied.appliedFmlDoorHeightCm.value = applied.fmlDoorHeightCm.value
    applied.appliedFmlWindowHeightCm.value = applied.fmlWindowHeightCm.value
    applied.appliedFmlWindowSillZCm.value = applied.fmlWindowSillZCm.value
    syncExtractionHeightSeedFromApplied()
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
    const appliedNulpunt = applyNulpunt(plan, layout, dropCm)
    editedPreviewPlan.value = appliedNulpunt.plan
    persistedUnderlayLayout.value = cloneUnderlayOriginLayout(appliedNulpunt.layout)
    fmlNulpuntImageCm.value = { ...appliedNulpunt.nulpuntImageCm }
    return {
      plan: appliedNulpunt.plan,
      layout: persistedUnderlayLayout.value,
      nulpuntImageCm: fmlNulpuntImageCm.value,
    }
  }

  /** Wis live FML-preview (na capture, vóór floor-id wissel) — voorkomt remount met vorige plan. */
  function clearLivePlanCanvas(): void {
    editedPreviewPlan.value = null
    importedPlan.value = null
    importedWarnings.value = []
    importedFmlText.value = ''
    persistedUnderlayLayout.value = null
    fmlNulpuntImageCm.value = null
    fmlOrient.value = defaultFloorOrient()
    underlayMoveMode.value = false
    cancelPlanRescale()
  }

  /** Na opnieuw afronden: toon verse detectie i.p.v. oude canvas-bewerkingen. */
  function resetGeneratedPreview(): void {
    editedPreviewPlan.value = null
    rebuildPreviewFromCanonical(true)
  }

  /** Alleen diktes/banden: hergenereert uit detectie; hoogtes komen uit extractionHeightSeed. */
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
    const scaledPlan = scaleFloorPlanAndRegenAreas(plan, factors, 0)
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

  function beginPlanRescale(): boolean {
    const plan = editedPreviewPlan.value ?? importedPlan.value ?? fmlExportPlan.value
    const walls = plan?.floors[0]?.walls ?? []
    const state = resolvePlanRescaleState({
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

  function cancelPlanRescale(): void {
    fmlRescaleActive.value = false
    fmlRescaleState.value = null
  }

  function updatePlanRescaleState(next: HScaleState): void {
    if (!fmlRescaleActive.value) return
    fmlRescaleState.value = { ...next }
  }

  function setPlanRescaleDistanceMmX(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    fmlRescaleDistanceMmX.value = mm
  }

  function setPlanRescaleDistanceMmY(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    fmlRescaleDistanceMmY.value = mm
  }

  function confirmPlanRescale(): boolean {
    const state = fmlRescaleState.value
    if (!state || !fmlRescaleActive.value) return false
    const measured = measuredCmFromRescaleState(state)
    const ok = rescaleFmlFromRulers({
      measuredCmX: measured.x,
      measuredCmY: measured.y,
      trueMmX: fmlRescaleDistanceMmX.value,
      trueMmY: fmlRescaleDistanceMmY.value,
    })
    if (ok) cancelPlanRescale()
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
    const text = buildGeneratedFmlText()
    if (!text) {
      deps.setLocalError(tGlobal('project.errors.noFloorReadyForFml'))
      return
    }
    const name = sanitizeFilename(stripFileExtension(deps.imageName.value))
    downloadFml(text, `${name}.fml`)
  }

  async function copyGeneratedFml(): Promise<void> {
    const text = buildGeneratedFmlText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      deps.setLocalError(tGlobal('result.clipboardUnavailable'))
    }
  }

  async function importFmlFile(file: File): Promise<void> {
    deps.setLocalError(null)
    try {
      const rawText = await file.text()
      const parsed = importFmlV3(rawText)
      pruneFacadeGroups(parsed.plan)
      importedPlan.value = applyJunctionSanitizeToPlan(parsed.plan)
      editedPreviewPlan.value = null
      importedWarnings.value = parsed.warnings
      importedFmlText.value = rawText
    } catch (error) {
      deps.setLocalError(error instanceof Error ? error.message : 'FML import mislukt.')
    }
  }

  function clearImportedFml(): void {
    clearLivePlanCanvas()
  }

  return {
    generatedPlan,
    fmlExportPlan,
    previewPlan: previewPlan,
    buildGeneratedFmlText,
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
    applyPreviewDefault,
    updatePreviewPlan,
    setPreviewUnderlayLayout,
    setFmlNulpuntImageCm,
    setFmlOrient,
    persistOrientState,
    applyFloorOrientOpToPreview,
    applyUnderlayOrientOp,
    setUnderlayMoveMode,
    applyNulpuntAtFmlCm,
    clearLivePlanCanvas,
    resetGeneratedPreview,
    regenerateFml,
    fmlRescaleActive,
    fmlRescaleState,
    fmlRescaleDistanceMmX,
    fmlRescaleDistanceMmY,
    beginPlanRescale,
    cancelPlanRescale,
    updatePlanRescaleState,
    setPlanRescaleDistanceMmX,
    setPlanRescaleDistanceMmY,
    confirmPlanRescale,
    rescaleFmlFromRulers,
    downloadGeneratedFml,
    copyGeneratedFml,
    importFmlFile,
    clearImportedFml,
  }
}

export type WorkspaceFmlGenerateApi = ReturnType<typeof createWorkspaceFmlGenerate>
