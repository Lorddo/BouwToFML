import { describe, expect, it } from 'vitest'
import {
  cmPointToImagePx,
  imagePxThicknessToCm,
  imagePxThicknessToCmAlongNormal,
  measureWallThicknessPxOnMask,
} from '@/core/fml/measure-underlay-wall-thickness'

describe('measure-underlay-wall-thickness', () => {
  it('converteert cm naar image-px met origin en schaal', () => {
    const px = cmPointToImagePx({ x: 10, y: 5 }, { x: 2, y: 3 }, 2, 2)
    expect(px.x).toBeCloseTo(240)
    expect(px.y).toBeCloseTo(160)
  })

  it('converteert px-dikte naar cm', () => {
    expect(imagePxThicknessToCm(60, 2, 2)).toBeCloseTo(3)
  })

  it('as-bewuste conversie gebruikt de schaal loodrecht op de muur', () => {
    expect(imagePxThicknessToCmAlongNormal(60, 0, 1, 5, 2)).toBeCloseTo(3)
    expect(imagePxThicknessToCmAlongNormal(60, 1, 0, 2, 5)).toBeCloseTo(3)
  })

  it('meet horizontale muur op binaire mask via midden-bbox', () => {
    const width = 80
    const height = 40
    const mask = new Uint8Array(width * height)
    for (let x = 20; x <= 59; x += 1) {
      for (let y = 17; y <= 21; y += 1) {
        mask[y * width + x] = 255
      }
    }
    const thicknessPx = measureWallThicknessPxOnMask(
      mask,
      width,
      height,
      { x: 25, y: 19 },
      { x: 55, y: 19 },
    )
    expect(thicknessPx).toBe(5)
  })

  it('meet volle dikte als FML-as in wit naast dikkere inkt ligt', () => {
    const width = 100
    const height = 60
    const mask = new Uint8Array(width * height)
    // Inktband y=20..34 (15px), FML-as op y=18 (net erboven, wit).
    for (let x = 10; x <= 90; x += 1) {
      for (let y = 20; y <= 34; y += 1) {
        mask[y * width + x] = 255
      }
    }
    const thicknessPx = measureWallThicknessPxOnMask(
      mask,
      width,
      height,
      { x: 20, y: 18 },
      { x: 80, y: 18 },
      { maxSearchPx: 40 },
    )
    expect(thicknessPx).toBe(15)
  })

  it('negeert T-aansluiting bij horizontale muur (mediaan over midden-scans)', () => {
    const width = 120
    const height = 120
    const mask = new Uint8Array(width * height)
    for (let x = 10; x <= 109; x += 1) {
      for (let y = 48; y <= 52; y += 1) {
        mask[y * width + x] = 255
      }
    }
    // T-junction aan het uiteinde (buiten midden-probe) — mag niet meetellen.
    for (let x = 58; x <= 62; x += 1) {
      for (let y = 48; y <= 110; y += 1) {
        mask[y * width + x] = 255
      }
    }
    const thicknessPx = measureWallThicknessPxOnMask(
      mask,
      width,
      height,
      { x: 15, y: 50 },
      { x: 104, y: 50 },
    )
    // Midden-probe raakt de T bij x≈60; mediaan van 5 scans moet dicht bij 5 blijven
    // of iets hoger, maar niet de volle T-lengte (~60).
    expect(thicknessPx).toBeGreaterThanOrEqual(5)
    expect(thicknessPx).toBeLessThan(20)
  })

  it('meet volle muur ondanks intern witgat (buitenste inkt in box)', () => {
    const width = 60
    const height = 40
    const mask = new Uint8Array(width * height)
    for (let y = 5; y <= 34; y += 1) {
      for (let x = 25; x <= 35; x += 1) {
        if (x >= 33 && x <= 34) continue
        mask[y * width + x] = 255
      }
    }
    // Buitenste inkt left=25, right=35 → 11px ondanks gat 33–34.
    const thicknessPx = measureWallThicknessPxOnMask(
      mask,
      width,
      height,
      { x: 30, y: 8 },
      { x: 30, y: 31 },
    )
    expect(thicknessPx).toBe(11)
  })
})
