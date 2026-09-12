import { describe, expect, it } from 'vitest'
import {
  FML_CAPABILITIES_DETECTION,
  FML_CAPABILITIES_EDITOR,
  FML_CAPABILITIES_INSPECT,
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
    expect(editor.tools.draw_roof).toBe(true)
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
    expect(detection.facadeGroups).toBe(true)
    expect(detection.areaSurfaceEdit).toBe(false)
    expect(detection.annotationEdit).toBe(false)
    expect(detection.fixtureLibrary).toBe(false)
    expect(detection.touchChrome).toBe(false)
    expect(detection.viewportChrome).toBe(true)
    expect(detection.thicknessPick).toBe(true)
    expect(detection.tools.draw_wall).toBe(true)
    expect(detection.tools.add_door).toBe(true)
    expect(detection.tools.draw_surface).toBe(false)
    expect(detection.tools.draw_roof).toBe(false)
    expect(detection.tools.add_fixture).toBe(false)
    expect(detection.settingsVariant).toBe('workspace')
  })

  it('planIo matches host rights matrix (tekenbureau editor today)', () => {
    expect(resolveFmlCapabilities('editor').planIo).toEqual({
      nativeRead: true,
      nativeWrite: true,
      fmlImport: true,
      fmlExport: 'lossy',
    })
    expect(resolveFmlCapabilities('inspect').planIo).toEqual({
      nativeRead: true,
      nativeWrite: false,
      fmlImport: true,
      fmlExport: 'none',
    })
    expect(resolveFmlCapabilities('detection').planIo).toEqual({
      nativeRead: true,
      nativeWrite: true,
      fmlImport: true,
      fmlExport: 'lossy',
    })
  })
})
