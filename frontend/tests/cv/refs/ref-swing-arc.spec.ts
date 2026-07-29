import { describe, expect, it } from 'vitest'
import { selectSwingSectorFace } from '@/cv/refs/ref-swing-arc'
import type { RefFace } from '@/cv/refs/types'

function makeFace(params: {
  label: number
  x: number
  y: number
  width: number
  height: number
  areaPx?: number
  role?: RefFace['role']
  compactness?: number
  touchesBorder?: boolean
}): RefFace {
  const cropW = 130
  const cropH = 80
  const cx = params.x + params.width / 2
  const cy = params.y + params.height / 2
  const area = params.areaPx ?? Math.max(1, Math.round(params.width * params.height * 0.7))
  return {
    label: params.label,
    areaPx: area,
    bbox: { x: params.x, y: params.y, width: params.width, height: params.height },
    centroid: { x: cx, y: cy },
    relativeCentroid: { x: cx / cropW, y: cy / cropH },
    inkRatio: 0.1,
    aspectRatio:
      Math.max(params.width, params.height) / Math.max(1, Math.min(params.width, params.height)),
    compactness: params.compactness ?? 0.5,
    touchesBorder: params.touchesBorder ?? false,
    role: params.role ?? 'interior',
  }
}

/** Linker + rechter kozijn → kopeinde-asband rond y≈8..17. */
function kozijnPair(): RefFace[] {
  return [
    makeFace({ label: 1, x: 4, y: 8, width: 4, height: 10, areaPx: 32, role: 'interior' }),
    makeFace({ label: 2, x: 120, y: 8, width: 4, height: 10, areaPx: 32, role: 'interior' }),
  ]
}

describe('selectSwingSectorFace', () => {
  it('kiest below-wedge i.p.v. full-width kamerblob (Project4-achtig)', () => {
    const cropW = 130
    const cropH = 80
    const faces: RefFace[] = [
      ...kozijnPair(),
      // As-rails (on_axis)
      makeFace({
        label: 3,
        x: 12,
        y: 10,
        width: 100,
        height: 3,
        areaPx: 280,
        role: 'interior',
        compactness: 0.85,
      }),
      // Full-width blob (zou area-rank winnen) — on_axis / bovenste helft
      makeFace({
        label: 4,
        x: 0,
        y: 0,
        width: 130,
        height: 36,
        areaPx: 4915,
        role: 'outside',
        touchesBorder: true,
      }),
      // Echte boog onder de as-band
      makeFace({
        label: 5,
        x: 28,
        y: 22,
        width: 86,
        height: 24,
        areaPx: 1072,
        role: 'interior',
      }),
    ]
    // relativeCentroid.y moet > 0.32 voor wedge; herbereken t.o.v. crop
    const swing = faces.find((f) => f.label === 5)!
    swing.relativeCentroid = { x: 0.55, y: 0.42 }
    const blob = faces.find((f) => f.label === 4)!
    blob.relativeCentroid = { x: 0.5, y: 0.22 }

    const pick = selectSwingSectorFace(faces, cropW, cropH)
    expect(pick).not.toBeNull()
    expect(pick!.face.label).toBe(5)
    expect(pick!.face.areaPx).toBe(1072)
  })

  it('face boven as-band wint niet als below bestaat', () => {
    const cropW = 130
    const cropH = 80
    const above = makeFace({
      label: 10,
      x: 20,
      y: 0,
      width: 90,
      height: 28,
      areaPx: 2200,
      role: 'interior',
    })
    above.relativeCentroid = { x: 0.5, y: 0.12 }
    const below = makeFace({
      label: 11,
      x: 30,
      y: 24,
      width: 80,
      height: 22,
      areaPx: 1009,
      role: 'interior',
    })
    below.relativeCentroid = { x: 0.5, y: 0.45 }
    const faces = [...kozijnPair(), above, below]
    const pick = selectSwingSectorFace(faces, cropW, cropH)
    expect(pick).not.toBeNull()
    expect(pick!.face.label).toBe(11)
  })

  it('zonder kopeinde-band: full-width wijkt voor smallere wedge', () => {
    const cropW = 130
    const cropH = 80
    // Geen 2 kozijnen → band null → all-faces + full-width reject
    const fullWidth = makeFace({
      label: 20,
      x: 0,
      y: 20,
      width: 130,
      height: 40,
      areaPx: 4000,
      role: 'outside',
      touchesBorder: true,
    })
    fullWidth.relativeCentroid = { x: 0.5, y: 0.5 }
    const wedge = makeFace({
      label: 21,
      x: 25,
      y: 28,
      width: 85,
      height: 26,
      areaPx: 1100,
      role: 'interior',
    })
    wedge.relativeCentroid = { x: 0.5, y: 0.5 }
    const pick = selectSwingSectorFace([fullWidth, wedge], cropW, cropH)
    expect(pick).not.toBeNull()
    expect(pick!.face.label).toBe(21)
  })

  it('zonder kopeinde-band en alleen full-width kandidaat: blijft die (geen crash)', () => {
    const cropW = 100
    const cropH = 60
    const only = makeFace({
      label: 30,
      x: 5,
      y: 20,
      width: 70,
      height: 28,
      areaPx: 1400,
      role: 'interior',
    })
    only.relativeCentroid = { x: 0.4, y: 0.55 }
    const pick = selectSwingSectorFace([only], cropW, cropH)
    expect(pick).not.toBeNull()
    expect(pick!.face.label).toBe(30)
  })
})
