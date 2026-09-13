/**
 * Embed entry for the editor (no OpenCV / workspace).
 * Host apps: `import { Editor } from '@/ui/editor/entry'`
 */
export { default as Editor } from './Editor.vue'
export { default as EditorTouchChrome } from './EditorTouchChrome.vue'
export {
  PLAN_CAPABILITIES_EDITOR,
  resolvePlanCapabilities,
  type PlanCapabilities,
  type PlanKind,
} from '@/ui/composables/plan-canvas/plan-capabilities'
