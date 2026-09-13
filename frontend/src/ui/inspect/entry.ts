/**
 * Embed entry for FML inspection (no OpenCV / workspace / mutate tools).
 * Host apps: `import { Inspect } from '@/ui/inspect/entry'`
 */
export { default as Inspect } from './Inspect.vue'
export {
  PLAN_CAPABILITIES_INSPECT,
  resolvePlanCapabilities,
  type PlanCapabilities,
  type PlanKind,
} from '@/ui/composables/plan-canvas/plan-capabilities'
export type { InspectHit, InspectKind } from '@/ui/composables/plan-canvas/plan-inspect'
export {
  INSPECT_COLOR_DONE,
  INSPECT_COLOR_OPEN,
  cycleInspectColor,
  inspectColorFor,
  pickInspectTarget,
} from '@/ui/composables/plan-canvas/plan-inspect'
