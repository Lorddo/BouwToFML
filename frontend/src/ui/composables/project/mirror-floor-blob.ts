import {
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  isIdentityFloorOrient,
} from '@/core/fml/floor-plan-orient'
import type { Floor, FloorPlan } from '@/core/fml/types'
import type { FloorOrientPersist, FloorWorkspaceBlob } from './types'

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function cloneFloor(floor: Floor): Floor {
  return JSON.parse(JSON.stringify(floor)) as Floor
}

function singleFloorPlan(floor: Floor, name = 'Floor'): FloorPlan {
  return { name, floors: [cloneFloor(floor)] }
}

function nextOrientPersist(prev: FloorOrientPersist | null | undefined): FloorOrientPersist | null {
  const composed = composeFloorOrient(prev ?? defaultFloorOrient(), 'flipX')
  if (isIdentityFloorOrient(composed)) return null
  return {
    quarterTurnsCw: composed.quarterTurnsCw,
    flipX: composed.flipX,
  }
}

/**
 * Verticale X-flip van één floor-blob om nulpunt (0,0).
 * Underlay-layout ongemoeid. Geen FML → ongewijzigd + mirrored=false.
 */
export function mirrorFloorBlobVertical(blob: FloorWorkspaceBlob): {
  blob: FloorWorkspaceBlob
  mirrored: boolean
} {
  const preview = blob.previewPlan
  if (preview?.floors[0]) {
    const nextPlan = applyFloorOrientOp(clonePlan(preview), 'flipX', 0)
    const nextFloor = nextPlan.floors[0] ?? null
    return {
      blob: {
        ...blob,
        previewPlan: nextPlan,
        generatedFloor: nextFloor ? cloneFloor(nextFloor) : blob.generatedFloor,
        fmlOrient: nextOrientPersist(blob.fmlOrient),
      },
      mirrored: true,
    }
  }
  if (blob.generatedFloor) {
    const wrapped = singleFloorPlan(blob.generatedFloor)
    const nextPlan = applyFloorOrientOp(wrapped, 'flipX', 0)
    const nextFloor = nextPlan.floors[0]
    return {
      blob: {
        ...blob,
        generatedFloor: nextFloor ? cloneFloor(nextFloor) : null,
        previewPlan: null,
        fmlOrient: nextOrientPersist(blob.fmlOrient),
      },
      mirrored: true,
    }
  }
  return { blob, mirrored: false }
}
