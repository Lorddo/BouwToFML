import { describe, expect, it } from 'vitest'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  buildInkEaterLabels,
  resolveInkBetweenFaces,
  resolveInkEatRadii,
  resolveWallInkReach,
  WALL_INK_REACH_BONUS_PX,
  WALL_INK_REACH_BOOSTER,
} from '@/cv/walls/rooms/room-ink-resolve'

function component(
  label: number,
  touchesBorder = false,
): RasterRoomComponent {
  return {
    label,
    areaPx: 100,
    bbox: { x: 1, y: 1, width: 10, height: 10 },
    touchesBorder,
  }
}

function paintLabels(
  width: number,
  height: number,
  paint: (x: number, y: number) => number,
): Int32Array {
  const data = new Int32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = paint(x, y)
    }
  }
  return data
}

function referenceFromLabels(
  labelsData: Int32Array,
  inkOnLabels: ReadonlySet<number> = new Set(),
): Uint8Array {
  const data = new Uint8Array(labelsData.length).fill(255)
  for (let idx = 0; idx < labelsData.length; idx += 1) {
    const label = labelsData[idx] ?? 0
    if (label === 0 || inkOnLabels.has(label)) {
      data[idx] = 0
    }
  }
  return data
}

function resolveWithReference(params: {
  labelsData: Int32Array
  components: RasterRoomComponent[]
  width: number
  height: number
  inkOnLabels?: ReadonlySet<number>
  threshold?: number
  referenceWallThicknessPx?: number
}) {
  const referenceData = referenceFromLabels(params.labelsData, params.inkOnLabels)
  const eaters = buildInkEaterLabels({
    components: params.components,
    labelsData: params.labelsData,
    referenceData,
    inkCoverageThreshold: params.threshold,
  })
  return resolveInkBetweenFaces({
    labelsData: params.labelsData,
    components: params.components,
    width: params.width,
    height: params.height,
    labelClass: eaters.labelClass,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
}

describe('resolveInkEatRadii', () => {
  it('schaalt muur 0.5×ref en buiten 0.15×ref zonder vaste clamp', () => {
    expect(resolveInkEatRadii(16)).toEqual({ wallEatMaxPx: 8, outsideEatMaxPx: 2 })
    expect(resolveInkEatRadii(40)).toEqual({ wallEatMaxPx: 20, outsideEatMaxPx: 6 })
    expect(resolveInkEatRadii(4)).toEqual({ wallEatMaxPx: 2, outsideEatMaxPx: 1 })
  })
})

describe('resolveWallInkReach', () => {
  it('geeft muur 2× booster en 2px bonus', () => {
    expect(resolveWallInkReach(16)).toEqual({
      reachBooster: WALL_INK_REACH_BOOSTER,
      reachBonusPx: WALL_INK_REACH_BONUS_PX,
    })
    expect(resolveWallInkReach(40).reachBonusPx).toBe(2)
  })
})

describe('buildInkEaterLabels', () => {
  it('markeert rand-vlak als buiten-eater en witte kamers niet', () => {
    const width = 5
    const height = 5
    const labelsData = paintLabels(width, height, (x, y) => {
      if (x === 0 || y === 0 || x === 4 || y === 4) return 1
      return 2
    })
    const components = [component(1, true), component(2)]
    const referenceData = referenceFromLabels(labelsData)
    const eaters = buildInkEaterLabels({ components, labelsData, referenceData })
    expect(eaters.inkEaterLabels.has(1)).toBe(true)
    expect(eaters.inkEaterLabels.has(2)).toBe(false)
    expect(eaters.labelClass.get(1)).toBe('outside')
    expect(eaters.labelClass.get(2)).toBe('surface')
  })

  it('markeert face met inkt op face als muur-eater', () => {
    const width = 4
    const height = 4
    const labelsData = paintLabels(width, height, () => 1)
    const components = [component(1)]
    const referenceData = new Uint8Array(width * height).fill(255)
    referenceData[0] = 0
    const eaters = buildInkEaterLabels({
      components,
      labelsData,
      referenceData,
      inkCoverageThreshold: 0.8,
    })
    expect(eaters.inkEaterLabels.has(1)).toBe(true)
    expect(eaters.labelClass.get(1)).toBe('wall')
  })
})

describe('resolveInkBetweenFaces', () => {
  it('wijst inkt tussen twee vloer-vlakken toe aan dichtstbijzijnde face', () => {
    const width = 8
    const height = 3
    const labelsData = paintLabels(width, height, (x) => {
      if (x <= 2) return 1
      if (x >= 5) return 2
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1), component(2)],
      width,
      height,
    })
    expect(result.labelsData[3]).toBe(1)
    expect(result.labelsData[4]).toBe(2)
    expect(result.assignedPx).toBe(6)
    expect(result.unresolvedPx).toBe(0)
  })

  it('wijst hele inkt-band toe aan dichtstbijzijnde face — geen onopgeloste pixels', () => {
    const width = 50
    const height = 5
    const labelsData = paintLabels(width, height, (x) => {
      if (x < 5) return 1
      if (x >= 45) return 2
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1, true), component(2)],
      width,
      height,
    })
    for (let y = 0; y < height; y += 1) {
      expect(result.labelsData[y * width + 5]).toBe(1)
      expect(result.labelsData[y * width + 20]).toBeGreaterThan(0)
      expect(result.labelsData[y * width + 44]).toBe(2)
    }
    expect(result.unresolvedPx).toBe(0)
  })

  it('wijst arcering toe aan dichtstbijzijnde face (muur wint bij gelijke stand)', () => {
    const width = 15
    const height = 7
    const labelsData = paintLabels(width, height, (x, y) => {
      if (x >= 1 && x <= 4 && y >= 1 && y <= 5) return 1
      if (x >= 10 && x <= 13 && y >= 1 && y <= 5) return 2
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1), component(2)],
      width,
      height,
      inkOnLabels: new Set([1, 2]),
    })
    expect(result.labelsData[5 * width + 5]).toBe(1)
    expect(result.labelsData[5 * width + 9]).toBe(2)
    expect(result.labelsData[3 * width + 7]).toBeGreaterThan(0)
    expect(result.labelsData[3 * width + 8]).toBeGreaterThan(0)
    expect(result.labelsData[3 * width + 9]).toBe(2)
  })

  it('buiten wint niet voor dichtere vloer/muur — dichtstbijzijnde face telt', () => {
    const width = 9
    const height = 5
    const labelsData = paintLabels(width, height, (x, y) => {
      if (x === 0) return 3
      if (x >= 7 && y >= 1 && y <= 3) return 1
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1), component(3, true)],
      width,
      height,
    })
    expect(result.labelsData[1 + width * 2]).toBe(3)
    expect(result.labelsData[6 + width * 2]).toBe(1)
    expect(result.labelsData[0 + width * 2]).toBe(3)
  })

  it('gelijke afstand: muur wint van buiten', () => {
    const width = 7
    const height = 5
    const labelsData = paintLabels(width, height, (x, y) => {
      if (y === 0) return 3
      if (y === 4) return 1
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1), component(3, true)],
      width,
      height,
      inkOnLabels: new Set([1]),
    })
    for (let x = 0; x < width; x += 1) {
      expect(result.labelsData[2 * width + x]).toBe(1)
      expect(result.labelsData[3 * width + x]).toBe(1)
    }
  })

  it('muur dichterbij dan buiten — geen buiten-flood over muur heen', () => {
    const width = 20
    const height = 11
    const inkTop = 3
    const inkBottom = 7
    const labelsData = paintLabels(width, height, (x, y) => {
      if (y < inkTop) return 3
      if (y > inkBottom && x >= 12) return 1
      if (y > inkBottom) return 4
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1), component(3, true), component(4)],
      width,
      height,
      inkOnLabels: new Set([1]),
    })
    for (let x = 0; x < 8; x += 1) {
      expect(result.labelsData[inkTop * width + x]).not.toBe(1)
    }
    expect(result.labelsData[inkTop * width + 5]).toBe(3)
    expect(result.labelsData[inkTop * width + 8]).toBe(3)
    for (let y = inkBottom; y <= inkBottom; y += 1) {
      expect(result.labelsData[y * width + 12]).toBe(1)
    }
  })

  it('muur wint hele inktstrook t.o.v. vloer bij wall-classificatie', () => {
    const width = 11
    const height = 1
    const labelsData = paintLabels(width, height, (x) => {
      if (x <= 2) return 1
      if (x >= 8) return 2
      return 0
    })
    const components = [component(1), component(2)]
    const referenceData = referenceFromLabels(labelsData)
    const eaters = buildInkEaterLabels({
      components,
      labelsData,
      referenceData,
    })
    // Bootstrap: beide surface → symmetrische grens in het midden
    const bootstrap = resolveInkBetweenFaces({
      labelsData,
      components,
      width,
      height,
      labelClass: eaters.labelClass,
      referenceWallThicknessPx: 16,
    })
    expect(bootstrap.labelsData[5]).toBe(1)

    const wallClass = new Map<number, 'wall' | 'surface'>([
      [1, 'wall'],
      [2, 'surface'],
    ])
    const boosted = resolveInkBetweenFaces({
      labelsData,
      components,
      width,
      height,
      labelClass: wallClass,
      referenceWallThicknessPx: 16,
    })
    for (let x = 3; x <= 6; x += 1) {
      expect(boosted.labelsData[x]).toBe(1)
    }
    expect(boosted.labelsData[7]).toBe(2)
  })

  it('muur wint inkt dichter bij vloer door 2× bereik', () => {
    const width = 12
    const height = 3
    const labelsData = paintLabels(width, height, (x) => {
      if (x <= 3) return 1
      if (x >= 8) return 2
      return 0
    })
    const referenceData = referenceFromLabels(labelsData, new Set([2]))
    const eaters = buildInkEaterLabels({
      components: [component(1), component(2)],
      labelsData,
      referenceData,
    })
    expect(eaters.labelClass.get(2)).toBe('wall')
    const result = resolveInkBetweenFaces({
      labelsData,
      components: [component(1), component(2)],
      width,
      height,
      labelClass: eaters.labelClass,
      referenceWallThicknessPx: 16,
    })
    expect(result.labelsData[1 * width + 6]).toBe(2)
    expect(result.labelsData[1 * width + 7]).toBe(2)
    // 2px bonus: muur concurreert op x=4 als (4-2)/2 = 1, gelijk met vloer op afstand 1
    expect(result.labelsData[1 * width + 4]).toBe(2)
  })

  it('houdt pixel-balans bij (face + assigned + unresolved = totaal)', () => {
    const width = 5
    const height = 5
    const labelsData = paintLabels(width, height, (x, y) => {
      if (x === 2 && y === 2) return 1
      return 0
    })
    const result = resolveWithReference({
      labelsData,
      components: [component(1)],
      width,
      height,
      inkOnLabels: new Set([1]),
    })
    let facePx = 0
    for (let idx = 0; idx < labelsData.length; idx += 1) {
      if ((labelsData[idx] ?? 0) > 0) facePx += 1
    }
    expect(result.assignedPx + result.unresolvedPx + facePx).toBe(width * height)
  })
})
