import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { yieldToMain } from '@/platform/image/workImage'
import type { RoomRasterClass } from './room-ink-classify'
import { runInkProcessAfterEdits } from './room-ink-process'
import {
  buildRoomReferenceMat,
  finalizeRoomReferenceMat,
} from './room-reference-preprocess'
import {
  deserializeRoomClassifyState,
  serializeRoomClassifyState,
  type SerializedRoomClassifyState,
} from '../strategies/room-first'

export interface RoomRecalculateLocalResult {
  roomClassifyState: SerializedRoomClassifyState & {
    faceOverrides: Array<[number, RoomRasterClass]>
    pinnedRoots: number[]
  }
  wallCount: number
  surfaceCount: number
  unknownCount: number
  mergedFaceCount: number
}

/**
 * Ink-process v2 op al gecomposeerde muur-B/W — geen kleur-rethreshold.
 * Caller levert effectiveBw (base ⊕ OCR ⊕ ink).
 */
export async function runRoomRecalculateLocal(params: {
  cv: OpenCV
  /** Kleur-onderlegger — alleen voor Otsu-referentie. */
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  /** Gecomposeerde muur-B/W bytes (zelfde WxH als image). */
  precomposedWallBw: Uint8Array
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  roomClassifyState: SerializedRoomClassifyState
  faceOverrides: Array<[number, RoomRasterClass]>
  pinnedRoots: number[]
}): Promise<RoomRecalculateLocalResult> {
  const width =
    params.image instanceof HTMLCanvasElement || params.image instanceof OffscreenCanvas
      ? params.image.width
      : (params.image as HTMLImageElement).naturalWidth
  const height =
    params.image instanceof HTMLCanvasElement || params.image instanceof OffscreenCanvas
      ? params.image.height
      : (params.image as HTMLImageElement).naturalHeight

  if (params.precomposedWallBw.length !== width * height) {
    throw new Error('precomposedWallBw past niet bij image-afmetingen.')
  }

  await yieldToMain()

  const wallMat = new params.cv.Mat(height, width, params.cv.CV_8UC1)
  wallMat.data.set(params.precomposedWallBw)

  const reference = buildRoomReferenceMat({
    cv: params.cv,
    image: params.image,
    eraserMask: params.eraserMask,
    preprocess: params.preprocess,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    wallStyle: params.wallStyle,
  })
  const roomReferenceCanvas = finalizeRoomReferenceMat(params.cv, reference.mat)
  const referenceData = new Uint8Array(reference.mat.data as Uint8Array)

  await yieldToMain()

  const classify = deserializeRoomClassifyState(params.roomClassifyState)

  const recalculated = await runInkProcessAfterEdits({
    cv: params.cv,
    mat: wallMat,
    classify,
    faceOverrides: new Map(params.faceOverrides),
    pinnedRoots: new Set(params.pinnedRoots),
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    referenceData,
    roomReferenceCanvas,
    skipClassifiedMask: true,
  })

  wallMat.delete()
  reference.mat.delete()

  return {
    roomClassifyState: {
      ...serializeRoomClassifyState(recalculated),
      faceOverrides: [...recalculated.refinedFaceOverrides.entries()],
      pinnedRoots: [...recalculated.refinedPinnedRoots],
    },
    wallCount: recalculated.wallCount,
    surfaceCount: recalculated.surfaceCount,
    unknownCount: recalculated.unknownCount,
    mergedFaceCount: recalculated.mergedFaceCount,
  }
}
