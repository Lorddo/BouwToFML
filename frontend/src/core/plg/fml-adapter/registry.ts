/**
 * FML concept-adapter registry (Fase A seam voor parallelle Fase B).
 *
 * Contract voor Fase B-taken:
 * 1. Voeg één module toe onder `core/plg/fml-adapter/` (bijv. `wall-elevation.ts`).
 * 2. Exporteer een `FmlConceptAdapter` met unieke `id`.
 * 3. Push die adapter in `FML_CONCEPT_ADAPTERS` hieronder — **volgorde telt**.
 *    Adapters zijn niet-commutatief. Spiegel de legacy import-keten:
 *    ridge → roof planes → bovenlicht-fold → slice-strip → facade-hydrate.
 * 4. Raak `importFmlV3.ts` / `buildFmlV3.ts` niet meer aan; hooks staan al.
 *
 * `hydrate` draait in `importFmlV3` ná die hele legacy-keten (genormaliseerd plan).
 * `serialize*` muteert het export-object; `serializePlanSettings` draait vóór
 * `stripFloorplannerHostileSettings` zodat elevation/floorStack nog gestript worden.
 */
import type {
  Floor,
  FloorDesign,
  FloorPlan,
  FloorSurface,
  Opening,
  Wall,
} from '../../plan/types'
import { wallElevationAdapter } from './wall-elevation'
import { roofAdapter } from './roof'
import { bovenlichtAdapter } from './bovenlicht'
import { dimensionsAdapter } from './dimensions'
import { facadeGroupsAdapter } from './facade-groups'
import { elevationsAdapter } from './elevations'
import { openingFrameAdapter } from './opening-frame'
import { openingKindAdapter } from './opening-kind'
import { fixtureKindAdapter } from './fixture-kind'

export interface FmlConceptAdapter {
  id: string
  /** FML-raw → getypt veld. Draait na de legacy import-keten, vóór return. */
  hydrate?(plan: FloorPlan): void
  /** Getypt veld → FML-raw. Muteert het export-object. */
  serializeWall?(wall: Wall, out: Record<string, unknown>, floor: Floor): void
  serializeOpening?(op: Opening, out: Record<string, unknown>): void
  serializeItem?(item: import('../../plan/types').FloorItem, out: Record<string, unknown>): void
  serializeSurface?(s: FloorSurface, out: Record<string, unknown>): void
  serializePlanSettings?(plan: FloorPlan, settings: Record<string, unknown>): void
  serializeDesignSettings?(design: FloorDesign, settings: Record<string, unknown>): void
}

/**
 * Volgorde is betekenisvol (zie file-header).
 * opening-kind / fixture-kind ná frame (frame hydrateert eerst uit extras).
 */
export const FML_CONCEPT_ADAPTERS: FmlConceptAdapter[] = [
  wallElevationAdapter,
  roofAdapter,
  bovenlichtAdapter,
  dimensionsAdapter,
  facadeGroupsAdapter,
  elevationsAdapter,
  openingFrameAdapter,
  openingKindAdapter,
  fixtureKindAdapter,
]

/** FML-settings → getypte velden; daarna zijn accessors settings-vrij. */
export function promotePlanExtensions(plan: FloorPlan): FloorPlan {
  for (const adapter of FML_CONCEPT_ADAPTERS) {
    adapter.hydrate?.(plan)
  }
  return plan
}
