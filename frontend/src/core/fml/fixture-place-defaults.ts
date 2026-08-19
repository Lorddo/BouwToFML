import type { FixtureAssetKind } from './fixture-refid-catalog'

/** Default footprint (cm) when placing a catalog fixture. */
const DEFAULTS: Partial<Record<FixtureAssetKind, { width: number; height: number }>> = {
  countertop: { width: 120, height: 60 },
  fridge: { width: 60, height: 60 },
  cabinet_high: { width: 60, height: 60 },
  kitchen_sink: { width: 80, height: 50 },
  cooktop: { width: 60, height: 52 },
  dishwasher: { width: 60, height: 60 },
  washing_machine: { width: 60, height: 60 },
  dryer: { width: 60, height: 60 },
  washer_dryer: { width: 60, height: 60 },
  bathtub: { width: 170, height: 75 },
  sink_double: { width: 120, height: 50 },
  toilet: { width: 40, height: 70 },
  toilet_wall_hung: { width: 38, height: 55 },
  glass_wall: { width: 90, height: 4 },
  entrance_arrow: { width: 40, height: 40 },
  north_cross: { width: 30, height: 30 },
  fuse_box: { width: 30, height: 50 },
  sink_small: { width: 40, height: 30 },
  shower_head: { width: 20, height: 20 },
  sink_large: { width: 60, height: 50 },
  sink_vanity: { width: 80, height: 50 },
  boiler: { width: 50, height: 40 },
  heat_pump: { width: 80, height: 40 },
  stair_winder_180: { width: 180, height: 90 },
  stair_quarter_90: { width: 80, height: 130 },
  stair_quarter_90_up: { width: 80, height: 130 },
  stair_straight: { width: 90, height: 220 },
  stair_straight_double: { width: 200, height: 220 },
  stair_opening: { width: 110, height: 110 },
  canopy: { width: 200, height: 80 },
  chimney: { width: 50, height: 50 },
  koof: { width: 80, height: 40 },
  railing: { width: 120, height: 8 },
  balustrade: { width: 200, height: 8 },
  skylight: { width: 80, height: 80 },
  roof_eave: { width: 200, height: 20 },
  dormer: { width: 180, height: 80 },
  oil_bottle: { width: 20, height: 20 },
  generic: { width: 60, height: 60 },
}

export function fixturePlaceSizeCm(kind: FixtureAssetKind): { width: number; height: number } {
  return DEFAULTS[kind] ?? { width: 60, height: 60 }
}
