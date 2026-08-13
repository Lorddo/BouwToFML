import { describe, expect, it } from 'vitest'
import { analyzeWindowAxelRef } from '@/cv/windows'
import type { RefFaceDualSpace, RefFaceGeom } from '@/cv/refs/ref-face-dual-space'
import type { OpeningRefProfile, RefFace, RefFaceProfile } from '@/cv/refs/types'

function makeFace(params: {
  label: number
  x: number
  y: number
  width: number
  height: number
}): RefFace {
  return {
    label: params.label,
    areaPx: params.width * params.height,
    bbox: { x: params.x, y: params.y, width: params.width, height: params.height },
    centroid: { x: params.x + params.width / 2, y: params.y + params.height / 2 },
    relativeCentroid: { x: 0.5, y: 0.5 },
    inkRatio: 0,
    aspectRatio: params.width / Math.max(1, params.height),
    compactness: 1,
    touchesBorder: false,
    role: 'interior',
    approxPolygon: [],
  }
}

function makeDual(params: {
  faces: RefFace[]
  inkOverrides: Partial<Record<number, { x: number; y: number; width: number; height: number }>>
}): RefFaceDualSpace {
  const whiteByLabel = new Map<number, RefFaceGeom>()
  const inkByLabel = new Map<number, RefFaceGeom>()
  for (const face of params.faces) {
    whiteByLabel.set(face.label, {
      label: face.label,
      bbox: { ...face.bbox },
      areaPx: face.areaPx,
      centroid: { ...face.centroid },
    })
    const ov = params.inkOverrides[face.label]
    if (ov) {
      inkByLabel.set(face.label, {
        label: face.label,
        bbox: { x: ov.x, y: ov.y, width: ov.width, height: ov.height },
        areaPx: ov.width * ov.height,
        centroid: { x: ov.x + ov.width / 2, y: ov.y + ov.height / 2 },
      })
    } else {
      inkByLabel.set(face.label, {
        label: face.label,
        bbox: { ...face.bbox },
        areaPx: face.areaPx,
        centroid: { ...face.centroid },
      })
    }
  }
  return {
    width: 100,
    height: 40,
    labelsData: new Int32Array(0),
    inkLabelsData: new Int32Array(0),
    whiteByLabel,
    inkByLabel,
    faces: params.faces,
    geom(label, prefer) {
      if (prefer === 'ink' || prefer === 'inkThenWhite') {
        return inkByLabel.get(label) ?? whiteByLabel.get(label)
      }
      return whiteByLabel.get(label) ?? inkByLabel.get(label)
    },
  }
}

function buildProfile(params: {
  faces: RefFace[]
  cropWidth?: number
  cropHeight?: number
  dual?: RefFaceDualSpace
}): OpeningRefProfile {
  const cropWidth = params.cropWidth ?? 100
  const cropHeight = params.cropHeight ?? 30
  const faceProfile: RefFaceProfile = {
    faces: params.faces,
    totalAreaPx: params.faces.reduce((sum, face) => sum + face.areaPx, 0),
    faceCount: params.faces.length,
    dual: params.dual,
  }
  return {
    kind: 'window',
    rect: { x: 0, y: 0, width: cropWidth, height: cropHeight },
    cropWidth,
    cropHeight,
    sourceCropWidth: cropWidth,
    sourceCropHeight: cropHeight,
    orientation: 'horizontal',
    bwMode: 'adaptive',
    skewCorrectedDeg: 0,
    primaryBlob: {
      index: 0,
      areaPx: 1000,
      bbox: { x: 0, y: 0, width: cropWidth, height: cropHeight },
      centroid: { x: cropWidth / 2, y: cropHeight / 2 },
      isPrimary: true,
      source: 'component',
      includesBothHeads: false,
    },
    combinedFacePolygon: [
      { x: 0, y: 0 },
      { x: cropWidth, y: 0 },
      { x: cropWidth, y: cropHeight },
    ],
    units: [
      {
        unit: {
          index: 0,
          areaPx: 1000,
          bbox: { x: 0, y: 0, width: cropWidth, height: cropHeight },
          centroid: { x: cropWidth / 2, y: cropHeight / 2 },
          isPrimary: true,
          source: 'component',
          includesBothHeads: false,
        },
        lineProfile: {
          lines: [],
          parallelCount: 0,
          perpCount: 0,
          arcCount: 0,
          otherCount: 0,
        },
        faceProfile,
        facePolygons: [],
        primitives: {
          kopeinde: false,
          kozijnLinks: null,
          kozijnRechts: null,
          kozijnTotaalOppervlakPx: null,
        },
      },
    ],
    images: {
      originalCropPng: '',
      bwCropPng: '',
      faceOverlayPng: '',
      faceCropPng: '',
      lineOverlayPng: '',
      straightenedPng: '',
    },
  }
}

describe('window-axel-ref', () => {
  it('bouwt ook zonder kozijnen een bruikbare band via top/bottom rails', () => {
    const faces = [
      makeFace({ label: 1, x: 10, y: 2, width: 80, height: 3 }), // top rail
      makeFace({ label: 2, x: 20, y: 8, width: 60, height: 3 }), // strip 1
      makeFace({ label: 3, x: 20, y: 13, width: 60, height: 3 }), // strip 2
      makeFace({ label: 4, x: 10, y: 20, width: 80, height: 3 }), // bottom rail
    ]
    const band = analyzeWindowAxelRef({ refIndex: 0, profile: buildProfile({ faces }) })
    expect(band).not.toBeNull()
    expect(band?.stripCount).toBe(2)
    expect(band?.framingSizeRange).toBeNull()
    expect(band?.topRailRange).not.toBeNull()
    expect(band?.bottomRailRange).not.toBeNull()
    const axis = band!.axisBandHeightPx
    expect(axis).toBeGreaterThan(0)
    expect(band!.targetStripHeightRatio).toBeCloseTo(band!.targetStripHeightPx / axis, 6)
    expect(band!.topRailRange!.minWidth).toBeCloseTo((80 * 0.6) / axis)
    expect(band!.topRailRange!.maxWidth).toBeCloseTo((80 * 1.4) / axis)
    expect(band!.topRailRange!.minHeight).toBeCloseTo((3 * 0.6) / axis)
    expect(band!.topRailRange!.maxHeight).toBeCloseTo((3 * 1.4) / axis)
    expect(band!.fullStripCount).toBe(4)
    expect(band!.fullStripHeightsPx).toHaveLength(4)
    expect(band!.topRailHeightPx).toBe(3)
    expect(band!.bottomRailHeightPx).toBe(3)
    // Zonder dual: geen ink-rail metrics
    expect(band!.topRailHeightInkPx).toBeNull()
    expect(band!.bottomRailHeightInkPx).toBeNull()
  })

  it('kozijnen + as-glas zonder T/B → geen top/bottom (niet as-glas als ink-rails)', () => {
    // L/R kozijnen + 2 horizontale glas-strips op de as — vroeger fallthrough → false rails.
    const faces = [
      makeFace({ label: 10, x: 2, y: 8, width: 8, height: 16 }), // L kozijn
      makeFace({ label: 11, x: 90, y: 8, width: 8, height: 16 }), // R kozijn
      makeFace({ label: 20, x: 15, y: 10, width: 70, height: 4 }), // glas
      makeFace({ label: 21, x: 15, y: 16, width: 70, height: 4 }), // glas
    ]
    const band = analyzeWindowAxelRef({
      refIndex: 0,
      profile: buildProfile({ faces, cropHeight: 32 }),
    })
    expect(band).not.toBeNull()
    expect(band!.framingSizeRange).not.toBeNull()
    expect(band!.topRailHeightPx).toBeNull()
    expect(band!.bottomRailHeightPx).toBeNull()
    expect(band!.topRailRange).toBeNull()
    expect(band!.bottomRailRange).toBeNull()
    expect(band!.topRailHeightInkPx).toBeNull()
    expect(band!.bottomRailHeightInkPx).toBeNull()
  })

  it('alleen top buiten as-band → topRail gezet, bottom null (asymmetrisch)', () => {
    // Project4-achtig: dikke top boven kozijn-band; glas on-axis; geen bottom buiten band.
    const faces = [
      makeFace({ label: 2, x: 6, y: 5, width: 178, height: 9 }), // top rail
      makeFace({ label: 10, x: 5, y: 17, width: 6, height: 9 }), // L kozijn
      makeFace({ label: 11, x: 178, y: 17, width: 6, height: 9 }), // R kozijn
      makeFace({ label: 20, x: 15, y: 17, width: 159, height: 2 }), // glas
      makeFace({ label: 21, x: 16, y: 24, width: 158, height: 2 }), // glas (nog in band)
    ]
    const dual = makeDual({
      faces,
      inkOverrides: {
        2: { x: 6, y: 4, width: 178, height: 11 },
      },
    })
    const band = analyzeWindowAxelRef({
      refIndex: 0,
      profile: buildProfile({ faces, cropWidth: 189, cropHeight: 31, dual }),
    })
    expect(band).not.toBeNull()
    expect(band!.topRailHeightPx).toBe(9)
    expect(band!.bottomRailHeightPx).toBeNull()
    expect(band!.topRailHeightInkPx).toBe(11)
    expect(band!.bottomRailHeightInkPx).toBeNull()
    expect(band!.topRailRange).not.toBeNull()
    expect(band!.bottomRailRange).toBeNull()
    expect(band!.framingSizeRange).not.toBeNull()
  })

  it('echte T/B + dual → white heights + ink heights beide aangeboden', () => {
    const faces = [
      makeFace({ label: 1, x: 10, y: 1, width: 80, height: 3 }), // top white
      makeFace({ label: 2, x: 20, y: 8, width: 60, height: 4 }), // glas
      makeFace({ label: 3, x: 10, y: 22, width: 80, height: 3 }), // bottom white
      makeFace({ label: 10, x: 2, y: 6, width: 8, height: 14 }), // L
      makeFace({ label: 11, x: 90, y: 6, width: 8, height: 14 }), // R
    ]
    const dual = makeDual({
      faces,
      inkOverrides: {
        1: { x: 10, y: 0, width: 80, height: 5 }, // ink dikker
        3: { x: 10, y: 21, width: 80, height: 5 },
      },
    })
    const band = analyzeWindowAxelRef({
      refIndex: 0,
      profile: buildProfile({ faces, cropHeight: 30, dual }),
    })
    expect(band).not.toBeNull()
    expect(band!.topRailHeightPx).toBe(3)
    expect(band!.bottomRailHeightPx).toBe(3)
    expect(band!.topRailHeightInkPx).toBe(5)
    expect(band!.bottomRailHeightInkPx).toBe(5)
    expect(band!.topRailRange).not.toBeNull()
    expect(band!.framingSizeRange).not.toBeNull()
  })

  it('3 glas-strips met overlappende AABB (na skew) → stripCount=3, niet 1', () => {
    // WhatsApp 2026-08-11: valse deskew → AABB Y-overlap; oude merge → 1 strip van 29px.
    const faces = [
      makeFace({ label: 4, x: 6, y: 27, width: 10, height: 24 }), // L kozijn
      makeFace({ label: 7, x: 276, y: 34, width: 11, height: 24 }), // R kozijn
      makeFace({ label: 5, x: 23, y: 28, width: 248, height: 12 }), // glas 1
      makeFace({ label: 9, x: 26, y: 39, width: 241, height: 7 }), // glas 2 (AABB raakt 1+3)
      makeFace({ label: 10, x: 22, y: 44, width: 248, height: 13 }), // glas 3
      makeFace({ label: 2, x: 7, y: 6, width: 280, height: 23 }), // top rail buiten as
      makeFace({ label: 13, x: 6, y: 56, width: 280, height: 25 }), // bottom rail
    ]
    // areaPx in makeFace = w*h; echte export had iets minder — voldoende voor telling.
    const band = analyzeWindowAxelRef({
      refIndex: 0,
      profile: buildProfile({ faces, cropWidth: 293, cropHeight: 99 }),
    })
    expect(band).not.toBeNull()
    expect(band!.stripCount).toBe(3)
    expect(band!.stripHeightsPx).toHaveLength(3)
    // Geen geplakte 29px-AABB: elke strip ≈ area/width (bbox-hoogte).
    expect(band!.targetStripHeightPx).toBeLessThan(20)
    expect(band!.framingSizeRange).not.toBeNull()
  })
})
