import type { ExtractionOutput } from '@/core/extraction'
import type { DetectionLayerId } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { toStorableDevSession } from './storable'

type ExtractionMeta = NonNullable<ExtractionOutput['meta']>

/**
 * Opgeslagen room-classify-state: TypedArrays blijven TypedArrays (structured clone /
 * IndexedDB). Legacy number[] uit oude JSON-snapshots blijft ook leesbaar.
 */
export type StorableRoomClassifyState = Omit<
  SerializedRoomClassifyState,
  'labelsData' | 'rawLabelsData' | 'baselineWallBwData'
> & {
  labelsData: Int32Array | number[]
  rawLabelsData?: Int32Array | number[]
  baselineWallBwData?: Uint8Array | number[]
}

/**
 * Opgeslagen variant van een detectie-output: TypedArrays blijven intact.
 * Alias `JsonExtractionOutput` blijft voor backward-compat imports.
 */
export type StorableExtractionOutput = Omit<ExtractionOutput, 'meta'> & {
  meta?: Omit<ExtractionMeta, 'roomClassifyState'> & {
    roomClassifyState?: StorableRoomClassifyState
  }
}

/** @deprecated Gebruik StorableExtractionOutput — TypedArrays, geen JSON number[]. */
export type JsonExtractionOutput = StorableExtractionOutput

export type StorableTabDetectionOutputs = Record<DetectionLayerId, StorableExtractionOutput | null>

/** @deprecated Gebruik StorableTabDetectionOutputs. */
export type JsonTabDetectionOutputs = StorableTabDetectionOutputs

function serializeRoomClassifyState(state: SerializedRoomClassifyState): StorableRoomClassifyState {
  return {
    ...state,
    labelsData: state.labelsData.slice(),
    rawLabelsData: state.rawLabelsData ? state.rawLabelsData.slice() : undefined,
    baselineWallBwData: state.baselineWallBwData ? state.baselineWallBwData.slice() : undefined,
  }
}

function deserializeRoomClassifyState(
  state: StorableRoomClassifyState,
): SerializedRoomClassifyState {
  // `new Int32Array(x)` accepteert number[] én TypedArray — legacy JSON blijft laden.
  return {
    ...state,
    labelsData: new Int32Array(state.labelsData),
    rawLabelsData: state.rawLabelsData ? new Int32Array(state.rawLabelsData) : undefined,
    baselineWallBwData: state.baselineWallBwData
      ? new Uint8Array(state.baselineWallBwData)
      : undefined,
  }
}

function serializeOutput(output: ExtractionOutput | null): StorableExtractionOutput | null {
  if (!output) return null
  const state = output.meta?.roomClassifyState
  if (!state) {
    return toStorableDevSession(output)
  }
  const prepared: StorableExtractionOutput = {
    ...output,
    meta: {
      ...output.meta,
      extractorId: output.meta?.extractorId ?? 'geometry-lbe',
      elapsedMs: output.meta?.elapsedMs ?? 0,
      roomClassifyState: serializeRoomClassifyState(state),
    },
  }
  return toStorableDevSession(prepared)
}

/** Snapshot-kopie van tabOutputs — TypedArrays blijven TypedArrays. */
export function cloneTabOutputsForSnapshot(
  outputs: TabDetectionOutputs,
): StorableTabDetectionOutputs {
  const next = {} as StorableTabDetectionOutputs
  for (const key of Object.keys(outputs) as DetectionLayerId[]) {
    next[key] = serializeOutput(outputs[key])
  }
  return next
}

/** Herstel tabOutputs na snapshot — zet labels terug naar Int32Array/Uint8Array. */
export function restoreTabOutputsFromSnapshot(
  outputs: StorableTabDetectionOutputs,
): TabDetectionOutputs {
  const next = {} as TabDetectionOutputs
  for (const key of Object.keys(outputs) as DetectionLayerId[]) {
    const output = outputs[key]
    const meta = output?.meta
    if (!output || !meta?.roomClassifyState) {
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
