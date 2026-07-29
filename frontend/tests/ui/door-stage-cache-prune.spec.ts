import { describe, expect, it } from 'vitest'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { DoorSwingHypothesis, ResolvedDoorCandidate } from '@/cv/doors'
import { createEmptyDoorSwingStageCache } from '@/ui/composables/workspace/useWorkspaceDoorSwingHelpers'
import { pruneDoorStageCacheByClassification } from '@/ui/composables/workspace/door-stage-cache-prune'

function hyp(id: string, faceIds: number[]): DoorSwingHypothesis {
  return {
    id,
    faceIds,
    unionBBox: { x: 0, y: 0, width: 10, height: 10 },
    filledAreaPx: 100,
    score: 1,
    source: 'single',
    matchedRefIndex: 0,
  }
}

function door(id: string, faceIds: number[]): ResolvedDoorCandidate {
  return {
    id,
    faceIds,
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    kind: 'single',
    score: 1,
  } as ResolvedDoorCandidate
}

describe('door-stage-cache-prune', () => {
  it('drops demoted door, keeps remaining door faces', () => {
    const cache = {
      ...createEmptyDoorSwingStageCache(),
      stage1Hypotheses: [hyp('a', [1]), hyp('b', [2])],
      stage2AcceptedHypotheses: [hyp('a', [1]), hyp('b', [2])],
      resolvedDoors: [door('a', [1]), door('b', [2])],
    }
    const classification = new Map<number, RoomRasterClass>([
      [1, 'unknown'],
      [2, 'door'],
    ])
    const next = pruneDoorStageCacheByClassification(cache, classification, new Map())
    expect(next.stage2AcceptedHypotheses.map((h) => h.id)).toEqual(['b'])
    expect(next.resolvedDoors.map((d) => d.id)).toEqual(['b'])
  })

  it('resolves class via parentMap merge', () => {
    const cache = {
      ...createEmptyDoorSwingStageCache(),
      stage2AcceptedHypotheses: [hyp('a', [10])],
      resolvedDoors: [door('a', [10])],
    }
    const classification = new Map<number, RoomRasterClass>([[5, 'door']])
    const parentMap = new Map([[10, 5]])
    const next = pruneDoorStageCacheByClassification(cache, classification, parentMap)
    expect(next.resolvedDoors).toHaveLength(1)
  })
})
