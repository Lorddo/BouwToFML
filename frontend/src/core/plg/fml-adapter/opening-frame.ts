/**
 * opening.frame / item.frame — FML kent geen kozijn. Hydrate mag legacy extras
 * → typed frame en stript daarna; serialize schrijft nooit kozijn-extras.
 */
import type { FloorItem, FloorPlan, Opening } from '../../plan/types'
import type { OpeningFrame } from '../extension-types'
import { FML_OPENING_FRAME_EXTRA } from './plg-fml-extras'
import type { FmlConceptAdapter } from './registry'

function readFrame(raw: unknown): OpeningFrame | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const pick = (key: string): number | null => {
    const value = rec[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
  }
  const leftCm = pick('leftCm')
  const rightCm = pick('rightCm')
  const topCm = pick('topCm')
  const bottomCm = pick('bottomCm')
  if (leftCm == null && rightCm == null && topCm == null && bottomCm == null) return null
  return {
    leftCm: leftCm ?? 0,
    rightCm: rightCm ?? 0,
    topCm: topCm ?? 0,
    bottomCm: bottomCm ?? 0,
  }
}

function stripFrameExtra(op: Opening): void {
  if (!op.extras || !(FML_OPENING_FRAME_EXTRA in op.extras)) return
  const next = { ...op.extras }
  delete next[FML_OPENING_FRAME_EXTRA]
  op.extras = Object.keys(next).length > 0 ? next : undefined
}

function hydrateOpening(op: Opening): void {
  if (op.frame != null) {
    stripFrameExtra(op)
    return
  }
  const fromExtras = readFrame(op.extras?.[FML_OPENING_FRAME_EXTRA])
  if (fromExtras) op.frame = fromExtras
  stripFrameExtra(op)
}

function stripItemFrameExtra(item: FloorItem): void {
  if (!item.extras || !(FML_OPENING_FRAME_EXTRA in item.extras)) return
  const next = { ...item.extras }
  delete next[FML_OPENING_FRAME_EXTRA]
  item.extras = Object.keys(next).length > 0 ? next : undefined
}

function hydrateItem(item: FloorItem): void {
  if (item.kind !== 'skylight') {
    stripItemFrameExtra(item)
    return
  }
  if (item.frame != null) {
    stripItemFrameExtra(item)
    return
  }
  const fromExtras = readFrame(item.extras?.[FML_OPENING_FRAME_EXTRA])
  if (fromExtras) item.frame = fromExtras
  stripItemFrameExtra(item)
}

function hydratePlan(plan: FloorPlan): void {
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      for (const op of wall.openings) hydrateOpening(op)
    }
    for (const item of floor.items ?? []) hydrateItem(item)
    for (const design of floor.designs ?? []) {
      for (const wall of design.walls) {
        for (const op of wall.openings) hydrateOpening(op)
      }
      for (const item of design.items ?? []) hydrateItem(item)
    }
  }
}

/** Kozijn blijft op opening.frame / item.frame (.plg); FML-export krijgt geen extras. */
function serializeOpening(_op: Opening, out: Record<string, unknown>): void {
  delete out[FML_OPENING_FRAME_EXTRA]
}

function serializeItem(_item: FloorItem, out: Record<string, unknown>): void {
  delete out[FML_OPENING_FRAME_EXTRA]
  delete out.frame
}

export const openingFrameAdapter = {
  id: 'opening-frame',
  hydrate: hydratePlan,
  serializeOpening,
  serializeItem,
} satisfies FmlConceptAdapter