import { ref, type Ref } from 'vue'
import type { PreprocessConfig } from '@/core/extraction/types'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import {
  bakeInkOverlayIntoBaseBw,
  buildBaseWallBw,
  composeWallBw,
  createInkOverlay,
  decodeInkOverlayRle,
  effectiveBwToCanvas,
  encodeInkOverlayRle,
  inkOverlayHasEdits,
  mergeInkOverlayInto,
} from '@/cv/preprocess/compose-wall-bw'
import {
  layerTuneFingerprintParts,
  underlayPreviewFingerprint,
} from '@/cv/preprocess/layer-preprocess'
import { canvasToDataUrl } from '@/cv/tools/maskImage'
import type { useOpenCvLoader } from '../useOpenCvLoader'

export function useWorkspaceWallBwCompose(deps: {
  originalImageEl: Ref<HTMLImageElement | null>
  preprocess: Ref<PreprocessConfig>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  /** Stap-1 eraser (na bake meestal leeg); géén OCR. */
  step1EraserMask: () => Uint8Array | undefined
  ocrMask: Ref<Uint8Array | null>
}) {
  const baseBwData = ref<Uint8Array | null>(null)
  const baseBwWidth = ref(0)
  const baseBwHeight = ref(0)
  const baseFingerprint = ref<string | null>(null)
  /** Live inkt-tools (stap 2/3); leeg na bake bij afronden stap 2. */
  const inkOverlay = ref<Uint8Array | null>(null)
  /**
   * Gebakken inkt uit stap 2 — overleeft wallLayer-retune (opnieuw op base gezet).
   * Reset bij 2→1 / volledige reset.
   */
  const bakedInkOverlay = ref<Uint8Array | null>(null)
  const effectiveBwData = ref<Uint8Array | null>(null)
  const effectiveBwUrl = ref<string | null>(null)
  const effectiveBwCanvas = ref<HTMLCanvasElement | null>(null)
  let rebuildInFlight: Promise<void> | null = null

  function imageSize(): { width: number; height: number } | null {
    const img = deps.originalImageEl.value
    if (!img?.complete || img.naturalWidth <= 0) return null
    return { width: img.naturalWidth, height: img.naturalHeight }
  }

  function ensureSizedOverlay(
    current: Uint8Array | null,
    width: number,
    height: number,
    assign: (next: Uint8Array) => void,
  ): Uint8Array {
    const need = width * height
    if (current && current.length === need) return current
    const next = createInkOverlay(width, height)
    assign(next)
    return next
  }

  function ensureInkOverlaySize(width: number, height: number): Uint8Array {
    return ensureSizedOverlay(inkOverlay.value, width, height, (next) => {
      inkOverlay.value = next
    })
  }

  function ensureBakedInkOverlaySize(width: number, height: number): Uint8Array {
    return ensureSizedOverlay(bakedInkOverlay.value, width, height, (next) => {
      bakedInkOverlay.value = next
    })
  }

  function applyBakedInkOntoBase() {
    const base = baseBwData.value
    const baked = bakedInkOverlay.value
    if (!base || !baked || baked.length !== base.length) return
    if (!inkOverlayHasEdits(baked)) return
    // bakeInkOverlayIntoBaseBw clears the overlay — use a copy so baked survives retune.
    const scratch = new Uint8Array(baked)
    bakeInkOverlayIntoBaseBw(base, scratch)
  }

  function publishCompose(includeOcr: boolean): Uint8Array | null {
    const base = baseBwData.value
    const w = baseBwWidth.value
    const h = baseBwHeight.value
    if (!base || w <= 0 || h <= 0) return null
    const overlay = ensureInkOverlaySize(w, h)
    ensureBakedInkOverlaySize(w, h)
    const composed = composeWallBw({
      baseBw: base,
      ocrMask: includeOcr ? deps.ocrMask.value : null,
      inkOverlay: overlay,
    })
    effectiveBwData.value = composed
    const canvas = effectiveBwToCanvas(composed, w, h) as HTMLCanvasElement
    effectiveBwCanvas.value = canvas
    effectiveBwUrl.value = canvasToDataUrl(canvas)
    return composed
  }

  function currentFingerprint(): string {
    const size = imageSize()
    const eraser = deps.step1EraserMask()
    const eraserKey = eraser && eraser.length > 0 ? `e${eraser.length}` : 'e0'
    const wallTune = layerTuneFingerprintParts(underlayPreviewFingerprint(deps.preprocess.value)).wall
    return `${size?.width ?? 0}x${size?.height ?? 0}|${wallTune}|${eraserKey}`
  }

  async function rebuildBaseWallBw(options?: { force?: boolean }): Promise<boolean> {
    const size = imageSize()
    const img = deps.originalImageEl.value
    if (!size || !img) return false
    const fp = currentFingerprint()
    if (!options?.force && baseBwData.value && baseFingerprint.value === fp) {
      publishCompose(true)
      return true
    }
    if (rebuildInFlight) {
      await rebuildInFlight
      return baseBwData.value != null
    }
    rebuildInFlight = (async () => {
      await deps.cvLoader.ensureOpenCv()
      const cv = await waitForOpenCV()
      const built = buildBaseWallBw({
        cv,
        image: img,
        preprocess: deps.preprocess.value,
        eraserMask: deps.step1EraserMask(),
      })
      try {
        baseBwData.value = built.data
        baseBwWidth.value = built.width
        baseBwHeight.value = built.height
        baseFingerprint.value = fp
        ensureInkOverlaySize(built.width, built.height)
        ensureBakedInkOverlaySize(built.width, built.height)
        applyBakedInkOntoBase()
        publishCompose(true)
      } finally {
        built.mat.delete()
      }
    })()
    try {
      await rebuildInFlight
      return baseBwData.value != null
    } finally {
      rebuildInFlight = null
    }
  }

  /** Goedkope hercompose (OCR/inkt wijziging); bouwt base indien nodig. */
  async function composeAndPublish(options?: { includeOcr?: boolean }): Promise<string | null> {
    const includeOcr = options?.includeOcr !== false
    if (!baseBwData.value || baseFingerprint.value !== currentFingerprint()) {
      await rebuildBaseWallBw()
    } else {
      publishCompose(includeOcr)
    }
    return effectiveBwUrl.value
  }

  function getEffectiveWallBwBytes(): Uint8Array | null {
    if (effectiveBwData.value) return effectiveBwData.value
    return publishCompose(true)
  }

  /** Canonieke muur-B/W (ná bake: wall + gebakken inkt; geen OCR). */
  function getBaseWallBw(): { data: Uint8Array; width: number; height: number } | null {
    const data = baseBwData.value
    const width = baseBwWidth.value
    const height = baseBwHeight.value
    if (!data || width <= 0 || height <= 0) return null
    return { data, width, height }
  }

  function getEffectiveWallBwCanvas(): HTMLCanvasElement | null {
    if (!effectiveBwCanvas.value) publishCompose(true)
    return effectiveBwCanvas.value
  }

  function clearInkOverlay() {
    const w = baseBwWidth.value
    const h = baseBwHeight.value
    inkOverlay.value = w > 0 && h > 0 ? createInkOverlay(w, h) : null
    bakedInkOverlay.value = w > 0 && h > 0 ? createInkOverlay(w, h) : null
    // Base kan gebakken pixels bevatten — invalidate zodat volgende rebuild schoon is.
    if (baseBwData.value) {
      baseBwData.value = null
      baseFingerprint.value = null
      effectiveBwData.value = null
      effectiveBwUrl.value = null
      effectiveBwCanvas.value = null
    }
  }

  /**
   * Stap 2 afronden: live ink → baseBw + bakedInkOverlay, overlay leeg.
   * Geen bake naar kleur-onderlegger.
   */
  function bakeInkIntoBase(): boolean {
    const base = baseBwData.value
    const w = baseBwWidth.value
    const h = baseBwHeight.value
    if (!base || w <= 0 || h <= 0) return false
    const live = ensureInkOverlaySize(w, h)
    if (!inkOverlayHasEdits(live)) {
      publishCompose(true)
      return false
    }
    const baked = ensureBakedInkOverlaySize(w, h)
    mergeInkOverlayInto(baked, live)
    const changed = bakeInkOverlayIntoBaseBw(base, live)
    publishCompose(true)
    return changed
  }

  function resetWallBwCompose() {
    baseBwData.value = null
    baseBwWidth.value = 0
    baseBwHeight.value = 0
    baseFingerprint.value = null
    inkOverlay.value = null
    bakedInkOverlay.value = null
    effectiveBwData.value = null
    effectiveBwUrl.value = null
    effectiveBwCanvas.value = null
  }

  function serializeInkOverlay(): number[] | null {
    const w = baseBwWidth.value
    const h = baseBwHeight.value
    if (w <= 0 || h <= 0) return null
    const live = inkOverlay.value
    const baked = bakedInkOverlay.value
    const merged = createInkOverlay(w, h)
    if (baked && baked.length === merged.length) mergeInkOverlayInto(merged, baked)
    if (live && live.length === merged.length) mergeInkOverlayInto(merged, live)
    if (!inkOverlayHasEdits(merged)) return null
    return encodeInkOverlayRle(merged)
  }

  function hydrateInkOverlay(runs: number[] | null | undefined, width: number, height: number) {
    const len = width * height
    if (!runs || runs.length === 0 || len <= 0) {
      inkOverlay.value = createInkOverlay(width, height)
      bakedInkOverlay.value = createInkOverlay(width, height)
      return
    }
    // Session: alles als baked (na hydrate volgt rebuildBase → apply baked).
    bakedInkOverlay.value = decodeInkOverlayRle(runs, len)
    inkOverlay.value = createInkOverlay(width, height)
  }

  return {
    baseBwData,
    baseBwWidth,
    baseBwHeight,
    inkOverlay,
    bakedInkOverlay,
    effectiveBwData,
    effectiveBwUrl,
    effectiveBwCanvas,
    rebuildBaseWallBw,
    composeAndPublish,
    publishCompose,
    getEffectiveWallBwBytes,
    getBaseWallBw,
    getEffectiveWallBwCanvas,
    ensureInkOverlaySize,
    clearInkOverlay,
    bakeInkIntoBase,
    resetWallBwCompose,
    serializeInkOverlay,
    hydrateInkOverlay,
    inkOverlayHasEdits: () =>
      inkOverlayHasEdits(inkOverlay.value) || inkOverlayHasEdits(bakedInkOverlay.value),
  }
}

export type WorkspaceWallBwCompose = ReturnType<typeof useWorkspaceWallBwCompose>
