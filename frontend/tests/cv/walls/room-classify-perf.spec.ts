import { describe, expect, it } from 'vitest'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { buildInkEaterLabels, resolveInkBetweenFaces } from '@/cv/walls/rooms/room-ink-resolve'
import { buildEnclosedFaceParentMap } from '@/cv/walls/rooms/room-raster-merge'

function benchMs(fn: () => void, maxMs: number): number {
  const start = performance.now()
  fn()
  const elapsed = performance.now() - start
  expect(elapsed).toBeLessThan(maxMs)
  return elapsed
}

/** Simuleert plattegrond: dunne muren (ink) + grote witte vlakken. */
function syntheticFloorPlan(width: number, height: number): {
  labelsData: Int32Array
  components: RasterRoomComponent[]
} {
  const labelsData = new Int32Array(width * height)
  const wall = 3
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1
      const onWall =
        x % 80 === 0 ||
        y % 60 === 0 ||
        (x > 200 && x < 206 && y > 100 && y < 400)
      if (onWall) {
        labelsData[y * width + x] = 0
      } else if (onBorder) {
        labelsData[y * width + x] = 1
      } else {
        const room = 2 + ((Math.floor(x / 80) + Math.floor(y / 60)) % 40)
        labelsData[y * width + x] = room
      }
    }
  }
  const components: RasterRoomComponent[] = [{ label: 1, areaPx: 1, bbox: { x: 0, y: 0, width, height }, touchesBorder: true }]
  for (let label = 2; label < 42; label += 1) {
    components.push({
      label,
      areaPx: 1000,
      bbox: { x: 10, y: 10, width: 50, height: 50 },
      touchesBorder: false,
    })
  }
  components.push({
    label: wall,
    areaPx: width,
    bbox: { x: 0, y: 0, width, height },
    touchesBorder: false,
  })
  return { labelsData, components }
}

describe('room classify perf guards', () => {
  it('resolveInkBetweenFaces op ~2M px binnen 3s', () => {
    const width = 1600
    const height = 1200
    const { labelsData, components } = syntheticFloorPlan(width, height)
    const referenceData = new Uint8Array(labelsData.length).fill(255)
    for (let idx = 0; idx < labelsData.length; idx += 1) {
      if ((labelsData[idx] ?? 0) === 0) referenceData[idx] = 0
    }
    const eaters = buildInkEaterLabels({
      components,
      labelsData,
      referenceData,
      inkCoverageThreshold: 0.5,
    })
    benchMs(() => {
      resolveInkBetweenFaces({
        labelsData,
        components,
        width,
        height,
        labelClass: eaters.labelClass,
      })
    }, 3000)
  })

  it('buildEnclosedFaceParentMap hangt niet bij resolved labels + micro-ketting', () => {
    const width = 200
    const height = 200
    const labelsData = new Int32Array(width * height).fill(0)
    for (let x = 50; x < 150; x += 1) {
      for (let y = 50; y < 150; y += 1) {
        labelsData[y * width + x] = 10
      }
    }
    for (let i = 0; i < 20; i += 1) {
      const label = 20 + i
      labelsData[(55 + i) * width + 100] = label
    }
    const components: RasterRoomComponent[] = [
      { label: 10, areaPx: 10000, bbox: { x: 50, y: 50, width: 100, height: 100 }, touchesBorder: false },
      ...Array.from({ length: 20 }, (_, i) => ({
        label: 20 + i,
        areaPx: 1,
        bbox: { x: 99, y: 55 + i, width: 3, height: 3 },
        touchesBorder: false,
      })),
    ]
    const referenceData = new Uint8Array(labelsData.length).fill(255)
    for (let idx = 0; idx < labelsData.length; idx += 1) {
      if ((labelsData[idx] ?? 0) === 0) referenceData[idx] = 0
    }
    const eaters = buildInkEaterLabels({
      components,
      labelsData,
      referenceData,
      inkCoverageThreshold: 0.5,
    })
    const resolved = resolveInkBetweenFaces({
      labelsData,
      components,
      width,
      height,
      labelClass: eaters.labelClass,
    })
    const labelAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0
      return resolved.labelsData[y * width + x] ?? 0
    }
    benchMs(() => {
      buildEnclosedFaceParentMap(components, width, height, { labelAt })
    }, 2000)
  })
})
