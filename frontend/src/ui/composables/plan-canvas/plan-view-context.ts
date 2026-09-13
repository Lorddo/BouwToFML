/**
 * De **view-as** van het canvas: welke tab staat open, niet wie het canvas embedt.
 * Zie `.cursor/docs/refactor/lean/editor-kernel.md` §3 voor de drie assen.
 *
 * `dakMode` was hiervoor vijf losse optionele refs die door Interaction, Tool- en
 * SelectionCoordinator naar de pointer werden gedrild. Het is géén capability:
 * de Dak-tab verandert hit-*gedrag* per klik, niet welke tools bestaan.
 */
export type PlanViewMode = 'plan' | 'dak'

export type PlanSelectableKind =
  | 'wall'
  | 'junction'
  | 'opening'
  | 'item'
  | 'area'
  | 'surface'
  | 'annotation'
  | 'dimension'

export interface PlanViewContext {
  /** Gelezen op het moment van de klik, niet bij opbouw. */
  readonly mode: PlanViewMode
  /** Dak-tab: meubels zijn niet aan te klikken en tonen geen grepen. */
  canSelect: (kind: PlanSelectableKind) => boolean
  /** Op de Dak-tab geldt alleen een nok als muur. */
  isRidgeWallId: (wallId: string) => boolean
}

/** Kinds die op de Dak-tab wegvallen. Muur en knoop hebben eigen nok-regels. */
const HIDDEN_ON_DAK: ReadonlySet<PlanSelectableKind> = new Set<PlanSelectableKind>(['item'])

export function createPlanViewContext(source: {
  isDak: () => boolean
  isRidgeWallId?: (wallId: string) => boolean
}): PlanViewContext {
  return {
    get mode(): PlanViewMode {
      return source.isDak() ? 'dak' : 'plan'
    },
    canSelect: (kind) => !(source.isDak() && HIDDEN_ON_DAK.has(kind)),
    isRidgeWallId: (wallId) => source.isRidgeWallId?.(wallId) === true,
  }
}
