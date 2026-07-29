import { describe, expect, it } from 'vitest'
import {
  filterSignificantBlobs,
  findKozijnPostsAlongX,
  keepPrimaryBlobOnly,
  labelInkComponents,
  removeInkSpeckles,
  resolveOpeningUnits,
  spansFromOccupancy,
} from '@/cv/refs/ref-blob'
import { resolveFaceCropBBox } from '@/cv/refs/ref-face-crop'
import {
  buildFaceUnionMask,
  groupInteriorFaceLabelsByKopeindeAxis,
} from '@/cv/refs/ref-face-contour'
import { resolveKopeindeAxisBand } from '@/cv/refs/ref-general-categories'
import { resolveUnitBBoxForFaces, resolveUnitFacePolygons } from '@/cv/refs/ref-unit-faces'
import type { RefFace } from '@/cv/refs/types'
import { buildFaceProfile, labelWhiteFaces } from '@/cv/refs/ref-face-profile'
import {
  classifyWallRenderStyleFromFaceCount,
  wallRenderStyleToGapsInkMode,
} from '@/cv/refs/ref-wall-render-style'
import { classifyLineRelation, buildLineProfile } from '@/cv/refs/ref-line-profile'
import { classifyRawSegments } from '@/cv/refs/ref-ink-vectors'
import { deriveOpeningPrimitives } from '@/cv/refs/ref-opening-primitives'
import { computeUnitGeneralCategoryMetrics } from '@/cv/refs/ref-general-categories'
import { rotateBwData90Cw } from '@/cv/refs/ref-orient'
import { shouldInvertRefCropPolarity } from '@/cv/refs/ref-crop-bw'
import { estimateDeskewCorrectionFromLines } from '@/cv/refs/ref-straighten'
import { detectDoorSwingSector } from '@/cv/refs/ref-swing-arc'
import { detectMidlineInk } from '@/cv/refs/ref-midline-ink'
import { buildReferenceAnalysisHtml } from '@/platform/export/reference-analysis-report'
import type { ReferenceAnalysisReport } from '@/cv/refs/types'
import { wallRenderStyleLabel } from '@/cv/refs/types'

function makeBw(width: number, height: number, paint: (set: (x: number, y: number) => void) => void): Uint8Array {
  const data = new Uint8Array(width * height).fill(255)
  paint((x, y) => {
    if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = 0
  })
  return data
}

/** Face-crop topologie: links + rechts elk één doorlopend wit kozijnvlak; rails alleen in opening. */
function paintFaceCropWindow(
  set: (x: number, y: number) => void,
  width: number,
  height: number,
  opts: {
    leftStijlX: number[]
    rightStijlX: number[]
    leftKozijn: { x0: number; x1: number; y0: number; y1: number }
    rightKozijn: { x0: number; x1: number; y0: number; y1: number }
    opening: { x0: number; x1: number; y0: number; y1: number }
    railYs: number[]
    mullionXs?: number[]
  },
): void {
  const { opening, railYs, mullionXs = [], leftStijlX, rightStijlX } = opts
  const y0 = Math.min(opts.leftKozijn.y0, opening.y0)
  const y1 = Math.max(opts.leftKozijn.y1, opening.y1)
  for (const x of leftStijlX) for (let y = y0; y <= y1; y += 1) set(x, y)
  for (const x of rightStijlX) for (let y = y0; y <= y1; y += 1) set(x, y)
  // Volledige breedte: scheidt kozijnvlakken van buiten-wit (anders 1 buiten-face).
  for (const y of [opening.y0, opening.y1]) {
    for (let x = 0; x < width; x += 1) set(x, y)
  }
  for (const y of railYs) {
    for (let x = opening.x0; x <= opening.x1; x += 1) set(x, y)
  }
  for (const x of mullionXs) for (let y = opening.y0; y <= opening.y1; y += 1) set(x, y)
  // Scheid kozijnvlakken van opening (anders één breed wit vlak).
  for (let y = y0; y <= y1; y += 1) {
    set(opening.x0, y)
    set(opening.x1 + 1, y)
  }
  const leftStijlMax = Math.max(...leftStijlX)
  const rightStijlMax = Math.max(...rightStijlX)
  for (let x = leftStijlMax + 1; x < opts.leftKozijn.x0; x += 1) {
    for (let y = 0; y < height; y += 1) set(x, y)
  }
  for (let x = rightStijlMax + 1; x < opts.rightKozijn.x0; x += 1) {
    for (let y = 0; y < height; y += 1) set(x, y)
  }
  for (let x = 0; x < Math.min(...leftStijlX); x += 1) {
    for (let y = 0; y < height; y += 1) set(x, y)
  }
  for (let x = opts.rightKozijn.x1 + 1; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) set(x, y)
  }
}

/** Gevulde deur-sector: wit vlak tussen kozijnlijn (bovenaan), radiaal en boog — zoals na straighten */
function paintFilledDoorSector(
  set: (x: number, y: number) => void,
  hingeX: number,
  hingeY: number,
  radius: number,
  sweepDeg: number,
  hingeRight = false,
): void {
  const endRad = (sweepDeg * Math.PI) / 180
  const sign = hingeRight ? -1 : 1
  for (let dy = 0; dy <= radius + 2; dy += 1) {
    for (let dx = 0; dx <= radius + 2; dx += 1) {
      const gx = hingeRight ? hingeX - dx : hingeX + dx
      const gy = hingeY + dy
      const sx = (gx - hingeX) * sign
      if (sx < -0.5) continue
      const ang = Math.atan2(dy, Math.max(0.001, sx))
      if (ang < -0.02 || ang > endRad + 0.02) continue
      const r = Math.hypot(sx, dy)
      if (r > radius + 0.5) continue
      if (dy === 0) set(gx, gy)
      if (Math.abs(ang - endRad) <= 0.04 && r <= radius) set(gx, gy)
      if (Math.abs(r - radius) <= 1.1 && ang >= 0 && ang <= endRad) set(gx, gy)
    }
  }
}

describe('ref-crop polarity', () => {
  it('inverteert NIET bij solid majority-dark met lichte rand', () => {
    // Solid muur: bijna alles zwart, witte rand
    const w = 40
    const h = 20
    const data = new Uint8Array(w * h).fill(0)
    for (let x = 0; x < w; x += 1) {
      data[x] = 255
      data[(h - 1) * w + x] = 255
    }
    for (let y = 0; y < h; y += 1) {
      data[y * w] = 255
      data[y * w + w - 1] = 255
    }
    expect(shouldInvertRefCropPolarity(data, w, h)).toBe(false)
  })

  it('inverteert wel bij donkere rand (witte inkt)', () => {
    const w = 20
    const h = 20
    const data = new Uint8Array(w * h).fill(255)
    // dark border
    for (let x = 0; x < w; x += 1) {
      data[x] = 0
      data[(h - 1) * w + x] = 0
    }
    for (let y = 0; y < h; y += 1) {
      data[y * w] = 0
      data[y * w + w - 1] = 0
    }
    expect(shouldInvertRefCropPolarity(data, w, h)).toBe(true)
  })
})

describe('ref-blob', () => {
  it('kiest grootste ink-blob en filtert speckles', () => {
    const data = makeBw(40, 20, (set) => {
      for (let y = 4; y < 12; y += 1) for (let x = 4; x < 28; x += 1) set(x, y)
      set(35, 2)
      set(36, 2)
    })
    const { blobs } = labelInkComponents(data, 40, 20)
    const significant = filterSignificantBlobs(blobs, 40 * 20, { minAreaPx: 4, minRatioOfLargest: 0.05 })
    expect(significant.length).toBe(1)
  })

  it('keepPrimaryBlobOnly verwijdert restjes', () => {
    const data = makeBw(40, 20, (set) => {
      for (let y = 4; y < 12; y += 1) for (let x = 4; x < 28; x += 1) set(x, y)
      for (let y = 1; y < 4; y += 1) for (let x = 34; x < 38; x += 1) set(x, y)
    })
    const kept = keepPrimaryBlobOnly(data, 40, 20)
    expect(labelInkComponents(kept.data, 40, 20).blobs.length).toBe(1)
  })

  it('removeInkSpeckles behoudt muur + aparte boog', () => {
    const data = makeBw(60, 40, (set) => {
      // dikke muurstrook rechts
      for (let y = 0; y < 40; y += 1) for (let x = 48; x < 58; x += 1) set(x, y)
      // losse boog-blob (voldoende area, niet-touching)
      for (let y = 8; y < 28; y += 1) for (let x = 8; x < 22; x += 1) set(x, y)
    })
    const cleaned = removeInkSpeckles(data, 60, 40)
    const blobs = labelInkComponents(cleaned.data, 60, 40).blobs
    expect(blobs.length).toBeGreaterThanOrEqual(2)
  })

  it('splitst dubbel raam via kozijn-posts in units met exact 2 kozijnen', () => {
    const data = makeBw(60, 20, (set) => {
      for (const px of [2, 3, 4, 28, 29, 30, 54, 55, 56]) {
        for (let y = 3; y < 17; y += 1) set(px, y)
      }
      for (let x = 2; x < 57; x += 1) {
        set(x, 3)
        set(x, 9)
        set(x, 16)
      }
    })
    const posts = findKozijnPostsAlongX(data, 60, 20, { x: 0, y: 0, width: 60, height: 20 })
    expect(posts.length).toBe(3)
    const { units } = resolveOpeningUnits({ data, width: 60, height: 20 })
    expect(units.length).toBe(2)
    // Geen unit over de volle breedte (dat zou 3 kozijnen zijn)
    for (const u of units) {
      expect(u.bbox.width).toBeLessThan(55)
      expect(u.source).toBe('kozijn_span')
    }
  })

  it('kan units forceren naar 1 gecombineerde kozijn-span', () => {
    const data = makeBw(60, 20, (set) => {
      for (const px of [2, 3, 4, 28, 29, 30, 54, 55, 56]) {
        for (let y = 3; y < 17; y += 1) set(px, y)
      }
      for (let x = 2; x < 57; x += 1) {
        set(x, 3)
        set(x, 9)
        set(x, 16)
      }
    })
    const { units } = resolveOpeningUnits({ data, width: 60, height: 20, singleUnit: true })
    expect(units.length).toBe(1)
    expect(units[0]?.includesBothHeads).toBe(true)
    expect((units[0]?.bbox.width ?? 0) >= 50).toBe(true)
  })

  it('knipt muur buiten 1e verticale stijlen weg', () => {
    // Muur links (solid blok) + 2 kozijnstijlen + rails
    const data = makeBw(80, 24, (set) => {
      for (let y = 2; y < 22; y += 1) for (let x = 0; x < 12; x += 1) set(x, y)
      for (const px of [20, 21, 58, 59]) {
        for (let y = 4; y < 20; y += 1) set(px, y)
      }
      for (let x = 20; x < 60; x += 1) {
        set(x, 4)
        set(x, 19)
      }
    })
    const { units } = resolveOpeningUnits({ data, width: 80, height: 24 })
    expect(units.length).toBeGreaterThanOrEqual(1)
    const primary = units.find((u) => u.isPrimary) ?? units[0]!
    // Crop mag niet tot x=0 (muur) beginnen
    expect(primary.bbox.x).toBeGreaterThanOrEqual(15)
    expect(primary.bbox.x + primary.bbox.width).toBeLessThanOrEqual(65)
  })

  it('spansFromOccupancy', () => {
    expect(spansFromOccupancy(Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 1, 1, 1]), 3, 2).length).toBe(2)
  })
})

describe('ref-orient', () => {
  it('rotateBwData90Cw', () => {
    const data = makeBw(3, 2, (set) => set(0, 1))
    const rotated = rotateBwData90Cw(data, 3, 2)
    expect(rotated.width).toBe(2)
    expect(rotated.height).toBe(3)
    expect(rotated.data[0]).toBe(0)
  })
})

describe('ref-face-profile', () => {
  it('één label per wit vlak', () => {
    const data = makeBw(10, 6, (set) => {
      for (let y = 0; y < 6; y += 1) {
        set(4, y)
        set(5, y)
      }
    })
    const profile = buildFaceProfile(data, 10, 6)
    expect(new Set(profile.faces.map((f) => f.label)).size).toBe(profile.faceCount)
    expect(profile.labelsData?.length).toBe(10 * 6)
    expect(labelWhiteFaces(data, 10, 6).faces.length).toBeGreaterThanOrEqual(2)
  })

  it('classificeert een buiten-face op de rand', () => {
    const data = makeBw(20, 14, (set) => {
      for (let y = 0; y < 14; y += 1) set(9, y)
      for (let x = 0; x < 9; x += 1) set(x, 6)
    })
    const profile = buildFaceProfile(data, 20, 14)
    expect(profile.faces.some((face) => face.role === 'outside')).toBe(true)
  })

  it('sealBorders + 4-connect splitst buiten-faces die via de crop-rand verbonden waren', () => {
    // Dubbele H-lijn tot aan de seal-rand (zoals een strakke LBE) → boven / midden / onder.
    const w = 24
    const h = 16
    const data = makeBw(w, h, (set) => {
      for (let x = 1; x <= w - 2; x += 1) {
        set(x, 5)
        set(x, 10)
      }
    })
    const sealed = buildFaceProfile(data, w, h, undefined, { sealBorders: true, minAreaPx: 1 })
    expect(sealed.faceCount).toBeGreaterThanOrEqual(3)
    expect(sealed.faceCount).toBeLessThanOrEqual(5)
    expect(classifyWallRenderStyleFromFaceCount(sealed.faceCount).renderStyle).toBe('solid')
  })
})

describe('ref-wall-render-style', () => {
  it('≤5 faces → solid, >5 → details', () => {
    expect(classifyWallRenderStyleFromFaceCount(5).renderStyle).toBe('solid')
    expect(classifyWallRenderStyleFromFaceCount(1).renderStyle).toBe('solid')
    expect(classifyWallRenderStyleFromFaceCount(6).renderStyle).toBe('details')
    expect(wallRenderStyleToGapsInkMode('solid')).toBe('solid')
    expect(wallRenderStyleToGapsInkMode('details')).toBe('detail')
    expect(wallRenderStyleToGapsInkMode('parallel_lines')).toBe('solid')
  })

  it('hatch-achtig patroon (>5 faces met seal) → details', () => {
    const w = 30
    const h = 20
    const data = makeBw(w, h, (set) => {
      for (let y = 2; y < h - 2; y += 2) {
        for (let x = 2; x < w - 2; x += 1) set(x, y)
      }
      for (let x = 2; x < w - 2; x += 3) {
        for (let y = 2; y < h - 2; y += 1) set(x, y)
      }
    })
    const profile = buildFaceProfile(data, w, h, undefined, { sealBorders: true, minAreaPx: 1 })
    expect(profile.faceCount).toBeGreaterThan(5)
  })
})

describe('ref-unit-faces', () => {
  it('single-unit crop-bbox houdt beide kozijnen in face-polygonen (BouwTek11-regressie)', () => {
    const poly = (x: number, y: number) => [
      { x, y },
      { x: x + 2, y },
      { x: x + 2, y: y + 2 },
      { x, y: y + 2 },
    ]
    const faces: RefFace[] = [
      {
        label: 4,
        role: 'interior',
        areaPx: 132,
        bbox: { x: 4, y: 10, width: 12, height: 14 },
        centroid: { x: 9.5, y: 16.4 },
        relativeCentroid: { x: 0.1, y: 0.5 },
        inkRatio: 0.1,
        aspectRatio: 0.85,
        compactness: 0.8,
        touchesBorder: false,
        approxPolygon: poly(4, 10),
      },
      {
        label: 6,
        role: 'interior',
        areaPx: 82,
        bbox: { x: 131, y: 14, width: 9, height: 12 },
        centroid: { x: 134.5, y: 19 },
        relativeCentroid: { x: 0.9, y: 0.6 },
        inkRatio: 0.1,
        aspectRatio: 0.75,
        compactness: 0.76,
        touchesBorder: false,
        approxPolygon: poly(131, 14),
      },
      {
        label: 7,
        role: 'interior',
        areaPx: 595,
        bbox: { x: 18, y: 18, width: 109, height: 8 },
        centroid: { x: 71, y: 22 },
        relativeCentroid: { x: 0.5, y: 0.7 },
        inkRatio: 0.1,
        aspectRatio: 13,
        compactness: 0.9,
        touchesBorder: false,
        approxPolygon: poly(18, 18),
      },
    ]
    // Te smalle kozijn_span (zoals in rapport (22)): mist rechter kozijn
    const narrowUnit = {
      bbox: { x: 15, y: 1, width: 72, height: 29 },
      includesBothHeads: true,
      source: 'kozijn_span',
    }
    const skipped = resolveUnitFacePolygons(narrowUnit.bbox, faces)
    expect(skipped.map((f) => f.label).sort()).not.toContain(6)

    const faceBBox = resolveUnitBBoxForFaces({
      unit: narrowUnit,
      faces,
      cropWidth: 146,
      cropHeight: 31,
      singleUnit: true,
    })
    expect(faceBBox.width).toBe(146)
    const included = resolveUnitFacePolygons(faceBBox, faces)
    expect(included.map((f) => f.label).sort()).toEqual([4, 6, 7])
  })
})

describe('ref-face-contour', () => {
  it('union-mask houdt alleen interior/head faces over', () => {
    const width = 24
    const height = 16
    const data = makeBw(width, height, (set) => {
      for (let x = 4; x <= 18; x += 1) {
        set(x, 4)
        set(x, 11)
      }
      for (let y = 4; y <= 11; y += 1) {
        set(4, y)
        set(18, y)
      }
    })
    const faceProfile = buildFaceProfile(data, width, height)
    const mask = buildFaceUnionMask(data, width, height, faceProfile)
    expect(mask[8 * width + 10]).toBe(255) // binnenvlak
    expect(mask[1 * width + 1]).toBe(0) // outside
  })

  it('kopeinde-as splitst velden in as / boven / onder', () => {
    const w = 70
    const h = 40
    const data = makeBw(w, h, (set) => {
      paintFaceCropWindow(set, w, h, {
        leftStijlX: [8, 9],
        rightStijlX: [60, 61],
        leftKozijn: { x0: 10, x1: 17, y0: 12, y1: 28 },
        rightKozijn: { x0: 53, x1: 59, y0: 12, y1: 28 },
        opening: { x0: 18, x1: 51, y0: 11, y1: 29 },
        railYs: [20],
      })
      // Extra wit vlak boven de as: alleen ink-rand (binnenkant blijft wit)
      for (let x = 23; x <= 41; x += 1) {
        set(x, 1)
        set(x, 7)
      }
      for (let y = 1; y <= 7; y += 1) {
        set(23, y)
        set(41, y)
      }
      // Extra wit vlak onder de as
      for (let x = 23; x <= 41; x += 1) {
        set(x, 32)
        set(x, 38)
      }
      for (let y = 32; y <= 38; y += 1) {
        set(23, y)
        set(41, y)
      }
    })
    const faceProfile = buildFaceProfile(data, w, h)
    const band = resolveKopeindeAxisBand(faceProfile, w)
    expect(band).not.toBeNull()
    expect(band!.yMin).toBeGreaterThanOrEqual(11)
    expect(band!.yMax).toBeLessThanOrEqual(29)

    const grouped = groupInteriorFaceLabelsByKopeindeAxis(faceProfile, w)
    expect(grouped.band).not.toBeNull()
    expect(grouped.onAxis.length).toBeGreaterThanOrEqual(2)
    expect(grouped.above.length).toBeGreaterThanOrEqual(1)
    expect(grouped.below.length).toBeGreaterThanOrEqual(1)

    const byLabel = new Map(faceProfile.faces.map((f) => [f.label, f]))
    for (const label of grouped.above) {
      expect(byLabel.get(label)!.centroid.y).toBeLessThan(grouped.band!.yMin)
    }
    for (const label of grouped.below) {
      expect(byLabel.get(label)!.centroid.y).toBeGreaterThan(grouped.band!.yMax)
    }
    for (const label of grouped.onAxis) {
      const y = byLabel.get(label)!.centroid.y
      expect(y).toBeGreaterThanOrEqual(grouped.band!.yMin)
      expect(y).toBeLessThanOrEqual(grouped.band!.yMax)
    }
  })
})

describe('ref-face-crop', () => {
  it('houdt deur-crop breder dan smalle kozijnstrook', () => {
    const width = 168
    const height = 189
    const data = makeBw(width, height, (set) => {
      for (let y = 0; y < height; y += 1) for (let x = 146; x < 160; x += 1) set(x, y)
      for (const x of [38, 39, 121, 122]) {
        for (let y = 28; y < 176; y += 1) set(x, y)
      }
      for (let x = 38; x <= 122; x += 1) {
        set(x, 28)
        set(x, 176)
      }
      const cx = 38
      const cy = 176
      const radius = 90
      for (let deg = 10; deg <= 88; deg += 1) {
        const rad = (deg * Math.PI) / 180
        set(Math.round(cx + radius * Math.cos(rad)), Math.round(cy - radius * Math.sin(rad)))
      }
    })
    const faceProfile = buildFaceProfile(data, width, height)
    const result = resolveFaceCropBBox({
      kind: 'door',
      data,
      width,
      height,
      faceProfile,
    })
    expect(result.cropBBox.width).toBeGreaterThanOrEqual(Math.round(width * 0.4))
    expect(result.primary?.source).toBe('kozijn_span')
  })

  it('brengt afgesneden buiten-inkt niet terug na face-mask', () => {
    const width = 120
    const height = 90
    const data = makeBw(width, height, (set) => {
      // opening
      for (const x of [20, 21, 92, 93]) for (let y = 10; y < 82; y += 1) set(x, y)
      for (let x = 20; x <= 93; x += 1) {
        set(x, 10)
        set(x, 82)
      }
      // buitenruis die niet aan interior face grenst
      for (let y = 0; y < 90; y += 1) for (let x = 103; x < 114; x += 1) set(x, y)
    })
    const faceProfile = buildFaceProfile(data, width, height)
    const result = resolveFaceCropBBox({
      kind: 'door',
      data,
      width,
      height,
      faceProfile,
    })
    let rightInk = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 103; x < 114; x += 1) {
        if ((result.maskedData[y * width + x] ?? 255) < 128) rightInk += 1
      }
    }
    expect(rightInk).toBe(0)
  })

  it('knipt uitstulpende inkt af buiten 3px rondom faces', () => {
    const width = 140
    const height = 90
    const data = makeBw(width, height, (set) => {
      // gesloten opening
      for (const x of [28, 29, 90, 91]) for (let y = 12; y < 76; y += 1) set(x, y)
      for (let x = 28; x <= 91; x += 1) {
        set(x, 12)
        set(x, 76)
      }
      // uitstulpende inkt vanaf rechter stijl naar buiten
      for (let x = 92; x < 125; x += 1) {
        set(x, 44)
        set(x, 45)
      }
    })
    const faceProfile = buildFaceProfile(data, width, height)
    const result = resolveFaceCropBBox({
      kind: 'window',
      data,
      width,
      height,
      faceProfile,
      maxInkDistancePx: 3,
    })
    let farInk = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 100; x < 130; x += 1) {
        if ((result.maskedData[y * width + x] ?? 255) < 128) farInk += 1
      }
    }
    expect(farInk).toBe(0)
  })
})

describe('ref-line-profile raw', () => {
  it('classificeert parallel/perp/other', () => {
    expect(classifyLineRelation(0)).toBe('parallel')
    expect(classifyLineRelation(90)).toBe('perp')
    expect(classifyLineRelation(45)).toBe('other')
  })

  it('telt parallel-bands uit ruwe segmenten', () => {
    const profile = buildLineProfile({
      orientation: 'horizontal',
      segments: [
        { a: { x: 0, y: 2 }, b: { x: 40, y: 2 } },
        { a: { x: 0, y: 8 }, b: { x: 40, y: 8 } },
        { a: { x: 0, y: 14 }, b: { x: 40, y: 14 } },
        { a: { x: 0, y: 20 }, b: { x: 40, y: 20 } },
        { a: { x: 2, y: 0 }, b: { x: 2, y: 22 } },
      ],
    })
    expect(profile.parallelCount).toBe(4)
    expect(profile.perpCount).toBe(1)
  })

  it('classificeert arc-segmenten met arc-hint', () => {
    const lines = classifyRawSegments({
      segments: [
        { a: { x: 30, y: 10 }, b: { x: 35, y: 15 } },
        { a: { x: 35, y: 15 }, b: { x: 38, y: 21 } },
        { a: { x: 5, y: 28 }, b: { x: 35, y: 28 } },
      ],
      orientation: 'horizontal',
      arcHint: { center: { x: 8, y: 28 }, radius: 30, tolerancePx: 3 },
    })
    expect(lines.some((l) => l.relation === 'arc')).toBe(true)
  })
})

describe('ref-straighten', () => {
  it('deskew gebruikt geclassificeerde lijnen als bron', () => {
    const correction = estimateDeskewCorrectionFromLines(
      [
        { a: { x: 0, y: 0 }, b: { x: 50, y: 2.6 }, lengthPx: 50, angleDeg: 3, relation: 'parallel' },
        { a: { x: 10, y: 0 }, b: { x: 10.3, y: 40 }, lengthPx: 40, angleDeg: 89.6, relation: 'perp' },
      ],
      'horizontal',
    )
    expect(correction).toBeLessThan(0)
    expect(Math.abs(correction)).toBeGreaterThanOrEqual(1)
  })

  it('negeert micro-skew op bijna-horizontale parallelrails (raam-as recht houden)', () => {
    // BouwTek11-achtig: lange H-rails ~0.6° door pixel-aliasing + korte kozijnen met luidruchtige hoek.
    const correction = estimateDeskewCorrectionFromLines(
      [
        { a: { x: 0, y: 8 }, b: { x: 140, y: 9.5 }, lengthPx: 140, angleDeg: 0.62, relation: 'parallel' },
        { a: { x: 0, y: 20 }, b: { x: 140, y: 21.5 }, lengthPx: 140, angleDeg: 0.61, relation: 'parallel' },
        { a: { x: 4, y: 6 }, b: { x: 5, y: 24 }, lengthPx: 18, angleDeg: 87.2, relation: 'perp' },
        { a: { x: 132, y: 7 }, b: { x: 134, y: 25 }, lengthPx: 18, angleDeg: 83.7, relation: 'perp' },
      ],
      'horizontal',
      5,
      { preferParallel: true, minAbsDeg: 1.25, minLengthPx: 8 },
    )
    expect(correction).toBe(0)
  })

  it('corrigeert echte scheefstand (~3°) op parallelrails wél', () => {
    const correction = estimateDeskewCorrectionFromLines(
      [
        { a: { x: 0, y: 0 }, b: { x: 100, y: 5.2 }, lengthPx: 100, angleDeg: 3, relation: 'parallel' },
        { a: { x: 0, y: 12 }, b: { x: 100, y: 17.2 }, lengthPx: 100, angleDeg: 3, relation: 'parallel' },
        { a: { x: 2, y: 0 }, b: { x: 4, y: 20 }, lengthPx: 20, angleDeg: 84, relation: 'perp' },
      ],
      'horizontal',
      5,
      { preferParallel: true, minAbsDeg: 1.25, minLengthPx: 8 },
    )
    expect(correction).toBeLessThan(0)
    expect(Math.abs(correction)).toBeGreaterThanOrEqual(2.5)
  })
})

describe('draaicirkel', () => {
  it('detecteert gevulde sector als draaicirkel ja', () => {
    const w = 80
    const h = 70
    const data = makeBw(w, h, (set) => {
      paintFilledDoorSector(set, 8, 10, 50, 90)
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    expect(
      detectDoorSwingSector({
        data,
        width: w,
        height: h,
        bbox,
      }),
    ).toBe(true)
  })

  it('deur primitives zetten draaicirkel=true bij gevulde sector', () => {
    const w = 80
    const h = 70
    const data = makeBw(w, h, (set) => {
      paintFilledDoorSector(set, 8, 10, 48, 90)
    })
    const faceProfile = buildFaceProfile(data, w, h)
    const bbox = { x: 0, y: 0, width: w, height: h }
    const prim = deriveOpeningPrimitives({
      kind: 'door',
      data,
      width: w,
      height: h,
      metricsBBox: bbox,
      orientation: 'horizontal',
      faceProfile,
      draaicirkel: detectDoorSwingSector({ data, width: w, height: h, bbox }),
    })
    expect(prim.draaicirkel).toBe(true)
  })

  it('deur zonder sector: draaicirkel=false', () => {
    const w = 80
    const h = 40
    const data = makeBw(w, h, (set) => {
      for (let x = 8; x <= 60; x += 1) set(x, 8)
      for (const x of [8, 60]) for (let y = 8; y < 30; y += 1) set(x, y)
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    expect(
      detectDoorSwingSector({
        data,
        width: w,
        height: h,
        bbox,
      }),
    ).toBe(false)
    const mid = detectMidlineInk({ data, width: w, height: h, bbox })
    expect(mid.hasMidline).toBe(true)
    expect(mid.spanPx).toBeGreaterThan(20)
  })

  it('bestek-deur: kopeinde=nee bij kozijn_span zonder kozijnvlakken', () => {
    const w = 47
    const h = 13
    const data = makeBw(w, h, (set) => {
      for (const x of [2, 3, 22, 23]) for (let y = 1; y < 12; y += 1) set(x, y)
      for (let x = 6; x <= 18; x += 1) set(x, 6)
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    const faceProfile = buildFaceProfile(data, w, h, bbox)
    const prim = deriveOpeningPrimitives({
      kind: 'door',
      data,
      width: w,
      height: h,
      metricsBBox: bbox,
      orientation: 'horizontal',
      faceProfile,
      draaicirkel: false,
    })
    expect(prim.kopeinde).toBe(false)
    expect(prim.middenlijn).toBe(true)
    expect(prim.middenlijnSpanPx).toBeGreaterThan(8)
  })

  it('face-crop beschermt middenlijn bij protectedInkMask', () => {
    const width = 60
    const height = 20
    const data = makeBw(width, height, (set) => {
      for (const x of [4, 5, 52, 53]) for (let y = 3; y < 17; y += 1) set(x, y)
      for (let x = 10; x <= 46; x += 1) set(x, 10)
      for (let x = 54; x < 58; x += 1) set(x, 10)
    })
    const faceProfile = buildFaceProfile(data, width, height)
    const bbox = { x: 0, y: 0, width, height }
    const mid = detectMidlineInk({ data, width, height, bbox })
    const result = resolveFaceCropBBox({
      kind: 'door',
      data,
      width,
      height,
      faceProfile,
      maxInkDistancePx: 3,
      protectedInkMask: mid.mask,
    })
    let midInk = 0
    for (let x = 10; x <= 46; x += 1) {
      if ((result.maskedData[10 * width + x] ?? 255) < 128) midInk += 1
    }
    expect(midInk).toBeGreaterThan(20)
    let farInk = 0
    for (let x = 54; x < 58; x += 1) {
      if ((result.maskedData[10 * width + x] ?? 255) < 128) farInk += 1
    }
    expect(farInk).toBe(0)
  })

  it('raam primitives met kopeinde meten kozijn op face-crop', () => {
    const w = 70
    const h = 28
    const data = makeBw(w, h, (set) => {
      paintFaceCropWindow(set, w, h, {
        leftStijlX: [8, 9],
        rightStijlX: [60, 61],
        leftKozijn: { x0: 10, x1: 17, y0: 5, y1: 22 },
        rightKozijn: { x0: 53, x1: 59, y0: 5, y1: 22 },
        opening: { x0: 18, x1: 51, y0: 4, y1: 23 },
        railYs: [12, 19],
        mullionXs: [36],
      })
    })
    const faceProfile = buildFaceProfile(data, w, h, { x: 0, y: 0, width: w, height: h })
    const bbox = { x: 0, y: 0, width: w, height: h }
    const prim = deriveOpeningPrimitives({
      kind: 'window',
      data,
      width: w,
      height: h,
      metricsBBox: bbox,
      orientation: 'horizontal',
      faceProfile,
    })
    expect(prim.kopeinde).toBe(true)
    expect(prim.kozijnLinks!.widthPx).toBeGreaterThan(1)
    expect(prim.kozijnRechts!.widthPx).toBeGreaterThan(1)
    expect(prim.kozijnTotaalOppervlakPx).toBeGreaterThan(0)
    expect(prim.draaicirkel).toBeUndefined()
  })

  it('general categories: kozijn = wit vlak bbox op face-crop', () => {
    const w = 40
    const h = 20
    const data = makeBw(w, h, (set) => {
      paintFaceCropWindow(set, w, h, {
        leftStijlX: [2, 3],
        rightStijlX: [34, 35],
        leftKozijn: { x0: 4, x1: 11, y0: 3, y1: 17 },
        rightKozijn: { x0: 27, x1: 33, y0: 3, y1: 17 },
        opening: { x0: 12, x1: 25, y0: 2, y1: 17 },
        railYs: [9],
      })
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    const faceProfile = buildFaceProfile(data, w, h, bbox)
    const metrics = computeUnitGeneralCategoryMetrics({
      data,
      width: w,
      height: h,
      bbox,
      faceProfile,
      orientation: 'horizontal',
      kind: 'window',
    })
    expect(metrics.kozijnLinks?.widthPx).toBeGreaterThan(1)
    expect(metrics.kozijnRechts?.widthPx).toBeGreaterThan(1)
    expect(metrics.kozijnLinks?.centroidX).toBeGreaterThan(0)
    expect(metrics.kozijnTotaalOppervlakPx).toBe(
      Math.round(((metrics.kozijnLinks?.areaPx ?? 0) + (metrics.kozijnRechts?.areaPx ?? 0)) * 10) / 10,
    )
  })

  it('general categories: asymmetrische kozijnbreedte op face-crop', () => {
    const w = 56
    const h = 22
    const data = makeBw(w, h, (set) => {
      paintFaceCropWindow(set, w, h, {
        leftStijlX: [2, 3],
        rightStijlX: [52, 53],
        leftKozijn: { x0: 4, x1: 18, y0: 4, y1: 18 },
        rightKozijn: { x0: 46, x1: 51, y0: 4, y1: 18 },
        opening: { x0: 19, x1: 44, y0: 3, y1: 18 },
        railYs: [10],
      })
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    const faceProfile = buildFaceProfile(data, w, h, bbox)
    const metrics = computeUnitGeneralCategoryMetrics({
      data,
      width: w,
      height: h,
      bbox,
      faceProfile,
      orientation: 'horizontal',
      kind: 'window',
    })
    expect(metrics.kopeinde).toBe(true)
    expect(metrics.kozijnLinks!.widthPx).toBeGreaterThan(metrics.kozijnRechts!.widthPx)
  })

  it('ref32-regressie: rechter kozijn is één face-bbox, geen rail-span', () => {
    const w = 320
    const h = 33
    const data = makeBw(w, h, (set) => {
      paintFaceCropWindow(set, w, h, {
        leftStijlX: [3, 4, 5],
        rightStijlX: [296, 297, 298],
        leftKozijn: { x0: 6, x1: 19, y0: 5, y1: 26 },
        rightKozijn: { x0: 301, x1: 314, y0: 5, y1: 26 },
        opening: { x0: 20, x1: 295, y0: 4, y1: 27 },
        railYs: [12, 19],
        mullionXs: [20, 21, 148, 149, 167, 168],
      })
    })
    const bbox = { x: 0, y: 0, width: w, height: h }
    const faceProfile = buildFaceProfile(data, w, h, bbox)
    const metrics = computeUnitGeneralCategoryMetrics({
      data,
      width: w,
      height: h,
      bbox,
      faceProfile,
      orientation: 'horizontal',
      kind: 'window',
    })
    expect(metrics.kopeinde).toBe(true)
    expect(metrics.kozijnLinks?.widthPx).toBe(14)
    expect(metrics.kozijnRechts?.widthPx).toBe(14)
    expect(metrics.kozijnLinks?.heightPx).toBeGreaterThan(10)
    expect(metrics.kozijnRechts?.heightPx).toBeGreaterThan(10)
  })
})

describe('reference-analysis-report', () => {
  it('HTML met data-URL', () => {
    const report: ReferenceAnalysisReport = {
      exportedAt: '2026-07-14T00:00:00.000Z',
      drawing: 'test.png',
      wall: {
        kind: 'wall',
        rect: { x: 0, y: 0, width: 10, height: 10 },
        cropWidth: 10,
        cropHeight: 10,
        orientation: 'horizontal',
        bwMode: 'otsu',
        skewCorrectedDeg: 0,
        thicknessPx: 8,
        renderStyle: 'solid',
        renderStyleLabel: wallRenderStyleLabel('solid'),
        renderStyleConfidence: 0.9,
        renderStyleScores: { solid: 0.9, parallel_lines: 0.1, details: 0.05 },
        primaryBlob: null,
        units: [],
        lineProfile: { lines: [], parallelCount: 0, perpCount: 0, arcCount: 0, otherCount: 0 },
        faceProfile: { faces: [], totalAreaPx: 0, faceCount: 0 },
        images: {
          originalCropPng: 'data:image/png;base64,aaa',
          bwCropPng: 'data:image/png;base64,bbb',
          faceOverlayPng: 'data:image/png;base64,ccc',
          faceCropPng: 'data:image/png;base64,ccf',
          lineOverlayPng: 'data:image/png;base64,ddd',
          straightenedPng: 'data:image/png;base64,eee',
        },
      },
      openings: [],
    }
    expect(buildReferenceAnalysisHtml(report)).toContain('Solid')
    expect(buildReferenceAnalysisHtml(report)).toContain('Algemene categorieën')
    expect(buildReferenceAnalysisHtml(report)).toContain('Kozijn links')
  })

  it('toont opening face-polygonen in HTML', () => {
    const report: ReferenceAnalysisReport = {
      exportedAt: '2026-07-16T00:00:00.000Z',
      drawing: 'opening-test.png',
      wall: null,
      openings: [
        {
          kind: 'window',
          rect: { x: 1, y: 2, width: 30, height: 20 },
          cropWidth: 30,
          cropHeight: 20,
          sourceCropWidth: 30,
          sourceCropHeight: 20,
          orientation: 'horizontal',
          bwMode: 'adaptive',
          skewCorrectedDeg: 0,
          primaryBlob: null,
          combinedFacePolygon: [
            { x: 2, y: 2 },
            { x: 26, y: 2 },
            { x: 26, y: 16 },
            { x: 2, y: 16 },
          ],
          combinedFacePolygons: [
            [
              { x: 2, y: 2 },
              { x: 26, y: 2 },
              { x: 26, y: 16 },
              { x: 2, y: 16 },
            ],
            [
              { x: 4, y: 4 },
              { x: 10, y: 4 },
              { x: 10, y: 8 },
              { x: 4, y: 8 },
            ],
          ],
          units: [
            {
              unit: {
                index: 0,
                areaPx: 300,
                bbox: { x: 0, y: 0, width: 30, height: 20 },
                centroid: { x: 15, y: 10 },
                isPrimary: true,
                source: 'kozijn_span',
                includesBothHeads: true,
              },
              lineProfile: { lines: [], parallelCount: 0, perpCount: 0, arcCount: 0, otherCount: 0 },
              faceProfile: { faces: [], totalAreaPx: 0, faceCount: 0 },
              facePolygons: [
                {
                  label: 7,
                  role: 'interior',
                  areaPx: 120,
                  approxPolygon: [
                    { x: 3, y: 3 },
                    { x: 12, y: 3 },
                    { x: 12, y: 16 },
                    { x: 3, y: 16 },
                  ],
                },
              ],
              primitives: {
                kopeinde: false,
                kozijnLinks: null,
                kozijnRechts: null,
                kozijnTotaalOppervlakPx: null,
                draaicirkel: undefined,
              },
            },
          ],
          images: {
            originalCropPng: 'data:image/png;base64,aaa',
            bwCropPng: 'data:image/png;base64,bbb',
            faceOverlayPng: 'data:image/png;base64,ccc',
            faceCropPng: 'data:image/png;base64,ddd',
            lineOverlayPng: 'data:image/png;base64,eee',
            straightenedPng: 'data:image/png;base64,fff',
            facePolygonOverlayPng: 'data:image/png;base64,ggg',
            combinedPolygonOverlayPng: 'data:image/png;base64,hhh',
            groupedPolygonCleanPng: 'data:image/png;base64,iii',
          },
          combinedFacePolygonParts: [
            {
              zone: 'on_axis',
              polygon: [
                { x: 2, y: 2 },
                { x: 26, y: 2 },
                { x: 26, y: 16 },
                { x: 2, y: 16 },
              ],
            },
            {
              zone: 'above',
              polygon: [
                { x: 4, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 2 },
                { x: 4, y: 2 },
              ],
            },
          ],
        },
      ],
    }
    const html = buildReferenceAnalysisHtml(report)
    expect(html).toContain('Face-polygonen unit #0')
    expect(html).toContain('Gegroepeerde contouren op faces')
    expect(html).toContain('Gegroepeerde contouren los')
    expect(html).toContain('combinedFacePolygons')
    expect(html).toContain('label 7 (interior)')
  })
})
