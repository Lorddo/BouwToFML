/**
 * Stap-2 muurstempel: donor-FML → canvas-bounds → erase → bake adaptive stampBw + solid stampMask.
 *
 * Live align (1+4): goedkope ghost-bitmap + bounds-stretch; OpenCV/compose alleen bij bake/retune.
 */
import { computed, ref, type Ref } from 'vue'
import type { Floor, Point2D, Wall } from '@/core/fml/types'
import {
  DEFAULT_FML_BAND_BOUNDARIES,
  type FmlThicknessBandBoundaries,
} from '@/core/fml/fml-wall-thickness-tiers'
import type { PreprocessConfig } from '@/core/extraction/types'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { buildWallLayerBwMat } from '@/cv/preprocess/compose-wall-bw'
import {
  DEFAULT_STAMP_BANDS,
  buildStampGhostDataUrl,
  centerAlignBounds,
  computeWallsBBox,
  filterWallsByBands,
  rasterizeStampGrayBytes,
  rasterizeStampSolid,
  stampGrayBytesToCanvas,
  stampMaskHasInk,
  transformWallsByBounds,
  wallsCmToPx,
  type StampBands,
  type StampBounds,
  type StampWallCm,
  type StampWallPx,
} from '@/cv/preprocess/wall-stamp-raster'
import { applyBrushStroke, applyPolygonErase, createEraserMask } from '@/cv/tools/eraser'
import type { PolygonPoint } from '@/cv/tools/polygon'
import { encodeMaskBase64, decodeMaskBase64 } from '@/platform/dev-workspace/mask-codec'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import { tGlobal } from '@/ui/i18n'

export type WallStampSerialized = {
  donorFloorId: string
  bands: StampBands
  baseBounds: StampBounds
  bounds: StampBounds
  wallsCm: StampWallCm[]
  /** Unfiltered donor walls (band-filter bij restore/rebuild). */
  sourceWallsCm?: StampWallCm[]
  originCm: Point2D
  eraseMaskBase64?: string
  stampBwBase64?: string
  stampMaskBase64?: string
  baked: boolean
}

export type WallStampDonorOption = {
  id: string
  name: string
  walls: Wall[]
}

export function useWallStamp(deps: {
  cvLoader: ReturnType<typeof useOpenCvLoader>
  preprocess: Ref<PreprocessConfig>
  imageWidth: () => number
  imageHeight: () => number
  pxPerMmX: () => number
  pxPerMmY: () => number
  bandBoundaries?: () => FmlThicknessBandBoundaries
  /** Na bake/retune — hercompose effectiveBw. */
  onStampBwChanged: () => void
}) {
  const active = ref(false)
  const baked = ref(false)
  const donorFloorId = ref<string | null>(null)
  const bands = ref<StampBands>({ ...DEFAULT_STAMP_BANDS })
  const baseBounds = ref<StampBounds | null>(null)
  const bounds = ref<StampBounds | null>(null)
  const wallsCm = ref<StampWallCm[]>([])
  /** Unfiltered donor snapshot — band-filter bij rebuild. */
  const sourceWallsCm = ref<StampWallCm[]>([])
  const originCm = ref<Point2D>({ x: 0, y: 0 })
  const wallsPxBase = ref<StampWallPx[]>([])
  const eraseMask = ref<Uint8Array | null>(null)
  const stampBw = ref<Uint8Array | null>(null)
  const stampMask = ref<Uint8Array | null>(null)
  /** Ghost data-URL in baseBounds-ruimte; Konva stretcht naar live bounds. */
  const previewUrl = ref<string | null>(null)
  const gumMode = ref<'off' | 'brush' | 'polygon'>('off')
  const brushRadius = ref(12)
  const busy = ref(false)
  const error = ref<string | null>(null)

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null

  const hasStamp = computed(
    () => stampMaskHasInk(stampBw.value) || stampMaskHasInk(stampMask.value),
  )

  function imageSize(): { width: number; height: number } | null {
    const width = deps.imageWidth()
    const height = deps.imageHeight()
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }

  function ensureEraseMask(width: number, height: number): Uint8Array {
    const need = width * height
    if (eraseMask.value && eraseMask.value.length === need) return eraseMask.value
    const next = createEraserMask(width, height)
    eraseMask.value = next
    return next
  }

  function resolveTransformedWalls(): StampWallPx[] {
    const base = baseBounds.value
    const live = bounds.value
    if (!base || !live || wallsPxBase.value.length === 0) return []
    return transformWallsByBounds(wallsPxBase.value, base, live)
  }

  /** Sync ghost — geen OpenCV, geen compose. */
  function rebuildGhost(): void {
    const size = imageSize()
    const base = baseBounds.value
    if (!size || !base || wallsPxBase.value.length === 0) {
      previewUrl.value = null
      return
    }
    previewUrl.value = buildStampGhostDataUrl({
      walls: wallsPxBase.value,
      baseBounds: base,
      imageWidth: size.width,
      imageHeight: size.height,
      eraseMask: eraseMask.value,
    })
  }

  function recomputePxFromSource() {
    const size = imageSize()
    const pxPerMmX = deps.pxPerMmX()
    const pxPerMmY = deps.pxPerMmY()
    if (!size || !(pxPerMmX > 0) || !(pxPerMmY > 0) || sourceWallsCm.value.length === 0)
      return false
    const boundaries = deps.bandBoundaries?.() ?? DEFAULT_FML_BAND_BOUNDARIES
    const filtered = filterWallsByBands(sourceWallsCm.value, bands.value, boundaries)
    wallsCm.value = filtered
    if (filtered.length === 0) {
      wallsPxBase.value = []
      return false
    }
    const px = wallsCmToPx({
      walls: filtered,
      origin: originCm.value,
      pxPerMmX,
      pxPerMmY,
    })
    const box = computeWallsBBox(px)
    if (!box) return false
    wallsPxBase.value = px
    // Behoud live bounds-center; update baseBounds aan nieuwe bbox-maat.
    const prev = bounds.value
    baseBounds.value = { ...box }
    if (prev) {
      const cx = prev.x + prev.width / 2
      const cy = prev.y + prev.height / 2
      bounds.value = {
        x: cx - box.width / 2,
        y: cy - box.height / 2,
        width: box.width,
        height: box.height,
      }
    } else {
      bounds.value = centerAlignBounds(box, size.width, size.height)
    }
    return true
  }

  /** Zware pad: solid + adaptive OpenCV + compose-callback. Alleen bake / retune / hydrate. */
  async function rebuildOutputs(options?: { adaptive?: boolean }): Promise<void> {
    const size = imageSize()
    const walls = resolveTransformedWalls()
    if (!size || walls.length === 0) {
      stampBw.value = null
      stampMask.value = null
      deps.onStampBwChanged()
      return
    }
    const erase = eraseMask.value
    const solid = rasterizeStampSolid({
      walls,
      width: size.width,
      height: size.height,
      eraseMask: erase,
    })
    stampMask.value = solid

    const doAdaptive = options?.adaptive !== false
    if (doAdaptive) {
      busy.value = true
      try {
        await deps.cvLoader.ensureOpenCv()
        const cv = await waitForOpenCV()
        const gray = rasterizeStampGrayBytes({
          walls,
          width: size.width,
          height: size.height,
          eraseMask: erase,
        })
        const grayCanvas = stampGrayBytesToCanvas(gray, size.width, size.height)
        const mat = buildWallLayerBwMat({
          cv,
          image: grayCanvas,
          preprocess: deps.preprocess.value,
        })
        try {
          stampBw.value = new Uint8Array(mat.data)
        } finally {
          mat.delete()
        }
      } catch (err) {
        // Fallback: solid als adaptive faalt (tests zonder OpenCV-assets).
        stampBw.value = new Uint8Array(solid)
        error.value =
          err instanceof Error ? err.message : tGlobal('preprocess.stampErrors.adaptiveFailed')
      } finally {
        busy.value = false
      }
    } else if (!stampBw.value || stampBw.value.length !== size.width * size.height) {
      stampBw.value = new Uint8Array(solid)
    }

    deps.onStampBwChanged()
  }

  function scheduleHeavyRebuild(options?: { adaptive?: boolean; delayMs?: number }) {
    if (rebuildTimer) clearTimeout(rebuildTimer)
    const delay = options?.delayMs ?? 80
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      void rebuildOutputs({ adaptive: options?.adaptive })
    }, delay)
  }

  function beginFromDonor(params: {
    donorFloorId: string
    walls: Wall[]
    originCm?: Point2D
  }): boolean {
    error.value = null
    const size = imageSize()
    if (!size) {
      error.value = tGlobal('preprocess.stampErrors.noUnderlaySize')
      return false
    }
    const pxPerMmX = deps.pxPerMmX()
    const pxPerMmY = deps.pxPerMmY()
    if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) {
      error.value = tGlobal('preprocess.stampErrors.confirmScale')
      return false
    }
    const boundaries = deps.bandBoundaries?.() ?? DEFAULT_FML_BAND_BOUNDARIES
    const allWalls = params.walls.map((w) => ({
      a: { ...w.a },
      b: { ...w.b },
      thickness: w.thickness,
    }))
    const filtered = filterWallsByBands(allWalls, bands.value, boundaries)
    if (filtered.length === 0) {
      error.value = tGlobal('preprocess.stampErrors.noWallsInBands')
      return false
    }
    const origin = params.originCm ?? { x: 0, y: 0 }
    const px = wallsCmToPx({
      walls: filtered,
      origin,
      pxPerMmX,
      pxPerMmY,
    })
    const box = computeWallsBBox(px)
    if (!box) {
      error.value = tGlobal('preprocess.stampErrors.bboxFailed')
      return false
    }
    const aligned = centerAlignBounds(box, size.width, size.height)
    donorFloorId.value = params.donorFloorId
    sourceWallsCm.value = allWalls
    wallsCm.value = filtered
    originCm.value = origin
    wallsPxBase.value = px
    baseBounds.value = { ...box }
    bounds.value = { ...aligned }
    eraseMask.value = createEraserMask(size.width, size.height)
    stampBw.value = null
    stampMask.value = null
    baked.value = false
    active.value = true
    gumMode.value = 'off'
    rebuildGhost()
    return true
  }

  function setBands(next: StampBands) {
    bands.value = { ...next }
    if (!active.value && !baked.value) return
    if (!recomputePxFromSource()) {
      error.value = tGlobal('preprocess.stampErrors.noWallsInBands')
      stampBw.value = null
      stampMask.value = null
      previewUrl.value = null
      if (baked.value) deps.onStampBwChanged()
      return
    }
    rebuildGhost()
    if (baked.value) scheduleHeavyRebuild({ adaptive: true })
  }

  /** Live align: alleen bounds — ghost stretcht mee, geen OpenCV/compose. */
  function setBounds(next: StampBounds) {
    bounds.value = { ...next }
  }

  function applyBrushErase(points: Array<{ x: number; y: number }>) {
    const size = imageSize()
    if (!size || points.length === 0) return
    const mask = ensureEraseMask(size.width, size.height)
    applyBrushStroke({
      mask,
      width: size.width,
      height: size.height,
      points,
      radius: brushRadius.value,
    })
    rebuildGhost()
    if (baked.value) scheduleHeavyRebuild({ adaptive: true })
  }

  function applyPolygonErasePoints(points: PolygonPoint[]) {
    const size = imageSize()
    if (!size || points.length < 3) return
    const mask = ensureEraseMask(size.width, size.height)
    applyPolygonErase({
      mask,
      width: size.width,
      height: size.height,
      polygon: points,
    })
    rebuildGhost()
    if (baked.value) scheduleHeavyRebuild({ adaptive: true })
  }

  async function bake(): Promise<boolean> {
    error.value = null
    if (!active.value && !baked.value) {
      error.value = tGlobal('preprocess.stampErrors.noActiveStamp')
      return false
    }
    // baked=true vóór rebuild: getComposeStampBw levert pas dan stampBw aan compose.
    baked.value = true
    await rebuildOutputs({ adaptive: true })
    if (!stampMaskHasInk(stampBw.value) && !stampMaskHasInk(stampMask.value)) {
      baked.value = false
      error.value = tGlobal('preprocess.stampErrors.noStampInk')
      return false
    }
    active.value = false
    gumMode.value = 'off'
    // Compose opnieuw — rebuildOutputs kan al gepubliceerd hebben; zeker na active=false.
    deps.onStampBwChanged()
    return true
  }

  function cancelActive() {
    if (baked.value) {
      active.value = false
      gumMode.value = 'off'
      return
    }
    clear()
  }

  function clear() {
    if (rebuildTimer) clearTimeout(rebuildTimer)
    rebuildTimer = null
    active.value = false
    baked.value = false
    donorFloorId.value = null
    bands.value = { ...DEFAULT_STAMP_BANDS }
    baseBounds.value = null
    bounds.value = null
    wallsCm.value = []
    sourceWallsCm.value = []
    originCm.value = { x: 0, y: 0 }
    wallsPxBase.value = []
    eraseMask.value = null
    stampBw.value = null
    stampMask.value = null
    previewUrl.value = null
    gumMode.value = 'off'
    error.value = null
    deps.onStampBwChanged()
  }

  /** Retune wallLayer: alleen na bake (gebakken inkt in effectiveBw). */
  function retuneFromPreprocess() {
    if (!baked.value) return
    if (wallsPxBase.value.length === 0) return
    scheduleHeavyRebuild({ adaptive: true, delayMs: 0 })
  }

  function serialize(): WallStampSerialized | null {
    if (!donorFloorId.value || !baseBounds.value || !bounds.value) return null
    if (!baked.value && !active.value) return null
    const size = imageSize()
    const out: WallStampSerialized = {
      donorFloorId: donorFloorId.value,
      bands: { ...bands.value },
      baseBounds: { ...baseBounds.value },
      bounds: { ...bounds.value },
      wallsCm: wallsCm.value.map((w) => ({
        a: { ...w.a },
        b: { ...w.b },
        thickness: w.thickness,
      })),
      sourceWallsCm: sourceWallsCm.value.map((w) => ({
        a: { ...w.a },
        b: { ...w.b },
        thickness: w.thickness,
      })),
      originCm: { ...originCm.value },
      baked: baked.value,
    }
    if (size && eraseMask.value && eraseMask.value.some((v) => v > 0)) {
      out.eraseMaskBase64 = encodeMaskBase64(eraseMask.value)
    }
    if (size && stampBw.value && stampMaskHasInk(stampBw.value)) {
      out.stampBwBase64 = encodeMaskBase64(stampBw.value)
    }
    if (size && stampMask.value && stampMaskHasInk(stampMask.value)) {
      out.stampMaskBase64 = encodeMaskBase64(stampMask.value)
    }
    return out
  }

  function hydrate(data: WallStampSerialized | null | undefined, width: number, height: number) {
    clear()
    if (!data || width <= 0 || height <= 0) return
    donorFloorId.value = data.donorFloorId
    bands.value = { ...data.bands }
    baseBounds.value = { ...data.baseBounds }
    bounds.value = { ...data.bounds }
    wallsCm.value = data.wallsCm.map((w) => ({
      a: { ...w.a },
      b: { ...w.b },
      thickness: w.thickness,
    }))
    sourceWallsCm.value = (data.sourceWallsCm ?? data.wallsCm).map((w) => ({
      a: { ...w.a },
      b: { ...w.b },
      thickness: w.thickness,
    }))
    originCm.value = { ...data.originCm }
    baked.value = data.baked
    active.value = false
    const pxPerMmX = deps.pxPerMmX()
    const pxPerMmY = deps.pxPerMmY()
    if (pxPerMmX > 0 && pxPerMmY > 0 && wallsCm.value.length > 0) {
      wallsPxBase.value = wallsCmToPx({
        walls: wallsCm.value,
        origin: originCm.value,
        pxPerMmX,
        pxPerMmY,
      })
    }
    const len = width * height
    eraseMask.value = data.eraseMaskBase64
      ? decodeMaskBase64(data.eraseMaskBase64, len)
      : createEraserMask(width, height)
    stampBw.value = data.stampBwBase64 ? decodeMaskBase64(data.stampBwBase64, len) : null
    stampMask.value = data.stampMaskBase64 ? decodeMaskBase64(data.stampMaskBase64, len) : null
    rebuildGhost()
    if (baked.value) deps.onStampBwChanged()
  }

  /** Compose: alleen gebakken stempel — tijdens align alleen ghost-overlay. */
  function getComposeStampBw(): Uint8Array | null {
    if (baked.value) return stampBw.value
    return null
  }

  function getOtsuStampMask(): Uint8Array | null {
    if (baked.value) return stampMask.value
    return null
  }

  return {
    active,
    baked,
    donorFloorId,
    bands,
    baseBounds,
    bounds,
    eraseMask,
    stampBw,
    stampMask,
    previewUrl,
    gumMode,
    brushRadius,
    busy,
    error,
    hasStamp,
    beginFromDonor,
    setBands,
    setBounds,
    applyBrushErase,
    applyPolygonErasePoints,
    bake,
    cancelActive,
    clear,
    retuneFromPreprocess,
    serialize,
    hydrate,
    getComposeStampBw,
    getOtsuStampMask,
    rebuildOutputs,
    rebuildGhost,
  }
}

export type WorkspaceWallStamp = ReturnType<typeof useWallStamp>

export function wallsFromFloor(floor: Floor | null | undefined): Wall[] {
  return floor?.walls ?? []
}
