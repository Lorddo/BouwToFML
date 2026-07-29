import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'

export function didDemoteDoorFace(
  previousClass: RoomRasterClass | null | undefined,
  nextClass: RoomRasterClass | null | undefined,
): boolean {
  return previousClass === 'door' && !!nextClass && nextClass !== 'door'
}

export function shouldRefreshDoorOverlayAfterBoxDemote(params: {
  targetClass: RoomRasterClass
  changedCount: number
  hadDoorFaceBefore: boolean
}): boolean {
  return params.changedCount > 0 && params.targetClass !== 'door' && params.hadDoorFaceBefore
}

/** Window-pipeline faces: `window` (glas) of `doorframe` (kozijn naast deurboog). */
export function isWindowPipelineFaceClass(
  cls: RoomRasterClass | null | undefined,
): cls is 'window' | 'doorframe' {
  return cls === 'window' || cls === 'doorframe'
}

export function didDemoteWindowPipelineFace(
  previousClass: RoomRasterClass | null | undefined,
  nextClass: RoomRasterClass | null | undefined,
): boolean {
  return (
    isWindowPipelineFaceClass(previousClass) && !!nextClass && !isWindowPipelineFaceClass(nextClass)
  )
}

export function shouldRefreshWindowOverlayAfterBoxDemote(params: {
  targetClass: RoomRasterClass
  changedCount: number
  hadWindowPipelineFaceBefore: boolean
}): boolean {
  return (
    params.changedCount > 0 &&
    !isWindowPipelineFaceClass(params.targetClass) &&
    params.hadWindowPipelineFaceBefore
  )
}
