import type { FixtureAssetKind } from '../fixture-refid-catalog'
import {
  balustrade,
  boiler,
  canopy,
  chimney,
  dormer,
  entranceArrow,
  fuseBox,
  glassWall,
  heatPump,
  hidden,
  koof,
  northCross,
  oilBottle,
  railing,
  roofEave,
  skylight,
} from './building'
import { cabinetHigh, cooktop, countertop, dishwasher, fridge, kitchenSink } from './kitchen'
import {
  bathtub,
  dryer,
  sinkDouble,
  sinkLarge,
  sinkSmall,
  sinkVanity,
  showerHead,
  toilet,
  toiletWallHung,
  washerDryer,
  washingMachine,
} from './sanitary'
import {
  stairOpening,
  stairQuarter90Arrival,
  stairQuarter90GoingUp,
  stairStraight,
  stairStraightDouble,
  stairWinder180,
} from './stairs'
import type { OpeningFrameCm } from '../opening-display-geom'
import { emptyShape, isFurnitureKind, type FixtureSymbolShape } from './types'

export type { FixtureSymbolShape } from './types'

/**
 * Eenvoudige top-view symbolen voor FML-import (geen place-tool).
 * Coördinaten in cm, gecentreerd op (0,0); caller past rotatie/spiegeling toe.
 */
export function buildFixtureSymbol(
  kind: FixtureAssetKind,
  widthCm: number,
  heightCm: number,
  mirror: { x?: boolean; y?: boolean; rotation?: number } = {},
  frame?: OpeningFrameCm,
): FixtureSymbolShape {
  const w = Math.max(8, widthCm)
  const h = Math.max(8, heightCm)
  const overWalls = !isFurnitureKind(kind)

  switch (kind) {
    case 'countertop':
      return countertop(w, h)
    case 'fridge':
      return fridge(w, h)
    case 'cabinet_high':
      return cabinetHigh(w, h)
    case 'kitchen_sink':
      return kitchenSink(w, h)
    case 'cooktop':
      return cooktop(w, h)
    case 'dishwasher':
      return dishwasher(w, h)
    case 'washing_machine':
      return washingMachine(w, h)
    case 'dryer':
      return dryer(w, h)
    case 'washer_dryer':
      return washerDryer(w, h)
    case 'bathtub':
      return bathtub(w, h)
    case 'sink_double':
      return sinkDouble(w, h)
    case 'sink_vanity':
      return sinkVanity(w, h)
    case 'toilet_wall_hung':
      return toiletWallHung(w, h)
    case 'glass_wall':
      return glassWall(widthCm, heightCm)
    case 'entrance_arrow':
      return entranceArrow(w, h)
    case 'north_cross':
      return northCross(w, h)
    case 'fuse_box':
      return fuseBox(w, h)
    case 'toilet':
      return toilet(w, h)
    case 'sink_small':
      return sinkSmall(w, h)
    case 'shower_head':
      return showerHead(w, h)
    case 'sink_large':
      return sinkLarge(w, h)
    case 'boiler':
      return boiler(w, h)
    case 'heat_pump':
      return heatPump(w, h)
    case 'stair_winder_180':
      return stairWinder180(w, h)
    case 'stair_quarter_90':
      return stairQuarter90GoingUp(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_quarter_90_up':
      return stairQuarter90Arrival(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_straight':
      return stairStraight(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_straight_double':
      return stairStraightDouble(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_opening':
      return stairOpening(w, h)
    case 'canopy':
      return canopy(w, h)
    case 'chimney':
      return chimney(w, h)
    case 'koof':
      return koof(w, h)
    case 'railing':
      return railing(w, h)
    case 'balustrade':
      return balustrade(widthCm, heightCm)
    case 'skylight':
      return skylight(w, h, frame)
    case 'roof_eave':
      return roofEave(w, h)
    case 'dormer':
      return dormer(w, h)
    case 'hidden':
      return hidden()
    case 'oil_bottle':
      return oilBottle(w, h)
    default:
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        overWalls,
      })
  }
}
