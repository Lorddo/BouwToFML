import type { ExtractionOutput } from '@/core/extraction'
import type { DetectionLayerId } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { clonePlain } from './clone-plain'

type JsonRoomClassifyState = Omit<
  SerializedRoomClassifyState,
  'labelsData' | 'rawLabelsData' | 'baselineWallBwData'
> & {
  labelsData: number[]
  rawLabelsData?: number[]
  baselineWallBwData?: number[]
}

type ExtractionMeta = NonNullable<ExtractionOutput['meta']>

/**
 * Opgeslagen variant van een detectie-output: TypedArrays zijn number[] zodat
 * JSON.stringify werkt. Bewust een eigen type — de snapshot en de runtime-vorm
 * zijn niet uitwisselbaar, ook al lijken ze op elkaar.
 */
export type JsonExtractionOutput = Omit<ExtractionOutput, 'meta'> & {
  meta?: Omit<ExtractionMeta, 'roomClassifyState'> & {
    roomClassifyState?: JsonRoomClassifyState
  }
}

export type JsonTabDetectionOutputs = Record<DetectionLayerId, JsonExtractionOutput | null>

function serializeRoomClassifyState(state: SerializedRoomClassifyState): JsonRoomClassifyState {
  return {
    ...state,
    labelsData: Array.from(state.labelsData),
    rawLabelsData: state.rawLabelsData ? Array.from(state.rawLabelsData) : undefined,
    baselineWallBwData: state.baselineWallBwData ? Array.from(state.baselineWallBwData) : undefined,
  }
}

function deserializeRoomClassifyState(state: JsonRoomClassifyState): SerializedRoomClassifyState {
  return {
    ...state,
    labelsData: new Int32Array(state.labelsData),
    rawLabelsData: state.rawLabelsData ? new Int32Array(state.rawLabelsData) : undefined,
    baselineWallBwData: state.baselineWallBwData
      ? new Uint8Array(state.baselineWallBwData)
      : undefined,
  }
}

function serializeOutput(output: ExtractionOutput | null): JsonExtractionOutput | null {
  if (!output) return null
  const state = output.meta?.roomClassifyState
  if (!state) {
    // Zonder classify-state verschilt de snapshot-vorm niet van de runtime-vorm.
    return clonePlain(output as JsonExtractionOutput)
  }
  const prepared: JsonExtractionOutput = {
    ...output,
    meta: {
      ...output.meta,
      extractorId: output.meta?.extractorId ?? 'geometry-lbe',
      elapsedMs: output.meta?.elapsedMs ?? 0,
      roomClassifyState: serializeRoomClassifyState(state),
    },
  }
  return clonePlain(prepared)
}

/** JSON-veilige kopie van tabOutputs — behoudt Int32Array-labels als number[]. */
export function cloneTabOutputsForSnapshot(outputs: TabDetectionOutputs): JsonTabDetectionOutputs {
  const next = {} as JsonTabDetectionOutputs
  for (const key of Object.keys(outputs) as DetectionLayerId[]) {
    next[key] = serializeOutput(outputs[key])
  }
  return next
}

/** Herstel tabOutputs na JSON-parse — zet labels terug naar Int32Array. */
export function restoreTabOutputsFromSnapshot(
  outputs: JsonTabDetectionOutputs,
): TabDetectionOutputs {
  const next = {} as TabDetectionOutputs
  for (const key of Object.keys(outputs) as DetectionLayerId[]) {
    const output = outputs[key]
    const meta = output?.meta
    if (!output || !meta?.roomClassifyState) {
      // Zonder classify-state verschilt de snapshot-vorm niet van de runtime-vorm.
      next[key] = output as ExtractionOutput | null
      continue
    }
    next[key] = {
      ...output,
      meta: {
        ...meta,
        roomClassifyState: deserializeRoomClassifyState(meta.roomClassifyState),
      },
    }
  }
  return next
}

/** Voeg live face-overrides toe aan walls-output vóór snapshot. */
export function enrichWallsOutputWithFaceState(
  outputs: TabDetectionOutputs,
  faceOverrides?: Array<[number, RoomRasterClass]>,
  pinnedRoots?: number[],
  liveState?: SerializedRoomClassifyState,
): TabDetectionOutputs {
  const walls = outputs.walls
  const baseState = liveState ?? walls?.meta?.roomClassifyState
  if (!baseState) return outputs

  const nextState: SerializedRoomClassifyState = {
    ...baseState,
    faceOverrides: faceOverrides?.length ? faceOverrides : baseState.faceOverrides,
    pinnedRoots: pinnedRoots?.length ? pinnedRoots : baseState.pinnedRoots,
  }
  if (!walls) {
    return {
      ...outputs,
      walls: {
        candidates: [],
        segments: [],
        masks: [],
        meta: {
          extractorId: 'geometry-lbe',
          elapsedMs: 0,
          roomPipelinePhase: 'classify',
          roomClassifyState: nextState,
        },
      },
    }
  }
  return {
    ...outputs,
    walls: {
      ...walls,
      meta: {
        extractorId: 'geometry-lbe',
        elapsedMs: 0,
        ...walls.meta,
        roomClassifyState: nextState,
      },
    },
  }
}
