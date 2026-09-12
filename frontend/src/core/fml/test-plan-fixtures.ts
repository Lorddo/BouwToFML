import type { FloorItem, Opening, OpeningType } from './types'
import type { OpeningKind } from './opening-kind-catalog'
import type { FixtureAssetKind } from './fixture-kind-catalog'
import { defaultOpeningKind } from './opening-kind-catalog'

/** Test-helper: minimale Opening met verplicht id+kind. */
export function testOpening(
  partial: Partial<Opening> & Pick<Opening, 't' | 'width' | 'type'> & { kind?: OpeningKind },
): Opening {
  const type: OpeningType = partial.type
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: partial.kind ?? defaultOpeningKind(type),
    t: partial.t,
    width: partial.width,
    type,
    mirrored: partial.mirrored,
    z: partial.z,
    z_height: partial.z_height,
    materials: partial.materials,
    name: partial.name,
    showLabel: partial.showLabel,
    name_x: partial.name_x,
    name_y: partial.name_y,
    bovenlicht: partial.bovenlicht,
    bovenlichtHeightCm: partial.bovenlichtHeightCm,
    bovenlichtGapCm: partial.bovenlichtGapCm,
    frame: partial.frame,
    extras: partial.extras,
  }
}

export function testItem(
  partial: Partial<FloorItem> & Pick<FloorItem, 'x' | 'y' | 'width' | 'height'> & { kind?: FixtureAssetKind },
): FloorItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: partial.kind ?? 'generic',
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    z: partial.z,
    z_height: partial.z_height,
    rotation: partial.rotation,
    mirrored: partial.mirrored,
    name: partial.name,
    showLabel: partial.showLabel,
    name_x: partial.name_x,
    name_y: partial.name_y,
    extras: partial.extras,
  }
}
