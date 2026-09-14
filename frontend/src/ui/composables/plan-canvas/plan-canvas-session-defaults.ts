import { computed, watch, type ComputedRef, type Ref } from 'vue'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/plan/bovenlicht'

/**
 * Sessie-defaults: wat een *nieuwe* opening erft van de instellingen.
 *
 * Bewust smal. De opening-domeinlogica (drafts, mixed-staat, packed-groepen)
 * blijft in `usePlanCanvasOpeningSelection` en `plan-canvas-opening-draft`;
 * hier staat alleen wat als vijf losse refs door drie contracten werd geregen.
 */
export interface PlanSessionDefaults {
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
  /** Weergave, geen default: uit = losse ramen i.p.v. één groep. */
  bovenlichtPacked?: Ref<boolean>
}

export interface BovenlichtDefaults {
  doorDefault: boolean
  windowDefault: boolean
  heightCm: number
  gapCm: number
}

/** De vier waarden waarmee een nieuwe opening geplaatst wordt. */
export function resolveBovenlichtDefaults(
  session: PlanSessionDefaults,
): ComputedRef<BovenlichtDefaults> {
  return computed(() => ({
    doorDefault: session.bovenlichtDefault?.value === true,
    windowDefault: session.windowBovenlichtDefault?.value === true,
    heightCm: session.bovenlichtHeightCm?.value ?? BOVENLICHT_HEIGHT_CM,
    gapCm: session.bovenlichtGapCm?.value ?? BOVENLICHT_GAP_CM,
  }))
}

/**
 * Verandert de tekenaar een default terwijl er een opening geselecteerd staat,
 * dan moet die opening-draft mee. `bovenlichtPacked` hoort er niet bij: dat
 * verandert de weergave, niet de waarden in de draft.
 */
export function watchBovenlichtDefaults(session: PlanSessionDefaults, onChange: () => void): void {
  const sources = [
    session.bovenlichtDefault,
    session.windowBovenlichtDefault,
    session.bovenlichtHeightCm,
    session.bovenlichtGapCm,
  ]
  for (const source of sources) {
    if (source) watch(source, () => onChange())
  }
}
