import type { RasterRoomComponent } from './room-raster'
import { resolveMergedLabel } from './room-raster-merge'
import type { RoomRasterClass } from './room-ink-classify-mapping'

/** Effectieve classificatie per ruw face-label — overrides winnen, daarna opgeslagen state. */
export function buildEffectiveComponentClassification(params: {
  components: RasterRoomComponent[]
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  priorParentMap: Map<number, number>
}): Map<number, RoomRasterClass> {
  const effective = new Map<number, RoomRasterClass>()
  for (const component of params.components) {
    const override = params.faceOverrides.get(component.label)
    if (override !== undefined) {
      effective.set(component.label, override)
      continue
    }
    if (component.touchesBorder) {
      effective.set(component.label, 'outside')
      continue
    }
    const direct = params.classificationByLabel.get(component.label)
    if (direct !== undefined) {
      effective.set(component.label, direct)
      continue
    }
    const priorRoot = resolveMergedLabel(component.label, params.priorParentMap)
    effective.set(component.label, params.classificationByLabel.get(priorRoot) ?? 'surface')
  }
  return effective
}

/** Wie mag inkt opeten — afgeleid uit effectieve classificatie (geen auto-inkt-gok). */
export function buildInkEaterLabelClassFromEffective(
  components: RasterRoomComponent[],
  effectiveClass: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  const labelClass = new Map<number, RoomRasterClass>()
  for (const component of components) {
    labelClass.set(
      component.label,
      effectiveClass.get(component.label) ?? (component.touchesBorder ? 'outside' : 'surface'),
    )
  }
  return labelClass
}

/** Na micro/small-merge: kinderen van wall/outside-parent worden eater voor pass 2. */
export function extendInkEaterClassAfterMerge(params: {
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  labelClass: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  effectiveClass: Map<number, RoomRasterClass>
}): Map<number, RoomRasterClass> {
  const extended = new Map(params.labelClass)
  for (const component of params.components) {
    const parentLabel = params.parentMap.get(component.label)
    if (parentLabel == null) continue
    if (params.faceOverrides.has(component.label)) continue

    const parentRoot = resolveMergedLabel(parentLabel, params.parentMap)
    const parentCls =
      extended.get(parentRoot) ??
      params.effectiveClass.get(parentRoot) ??
      extended.get(parentLabel) ??
      params.effectiveClass.get(parentLabel)
    if (
      parentCls !== 'wall' &&
      parentCls !== 'window' &&
      parentCls !== 'doorframe' &&
      parentCls !== 'outside'
    ) {
      continue
    }
    extended.set(component.label, parentCls)
  }
  return extended
}

/** Gemergde micro/small-kinderen erven wall/window van parent (zonder bestaande override). */
export function applyMergedWallChildInheritance(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap: Map<number, number>
  faceOverrides: Map<number, RoomRasterClass>
}): Map<number, RoomRasterClass> {
  const inherited = new Map(params.faceOverrides)
  for (const [child, parent] of params.parentMap.entries()) {
    if (inherited.has(child)) continue
    const parentRoot = resolveMergedLabel(parent, params.parentMap)
    const parentCls =
      inherited.get(parentRoot) ??
      inherited.get(parent) ??
      params.classificationByLabel.get(parentRoot) ??
      params.classificationByLabel.get(parent)
    if (parentCls === 'wall' || parentCls === 'window' || parentCls === 'doorframe') {
      inherited.set(child, parentCls)
    }
  }
  return inherited
}

export function countClassificationStats(classificationByLabel: Map<number, RoomRasterClass>): {
  wallCount: number
  surfaceCount: number
  unknownCount: number
  doorCount: number
  windowCount: number
  doorframeCount: number
} {
  let wallCount = 0
  let surfaceCount = 0
  let unknownCount = 0
  let doorCount = 0
  let windowCount = 0
  let doorframeCount = 0
  for (const classification of classificationByLabel.values()) {
    if (classification === 'wall') wallCount += 1
    if (classification === 'surface') surfaceCount += 1
    if (classification === 'unknown') unknownCount += 1
    if (classification === 'door') doorCount += 1
    if (classification === 'window') windowCount += 1
    if (classification === 'doorframe') doorframeCount += 1
  }
  return { wallCount, surfaceCount, unknownCount, doorCount, windowCount, doorframeCount }
}
