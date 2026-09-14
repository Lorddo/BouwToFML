import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import type { HScaleState } from '@/platform/calibration'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import {
  cloneUnderlayOriginLayout,
  copyUnderlayDisplayOrient,
  drawingFromImageScale,
  previewUnderlayLayoutFromDrawing,
  provisionalDrawingFromImage,
  resolveUnderlayPxPerMmFromRulers,
} from '@/core/fml/drawing-to-underlay-layout'
import {
  copyUnderlayFromDonor,
  isReusableUnderlayDrawing,
  listUnderlayReuseDonors,
} from '@/core/fml/copy-underlay-drawing'
import { elevationViewForGroup, setElevationViewDrawing } from '@/core/fml/elevation-views'
import { scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import { scaleFloorPlanAndRegenAreas } from '@/ui/composables/plan-canvas/regenerate-floor-areas'
import {
  rescaleStateFromImageHandles,
  initPlanRescaleStateFromWalls,
  initImageScaleHandles,
  measuredCmFromRescaleState,
  resolveRescaleFactorsFromRulers,
} from '@/ui/composables/plan-canvas/plan-canvas-rescale-from-measure'
import { imageDimensions, loadImage } from '@/platform/image'

export interface UseEditorUnderlayOptions {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  activeFloor: Ref<FloorPlan['floors'][number] | null>
  floors: Ref<FloorPlan['floors']>
  inspectMode: Ref<boolean>
  gevelsMode: Ref<boolean>
  elevationGroupId: Ref<string>
  elevationUnderlaySrc: Ref<string | null>
  elevationUnderlayWidthPx: Ref<number>
  elevationUnderlayHeightPx: Ref<number>
  elevationUnderlayLayout: Ref<PreviewUnderlayLayout | null>
  activeUnderlayLayout: Ref<PreviewUnderlayLayout | null>
  activeUnderlayWidthPx: Ref<number>
  activeUnderlayHeightPx: Ref<number>
  syncElevationUnderlayFromPlan: () => Promise<void>
  previewCanvasRef: Ref<{
    resetView?: () => void
    flushPendingFieldCommits?: () => void
    pushUndo?: () => void
  } | null>
  t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * Onderlegger state + reuse + scale + persist + orient.
 * Alles dat in de viewer aan de onderlegger hangt, behalve de template-chrome zelf.
 */
export function useEditorUnderlay(options: UseEditorUnderlayOptions) {
  const {
    plan,
    activeFloorIndex,
    activeFloor,
    inspectMode,
    gevelsMode,
    elevationGroupId,
    elevationUnderlaySrc,
    elevationUnderlayWidthPx,
    elevationUnderlayHeightPx,
    elevationUnderlayLayout,
    activeUnderlayLayout,
    activeUnderlayWidthPx,
    activeUnderlayHeightPx,
    syncElevationUnderlayFromPlan,
    previewCanvasRef,
    t,
  } = options

  const underlaySrc = ref<string | null>(null)
  const underlayWidthPx = ref(0)
  const underlayHeightPx = ref(0)
  const underlayLayout = ref<PreviewUnderlayLayout | null>(null)
  const underlayOpacity = ref(0.5)
  const underlayHint = ref<string | null>(null)
  const underlayMoveMode = ref(false)
  const reuseUnderlayOpen = ref(false)
  const underlayFoldOpen = ref(false)

  const rescaleActive = ref(false)
  const rescaleState = ref<HScaleState | null>(null)
  const rescaleDistanceMmX = ref(0)
  const rescaleDistanceMmY = ref(0)
  const underlayScaleActive = ref(false)
  const underlayScaleState = ref<HScaleState | null>(null)
  const underlayScaleMmX = ref(3000)
  const underlayScaleMmY = ref(3000)

  let localUnderlayObjectUrl: string | null = null
  let underlayLoadGen = 0

  // --- Reuse donors ---

  const underlayReuseDonors = computed(() => {
    const current = plan.value
    if (!current) return []
    if (gevelsMode.value) {
      return listUnderlayReuseDonors(current, { elevationGroupId: elevationGroupId.value })
    }
    return listUnderlayReuseDonors(current, { floorIndex: activeFloorIndex.value })
  })

  const activeHasReusableUnderlay = computed(() => {
    const current = plan.value
    if (!current) return false
    if (gevelsMode.value) {
      return isReusableUnderlayDrawing(
        elevationViewForGroup(current, elevationGroupId.value)?.drawing,
      )
    }
    return isReusableUnderlayDrawing(current.floors[activeFloorIndex.value]?.drawing)
  })

  const needsUnderlayReuse = computed(
    () =>
      !inspectMode.value &&
      !activeHasReusableUnderlay.value &&
      underlayReuseDonors.value.length > 0,
  )

  watch([needsUnderlayReuse, gevelsMode, activeFloorIndex, elevationGroupId], ([needed]) => {
    if (needed) {
      underlayFoldOpen.value = true
      reuseUnderlayOpen.value = true
      return
    }
    reuseUnderlayOpen.value = false
  })

  watch(underlayReuseDonors, (opts) => {
    if (opts.length === 0) reuseUnderlayOpen.value = false
  })

  function reuseDonorLabel(opt: { kind: 'floor' | 'elevation'; name: string }): string {
    return opt.kind === 'elevation'
      ? t('viewer.reuseUnderlayGevel', { name: opt.name })
      : t('viewer.reuseUnderlayFloor', { name: opt.name })
  }

  async function onReuseUnderlayFromDonor(donorId: string): Promise<void> {
    reuseUnderlayOpen.value = false
    const current = plan.value
    if (!current || inspectMode.value) return
    cancelPlanRescale()
    cancelUnderlayScale()
    persistActiveUnderlayDrawing()
    const target =
      gevelsMode.value && elevationGroupId.value
        ? ({ kind: 'elevation', groupId: elevationGroupId.value } as const)
        : ({ kind: 'floor', index: activeFloorIndex.value } as const)
    const next = copyUnderlayFromDonor(current, donorId, target)
    if (!next) return
    plan.value = next
    underlayHint.value = null
    if (target.kind === 'elevation') {
      await syncElevationUnderlayFromPlan()
    } else {
      await syncUnderlayForActiveFloor()
    }
    await nextTick()
    previewCanvasRef.value?.resetView?.()
  }

  // --- Underlay state management ---

  function revokeLocalUnderlay(): void {
    if (localUnderlayObjectUrl) {
      URL.revokeObjectURL(localUnderlayObjectUrl)
      localUnderlayObjectUrl = null
    }
  }

  function clearUnderlayState(): void {
    underlayLoadGen += 1
    revokeLocalUnderlay()
    underlaySrc.value = null
    underlayWidthPx.value = 0
    underlayHeightPx.value = 0
    underlayLayout.value = null
    underlayOpacity.value = 0.5
    underlayHint.value = null
    underlayMoveMode.value = false
    cancelUnderlayScale()
  }

  function resolveDrawingOpacity(alpha: number | undefined): number {
    const pct = typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : 50
    return Math.min(1, Math.max(0, pct / 100))
  }

  function onUnderlayOpacityInput(event: Event): void {
    const next = Number((event.target as HTMLInputElement).value) / 100
    underlayOpacity.value = next
    if (next <= 0) underlayMoveMode.value = false
  }

  function applyImageToUnderlay(
    src: string,
    width: number,
    height: number,
    drawing: NonNullable<FloorPlan['floors'][number]['drawing']>,
  ): boolean {
    const layout = previewUnderlayLayoutFromDrawing(drawing, { width, height })
    if (!layout) return false
    underlaySrc.value = src
    underlayWidthPx.value = width
    underlayHeightPx.value = height
    underlayLayout.value = cloneUnderlayOriginLayout(layout)
    underlayOpacity.value = resolveDrawingOpacity(drawing.alpha)
    return true
  }

  async function tryLoadDrawingUrl(
    url: string,
    drawing: NonNullable<FloorPlan['floors'][number]['drawing']>,
    gen: number,
  ): Promise<boolean> {
    try {
      const img = await loadImage(url)
      if (gen !== underlayLoadGen) return false
      const { width, height } = imageDimensions(img)
      return applyImageToUnderlay(url, width, height, drawing)
    } catch {
      return false
    }
  }

  async function syncUnderlayForActiveFloor(): Promise<void> {
    const drawing = activeFloor.value?.drawing
    underlayLoadGen += 1
    const gen = underlayLoadGen
    revokeLocalUnderlay()
    underlaySrc.value = null
    underlayWidthPx.value = 0
    underlayHeightPx.value = 0
    underlayLayout.value = null
    underlayHint.value = null

    if (!drawing || !(drawing.width > 0) || !(drawing.height > 0)) {
      underlayOpacity.value = 0.5
      return
    }

    underlayOpacity.value = resolveDrawingOpacity(drawing.alpha)

    if (drawing.url) {
      const ok = await tryLoadDrawingUrl(drawing.url, drawing, gen)
      if (gen !== underlayLoadGen) return
      if (ok) {
        underlayHint.value = null
        return
      }
      underlayHint.value =
        'Onderlegger-URL kon niet laden (COEP/CORS). Kies lokaal een PNG/JPG van dezelfde scan.'
      return
    }

    underlayHint.value = t('viewer.underlayMissingUrl')
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') {
          reject(new Error('read failed'))
          return
        }
        resolve(result)
      }
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsDataURL(file)
    })
  }

  async function onUnderlayFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !plan.value) return
    cancelPlanRescale()
    cancelUnderlayScale()
    try {
      const dataUrl = await fileToDataUrl(file)
      const img = await loadImage(dataUrl)
      const { width, height } = imageDimensions(img)
      const drawing = provisionalDrawingFromImage(
        { width, height },
        { url: dataUrl, alpha: Math.round(underlayOpacity.value * 100) },
      )
      if (!drawing) {
        underlayHint.value = t('viewer.underlayInvalid')
        return
      }
      if (gevelsMode.value && elevationGroupId.value) {
        elevationUnderlayWidthPx.value = width
        elevationUnderlayHeightPx.value = height
        elevationUnderlaySrc.value = dataUrl
        plan.value = setElevationViewDrawing(plan.value, elevationGroupId.value, drawing)
        const layout = previewUnderlayLayoutFromDrawing(drawing, { width, height })
        elevationUnderlayLayout.value = layout
        underlayHint.value = null
        await nextTick()
        previewCanvasRef.value?.resetView?.()
        beginUnderlayScale()
        return
      }
      const idx = activeFloorIndex.value
      plan.value = {
        ...plan.value,
        floors: plan.value.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
      }
      applyImageToUnderlay(dataUrl, width, height, drawing)
      underlayHint.value = null
      await nextTick()
      previewCanvasRef.value?.resetView?.()
      beginUnderlayScale()
    } catch {
      underlayHint.value = t('viewer.underlayLoadFailed')
    }
  }

  // --- Persist drawing ---

  function persistElevationUnderlayDrawing(groupId = elevationGroupId.value): void {
    const current = plan.value
    const layout = elevationUnderlayLayout.value
    const id = groupId.trim()
    if (!current || !layout || !id) return
    if (!(elevationUnderlayWidthPx.value > 0) || !(elevationUnderlayHeightPx.value > 0)) return
    const url =
      elevationViewForGroup(current, id)?.drawing?.url ?? elevationUnderlaySrc.value ?? undefined
    if (!url) return
    const drawing = drawingFromImageScale({
      imageWidthPx: elevationUnderlayWidthPx.value,
      imageHeightPx: elevationUnderlayHeightPx.value,
      pxPerMmX: layout.pxPerMmX,
      pxPerMmY: layout.pxPerMmY,
      origin: layout.origin,
      url,
      alpha: Math.round(underlayOpacity.value * 100),
      rotation: layout.rotationDeg ?? 0,
    })
    if (!drawing) return
    plan.value = setElevationViewDrawing(current, id, drawing)
  }

  function persistActiveUnderlayDrawing(): void {
    persistElevationUnderlayDrawing()
    const current = plan.value
    const layout = underlayLayout.value
    const idx = activeFloorIndex.value
    const floor = current?.floors[idx]
    if (!current || !floor || !layout) return
    if (!(underlayWidthPx.value > 0) || !(underlayHeightPx.value > 0)) return
    const url = floor.drawing?.url ?? underlaySrc.value
    if (!url) return
    const drawing = drawingFromImageScale({
      imageWidthPx: underlayWidthPx.value,
      imageHeightPx: underlayHeightPx.value,
      pxPerMmX: layout.pxPerMmX,
      pxPerMmY: layout.pxPerMmY,
      origin: layout.origin,
      url,
      alpha: Math.round(underlayOpacity.value * 100),
      rotation: layout.rotationDeg ?? 0,
    })
    if (!drawing) return
    if (floor.drawing?.extras) drawing.extras = floor.drawing.extras
    if (floor.drawing?.visible != null) drawing.visible = floor.drawing.visible
    plan.value = {
      ...current,
      floors: current.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
    }
  }

  // --- FML rescale ---

  function cancelPlanRescale(): void {
    rescaleActive.value = false
    rescaleState.value = null
  }

  function beginPlanRescale(): boolean {
    if (inspectMode.value) return false
    const walls = plan.value?.floors[activeFloorIndex.value]?.walls ?? []
    const state = initPlanRescaleStateFromWalls(walls)
    if (!state) return false
    const measured = measuredCmFromRescaleState(state)
    rescaleState.value = state
    rescaleDistanceMmX.value = measured.x * 10
    rescaleDistanceMmY.value = measured.y * 10
    underlayMoveMode.value = false
    cancelUnderlayScale()
    rescaleActive.value = true
    return true
  }

  function updatePlanRescaleState(next: HScaleState): void {
    if (!rescaleActive.value) return
    rescaleState.value = { ...next }
  }

  function setPlanRescaleDistanceMmX(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    rescaleDistanceMmX.value = mm
  }

  function setPlanRescaleDistanceMmY(mm: number): void {
    if (!(mm > 0) || !Number.isFinite(mm)) return
    rescaleDistanceMmY.value = mm
  }

  function confirmPlanRescale(): boolean {
    const state = rescaleState.value
    const current = plan.value
    if (!state || !rescaleActive.value || !current) return false
    const measured = measuredCmFromRescaleState(state)
    const factors = resolveRescaleFactorsFromRulers({
      measuredCmX: measured.x,
      measuredCmY: measured.y,
      trueMmX: rescaleDistanceMmX.value,
      trueMmY: rescaleDistanceMmY.value,
    })
    if (factors == null) return false
    plan.value = scaleFloorPlanAndRegenAreas(current, factors, activeFloorIndex.value)
    if (underlayLayout.value) {
      underlayLayout.value = scaleUnderlayLayout(underlayLayout.value, factors)
    }
    cancelPlanRescale()
    return true
  }

  // --- Underlay scale ---

  function cancelUnderlayScale(): void {
    underlayScaleActive.value = false
    underlayScaleState.value = null
  }

  function beginUnderlayScale(): boolean {
    if (inspectMode.value || !underlayAvailable.value) return false
    const layout = activeUnderlayLayout.value
    const widthPx = activeUnderlayWidthPx.value
    const heightPx = activeUnderlayHeightPx.value
    const handles = initImageScaleHandles(widthPx, heightPx)
    if (!layout || !handles) return false
    const cmState = rescaleStateFromImageHandles(handles, layout)
    if (!cmState) return false
    const measured = measuredCmFromRescaleState(cmState)
    cancelPlanRescale()
    underlayScaleState.value = cmState
    underlayScaleMmX.value = measured.x * 10
    underlayScaleMmY.value = measured.y * 10
    underlayMoveMode.value = false
    underlayScaleActive.value = true
    return true
  }

  function updateUnderlayScaleState(next: HScaleState): void {
    if (!underlayScaleActive.value) return
    underlayScaleState.value = { ...next }
  }

  function onRescaleStateUpdate(next: HScaleState): void {
    if (rescaleActive.value) updatePlanRescaleState(next)
    else if (underlayScaleActive.value) updateUnderlayScaleState(next)
  }

  function confirmUnderlayScale(): boolean {
    const state = underlayScaleState.value
    const layout = activeUnderlayLayout.value
    const current = plan.value
    if (!state || !layout || !current || !underlayScaleActive.value) return false
    const measured = measuredCmFromRescaleState(state)
    const nextPpm = resolveUnderlayPxPerMmFromRulers({
      measuredCmX: measured.x,
      measuredCmY: measured.y,
      currentPxPerMmX: layout.pxPerMmX,
      currentPxPerMmY: layout.pxPerMmY,
      trueMmX: underlayScaleMmX.value,
      trueMmY: underlayScaleMmY.value,
    })
    if (!nextPpm) return false
    const widthPx = activeUnderlayWidthPx.value
    const heightPx = activeUnderlayHeightPx.value
    const url = gevelsMode.value
      ? (elevationViewForGroup(current, elevationGroupId.value)?.drawing?.url ??
        elevationUnderlaySrc.value ??
        undefined)
      : (current.floors[activeFloorIndex.value]?.drawing?.url ?? underlaySrc.value ?? undefined)
    const drawing = drawingFromImageScale({
      imageWidthPx: widthPx,
      imageHeightPx: heightPx,
      pxPerMmX: nextPpm.pxPerMmX,
      pxPerMmY: nextPpm.pxPerMmY,
      origin: layout.origin,
      url,
      alpha: Math.round(underlayOpacity.value * 100),
      rotation: layout.rotationDeg ?? 0,
    })
    if (!drawing) return false
    if (gevelsMode.value && elevationGroupId.value) {
      plan.value = setElevationViewDrawing(current, elevationGroupId.value, drawing)
      const nextLayout = previewUnderlayLayoutFromDrawing(drawing, {
        width: widthPx,
        height: heightPx,
      })
      if (nextLayout) {
        elevationUnderlayLayout.value = copyUnderlayDisplayOrient(nextLayout, layout)
      }
      cancelUnderlayScale()
      void nextTick().then(() => previewCanvasRef.value?.resetView?.())
      return true
    }
    const idx = activeFloorIndex.value
    const floor = current.floors[idx]
    if (floor?.drawing?.extras) drawing.extras = floor.drawing.extras
    if (floor?.drawing?.visible != null) drawing.visible = floor.drawing.visible
    plan.value = {
      ...current,
      floors: current.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
    }
    const nextLayout = previewUnderlayLayoutFromDrawing(drawing, {
      width: underlayWidthPx.value,
      height: underlayHeightPx.value,
    })
    if (nextLayout) {
      underlayLayout.value = copyUnderlayDisplayOrient(nextLayout, layout)
    }
    cancelUnderlayScale()
    if ((floor?.walls.length ?? 0) === 0) {
      void nextTick().then(() => previewCanvasRef.value?.resetView?.())
    }
    return true
  }

  // --- Computed ---

  const underlayAvailable = computed(() =>
    gevelsMode.value
      ? !!elevationUnderlaySrc.value && !!elevationUnderlayLayout.value
      : !!underlaySrc.value && !!underlayLayout.value,
  )

  const canStartRescale = computed(
    () => (plan.value?.floors[activeFloorIndex.value]?.walls.length ?? 0) > 0 && !inspectMode.value,
  )

  const canStartUnderlayScale = computed(() => underlayAvailable.value && !inspectMode.value)

  const rescaleOverlayActive = computed(() => rescaleActive.value || underlayScaleActive.value)
  const rescaleOverlayState = computed(() =>
    rescaleActive.value ? rescaleState.value : underlayScaleState.value,
  )

  const underlayScalePxX = computed(() => {
    const state = underlayScaleState.value
    const layout = activeUnderlayLayout.value
    if (!state || !layout) return 0
    return measuredCmFromRescaleState(state).x * 10 * layout.pxPerMmX
  })

  const underlayScalePxY = computed(() => {
    const state = underlayScaleState.value
    const layout = activeUnderlayLayout.value
    if (!state || !layout) return 0
    return measuredCmFromRescaleState(state).y * 10 * layout.pxPerMmY
  })

  const underlayScaleCanConfirm = computed(
    () =>
      underlayScaleActive.value &&
      underlayScalePxX.value > 3 &&
      underlayScalePxY.value > 3 &&
      underlayScaleMmX.value > 0 &&
      underlayScaleMmY.value > 0,
  )

  const underlayScaleMismatchPct = computed(() => {
    const x = underlayScalePxX.value / underlayScaleMmX.value
    const y = underlayScalePxY.value / underlayScaleMmY.value
    if (!(x > 0) || !(y > 0)) return 0
    return (Math.abs(x - y) / Math.min(x, y)) * 100
  })

  // --- Orient ---

  function applyViewerUnderlayOrient(): void {
    const layout = activeUnderlayLayout.value
    if (!layout) return
    const next = cloneUnderlayOriginLayout(layout)
    next.flipX = !next.flipX
    if (!next.flipX) delete next.flipX
    if (gevelsMode.value) elevationUnderlayLayout.value = next
    else underlayLayout.value = next
  }

  function setUnderlayRotationDeg(raw: number): void {
    const layout = activeUnderlayLayout.value
    if (!layout || !Number.isFinite(raw)) return
    const next = cloneUnderlayOriginLayout(layout)
    let rotationDeg = raw
    while (rotationDeg > 180) rotationDeg -= 360
    while (rotationDeg <= -180) rotationDeg += 360
    if (Math.abs(rotationDeg) < 0.001) delete next.rotationDeg
    else next.rotationDeg = Math.round(rotationDeg * 10) / 10
    if (gevelsMode.value) elevationUnderlayLayout.value = next
    else underlayLayout.value = next
  }

  const underlayRotationDeg = computed(() => activeUnderlayLayout.value?.rotationDeg ?? 0)

  function onElevationUnderlayLayout(layout: PreviewUnderlayLayout): void {
    elevationUnderlayLayout.value = cloneUnderlayOriginLayout(layout)
  }

  return {
    underlaySrc,
    underlayWidthPx,
    underlayHeightPx,
    underlayLayout,
    underlayOpacity,
    underlayHint,
    underlayMoveMode,
    reuseUnderlayOpen,
    underlayFoldOpen,
    underlayReuseDonors,
    needsUnderlayReuse,
    underlayAvailable,
    underlayRotationDeg,
    canStartRescale,
    canStartUnderlayScale,
    rescaleOverlayActive,
    rescaleOverlayState,
    rescaleActive,
    rescaleState,
    rescaleDistanceMmX,
    rescaleDistanceMmY,
    underlayScaleActive,
    underlayScaleState,
    underlayScaleMmX,
    underlayScaleMmY,
    underlayScalePxX,
    underlayScalePxY,
    underlayScaleCanConfirm,
    underlayScaleMismatchPct,
    reuseDonorLabel,
    onReuseUnderlayFromDonor,
    clearUnderlayState,
    onUnderlayOpacityInput,
    onUnderlayFileInput,
    persistElevationUnderlayDrawing,
    persistActiveUnderlayDrawing,
    cancelPlanRescale,
    beginPlanRescale,
    setPlanRescaleDistanceMmX,
    setPlanRescaleDistanceMmY,
    confirmPlanRescale,
    cancelUnderlayScale,
    beginUnderlayScale,
    confirmUnderlayScale,
    onRescaleStateUpdate,
    syncUnderlayForActiveFloor,
    applyViewerUnderlayOrient,
    setUnderlayRotationDeg,
    onElevationUnderlayLayout,
  }
}
