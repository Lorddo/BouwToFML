import { describe, expect, it, vi } from 'vitest'
import { despeckleByMinArea } from '@/cv/port/despeckle'
import type { OpenCV } from '@/cv/loadOpenCV'

describe('despeckleByMinArea', () => {
  it('doet niets bij 0 of undefined (geen beeldmaat-schaal)', () => {
    const cv = {
      bitwise_not: vi.fn(),
      connectedComponentsWithStats: vi.fn(),
    } as unknown as OpenCV
    const mat = { cols: 3000, rows: 2000, data: new Uint8Array(1) } as OpenCV['Mat']
    expect(despeckleByMinArea(cv, mat, 0)).toBe(0)
    expect(despeckleByMinArea(cv, mat, undefined)).toBe(0)
    expect(cv.connectedComponentsWithStats).not.toHaveBeenCalled()
  })
})
