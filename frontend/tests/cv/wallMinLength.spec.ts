import { describe, expect, it } from 'vitest'
import { wallMinLengthPxForRenderStyle } from '@/cv/lbe/wall-min-length'

describe('wallMinLengthPxForRenderStyle', () => {
  it('geeft 5px voor solid en parallel_lines', () => {
    expect(wallMinLengthPxForRenderStyle('solid')).toBe(5)
    expect(wallMinLengthPxForRenderStyle('parallel_lines')).toBe(5)
  })

  it('geeft 20px voor details', () => {
    expect(wallMinLengthPxForRenderStyle('details')).toBe(20)
  })
})
