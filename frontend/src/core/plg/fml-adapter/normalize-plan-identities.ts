/**
 * Inbound normalize: legacy `guid`/`refid` → verplicht `id` + `kind`.
 * Geen PLG-versiebump — V1 ongepubliceerd; tolerant voor lokale blobs.
 */
import {
  openingTypeFromKind,
  resolveOpeningKind,
  type OpeningKind,
} from '../../plan/opening-kind-catalog'
import { resolveFixtureKind, type FixtureAssetKind } from '../../plan/fixture-kind-catalog'
import type { Floor, FloorItem, FloorPlan, Opening, OpeningType, Wall } from '../../plan/types'
import { openingKindFromFmlRefid } from './opening-fml-refids'
import { fixtureKindFromFmlRefid } from './fixture-fml-refids'

export const FML_REFID_EXTRA = 'fmlRefid'

function newId(): string {
  return crypto.randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOpening(raw: Opening): Opening {
  const rec = raw as Opening & { guid?: string; refid?: string }
  const id = readString(rec.id) || readString(rec.guid) || newId()
  delete (rec as { guid?: string }).guid

  const hintedType: OpeningType = rec.type === 'window' ? 'window' : 'door'
  let kind: OpeningKind | undefined = readString(rec.kind) as OpeningKind | undefined
  if (kind) {
    kind = resolveOpeningKind(kind).kind
  } else {
    const refid = readString(rec.refid) || readString(rec.extras?.[FML_REFID_EXTRA])
    kind = openingKindFromFmlRefid(refid, hintedType).kind
  }
  delete (rec as { refid?: string }).refid

  if (rec.extras && FML_REFID_EXTRA in rec.extras) {
    const next = { ...rec.extras }
    delete next[FML_REFID_EXTRA]
    rec.extras = Object.keys(next).length > 0 ? next : undefined
  }

  rec.id = id
  rec.kind = kind!
  rec.type = openingTypeFromKind(kind!)
  return rec
}

function normalizeItem(raw: FloorItem): FloorItem {
  const rec = raw as FloorItem & { guid?: string; refid?: string }
  const id = readString(rec.id) || readString(rec.guid) || newId()
  delete (rec as { guid?: string }).guid

  let kind: FixtureAssetKind | undefined = readString(rec.kind) as FixtureAssetKind | undefined
  if (kind) {
    kind = resolveFixtureKind(kind).kind
  } else {
    const refid = readString(rec.refid) || readString(rec.extras?.[FML_REFID_EXTRA])
    kind = fixtureKindFromFmlRefid(refid).kind
  }
  delete (rec as { refid?: string }).refid

  if (rec.extras && FML_REFID_EXTRA in rec.extras) {
    const next = { ...rec.extras }
    delete next[FML_REFID_EXTRA]
    rec.extras = Object.keys(next).length > 0 ? next : undefined
  }

  rec.id = id
  rec.kind = kind!
  return rec
}

function normalizeWall(wall: Wall): void {
  wall.openings = (wall.openings ?? []).map((op) => normalizeOpening(op))
}

function normalizeFloor(floor: Floor): void {
  for (const wall of floor.walls ?? []) normalizeWall(wall)
  for (const design of floor.designs ?? []) {
    for (const wall of design.walls ?? []) normalizeWall(wall)
    if (design.items) {
      design.items = design.items.map((item) => normalizeItem(item))
    }
  }
  if (floor.items) {
    floor.items = floor.items.map((item) => normalizeItem(item))
  }
}

/** Muteert plan in-place: openings/items krijgen verplicht `id` + `kind`, geen `refid`/`guid`. */
export function normalizePlanIdentities(plan: FloorPlan): FloorPlan {
  if (!isRecord(plan) || !Array.isArray(plan.floors)) return plan
  for (const floor of plan.floors) normalizeFloor(floor)
  return plan
}
