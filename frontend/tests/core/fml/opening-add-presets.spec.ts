import { describe, expect, it } from 'vitest'
import {
  DOOR_ADD_SUBTYPES,
  WINDOW_ADD_SUBTYPES,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  isTriangleWindow,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
} from '@/core/fml/opening-add-presets'
import {
  DOUBLE_SOLID_DOOR_REFID,
  FRENCH_BALCONY_DOOR_REFID,
  ARCHWAY_DOOR_REFID,
  BIFOLD_DOOR_REFID,
  BIFOLD_DOUBLE_DOOR_REFID,
  GARAGE_DOOR_REFID,
  PASSAGE_DOOR_REFID,
  SLIDING_DOUBLE_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  WINDOW_TRIPLE_REFID,
} from '@/core/fml/types'

describe('opening add presets', () => {
  it('heeft een preset voor elk dropdown-type', () => {
    for (const subtype of DOOR_ADD_SUBTYPES) {
      expect(resolveDoorAddPreset(subtype).type).toBe('door')
      expect(resolveDoorAddPreset(subtype).refid.length).toBeGreaterThan(0)
    }
    for (const subtype of WINDOW_ADD_SUBTYPES) {
      expect(resolveWindowAddPreset(subtype).type).toBe('window')
      expect(resolveWindowAddPreset(subtype).refid.length).toBeGreaterThan(0)
    }
    expect(DOOR_ADD_SUBTYPES).toContain('garage')
    expect(DOOR_ADD_SUBTYPES).toContain('french_balcony')
    expect(DOOR_ADD_SUBTYPES).toContain('passage')
    expect(DOOR_ADD_SUBTYPES).toContain('archway')
    expect(DOOR_ADD_SUBTYPES).toContain('bifold')
    expect(DOOR_ADD_SUBTYPES).toContain('bifold_double')
    expect(resolveDoorAddPreset('passage').refid).toBe(PASSAGE_DOOR_REFID)
    expect(resolveDoorAddPreset('bifold').refid).toBe(BIFOLD_DOOR_REFID)
    expect(resolveDoorAddPreset('bifold_double').refid).toBe(BIFOLD_DOUBLE_DOOR_REFID)
    expect(resolveDoorAddPreset('archway').refid).toBe(ARCHWAY_DOOR_REFID)
  })

  it('mapt catalogus-refids (ook niet-preset hashes) naar dropdown-subtype', () => {
    expect(resolveDoorSubtypeFromRefid(GARAGE_DOOR_REFID)).toBe('garage')
    expect(resolveDoorSubtypeFromRefid(FRENCH_BALCONY_DOOR_REFID)).toBe('french_balcony')
    expect(resolveDoorSubtypeFromRefid(PASSAGE_DOOR_REFID)).toBe('passage')
    expect(resolveDoorSubtypeFromRefid(ARCHWAY_DOOR_REFID)).toBe('archway')
    expect(resolveDoorSubtypeFromRefid(BIFOLD_DOOR_REFID)).toBe('bifold')
    expect(resolveDoorSubtypeFromRefid(BIFOLD_DOUBLE_DOOR_REFID)).toBe('bifold_double')
    expect(resolveDoorSubtypeFromRefid('568f1c990a44f774c52d16d599b29f0e61767616')).toBe(
      'double_solid',
    )
    expect(resolveDoorSubtypeFromRefid('f54db5adfdca7fad8fa792c1d5872c9567ff8d5d')).toBe('sliding')
    expect(resolveDoorAddPreset('double_solid').refid).toBe(DOUBLE_SOLID_DOOR_REFID)
    expect(resolveDoorAddPreset('sliding').refid).toBe(SLIDING_DOUBLE_DOOR_REFID)
    expect(resolveDoorSubtypeFromRefid('df95e84f01163fe9983d43d088551813e40e3e2f')).toBe('pocket')
    expect(resolveDoorSubtypeFromRefid('9c1479d9dfc482859aea10b9dd67f5e7773fff6d')).toBe(
      'double_solid',
    )
    expect(resolveWindowSubtypeFromRefid(WINDOW_TRIPLE_REFID)).toBe('triple')
    expect(resolveDoorSubtypeFromRefid('unknown-refid')).toBe('standard')
    expect(resolveWindowSubtypeFromRefid('unknown-refid')).toBe('single')
    expect(isTriangleWindow('window', resolveWindowAddPreset('triangle').refid)).toBe(true)
    expect(isTriangleWindow('window', CONCEPT_WINDOW_REFID)).toBe(false)
  })
})
