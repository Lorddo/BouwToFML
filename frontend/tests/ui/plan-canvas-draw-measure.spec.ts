import { describe, expect, it } from 'vitest'
import {
  DRAW_SEED_CM,
  centerlineSpanFromInner,
  connectorInsetAlong,
  endFromDirection,
  applyDrawTypeKey,
  formatDrawLength,
  formatDrawLengthMeters,
  formatDrawTypeLabel,
  innerSpanFromCenterline,
  parseDrawLengthDraftToCm,
  parseDrawLengthToCm,
  roomEndFromHv,
  seedDrawRoomEnd,
  seedDrawWallEnd,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'

describe('plan-canvas-draw-measure', () => {
  describe('parseDrawLengthToCm', () => {
    it('defaults bare numbers to metres', () => {
      expect(parseDrawLengthToCm('2')).toBe(200)
      expect(parseDrawLengthToCm('2.5')).toBe(250)
      expect(parseDrawLengthToCm('2,5')).toBe(250)
    })

    it('accepts m / cm / mm suffixes', () => {
      expect(parseDrawLengthToCm('2m')).toBe(200)
      expect(parseDrawLengthToCm('200cm')).toBe(200)
      expect(parseDrawLengthToCm('2000mm')).toBe(200)
      expect(parseDrawLengthToCm('1.5 m')).toBe(150)
    })

    it('uses the selected ruler unit when there is no suffix', () => {
      expect(parseDrawLengthToCm('99.6', 'cm')).toBeCloseTo(99.6)
      expect(parseDrawLengthToCm('0.4', 'cm')).toBeCloseTo(0.4)
      expect(parseDrawLengthToCm('0.004', 'm')).toBeCloseTo(0.4)
      expect(parseDrawLengthToCm('4', 'mm')).toBeCloseTo(0.4)
      expect(parseDrawLengthToCm('2m', 'cm')).toBe(200)
    })

    it('accepts feet-inch override even when default is metric', () => {
      expect(parseDrawLengthToCm('1\' 5"', 'm')).toBeCloseTo((12 + 5) * 2.54)
      expect(parseDrawLengthToCm('66"', 'cm')).toBeCloseTo(66 * 2.54)
      expect(parseDrawLengthToCm("5'", 'mm')).toBeCloseTo(5 * 12 * 2.54)
    })

    it('accepts metric override when default is ft-in', () => {
      expect(parseDrawLengthToCm('2m', 'ft-in')).toBe(200)
      expect(parseDrawLengthToCm('2000mm', 'ft-in')).toBe(200)
    })

    it('bare number with ft-in default is inches', () => {
      expect(parseDrawLengthToCm('12', 'ft-in')).toBeCloseTo(12 * 2.54)
      expect(parseDrawLengthToCm('5\' 6 5/32"', 'ft-in')).toBeCloseTo((5 * 12 + 6 + 5 / 32) * 2.54)
    })

    it('rejects empty, zero or invalid', () => {
      expect(parseDrawLengthToCm('')).toBeNull()
      expect(parseDrawLengthToCm('abc')).toBeNull()
      expect(parseDrawLengthToCm('0')).toBeNull()
    })

    it('keeps a signed value so -2m can flip direction', () => {
      expect(parseDrawLengthToCm('-2')).toBe(-200)
      expect(parseDrawLengthToCm('-2m')).toBe(-200)
      expect(parseDrawLengthToCm('-200cm')).toBe(-200)
      expect(parseDrawLengthToCm("-1'", 'm')).toBeCloseTo(-12 * 2.54)
    })
  })

  describe('parseDrawLengthDraftToCm', () => {
    it('accepts a trailing decimal while typing', () => {
      expect(parseDrawLengthDraftToCm('3.')).toBe(300)
      expect(parseDrawLengthDraftToCm('-')).toBeNull()
      expect(parseDrawLengthDraftToCm('2,')).toBe(200)
    })

    it('accepts partial feet-inch while typing', () => {
      expect(parseDrawLengthDraftToCm("5'", 'm')).toBeCloseTo(5 * 12 * 2.54)
    })
  })

  describe('applyDrawTypeKey', () => {
    it('builds a metre buffer and toggles minus', () => {
      expect(applyDrawTypeKey('', '3')).toBe('3')
      expect(applyDrawTypeKey('3', '.')).toBe('3.')
      expect(applyDrawTypeKey('3.', '5')).toBe('3.5')
      expect(applyDrawTypeKey('3.5', 'Backspace')).toBe('3.')
      expect(applyDrawTypeKey('3.5', '-')).toBe('-3.5')
      expect(applyDrawTypeKey('-3.5', '-')).toBe('3.5')
    })

    it('allows feet-inch and unit-suffix keys', () => {
      expect(applyDrawTypeKey('5', "'")).toBe("5'")
      expect(applyDrawTypeKey("5'", ' ')).toBe("5' ")
      expect(applyDrawTypeKey("5' 6", '"')).toBe('5\' 6"')
      expect(applyDrawTypeKey('5', '/')).toBe('5/')
      expect(applyDrawTypeKey('200', 'c')).toBe('200c')
      expect(applyDrawTypeKey('200c', 'm')).toBe('200cm')
      expect(applyDrawTypeKey('12', 'i')).toBe('12i')
      expect(applyDrawTypeKey('12i', 'n')).toBe('12in')
    })
  })

  describe('formatDrawTypeLabel', () => {
    it('prefers the typed buffer', () => {
      expect(formatDrawTypeLabel('3.', 300)).toBe('3.')
      expect(formatDrawTypeLabel('', 250)).toBe('2.5')
      expect(formatDrawTypeLabel('', 99.6, 'cm')).toBe('99.6')
    })
  })

  describe('formatDrawLength', () => {
    it('formats cm as metres with millimetre precision', () => {
      expect(formatDrawLengthMeters(200)).toBe('2')
      expect(formatDrawLengthMeters(250)).toBe('2.5')
      expect(formatDrawLengthMeters(201)).toBe('2.01')
      expect(formatDrawLength(0.4, 'm')).toBe('0.004')
    })

    it('formats in the selected ruler unit', () => {
      expect(formatDrawLength(99.6, 'cm')).toBe('99.6')
      expect(formatDrawLength(0.4, 'cm')).toBe('0.4')
      expect(formatDrawLength(0.4, 'mm')).toBe('4')
    })
  })

  describe('endFromDirection', () => {
    it('places along hover direction at fixed length', () => {
      const end = endFromDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, 200)
      expect(end.x).toBeCloseTo(200)
      expect(end.y).toBeCloseTo(0)
    })

    it('defaults to +X when hover equals start', () => {
      const end = endFromDirection({ x: 10, y: 20 }, { x: 10, y: 20 }, 150)
      expect(end).toEqual({ x: 160, y: 20 })
    })

    it('normalizes diagonal hover', () => {
      const end = endFromDirection({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)
      expect(end.x).toBeCloseTo(6)
      expect(end.y).toBeCloseTo(8)
    })
  })

  describe('roomEndFromHv', () => {
    it('uses hover quadrant signs', () => {
      const end = roomEndFromHv({ x: 0, y: 0 }, { x: -10, y: 5 }, 200, 300)
      expect(end).toEqual({ x: -200, y: 300 })
    })

    it('defaults to +X/+Y when hover equals start', () => {
      const end = roomEndFromHv({ x: 0, y: 0 }, { x: 0, y: 0 }, 100, 50)
      expect(end).toEqual({ x: 100, y: 50 })
    })
  })

  describe('draw seed', () => {
    it('starts wall 0.5 m up (FML Y-down)', () => {
      expect(seedDrawWallEnd({ x: 10, y: 80 })).toEqual({ x: 10, y: 80 - DRAW_SEED_CM })
    })

    it('starts room 0.5 × 0.5 m up and right', () => {
      expect(seedDrawRoomEnd({ x: 0, y: 0 })).toEqual({ x: DRAW_SEED_CM, y: -DRAW_SEED_CM })
    })

    it('adds thickness pad to the seed hartlijn', () => {
      expect(seedDrawWallEnd({ x: 0, y: 0 }, 10)).toEqual({ x: 0, y: -(DRAW_SEED_CM + 10) })
      expect(seedDrawRoomEnd({ x: 0, y: 0 }, 20, 20)).toEqual({
        x: DRAW_SEED_CM + 20,
        y: -(DRAW_SEED_CM + 20),
      })
    })
  })

  describe('inner vs centerline', () => {
    it('converts centered opposite walls', () => {
      expect(innerSpanFromCenterline(400, 20, 20)).toBe(380)
      expect(centerlineSpanFromInner(400, 20, 20)).toBe(420)
      expect(innerSpanFromCenterline(420, 20, 20)).toBe(400)
    })

    it('uses existing perpendicular thickness as start inset', () => {
      const host = {
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0.5,
      }
      expect(connectorInsetAlong({ x: 0, y: 0 }, { x: 0, y: -1 }, [host])).toBeCloseTo(10)
      expect(connectorInsetAlong({ x: 0, y: 0 }, { x: 1, y: 0 }, [host])).toBeCloseTo(0)
    })
  })
})
