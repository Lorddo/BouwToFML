import { describe, expect, it } from 'vitest'
import {
  carveOtsuWhiteIntoGapsBlack,
  cutWallsFromGrayData,
  demoteFacesByWallMaskCoverage,
  resolveSolidFaceDemotePolicy,
  resolveSolidWallCutPolicy,
  runGapsPipeline,
} from '@/cv/gaps'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

describe('cutWallsFromGrayData', () => {
  it('zet muur-inkt (zwart op mask) wit op source; floors/gaps blijven', () => {
    const source = Uint8Array.from([180, 40, 90])
    const wallMask = Uint8Array.from([255, 0, 255])
    const out = cutWallsFromGrayData(source, wallMask, resolveSolidWallCutPolicy())
    expect([...out]).toEqual([180, 255, 90])
  })
})

describe('carveOtsuWhiteIntoGapsBlack', () => {
  it('carves Otsu-wit alleen in gaten-zwart; wit op gaten blijft wit', () => {
    // gaps: W B B W · otsu: B W B W → out: W W B W
    const gaps = Uint8Array.from([255, 0, 0, 255])
    const otsu = Uint8Array.from([0, 255, 0, 255])
    const out = carveOtsuWhiteIntoGapsBlack(gaps, otsu)
    expect([...out]).toEqual([255, 255, 0, 255])
  })

  it('schildert geen Otsu-zwart bij op witte gaten-pixels', () => {
    const gaps = Uint8Array.from([255, 255])
    const otsu = Uint8Array.from([0, 0])
    const out = carveOtsuWhiteIntoGapsBlack(gaps, otsu)
    expect([...out]).toEqual([255, 255])
  })
})

describe('demoteFacesByWallMaskCoverage', () => {
  it('demoteert faces met hoge muurmask-dekking naar outside; houdt floors', () => {
    // 2x2: label1 left column (wall-covered), label2 right column (floor)
    const labelsData = Int32Array.from([1, 2, 1, 2])
    const wallMaskData = Uint8Array.from([0, 255, 0, 255]) // black under label1
    const components: RasterRoomComponent[] = [
      {
        label: 1,
        areaPx: 2,
        bbox: { x: 0, y: 0, width: 1, height: 2 },
        touchesBorder: false,
      },
      {
        label: 2,
        areaPx: 2,
        bbox: { x: 1, y: 0, width: 1, height: 2 },
        touchesBorder: false,
      },
    ]
    const prior = new Map([
      [1, 'wall' as const],
      [2, 'surface' as const],
    ])
    const result = demoteFacesByWallMaskCoverage({
      labelsData,
      wallMaskData,
      components,
      parentMap: new Map(),
      priorClassification: prior,
      policy: resolveSolidFaceDemotePolicy(),
      groupBy: 'component',
    })
    expect(result.classificationByLabel.get(1)).toBe('outside')
    expect(result.classificationByLabel.get(2)).toBe('surface')
    expect(result.demotedCount).toBe(1)
    expect(result.keptCount).toBe(1)
  })
})

describe('runGapsPipeline', () => {
  it('weigert niet-solid policies', () => {
    expect(() =>
      runGapsPipeline({
        labelsData: new Int32Array(0),
        wallMaskData: new Uint8Array(0),
        components: [],
        parentMap: new Map(),
        priorClassification: new Map(),
        policyId: 'parallel' as never,
      }),
    ).toThrow(/not implemented/)
  })
})
