import { ref, computed } from 'vue'
import { CONCEPT_DOOR_REFID } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import { SELECTION_COLORS, type ElementClass, type SelectionRect } from './types'
import {
  assignWallThicknessBand,
  enforceWallRefLimit,
  isWallThicknessBand,
  resolveWallThicknessBand,
} from './wall-thickness-ref'

const ACTIVE_SELECTION_CLASSES: ElementClass[] = ['wall', 'door', 'window']

let nextId = 1

const MIN_RECT_SIZE = 5

export function useExampleSelection(activeClasses: ElementClass[] = ACTIVE_SELECTION_CLASSES) {
  const rects = ref<SelectionRect[]>([])
  const selectedRectId = ref<string | null>(null)
  const activeClass = ref<ElementClass | null>(null)
  const isDrawing = ref(false)
  const drawStart = ref<{ x: number; y: number } | null>(null)
  const previewRect = ref<SelectionRect | null>(null)

  const typeColors = SELECTION_COLORS

  function addRect(rect: Omit<SelectionRect, 'id'>) {
    let withDefaults: Omit<SelectionRect, 'id'> =
      rect.type === 'door' ? { ...rect, fmlRefId: rect.fmlRefId ?? CONCEPT_DOOR_REFID } : rect
    if (rect.type === 'wall') {
      const used = new Set(
        rects.value.filter((r) => r.type === 'wall').map((r) => resolveWallThicknessBand(r)),
      )
      const preferred = isWallThicknessBand(rect.wallThicknessBand)
        ? rect.wallThicknessBand
        : ('max' as FmlThicknessBand)
      const fallbackOrder: FmlThicknessBand[] = ['max', 'mid', 'min']
      const band =
        !used.has(preferred) && used.size < 3
          ? preferred
          : (fallbackOrder.find((b) => !used.has(b)) ?? preferred)
      withDefaults = { ...withDefaults, wallThicknessBand: band }
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
    bounds: Pick<SelectionRect, 'x' | 'y' | 'width' | 'height'>,
  ) {
    const idx = rects.value.findIndex((r) => r.id === id)
    if (idx < 0) return
    const width = Math.max(MIN_RECT_SIZE, bounds.width)
    const height = Math.max(MIN_RECT_SIZE, bounds.height)
    const next = [...rects.value]
    next[idx] = { ...next[idx], x: bounds.x, y: bounds.y, width, height }
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

  function updateRectWallThicknessBand(id: string, band: FmlThicknessBand) {
    if (!isWallThicknessBand(band)) return
    rects.value = assignWallThicknessBand(rects.value, id, band)
  }

  function clearRects() {
    rects.value = []
  }

  function clearRectsByType(cls: ElementClass) {
    rects.value = rects.value.filter((r) => r.type !== cls)
  }

  /**
   * Vervang alle muur-refs in één keer (restore). Unieke bands + max 3 via enforce.
   * Voorkomt sequentiële addRect-race waarbij ontbrekende bands tot collapse leiden.
   */
  function replaceWallRects(
    walls: Array<
      Omit<SelectionRect, 'id' | 'type'> & {
        wallThicknessBand?: FmlThicknessBand
      }
    >,
  ) {
    const nonWall = rects.value.filter((r) => r.type !== 'wall')
    const used = new Set<FmlThicknessBand>()
    const fallbackOrder: FmlThicknessBand[] = ['max', 'mid', 'min']
    const nextWalls: SelectionRect[] = []
    for (const wall of walls) {
      const preferred = isWallThicknessBand(wall.wallThicknessBand)
        ? wall.wallThicknessBand
        : ('max' as FmlThicknessBand)
      const band =
        !used.has(preferred) && used.size < 3
          ? preferred
          : (fallbackOrder.find((b) => !used.has(b)) ?? preferred)
      used.add(band)
      nextWalls.push({
        ...wall,
        type: 'wall',
        wallThicknessBand: band,
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
    // Na selectie terug naar pan; opnieuw activeren via Muur/Deur/Raam (of Escape bij afbreken).
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
  }

  function toExamples() {
    return rects.value.map((r) => ({
      id: r.id,
      type: r.type,
      bbox: { x: r.x, y: r.y, width: r.width, height: r.height },
      signature: r.signature,
    }))
  }

  return {
    rects,
    selectedRectId,
    activeClass,
    isDrawing,
    previewRect,
    typeColors,
    counts,
    addRect,
    removeRect,
    selectRect,
    updateRectBounds,
    updateRectFmlRefId,
    updateRectWallThicknessBand,
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
    toExamples,
  }
}
