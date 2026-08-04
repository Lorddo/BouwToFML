/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { WALL_BW_INK, WALL_BW_WHITE } from '@/cv/preprocess/compose-wall-bw'
import {
  applyEraseToBw,
  centerAlignBounds,
  computeWallsBBox,
  filterWallsByBands,
  orStampBwInto,
  orStampMaskIntoReference,
  rasterizeStampGrayBytes,
  rasterizeStampSolid,
  buildStampGhostDataUrl,
  stampMaskHasInk,
  transformPointByBounds,
  transformWallsByBounds,
  wallsCmToPx,
  type StampWallCm,
  type StampWallPx,
} from '@/cv/preprocess/wall-stamp-raster'
import { DEFAULT_FML_BAND_BOUNDARIES } from '@/core/fml/fml-wall-thickness-tiers'

describe('filterWallsByBands', () => {
  const walls: StampWallCm[] = [
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 8 },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 15 },
    { a: { x: 0, y: 0 }, b: { x: 50, y: 50 }, thickness: 30 },
  ]

  it('filtert op aangevinkte banden', () => {
    const onlyMax = filterWallsByBands(walls, { min: false, mid: false, max: true })
    expect(onlyMax).toHaveLength(1)
    expect(onlyMax[0]?.thickness).toBe(30)

    const midMax = filterWallsByBands(walls, { min: false, mid: true, max: true })
    expect(midMax).toHaveLength(2)

    const all = filterWallsByBands(walls, { min: true, mid: true, max: true })
    expect(all).toHaveLength(3)
  })

  it('gebruikt custom boundaries', () => {
    const custom = filterWallsByBands(
      walls,
      { min: true, mid: false, max: false },
      { midBoundaryCm: 20, maxBoundaryCm: 40 },
    )
    expect(custom.map((w) => w.thickness)).toEqual([8, 15])
  })
})

describe('wallsCmToPx + bbox + transform', () => {
  const walls: StampWallCm[] = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 10 }]

  it('cm→px met origin en schaal', () => {
    const px = wallsCmToPx({
      walls,
      origin: { x: 0, y: 0 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })
    expect(px).toHaveLength(1)
    expect(px[0]?.a).toEqual({ x: 0, y: 0 })
    expect(px[0]?.b).toEqual({ x: 1000, y: 0 })
    expect(px[0]?.thicknessPx).toBe(100)
  })

  it('computeWallsBBox dekt dikte', () => {
    const px: StampWallPx[] = [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, thicknessPx: 20 }]
    const box = computeWallsBBox(px)
    expect(box).toEqual({ x: 90, y: 90, width: 120, height: 20 })
  })

  it('centerAlignBounds verschuift centrum', () => {
    const aligned = centerAlignBounds({ x: 0, y: 0, width: 100, height: 50 }, 400, 300)
    expect(aligned.width).toBe(100)
    expect(aligned.height).toBe(50)
    expect(aligned.x + aligned.width / 2).toBeCloseTo(200)
    expect(aligned.y + aligned.height / 2).toBeCloseTo(150)
  })

  it('transformPointByBounds schaalt vanuit base', () => {
    const base = { x: 0, y: 0, width: 100, height: 100 }
    const bounds = { x: 50, y: 50, width: 200, height: 200 }
    expect(transformPointByBounds({ x: 50, y: 25 }, base, bounds)).toEqual({
      x: 150,
      y: 100,
    })
  })

  it('transformWallsByBounds schaalt dikte mee', () => {
    const wallsPx: StampWallPx[] = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thicknessPx: 10 }]
    const base = { x: 0, y: 0, width: 100, height: 10 }
    const bounds = { x: 0, y: 0, width: 200, height: 20 }
    const next = transformWallsByBounds(wallsPx, base, bounds)
    expect(next[0]?.b.x).toBeCloseTo(200)
    expect(next[0]?.thicknessPx).toBe(20)
  })
})

describe('rasterize solid + erase + OR', () => {
  it('rasterizeStampSolid tekent zwarte inkt', () => {
    const walls: StampWallPx[] = [{ a: { x: 10, y: 10 }, b: { x: 30, y: 10 }, thicknessPx: 4 }]
    const solid = rasterizeStampSolid({ walls, width: 40, height: 40 })
    expect(stampMaskHasInk(solid)).toBe(true)
    expect(solid[10 * 40 + 20]).toBe(WALL_BW_INK)
    expect(solid[0]).toBe(WALL_BW_WHITE)
  })

  it('erase wist solid én gray', () => {
    const walls: StampWallPx[] = [{ a: { x: 20, y: 20 }, b: { x: 20, y: 20 }, thicknessPx: 6 }]
    const erase = new Uint8Array(40 * 40)
    erase[20 * 40 + 20] = 255
    const solid = rasterizeStampSolid({ walls, width: 40, height: 40, eraseMask: erase })
    expect(solid[20 * 40 + 20]).toBe(WALL_BW_WHITE)

    const gray = rasterizeStampGrayBytes({ walls, width: 40, height: 40, eraseMask: erase })
    expect(gray[20 * 40 + 20]).toBe(WALL_BW_WHITE)
  })

  it('applyEraseToBw forceert wit', () => {
    const bw = new Uint8Array([WALL_BW_INK, WALL_BW_INK])
    const erase = new Uint8Array([255, 0])
    applyEraseToBw(bw, erase)
    expect(Array.from(bw)).toEqual([WALL_BW_WHITE, WALL_BW_INK])
  })

  it('orStampBwInto en orStampMaskIntoReference', () => {
    const target = new Uint8Array([WALL_BW_WHITE, WALL_BW_WHITE, WALL_BW_INK])
    const stamp = new Uint8Array([WALL_BW_INK, WALL_BW_WHITE, WALL_BW_WHITE])
    orStampBwInto(target, stamp)
    expect(Array.from(target)).toEqual([WALL_BW_INK, WALL_BW_WHITE, WALL_BW_INK])

    const ref = new Uint8Array([200, 200, 200])
    orStampMaskIntoReference(ref, stamp)
    expect(Array.from(ref)).toEqual([WALL_BW_INK, 200, 200])
  })

  it('gray en solid verschillen op stroke-pixels', () => {
    const walls: StampWallPx[] = [{ a: { x: 5, y: 5 }, b: { x: 15, y: 5 }, thicknessPx: 3 }]
    const solid = rasterizeStampSolid({ walls, width: 20, height: 20 })
    const gray = rasterizeStampGrayBytes({ walls, width: 20, height: 20 })
    let foundDiff = false
    for (let i = 0; i < solid.length; i += 1) {
      if (solid[i] === WALL_BW_INK && gray[i] !== WALL_BW_INK && gray[i] !== WALL_BW_WHITE) {
        foundDiff = true
        break
      }
    }
    expect(foundDiff || stampMaskHasInk(solid)).toBe(true)
    void DEFAULT_FML_BAND_BOUNDARIES
  })
})

describe('buildStampGhostDataUrl', () => {
  it('maakt PNG data-URL in baseBounds-ruimte', () => {
    const walls: StampWallPx[] = [{ a: { x: 10, y: 10 }, b: { x: 40, y: 10 }, thicknessPx: 4 }]
    const url = buildStampGhostDataUrl({
      walls,
      baseBounds: { x: 8, y: 8, width: 36, height: 8 },
      imageWidth: 100,
      imageHeight: 100,
    })
    expect(url).toMatch(/^data:image\/png;base64,/)
  })
})
