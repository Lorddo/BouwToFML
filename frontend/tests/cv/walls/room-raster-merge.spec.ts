import { describe, expect, it } from 'vitest'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  bboxContains,
  bboxMaxSidePct,
  buildEnclosedFaceParentMap,
  classifyChildTier,
  countDistinctMergedFaces,
  majorityCardinalParentLabel,
  MICRO_TIER_MAX_PCT,
  resolveMaxChildBboxPx,
  resolveMergedLabel,
  SMALL_TIER_MAX_PCT,
} from '@/cv/walls/rooms/room-raster-merge'
import { buildInkEaterLabels, resolveInkBetweenFaces } from '@/cv/walls/rooms/room-ink-resolve'

function component(
  label: number,
  areaPx: number,
  bbox: { x: number; y: number; width: number; height: number },
  touchesBorder = false,
): RasterRoomComponent {
  return { label, areaPx, bbox, touchesBorder }
}

function resolveLabels(params: {
  labelsData: Int32Array
  components: RasterRoomComponent[]
  width: number
  height: number
  inkOnLabels?: ReadonlySet<number>
}) {
  const referenceData = new Uint8Array(params.labelsData.length).fill(255)
  for (let idx = 0; idx < params.labelsData.length; idx += 1) {
    const label = params.labelsData[idx] ?? 0
    if (label === 0 || params.inkOnLabels?.has(label)) {
      referenceData[idx] = 0
    }
  }
  const eaters = buildInkEaterLabels({
    components: params.components,
    labelsData: params.labelsData,
    referenceData,
    inkCoverageThreshold: 0.5,
  })
  return resolveInkBetweenFaces({
    labelsData: params.labelsData,
    components: params.components,
    width: params.width,
    height: params.height,
    labelClass: eaters.labelClass,
  })
}

function labelAtFromPainter(
  width: number,
  height: number,
  paint: (x: number, y: number) => number,
): (x: number, y: number) => number {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return paint(x, y)
  }
}

describe('room-raster-merge tiers', () => {
  it('classificeert micro (≤3%) en small (3–10%) op tekening', () => {
    const shortSide = 2000
    expect(classifyChildTier(component(1, 100, { x: 0, y: 0, width: 50, height: 50 }), shortSide)).toBe(
      'micro',
    )
    expect(classifyChildTier(component(2, 400, { x: 0, y: 0, width: 80, height: 80 }), shortSide)).toBe(
      'small',
    )
    expect(classifyChildTier(component(3, 900, { x: 0, y: 0, width: 250, height: 80 }), shortSide)).toBe(
      null,
    )
    expect(bboxMaxSidePct({ x: 0, y: 0, width: 60, height: 60 }, shortSide)).toBeCloseTo(0.03)
  })

  it('small tier: merge als alle vier zijden dezelfde parent raken', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 2100, { x: 500, y: 500, width: 70, height: 50 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 500 && x < 570 && y >= 500 && y < 550) return 2
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(classifyChildTier(components[1], 2000)).toBe('small')
    expect(parentMap.get(2)).toBe(1)
    expect(countDistinctMergedFaces(components, parentMap)).toBe(1)
  })

  it('micro tier: merge bij 3 van 4 zijden gelijk', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 80, { x: 400, y: 400, width: 14, height: 14 }),
      component(3, 60, { x: 392, y: 400, width: 8, height: 14 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 400 && x < 414 && y >= 400 && y < 414) return 2
      if (x >= 392 && x < 400 && y >= 400 && y < 414) return 3
      return 1
    })
    const componentsByLabel = new Map(components.map((c) => [c.label, c]))
    const parentLabel = majorityCardinalParentLabel({
      child: components[1],
      labelAt,
      imageWidth: width,
      imageHeight: height,
      resolve: (l) => l,
      componentsByLabel,
    })
    expect(parentLabel).toBe(1)

    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('micro tier: merge bij omringende cardinal buren', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 120, { x: 600, y: 600, width: 12, height: 12 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 600 && x < 612 && y >= 600 && y < 612) return 2
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(classifyChildTier(components[1], 2000)).toBe('micro')
    expect(parentMap.get(2)).toBe(1)
  })

  it('merge ook als child relatief groot t.o.v. parent (geen area-ratio)', () => {
    const width = 1000
    const height = 1000
    const components: RasterRoomComponent[] = [
      component(1, 10_000, { x: 0, y: 0, width: 1000, height: 1000 }),
      component(2, 1225, { x: 100, y: 100, width: 35, height: 35 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 100 && x < 135 && y >= 100 && y < 135) return 2
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('geen merge boven small-tier (10% bbox)', () => {
    const width = 800
    const height = 600
    const components: RasterRoomComponent[] = [
      component(1, 200_000, { x: 0, y: 0, width: 800, height: 600 }),
      component(2, 4000, { x: 50, y: 50, width: 120, height: 90 }),
    ]
    const labelAt = labelAtFromPainter(width, height, () => 1)
    expect(classifyChildTier(components[1], 600)).toBe(null)
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.size).toBe(0)
  })

  it('merge naar directe parent, niet naar grootste bbox', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 60_000, { x: 100, y: 100, width: 300, height: 250 }),
      component(3, 400, { x: 200, y: 200, width: 18, height: 14 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 200 && x < 218 && y >= 200 && y < 214) return 3
      if (x >= 100 && x < 400 && y >= 100 && y < 350) return 2
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(3)).toBe(2)
    expect(parentMap.has(2)).toBe(false)
  })

  it('merge niet bij deurboog: kozijn aan één kant andere kleur', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 1_500_000, { x: 0, y: 0, width: 1200, height: 2000 }),
      component(2, 800_000, { x: 1200, y: 0, width: 800, height: 2000 }),
      component(3, 2800, { x: 1140, y: 780, width: 70, height: 80 }),
      component(4, 300, { x: 1125, y: 755, width: 18, height: 50 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 1140 && x < 1210 && y >= 780 && y < 860) return 3
      if (x >= 1125 && x < 1143 && y >= 755 && y < 805) return 4
      if (x < 1200) return 1
      return 2
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.has(3)).toBe(false)
  })

  it('merge niet bij deurboog tussen twee kamers', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 1_000_000, { x: 0, y: 0, width: 1000, height: 2000 }),
      component(2, 800_000, { x: 1000, y: 0, width: 1000, height: 2000 }),
      component(3, 500, { x: 980, y: 800, width: 30, height: 40 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 980 && x < 1010 && y >= 800 && y < 840) return 3
      if (x < 1000) return 1
      return 2
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.has(3)).toBe(false)
  })

  it('kijkt door dikke inkt (muur) heen naar buur', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 120, { x: 500, y: 500, width: 12, height: 12 }),
    ]
    const thickWall = 40
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 500 && x < 512 && y >= 500 && y < 512) return 2
      if (x >= 512 && x < 512 + thickWall && y >= 498 && y < 514) return 0
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('kijkt door ketting van micro-tussenfaces naar parent', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 120, { x: 520, y: 500, width: 12, height: 12 }),
      component(3, 40, { x: 508, y: 504, width: 12, height: 4 }),
      component(4, 40, { x: 496, y: 504, width: 12, height: 4 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 520 && x < 532 && y >= 500 && y < 512) return 2
      if (x >= 508 && x < 520 && y >= 504 && y < 508) return 3
      if (x >= 496 && x < 508 && y >= 504 && y < 508) return 4
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('kijkt door micro-tussenface naar parent', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 120, { x: 500, y: 500, width: 12, height: 12 }),
      component(3, 40, { x: 488, y: 504, width: 12, height: 4 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 500 && x < 512 && y >= 500 && y < 512) return 2
      if (x >= 488 && x < 500 && y >= 504 && y < 508) return 3
      return 1
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('geen merge via globale bbox-scan zonder cardinal overeenkomst', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 1_000_000, { x: 0, y: 0, width: 1000, height: 2000 }),
      component(2, 1_000_000, { x: 1000, y: 0, width: 1000, height: 2000 }),
      component(3, 120, { x: 994, y: 600, width: 12, height: 12 }),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (x >= 994 && x < 1006 && y >= 600 && y < 612) return 3
      if (x < 1000) return 1
      return 2
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.has(3)).toBe(false)
  })

  it('resolveMaxChildBboxPx is 10% van korte zijde', () => {
    expect(resolveMaxChildBboxPx(500, 400)).toBe(Math.round(400 * SMALL_TIER_MAX_PCT))
    expect(resolveMaxChildBboxPx(4000, 3000)).toBe(Math.round(3000 * SMALL_TIER_MAX_PCT))
  })

  it('resolveMergedLabel volgt merge-keten', () => {
    const parentMap = new Map<number, number>([
      [3, 2],
      [2, 1],
    ])
    expect(resolveMergedLabel(3, parentMap)).toBe(1)
  })

  it('bboxContains vereist volledige insluiting', () => {
    const outer = { x: 10, y: 10, width: 100, height: 100 }
    const inner = { x: 20, y: 20, width: 30, height: 30 }
    const overlap = { x: 95, y: 95, width: 30, height: 30 }
    expect(bboxContains(outer, inner)).toBe(true)
    expect(bboxContains(outer, overlap)).toBe(false)
  })

  it('geen merge van omsloten micro-vlak naar buiten-canvas parent', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 600_000, { x: 0, y: 0, width: 2000, height: 360 }, true),
      component(2, 2_000_000, { x: 0, y: 440, width: 2000, height: 1560 }, false),
      component(3, 80, { x: 500, y: 386, width: 12, height: 12 }, false),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (y >= 360 && y < 440) return 0
      if (x >= 500 && x < 512 && y >= 386 && y < 398) return 3
      if (y < 360) return 1
      return 2
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(classifyChildTier(components[2], 2000)).toBe('micro')
    expect(parentMap.has(3)).toBe(false)
  })

  it('geen merge van niet-rand small-tier naar buiten-canvas parent', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 600_000, { x: 0, y: 0, width: 2000, height: 360 }, true),
      component(2, 2_000_000, { x: 0, y: 440, width: 2000, height: 1560 }, false),
      component(3, 2100, { x: 500, y: 370, width: 70, height: 50 }, false),
    ]
    const labelAt = labelAtFromPainter(width, height, (x, y) => {
      if (y >= 360 && y < 440) return 0
      if (x >= 500 && x < 570 && y >= 370 && y < 420) return 3
      if (y < 360) return 1
      return 2
    })
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(classifyChildTier(components[2], 2000)).toBe('small')
    expect(parentMap.has(3)).toBe(false)
  })

  it('tier constanten', () => {
    expect(MICRO_TIER_MAX_PCT).toBe(0.03)
    expect(SMALL_TIER_MAX_PCT).toBe(0.1)
  })
})

describe('na resolveInkBetweenFaces', () => {
  it('merge over dikke inkt-band tussen twee kamers', () => {
    const width = 2000
    const height = 2000
    const thickWall = 40
    const components: RasterRoomComponent[] = [
      component(1, 3_000_000, { x: 0, y: 0, width: 2000, height: 2000 }),
      component(2, 120, { x: 500, y: 500, width: 12, height: 12 }),
    ]
    const rawLabels = new Int32Array(width * height).fill(1)
    for (let y = 500; y < 512; y += 1) {
      for (let x = 500; x < 512; x += 1) {
        rawLabels[y * width + x] = 2
      }
    }
    for (let y = 498; y < 514; y += 1) {
      for (let x = 512; x < 512 + thickWall; x += 1) {
        rawLabels[y * width + x] = 0
      }
    }
    const resolved = resolveLabels({ labelsData: rawLabels, components, width, height, inkOnLabels: new Set([1]) })
    const labelAt = (x: number, y: number) => resolved.labelsData[y * width + x] ?? 0
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(2)).toBe(1)
  })

  it('geen merge van omsloten micro naar buiten-parent na ink-resolve', () => {
    const width = 2000
    const height = 2000
    const components: RasterRoomComponent[] = [
      component(1, 600_000, { x: 0, y: 0, width: 2000, height: 360 }, true),
      component(2, 2_000_000, { x: 0, y: 440, width: 2000, height: 1560 }, false),
      component(3, 80, { x: 500, y: 370, width: 14, height: 14 }),
    ]
    const rawLabels = new Int32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (y < 360) rawLabels[y * width + x] = 1
        else if (y >= 440) rawLabels[y * width + x] = 2
        else if (x >= 500 && x < 514 && y >= 370 && y < 384) rawLabels[y * width + x] = 3
      }
    }
    const resolved = resolveLabels({ labelsData: rawLabels, components, width, height, inkOnLabels: new Set([1]) })
    const labelAt = (x: number, y: number) => resolved.labelsData[y * width + x] ?? 0
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
    expect(parentMap.get(3)).not.toBe(1)
  })
})
