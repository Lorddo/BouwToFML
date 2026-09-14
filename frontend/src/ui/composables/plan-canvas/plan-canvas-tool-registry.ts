import type { Point2D } from '@/core/fml/types'

/**
 * Tool-dispatch als geordende lijst in plaats van een rij `if (mode.value)`-takken.
 *
 * De pointer kende twaalf tools bij naam en had per tool een boolean plus één tot
 * drie methodes nodig; dat waren tien van de leden in `PointerToolModes` en
 * vierentwintig in `PointerActions`. Nu levert de Interaction-laag de tools als
 * lijst en weet de pointer alleen nog: eerst de tools, dan de cascade.
 *
 * De **volgorde van de lijst is het gedrag.** Zij is één-op-één overgenomen uit
 * `onWrapPointerDown`; de karakteriseringstests in
 * `plan-canvas-pointer-cascade.spec.ts` pinnen die volgorde.
 */
export interface PlanToolEntry {
  /** Alleen voor leesbaarheid en tests; niet de `PlanToolId` (surface-edit is geen tool). */
  readonly id: string
  active: () => boolean
  /**
   * `true` = klik geconsumeerd, `false` = doorvallen naar de volgende tool en
   * uiteindelijk de select-cascade. Alleen surface-edit valt echt door.
   */
  down: (cm: Point2D, event: MouseEvent) => boolean
  /** Ontbreekt bij tools die geen hover-voorbeeld tekenen (nulpunt, label, plaatsen). */
  hover?: (event: MouseEvent) => void
  /** Loopt als géén tool de beweging pakt; wist het eigen hover-voorbeeld. */
  clearHover?: () => void
  /** Alleen dakvlak/oppervlak-tekenen sluit een polygoon op dubbelklik. */
  dblClick?: (event: MouseEvent) => void
  /**
   * `null` = deze tool laat de cursor met rust. De pointer roept dit alleen
   * als er niet gepand wordt en er geen dikte-pick loopt.
   */
  cursor?: () => string | null
}

/** Eerste actieve tool die de klik consumeert wint. */
export function dispatchPlanToolDown(
  tools: ReadonlyArray<PlanToolEntry>,
  cm: Point2D,
  event: MouseEvent,
): boolean {
  for (const tool of tools) {
    if (!tool.active()) continue
    if (tool.down(cm, event)) return true
  }
  return false
}

/**
 * Eerste actieve tool mét hover wint. Pakt niemand de beweging, dan wissen alle
 * tools hun voorbeeld — de onderlinge orde daarvan doet niet mee, elke tool wist
 * alleen zijn eigen staat.
 */
export function dispatchPlanToolHover(
  tools: ReadonlyArray<PlanToolEntry>,
  event: MouseEvent,
): boolean {
  for (const tool of tools) {
    if (!tool.active() || !tool.hover) continue
    tool.hover(event)
    return true
  }
  for (const tool of tools) tool.clearHover?.()
  return false
}

export function dispatchPlanToolDblClick(
  tools: ReadonlyArray<PlanToolEntry>,
  event: MouseEvent,
): void {
  for (const tool of tools) {
    if (!tool.active() || !tool.dblClick) continue
    tool.dblClick(event)
    return
  }
}

export function resolvePlanToolCursor(tools: ReadonlyArray<PlanToolEntry>): string | null {
  for (const tool of tools) {
    if (!tool.active() || !tool.cursor) continue
    const cursor = tool.cursor()
    if (cursor) return cursor
  }
  return null
}
