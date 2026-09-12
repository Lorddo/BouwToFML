import { ref, computed, watch } from 'vue'
import { FACTORY_THICKNESS_CMS } from '@/core/fml/fml-wall-thickness-catalog'
import { SELECTION_COLORS, type ElementClass, type SelectionRect } from './types'
import { compactRectRotationDeg } from './oriented-rect'
import {
  bindNextWallRefCm,
  enforceWallRefLimit,
  findWallRectForCm,
  resolveWallThicknessCm,
} from './wall-thickness-ref'

const ACTIVE_SELECTION_CLASSES: ElementClass[] = ['wall', 'door', 'window']

let nextId = 1

const MIN_RECT_SIZE = 5

export function useExampleSelection(
  activeClasses: ElementClass[] = ACTIVE_SELECTION_CLASSES,
  options?: { getThicknessCatalog?: () => readonly number[] },
) {
  const rects = ref<SelectionRect[]>([])
  const selectedRectId = ref<string | null>(null)
  const activeClass = ref<ElementClass | null>(null)
  const isDrawing = ref(false)
  const drawStart = ref<{ x: number; y: number } | null>(null)
  const previewRect = ref<SelectionRect | null>(null)
  /** Catalogus-cm voor de volgende muur-ref (stap 2: klik op dikte-rij). */
  const pendingWallThicknessCm = ref<number | null>(null)

  const typeColors = SELECTION_COLORS

  function catalog(): readonly number[] {
    return options?.getThicknessCatalog?.() ?? FACTORY_THICKNESS_CMS
  }

  watch(activeClass, (cls) => {
    if (cls !== 'wall') pendingWallThicknessCm.value = null
  })

  function addRect(rect: Omit<SelectionRect, 'id'>) {
    let withDefaults: Omit<SelectionRect, 'id'> =
      rect.type === 'door' ? { ...rect, fmlRefId: rect.fmlRefId ?? 'door.single' } : rect
    if (rect.type === 'wall') {
      const cm =
        resolveWallThicknessCm(rect) ??
        pendingWallThicknessCm.value ??
        bindNextWallRefCm(rects.value, catalog())
      withDefaults = { ...withDefaults, wallThicknessCm: cm }
      const existing = findWallRectForCm(rects.value, cm)
      if (existing) removeRect(existing.id)
    }
    rects.value.push({ ...withDefaults, id: `sel-${nextId++}` })
    if (rect.type === 'wall') {
      rects.value = enforceWallRefLimit(rects.value).rects
    }
  }

  function removeRect(id: string) {
    rects.value = rects.value.filter((r) => r.id !== id)
    if (selectedRectId.value === id) {
      selectedRectId.value = null
    }
  }

  function selectRect(id: string | null) {
    selectedRectId.value = id
  }

  function updateRectBounds(
    id: string,
    bounds: Pick<SelectionRect, 'x' | 'y' | 'width' | 'height'> & { rotationDeg?: number },
  ) {
    const idx = rects.value.findIndex((r) => r.id === id)
    if (idx < 0) return
    const width = Math.max(MIN_RECT_SIZE, bounds.width)
    const height = Math.max(MIN_RECT_SIZE, bounds.height)
    const next = [...rects.value]
    const current = next[idx]
    const rotationDeg =
      'rotationDeg' in bounds ? compactRectRotationDeg(bounds.rotationDeg) : current.rotationDeg
    next[idx] = {
      ...current,
      x: bounds.x,
      y: bounds.y,
      width,
      height,
      ...(rotationDeg != null ? { rotationDeg } : { rotationDeg: undefined }),
    }
    if (rotationDeg == null) delete next[idx].rotationDeg
    rects.value = next
  }

  function updateRectFmlRefId(id: string, fmlRefId: string) {
    const idx = rects.value.findIndex((r) => r.id === id)
    if (idx < 0) return
    const current = rects.value[idx]
    if (current.type !== 'door') return
    const next = [...rects.value]
    next[idx] = { ...current, fmlRefId }
    rects.value = next
  }

  function updateRectWallThicknessCm(id: string, cm: number) {
    if (!(cm > 0) || !Number.isFinite(cm)) return
    const idx = rects.value.findIndex((r) => r.id === id)
    if (idx < 0) return
    const current = rects.value[idx]
    if (current.type !== 'wall') return
    const next = [...rects.value]
    next[idx] = { ...current, wallThicknessCm: cm }
    rects.value = next
  }

  function clearRects() {
    rects.value = []
  }

  function clearRectsByType(cls: ElementClass) {
    rects.value = rects.value.filter((r) => r.type !== cls)
  }

  /**
   * Vervang alle muur-refs in één keer (restore). Cap 8 via enforce.
   * `wallThicknessCm` blijft; oude `wallThicknessBand` wordt genegeerd.
   */
  function replaceWallRects(
    walls: Array<
      Omit<SelectionRect, 'id' | 'type'> & {
        wallThicknessCm?: number
      }
    >,
  ) {
    const nonWall = rects.value.filter((r) => r.type !== 'wall')
    const nextWalls: SelectionRect[] = []
    for (const wall of walls) {
      const bound =
        resolveWallThicknessCm(wall) ?? bindNextWallRefCm([...nonWall, ...nextWalls], catalog())
      nextWalls.push({
        ...wall,
        type: 'wall',
        wallThicknessCm: bound,
        id: `sel-${nextId++}`,
      })
    }
    rects.value = enforceWallRefLimit([...nonWall, ...nextWalls]).rects
  }

  function rectsByClass(cls: ElementClass) {
    return rects.value.filter((r) => r.type === cls)
  }

  function limitToN(n: number) {
    const limited: SelectionRect[] = []
    for (const cls of activeClasses) {
      limited.push(...rectsByClass(cls).slice(0, n))
    }
    rects.value = limited
  }

  const counts = computed(() => {
    const out = {} as Record<ElementClass, number>
    for (const cls of activeClasses) {
      out[cls] = rectsByClass(cls).length
    }
    return out
  })

  function startDraw(x: number, y: number) {
    if (!activeClass.value) return
    isDrawing.value = true
    drawStart.value = { x, y }
    previewRect.value = {
      id: 'preview',
      type: activeClass.value,
      x,
      y,
      width: 0,
      height: 0,
    }
  }

  function updateDraw(x: number, y: number) {
    if (!drawStart.value || !previewRect.value) return
    const sx = drawStart.value.x
    const sy = drawStart.value.y
    previewRect.value = {
      ...previewRect.value,
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      width: Math.abs(x - sx),
      height: Math.abs(y - sy),
    }
  }

  function endDraw() {
    if (previewRect.value && previewRect.value.width > 5 && previewRect.value.height > 5) {
      addRect({
        type: previewRect.value.type,
        x: previewRect.value.x,
        y: previewRect.value.y,
        width: previewRect.value.width,
        height: previewRect.value.height,
      })
    }
    isDrawing.value = false
    drawStart.value = null
    previewRect.value = null
    pendingWallThicknessCm.value = null
    // Na selectie terug naar pan; opnieuw activeren via dikte-rij / Deur / Raam (of Escape).
    activeClass.value = null
  }

  function cancelDraw() {
    isDrawing.value = false
    drawStart.value = null
    previewRect.value = null
  }

  function deactivateDrawMode() {
    cancelDraw()
    activeClass.value = null
    pendingWallThicknessCm.value = null
  }

  function setPendingWallThicknessCm(cm: number | null) {
    pendingWallThicknessCm.value = cm != null && cm > 0 && Number.isFinite(cm) ? cm : null
  }

  function toExamples() {
    return rects.value.map((r) => ({
      id: r.id,
      type: r.type,
      bbox: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        ...(r.rotationDeg != null ? { rotationDeg: r.rotationDeg } : {}),
      },
      signature: r.signature,
    }))
  }

  return {
    rects,
    selectedRectId,
    activeClass,
    isDrawing,
    previewRect,
    pendingWallThicknessCm,
    typeColors,
    counts,
    addRect,
    removeRect,
    selectRect,
    updateRectBounds,
    updateRectFmlRefId,
    updateRectWallThicknessCm,
    clearRects,
    clearRectsByType,
    replaceWallRects,
    rectsByClass,
    limitToN,
    startDraw,
    updateDraw,
    endDraw,
    cancelDraw,
    deactivateDrawMode,
    setPendingWallThicknessCm,
    toExamples,
  }
}
