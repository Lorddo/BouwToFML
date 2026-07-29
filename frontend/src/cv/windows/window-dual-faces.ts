import type { FaceGeom, FaceSpace } from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { allowedClassForWindow, type RootFace } from './window-axel-strip-geometry'

/** FaceGeom → Stage RootFace (strip/evidence). */
function faceGeomToRootFace(geom: FaceGeom): RootFace {
  return {
    root: geom.id,
    areaPx: geom.areaPx,
    bbox: { ...geom.bbox },
    className: geom.className,
  }
}

/**
 * RootFaces uit een FaceSpace.byId — zelfde class-gate als Stage 1
 * (`allowedClassForWindow`, breder dan opening-white seeds).
 */
export function rootFacesFromSpace(
  space: FaceSpace,
  classGate: (className: RoomRasterClass) => boolean = allowedClassForWindow,
): RootFace[] {
  const out: RootFace[] = []
  for (const geom of space.byId.values()) {
    if (!(geom.id > 0)) continue
    if (!classGate(geom.className)) continue
    out.push(faceGeomToRootFace(geom))
  }
  return out
}
