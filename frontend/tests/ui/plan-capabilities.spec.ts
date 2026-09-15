import { describe, expect, it } from 'vitest'
import {
  PLAN_CAPABILITIES_DETECTION,
  PLAN_CAPABILITIES_EDITOR,
  PLAN_CAPABILITIES_INSPECT,
  resolveHostFlags,
  resolvePlanCapabilities,
} from '@/ui/composables/plan-canvas/plan-capabilities'

describe('plan-capabilities', () => {
  it('resolves three frozen presets', () => {
    expect(resolvePlanCapabilities('editor')).toBe(PLAN_CAPABILITIES_EDITOR)
    expect(resolvePlanCapabilities('inspect')).toBe(PLAN_CAPABILITIES_INSPECT)
    expect(resolvePlanCapabilities('detection')).toBe(PLAN_CAPABILITIES_DETECTION)
  })

  it('editor is the feature superset', () => {
    const editor = resolvePlanCapabilities('editor')
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
    const inspect = resolvePlanCapabilities('inspect')
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
    const detection = resolvePlanCapabilities('detection')
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
    expect(resolvePlanCapabilities('editor').planIo).toEqual({
      nativeRead: true,
      nativeWrite: true,
      fmlImport: true,
      fmlExport: 'lossy',
    })
    expect(resolvePlanCapabilities('inspect').planIo).toEqual({
      nativeRead: true,
      nativeWrite: false,
      fmlImport: true,
      fmlExport: 'none',
    })
    expect(resolvePlanCapabilities('detection').planIo).toEqual({
      nativeRead: true,
      nativeWrite: true,
      fmlImport: true,
      fmlExport: 'lossy',
    })
  })
})

describe('resolveHostFlags', () => {
  it('editor: area + annotation + touch on, inspect off', () => {
    expect(resolveHostFlags('editor')).toEqual({
      areaSurfaceEditEnabled: true,
      annotationEditEnabled: true,
      inspectMode: false,
      touchEditor: true,
    })
  })

  it('inspect: only inspect on', () => {
    expect(resolveHostFlags('inspect')).toEqual({
      areaSurfaceEditEnabled: false,
      annotationEditEnabled: false,
      inspectMode: true,
      touchEditor: false,
    })
  })

  it('detection: area off (matches PLAN_AREA_SURFACE_EDIT_VISIBLE)', () => {
    expect(resolveHostFlags('detection')).toEqual({
      areaSurfaceEditEnabled: false,
      annotationEditEnabled: false,
      inspectMode: false,
      touchEditor: false,
    })
  })

  it('dakMode forces area/surface edit regardless of kind', () => {
    expect(resolveHostFlags('detection', true).areaSurfaceEditEnabled).toBe(true)
    expect(resolveHostFlags('inspect', true).areaSurfaceEditEnabled).toBe(true)
    expect(resolveHostFlags('editor', true).areaSurfaceEditEnabled).toBe(true)
    expect(resolveHostFlags('detection', true)).toMatchObject({
      annotationEditEnabled: false,
      inspectMode: false,
      touchEditor: false,
    })
    expect(resolveHostFlags('inspect', true)).toMatchObject({
      annotationEditEnabled: false,
      inspectMode: true,
      touchEditor: false,
    })
  })
})
