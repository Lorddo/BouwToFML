import { resolvePixelClassification, type RoomRasterClass } from './room-ink-classify'
import type { RasterRoomComponent } from './room-raster'
import { classifyChildTier, resolveMergedLabel } from './room-raster-merge'

/**
 * Enclosed micro/small-merge (`parentMap`) is why Muren nog unieke kleuren toont
 * (preview: groupBy component + colorForLabel(rawLabel)) terwijl FaceID/openings
 * alleen de merged root zien.
 *
 * Autoclass schrijft classes op merged roots; kinderen hebben vaak geen eigen key
 * en erven wall via resolvePixelClassification — daardoor faalde een detach die
 * “child must already be surface” eiste.
 *
 * Opening-seed pass (tijdelijke Stage identity; ≠ permanente claim):
 * 1. koppelt micro/small-kinderen (of alle kinderen van wall/outside) los
 * 2. materialiseert ontbrekende child-class als `surface` (witte CC ≠ wall-inkt)
 * 3. zonder component-meta (probe): alle parentMap-kinderen los → FaceID = rawLabel
 */
export function detachEnclosedChildrenForOpeningSeeds(params: {
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  components?: readonly RasterRoomComponent[]
  imageWidth?: number
  imageHeight?: number
}): {
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
} {
  const { parentMap } = params
  if (parentMap.size === 0) {
    return {
      parentMap,
      classificationByLabel: params.classificationByLabel,
    }
  }

  const nextParent = new Map(parentMap)
  const nextClass = new Map(params.classificationByLabel)
  const shortSide =
    params.imageWidth && params.imageHeight ? Math.min(params.imageWidth, params.imageHeight) : 0
  const byLabel =
    params.components && params.components.length > 0
      ? new Map(params.components.map((c) => [c.label, c]))
      : null
  const hasTier = !!byLabel && shortSide > 0

  for (const child of parentMap.keys()) {
    const root = resolveMergedLabel(child, parentMap)
    if (root === child) continue

    const rootCls =
      nextClass.get(root) ?? resolvePixelClassification(root, parentMap, nextClass, 'merged')

    let shouldDetach = false
    if (!hasTier) {
      // Probe / geen meta: CC-identiteit = FaceID (zelfde als unieke preview-kleur).
      shouldDetach = true
    } else {
      const childComp = byLabel!.get(child)
      const tier = childComp ? classifyChildTier(childComp, shortSide) : null
      // Wall/outside-parent: altijd los (ook als child class nog “wall” erft).
      // Surface-parent: alleen micro/small (enclosed-merge kandidaten).
      shouldDetach =
        rootCls === 'wall' ||
        rootCls === 'window' ||
        rootCls === 'doorframe' ||
        rootCls === 'outside' ||
        (tier !== null && (rootCls === 'surface' || rootCls === 'unknown' || rootCls === 'door'))
    }

    if (!shouldDetach) continue

    nextParent.delete(child)
    if (!nextClass.has(child)) {
      nextClass.set(
        child,
        rootCls === 'wall' ||
          rootCls === 'window' ||
          rootCls === 'doorframe' ||
          rootCls === 'outside'
          ? 'surface'
          : rootCls,
      )
    }
  }

  return { parentMap: nextParent, classificationByLabel: nextClass }
}
