import { describe, expect, it } from 'vitest'
import {
  FML_CAPABILITIES_DETECTION,
  FML_CAPABILITIES_EDITOR,
  FML_CAPABILITIES_INSPECT,
  fmlCanvasFlagsFromCapabilities,
  isFmlToolEnabled,
  resolveFmlCapabilities,
} from '@/ui/composables/fml-preview/fml-capabilities'

describe('fml-capabilities', () => {
  it('resolves three frozen presets', () => {
    expect(resolveFmlCapabilities('editor')).toBe(FML_CAPABILITIES_EDITOR)
    expect(resolveFmlCapabilities('inspect')).toBe(FML_CAPABILITIES_INSPECT)
    expect(resolveFmlCapabilities('detection')).toBe(FML_CAPABILITIES_DETECTION)
  })

  it('editor is the feature superset', () => {
    const editor = resolveFmlCapabilities('editor')
    expect(editor.mutate).toBe(true)
    expect(editor.inspect).toBe(false)
    expect(editor.areaSurfaceEdit).toBe(true)
    expect(editor.annotationEdit).toBe(true)
    expect(editor.fixtureLibrary).toBe(true)
    expect(editor.touchChrome).toBe(true)
    expect(editor.viewportChrome).toBe(true)
    expect(editor.facadeGroups).toBe(true)
    expect(editor.tools.add_fixture).toBe(true)
    expect(editor.tools.draw_surface).toBe(true)
    expect(editor.settingsVariant).toBe('viewer')
  })

  it('inspect is read-only with no tools', () => {
    const inspect = resolveFmlCapabilities('inspect')
    expect(inspect.mutate).toBe(false)
    expect(inspect.inspect).toBe(true)
    expect(inspect.facadeGroups).toBe(true)
    expect(inspect.touchChrome).toBe(false)
    expect(inspect.viewportChrome).toBe(true)
    expect(inspect.tools.box_select).toBe(false)
    expect(inspect.tools.draw_wall).toBe(false)
    expect(inspect.settingsVariant).toBe('inspect')
  })

  it('detection matches workspace product gates', () => {
    const detection = resolveFmlCapabilities('detection')
    expect(detection.mutate).toBe(true)
    expect(detection.inspect).toBe(false)
    expect(detection.facadeGroups).toBe(false)
    expect(detection.areaSurfaceEdit).toBe(false)
    expect(detection.annotationEdit).toBe(false)
    expect(detection.fixtureLibrary).toBe(false)
    expect(detection.touchChrome).toBe(false)
    expect(detection.viewportChrome).toBe(false)
    expect(detection.thicknessPick).toBe(true)
    expect(detection.tools.draw_wall).toBe(true)
    expect(detection.tools.add_door).toBe(true)
    expect(detection.tools.draw_surface).toBe(false)
    expect(detection.tools.add_fixture).toBe(false)
    expect(detection.settingsVariant).toBe('workspace')
  })

  it('isFmlToolEnabled reads the tools map', () => {
    expect(isFmlToolEnabled(FML_CAPABILITIES_EDITOR, 'draw_wall')).toBe(true)
    expect(isFmlToolEnabled(FML_CAPABILITIES_INSPECT, 'draw_wall')).toBe(false)
    expect(isFmlToolEnabled(FML_CAPABILITIES_DETECTION, 'add_fixture')).toBe(false)
  })

  it('fmlCanvasFlagsFromCapabilities maps editor flags', () => {
    const flags = fmlCanvasFlagsFromCapabilities(FML_CAPABILITIES_EDITOR)
    expect(flags).toEqual({
      areaSurfaceEditEnabled: true,
      annotationEditEnabled: true,
      inspectMode: false,
      touchEditor: true,
      includeSurfaceTool: true,
      includeAnnotationTools: true,
      includeFixtureTool: true,
    })
  })

  it('fmlCanvasFlagsFromCapabilities honors overrides', () => {
    const flags = fmlCanvasFlagsFromCapabilities(FML_CAPABILITIES_DETECTION, {
      areaSurfaceEditEnabled: true,
    })
    expect(flags.areaSurfaceEditEnabled).toBe(true)
    expect(flags.includeSurfaceTool).toBe(true)
    expect(flags.touchEditor).toBe(false)
  })
})
