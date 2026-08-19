import { describe, expect, it } from 'vitest'
import {
  endFromDirection,
  formatDrawLengthMeters,
  parseDrawLengthToCm,
  roomEndFromHv,
} from '@/ui/composables/fml-preview/fml-preview-draw-measure'

describe('fml-preview-draw-measure', () => {
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

    it('rejects empty or invalid', () => {
      expect(parseDrawLengthToCm('')).toBeNull()
      expect(parseDrawLengthToCm('abc')).toBeNull()
      expect(parseDrawLengthToCm('-1')).toBeNull()
    })
  })

  describe('formatDrawLengthMeters', () => {
    it('formats cm as metres', () => {
      expect(formatDrawLengthMeters(200)).toBe('2')
      expect(formatDrawLengthMeters(250)).toBe('2.5')
      expect(formatDrawLengthMeters(201)).toBe('2.01')
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
})
