import fs from 'fs'
import path from 'path'

const root = path.resolve('src')
const files = [
  'ui/composables/fml-preview/useFmlElevationSelectEdit.ts',
  'ui/composables/fml-preview/useFmlPreviewOpeningSelection.ts',
  'ui/composables/fml-preview/useFmlPreviewItemDrag.ts',
  'ui/components/FmlPreviewCanvas.vue',
  'platform/selection/useExampleSelection.ts',
  'ui/composables/workspace/useWorkspaceDoorSwingHelpers.ts',
  'ui/composables/workspace/workspace-dev-session-capture.ts',
  'cv/doors/door-resolve.ts',
  'ui/composables/workspace/useWorkspaceDoorSwingComputationCache.ts',
  'ui/composables/workspace/workspace-export-door-swing-report.ts',
  'ui/components/InputReferencePanel.vue',
  'ui/components/WorkspaceWindowsDevPanel.vue',
  'core/fml/opening-height-overflow.ts',
  'core/fml/elevation-openings.ts',
  'core/fml/opening-from-preset.ts',
  'ui/composables/useFmlPreviewEditor.ts',
  'ui/composables/fml-preview/useFmlPreviewAddFixture.ts',
  'ui/components/fml-preview-openings.ts',
]

const replacements = [
  [/resolveWindowAddPreset\(([^)]+)\)\.refid/g, 'resolveWindowAddPreset($1).kind'],
  [/resolveDoorAddPreset\(([^)]+)\)\.refid/g, 'resolveDoorAddPreset($1).kind'],
  [/resolveDoorFmlTemplateRefId/g, 'resolveDoorTemplateKind'],
  [/DOOR_FML_TEMPLATE_OPTIONS/g, 'DOOR_TEMPLATE_KIND_OPTIONS'],
  [/CONCEPT_DOOR_REFID/g, "'door.single'"],
  [/CONCEPT_WINDOW_REFID/g, "'window.single'"],
  [/WINDOW_DOUBLE_REFID/g, "'window.double'"],
  [/WINDOW_TRIPLE_REFID/g, "'window.triple'"],
  [/opt\.refid/g, 'opt.kind'],
  [/:\s*opt\.refid/g, ': opt.kind'],
]

for (const rel of files) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) {
    console.log('skip missing', rel)
    continue
  }
  let text = fs.readFileSync(file, 'utf8')
  const before = text
  for (const [re, to] of replacements) text = text.replace(re, to)
  // Fix broken string from CONCEPT replace if it created ''door.single''
  text = text.replace(/''door\.single''/g, "'door.single'")
  text = text.replace(/''window\.single''/g, "'window.single'")
  text = text.replace(/''window\.double''/g, "'window.double'")
  text = text.replace(/''window\.triple''/g, "'window.triple'")
  if (text !== before) {
    fs.writeFileSync(file, text)
    console.log('patched', rel)
  } else {
    console.log('unchanged', rel)
  }
}
