import { analyzeDoorSwingRef, type DoorSwingRefBand } from '@/cv/doors'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { grayMatFromBwBytes } from '@/cv/refs/ref-crop-bw'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { resolveFloorDual, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SelectionRect } from '@/platform/selection'
import { resolveDoorFmlTemplateRefId } from '@/core/fml/types'
import { resolveDoorRefKind, signatureForDoorRects } from './useWorkspaceDoorSwingHelpers'

function fingerprintBaseBw(
  baseBw: { data: Uint8Array; width: number; height: number } | null | undefined,
): string {
  if (!baseBw) return 'nobase'
  const d = baseBw.data
  let sum = 0
  let ink = 0
  const step = Math.max(1, Math.floor(d.length / 256))
  for (let i = 0; i < d.length; i += step) {
    const v = d[i] ?? 255
    sum = (sum + v) % 1_000_003
    if (v < 128) ink += 1
  }
  return `${baseBw.width}x${baseBw.height}:${d.length}:${sum}:${ink}`
}

/**
 * Deur computation-cache: floor dual + REF-bands.
 * Stage detach/rebind/filter zit in `runDoorStagePipeline` (pure CV).
 */
export function createDoorSwingComputationCache() {
  let dualCache: {
    dual: FaceDualSpace | null
    labelsData: Int32Array | null
    rawLabelsData: Int32Array | null
    classSignature: string
  } = {
    dual: null,
    labelsData: null,
    rawLabelsData: null,
    classSignature: '',
  }

  let refBandCache: {
    image: HTMLImageElement | HTMLCanvasElement | null
    rectSignature: string
    baseBwFingerprint: string
    bands: DoorSwingRefBand[]
  } = {
    image: null,
    rectSignature: '',
    baseBwFingerprint: '',
    bands: [],
  }

  function classSignatureOf(classificationByLabel: Map<number, RoomRasterClass>): string {
    return [...classificationByLabel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, cls]) => `${id}:${cls}`)
      .join('|')
  }

  function resolveDual(
    state: SerializedRoomClassifyState,
    classificationByLabel: Map<number, RoomRasterClass>,
    faceOverrides?: Map<number, RoomRasterClass>,
    cache?: RoomRasterCache | null,
  ): FaceDualSpace {
    // Live roomRasterCache heeft eigen epoch-cache in ensureFaceDualSpace —
    // geen tweede signature/epoch-laag (stale dual → existingDoorsOnly leeg → wipe).
    if (cache) {
      return resolveFloorDual({
        state,
        cache,
        classificationByLabel,
        faceOverrides,
      })
    }

    const rawLabelsData = state.rawLabelsData ?? state.labelsData
    const overrideSig = faceOverrides
      ? [...faceOverrides.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([id, cls]) => `${id}:${cls}`)
          .join('|')
      : ''
    const classSignature = `${classSignatureOf(classificationByLabel)}#${overrideSig}`
    if (
      dualCache.dual &&
      dualCache.rawLabelsData === rawLabelsData &&
      dualCache.labelsData === state.labelsData &&
      dualCache.classSignature === classSignature
    ) {
      return dualCache.dual
    }
    const dual = resolveFloorDual({
      state,
      cache: null,
      classificationByLabel,
      faceOverrides,
    })
    dualCache = {
      dual,
      rawLabelsData,
      labelsData: state.labelsData,
      classSignature,
    }
    return dual
  }

  async function resolveRefBands(params: {
    rects: SelectionRect[]
    image: HTMLImageElement | HTMLCanvasElement
    cv: OpenCV
    preprocess: PreprocessConfig
    eraserMask?: Uint8Array
    baseBw?: { data: Uint8Array; width: number; height: number } | null
  }): Promise<DoorSwingRefBand[]> {
    const rectSignature = signatureForDoorRects(params.rects)
    const baseBwFingerprint = fingerprintBaseBw(params.baseBw)
    if (
      refBandCache.image === params.image &&
      refBandCache.rectSignature === rectSignature &&
      refBandCache.baseBwFingerprint === baseBwFingerprint
    ) {
      return refBandCache.bands
    }
    const sharedWallBwMat = params.baseBw
      ? grayMatFromBwBytes(params.cv, params.baseBw.data, params.baseBw.width, params.baseBw.height)
      : undefined
    try {
      const bands: DoorSwingRefBand[] = []
      for (const rect of params.rects) {
        if (rect.type !== 'door') continue
        const band = await analyzeDoorSwingRef({
          cv: params.cv,
          image: params.image,
          rect,
          preprocess: params.preprocess,
          eraserMask: params.eraserMask,
          sharedWallBwMat,
        })
        if (!band) continue
        const fmlRefId = resolveDoorFmlTemplateRefId(rect.fmlRefId)
        bands.push({
          ...band,
          fmlRefId,
          kind: resolveDoorRefKind(fmlRefId),
        })
      }
      refBandCache = {
        image: params.image,
        rectSignature,
        baseBwFingerprint,
        bands,
      }
      return bands
    } finally {
      sharedWallBwMat?.delete()
    }
  }

  function getCachedRefBands(): DoorSwingRefBand[] {
    return refBandCache.bands
  }

  function reset(): void {
    dualCache = {
      dual: null,
      labelsData: null,
      rawLabelsData: null,
      classSignature: '',
    }
    refBandCache = {
      image: null,
      rectSignature: '',
      baseBwFingerprint: '',
      bands: [],
    }
  }

  return {
    resolveDual,
    resolveRefBands,
    getCachedRefBands,
    reset,
  }
}
