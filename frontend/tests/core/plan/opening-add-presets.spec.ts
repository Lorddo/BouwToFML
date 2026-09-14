import { describe, expect, it } from 'vitest'
import {
  DOOR_ADD_SUBTYPES,
  WINDOW_ADD_SUBTYPES,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  isTriangleWindow,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
} from '@/core/plan/opening-add-presets'

describe('opening add presets', () => {
  it('heeft een preset voor elk dropdown-type', () => {
    for (const subtype of DOOR_ADD_SUBTYPES) {
      expect(resolveDoorAddPreset(subtype).type).toBe('door')
      expect(resolveDoorAddPreset(subtype).kind.length).toBeGreaterThan(0)
    }
    for (const subtype of WINDOW_ADD_SUBTYPES) {
      expect(resolveWindowAddPreset(subtype).type).toBe('window')
      expect(resolveWindowAddPreset(subtype).kind.length).toBeGreaterThan(0)
    }
    expect(DOOR_ADD_SUBTYPES).toContain('garage')
    expect(DOOR_ADD_SUBTYPES).toContain('french_balcony')
    expect(DOOR_ADD_SUBTYPES).toContain('passage')
    expect(DOOR_ADD_SUBTYPES).toContain('archway')
    expect(DOOR_ADD_SUBTYPES).toContain('bifold')
    expect(DOOR_ADD_SUBTYPES).toContain('bifold_double')
    expect(resolveDoorAddPreset('passage').kind).toBe('door.passage')
    expect(resolveDoorAddPreset('bifold').kind).toBe('door.bifold')
    expect(resolveDoorAddPreset('bifold_double').kind).toBe('door.bifold_double')
    expect(resolveDoorAddPreset('archway').kind).toBe('door.archway')
  })

  it('mapt catalogus-refids (ook niet-preset hashes) naar dropdown-subtype', () => {
    expect(resolveDoorSubtypeFromRefid('door.garage')).toBe('garage')
    expect(resolveDoorSubtypeFromRefid('door.french_balcony')).toBe('french_balcony')
    expect(resolveDoorSubtypeFromRefid('door.passage')).toBe('passage')
    expect(resolveDoorSubtypeFromRefid('door.archway')).toBe('archway')
    expect(resolveDoorSubtypeFromRefid('door.bifold')).toBe('bifold')
    expect(resolveDoorSubtypeFromRefid('door.bifold_double')).toBe('bifold_double')
    expect(resolveDoorSubtypeFromRefid('568f1c990a44f774c52d16d599b29f0e61767616')).toBe(
      'double_solid',
    )
    expect(resolveDoorSubtypeFromRefid('f54db5adfdca7fad8fa792c1d5872c9567ff8d5d')).toBe('sliding')
    expect(resolveDoorAddPreset('double_solid').kind).toBe('door.double_solid')
    expect(resolveDoorAddPreset('sliding').kind).toBe('door.sliding')
    expect(resolveDoorSubtypeFromRefid('df95e84f01163fe9983d43d088551813e40e3e2f')).toBe('pocket')
    expect(resolveDoorSubtypeFromRefid('9c1479d9dfc482859aea10b9dd67f5e7773fff6d')).toBe(
      'double_solid',
    )
    expect(resolveWindowSubtypeFromRefid('window.triple')).toBe('triple')
    expect(resolveDoorSubtypeFromRefid('unknown-refid')).toBe('standard')
    expect(resolveWindowSubtypeFromRefid('unknown-refid')).toBe('single')
    expect(isTriangleWindow('window', resolveWindowAddPreset('triangle').kind)).toBe(true)
    expect(isTriangleWindow('window', 'window.single')).toBe(false)
  })
})
