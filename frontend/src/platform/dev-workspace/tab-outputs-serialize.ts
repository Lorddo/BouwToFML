import type { ExtractionOutput } from '@/core/extraction'
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

function serializeOutput(output: ExtractionOutput | null): ExtractionOutput | null {
  if (!output) return null
  const state = output.meta?.roomClassifyState
  const prepared: ExtractionOutput = state
    ? {
        ...output,
        meta: {
          ...output.meta,
          extractorId: output.meta?.extractorId ?? 'geometry-lbe',
          elapsedMs: output.meta?.elapsedMs ?? 0,
          roomClassifyState: serializeRoomClassifyState(state),
        },
      }
    : output
  return clonePlain(prepared)
}

/** JSON-veilige kopie van tabOutputs — behoudt Int32Array-labels als number[]. */
export function cloneTabOutputsForSnapshot(outputs: TabDetectionOutputs): TabDetectionOutputs {
  const next: TabDetectionOutputs = { ...outputs }
  for (const key of Object.keys(outputs) as Array<keyof TabDetectionOutputs>) {
    next[key] = serializeOutput(outputs[key])
  }
  return next
}

/** Herstel tabOutputs na JSON-parse — zet labels terug naar Int32Array. */
export function restoreTabOutputsFromSnapshot(outputs: TabDetectionOutputs): TabDetectionOutputs {
  const next: TabDetectionOutputs = { ...outputs }
  for (const key of Object.keys(outputs) as Array<keyof TabDetectionOutputs>) {
    const output = outputs[key]
    if (!output?.meta?.roomClassifyState) {
      next[key] = output
      continue
    }
    const state = output.meta.roomClassifyState as JsonRoomClassifyState
    next[key] = {
      ...output,
      meta: {
        ...output.meta,
        roomClassifyState: deserializeRoomClassifyState(state),
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
        ...walls.meta,
        roomClassifyState: nextState,
      },
    },
  }
}
