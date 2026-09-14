import { computed, type Ref } from 'vue'
import type {
  FloorDimension,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
} from '@/core/plan/types'
import { readPlanSlices, writePlanSlices, type PlanSlice } from '@/core/plan/plan-slices'
import {
  collectOverlayDimensionLines,
  convertOverlayDimensionsToManual,
} from '@/core/plan/convert-overlay-dimensions'

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

export interface EditorAnnotationsDeps {
  localPlan: Ref<FloorPlan | null>
  floorIndex: Ref<number>
  labels: () => FloorLabel[]
  lines: () => FloorLine[]
  dimensions: () => FloorDimension[]
  planSurfaces: () => FloorSurface[]
  setFloorLabels: (next: FloorLabel[] | undefined) => void
  setFloorLines: (next: FloorLine[] | undefined) => void
  setFloorDimensions: (next: FloorDimension[] | undefined) => void
  prepareParentSync: () => void
}

export function createEditorAnnotations(deps: EditorAnnotationsDeps) {
  function addLabel(label: Omit<FloorLabel, 'id'> & { id?: string }): string {
    const id = label.id?.trim() || `label-${shortGuid()}`
    const next: FloorLabel = { ...label, id }
    deps.setFloorLabels([...deps.labels(), next])
    return id
  }

  function updateLabel(
    labelId: string,
    patch: Partial<
      Pick<
        FloorLabel,
        'text' | 'x' | 'y' | 'fontSize' | 'fontColor' | 'outline' | 'bold' | 'italic'
      >
    >,
  ): void {
    const next = deps.labels().map((l) => (l.id === labelId ? { ...l, ...patch } : l))
    deps.setFloorLabels(next)
  }

  function removeLabel(labelId: string): void {
    const next = deps.labels().filter((l) => l.id !== labelId)
    deps.setFloorLabels(next.length > 0 ? next : undefined)
  }

  function addLine(line: Omit<FloorLine, 'id'> & { id?: string }): string {
    const id = line.id?.trim() || `line-${shortGuid()}`
    const next: FloorLine = { ...line, id }
    deps.setFloorLines([...deps.lines(), next])
    return id
  }

  function updateLine(
    lineId: string,
    patch: Partial<Pick<FloorLine, 'type' | 'color' | 'thickness'>>,
  ): void {
    const next = deps.lines().map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    deps.setFloorLines(next)
  }

  function removeLine(lineId: string): void {
    const next = deps.lines().filter((l) => l.id !== lineId)
    deps.setFloorLines(next.length > 0 ? next : undefined)
  }

  function addDimension(dim: Omit<FloorDimension, 'id'> & { id?: string }): string {
    const id = dim.id?.trim() || `dim-${shortGuid()}`
    const next: FloorDimension = { ...dim, id, type: 'custom_dimension' }
    deps.setFloorDimensions([...(deps.dimensions() ?? []), next])
    return id
  }

  function removeDimension(dimensionId: string): void {
    const next = (deps.dimensions() ?? []).filter((d) => d.id !== dimensionId)
    deps.setFloorDimensions(next.length > 0 ? next : undefined)
  }

  function updateDimension(
    dimensionId: string,
    patch: Partial<Pick<FloorDimension, 'a' | 'b'>>,
  ): void {
    const next = (deps.dimensions() ?? []).map((d) =>
      d.id === dimensionId ? { ...d, ...patch } : d,
    )
    deps.setFloorDimensions(next)
  }

  function convertOverlayToManual(source: 'autogen' | 'slicer'): boolean {
    if (!deps.localPlan.value) return false
    const baked = collectOverlayDimensionLines(deps.localPlan.value, deps.floorIndex.value, source)
    if (source === 'autogen' && baked.length === 0) return false
    if (
      source === 'slicer' &&
      readPlanSlices(deps.localPlan.value.floors[deps.floorIndex.value]).length === 0
    )
      return false
    const next = convertOverlayDimensionsToManual(
      deps.localPlan.value,
      deps.floorIndex.value,
      source,
    )
    deps.prepareParentSync()
    deps.localPlan.value = next
    return true
  }

  const planSlices = computed(() =>
    readPlanSlices(deps.localPlan.value?.floors[deps.floorIndex.value]),
  )

  function setPlanSlices(slices: PlanSlice[]): void {
    if (!deps.localPlan.value) return
    deps.localPlan.value = writePlanSlices(deps.localPlan.value, slices, deps.floorIndex.value)
  }

  function addPlanSlice(slice: PlanSlice): number {
    const next = [...planSlices.value, { m: { ...slice.m }, p: { ...slice.p } }]
    setPlanSlices(next)
    return next.length - 1
  }

  function updatePlanSlice(index: number, slice: PlanSlice): void {
    if (index < 0 || index >= planSlices.value.length) return
    const next = planSlices.value.map((s, i) =>
      i === index ? { m: { ...slice.m }, p: { ...slice.p } } : s,
    )
    setPlanSlices(next)
  }

  function clearPlanSlices(): void {
    setPlanSlices([])
  }

  return {
    addLabel,
    updateLabel,
    removeLabel,
    addLine,
    updateLine,
    removeLine,
    addDimension,
    updateDimension,
    removeDimension,
    convertOverlayToManual,
    planSlices,
    setPlanSlices,
    addPlanSlice,
    updatePlanSlice,
    clearPlanSlices,
  }
}
