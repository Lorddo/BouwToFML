/**
 * Embed entry for the FML editor (no OpenCV / workspace).
 * Host apps: `import { FmlEditor } from '@/ui/fml-editor/entry'`
 */
export { default as FmlEditor } from './FmlEditor.vue'
export { default as FmlEditorTouchChrome } from './FmlEditorTouchChrome.vue'
export {
  FML_CAPABILITIES_EDITOR,
  resolveFmlCapabilities,
  type FmlCapabilities,
  type FmlKind,
} from '@/ui/composables/fml-preview/fml-capabilities'
