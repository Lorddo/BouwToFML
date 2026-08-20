/**
 * Embed entry for FML inspection (no OpenCV / workspace / mutate tools).
 * Host apps: `import { FmlInspect } from '@/ui/fml-inspect/entry'`
 */
export { default as FmlInspect } from './FmlInspect.vue'
export {
  FML_CAPABILITIES_INSPECT,
  resolveFmlCapabilities,
  type FmlCapabilities,
  type FmlKind,
} from '@/ui/composables/fml-preview/fml-capabilities'
export type { FmlInspectHit, FmlInspectKind } from '@/ui/composables/fml-preview/fml-inspect'
export {
  INSPECT_COLOR_DONE,
  INSPECT_COLOR_OPEN,
  cycleInspectColor,
  inspectColorFor,
  pickInspectTarget,
} from '@/ui/composables/fml-preview/fml-inspect'
