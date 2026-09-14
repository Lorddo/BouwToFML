/**
 * B6 — opening.frame ↔ FML opening.btfFrame (via extras bij import).
 */
import { OPENING_FRAME_EXTRA } from '../../plan/opening-display-geom'
import type { FloorPlan, Opening } from '../../plan/types'
import type { OpeningFrame } from '../extension-types'
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

function hydrateOpening(op: Opening): void {
  if (op.frame != null) {
    if (op.extras && OPENING_FRAME_EXTRA in op.extras) {
      const next = { ...op.extras }
      delete next[OPENING_FRAME_EXTRA]
      op.extras = Object.keys(next).length > 0 ? next : undefined
    }
    return
  }
  const fromExtras = readFrame(op.extras?.[OPENING_FRAME_EXTRA])
  if (!fromExtras) return
  op.frame = fromExtras
  if (op.extras) {
    const next = { ...op.extras }
    delete next[OPENING_FRAME_EXTRA]
    op.extras = Object.keys(next).length > 0 ? next : undefined
  }
}

function hydratePlan(plan: FloorPlan): void {
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      for (const op of wall.openings) hydrateOpening(op)
    }
    for (const design of floor.designs ?? []) {
      for (const wall of design.walls) {
        for (const op of wall.openings) hydrateOpening(op)
      }
    }
  }
}

function serializeOpening(op: Opening, out: Record<string, unknown>): void {
  if (!op.frame) {
    delete out[OPENING_FRAME_EXTRA]
    return
  }
  out[OPENING_FRAME_EXTRA] = {
    leftCm: op.frame.leftCm,
    rightCm: op.frame.rightCm,
    topCm: op.frame.topCm,
    bottomCm: op.frame.bottomCm,
  }
}

export const openingFrameAdapter: FmlConceptAdapter = {
  id: 'opening-frame',
  hydrate: hydratePlan,
  serializeOpening,
}
