import { describe, expect, it } from 'vitest'
import {
  cmPointToImagePx,
  FML_THICKNESS_PICK_SEARCH_CM,
  imagePxThicknessToCm,
  imagePxThicknessToCmAlongNormal,
  measureWallThicknessCmOnUnderlay,
  measureWallThicknessPxOnMask,
  wallBwToInkMask,
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

  it('zet zoekvenster min=20 / max=50 cm', () => {
    expect(FML_THICKNESS_PICK_SEARCH_CM.min).toBe(20)
    expect(FML_THICKNESS_PICK_SEARCH_CM.max).toBe(50)
  })

  it('converteert muur-B/W (0=inkt) naar meetmask (255=inkt)', () => {
    const wallBw = new Uint8Array([0, 255, 40, 200])
    expect([...wallBwToInkMask(wallBw)]).toEqual([255, 0, 255, 0])
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

  it('beperkt zoekvenster zodat parallelle muur buiten min-venster niet meetelt', () => {
    // 2 px/mm → 20 cm zoek = 400 px per zijde; parallelle muur op 30 cm (=600 px) blijft buiten.
    const pxPerMm = 2
    const width = 200
    const height = 1400
    const wallBw = new Uint8Array(width * height).fill(255)
    // Hoofdband y=698..702 (5px), midden x=100
    for (let x = 40; x <= 160; x += 1) {
      for (let y = 698; y <= 702; y += 1) {
        wallBw[y * width + x] = 0
      }
    }
    // Parallelle muur 30 cm onder midden: 30cm * 10 * 2px/mm = 600 px → y≈1300
    for (let x = 40; x <= 160; x += 1) {
      for (let y = 1298; y <= 1302; y += 1) {
        wallBw[y * width + x] = 0
      }
    }
    // mid cm (25,0) → image (100,700): (25+ox)*20=100 → ox=-20; (0+oy)*20=700 → oy=35
    const cm = measureWallThicknessCmOnUnderlay({
      wallBw: { data: wallBw, width, height },
      wall: { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      origin: { x: -20, y: 35 },
      pxPerMmX: pxPerMm,
      pxPerMmY: pxPerMm,
      maxSearchCm: FML_THICKNESS_PICK_SEARCH_CM.min,
    })
    // 5 px * 0.9 → ~0.225 cm → floor 1 cm; parallelle muur mag niet meestijgen
    expect(cm).toBeLessThan(5)
  })

  it('max-zoekvenster meet gearceerde band buitenste-tot-buitenste', () => {
    const pxPerMm = 2
    const width = 120
    const height = 200
    const wallBw = new Uint8Array(width * height).fill(255)
    // Twee parallelle inktlijnen (arcering/dubbel) y=90 en y=110 → buitenste span 21 px
    for (let x = 20; x <= 100; x += 1) {
      wallBw[90 * width + x] = 0
      wallBw[110 * width + x] = 0
    }
    // mid cm (20,0) → image (60,100): (20+ox)*20=60 → ox=-17; oy=5
    const cm = measureWallThicknessCmOnUnderlay({
      wallBw: { data: wallBw, width, height },
      wall: { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
      origin: { x: -17, y: 5 },
      pxPerMmX: pxPerMm,
      pxPerMmY: pxPerMm,
      maxSearchCm: FML_THICKNESS_PICK_SEARCH_CM.max,
    })
    // 21 px * 0.9 / 20 ≈ 0.945 → floor 1 cm; moet niet naar hartlijn-halve (~10 px) zakken
    expect(cm).toBeGreaterThanOrEqual(1)
    expect(cm).toBeLessThan(3)
  })
})
