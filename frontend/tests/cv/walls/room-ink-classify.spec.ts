import { describe, expect, it } from 'vitest'
import {
  classifyFacesByInkCoverage,
  classifyFaceLabelsSubset,
  cycleFaceClassification,
  resolveExteriorClassForAffectedLabel,
  applyFaceClassificationOverrides,
  remapClassificationForParentMap,
  resolvePixelClassification,
  toWallPipelineClass,
  mapClassesForWallPipeline,
  pickDoorOverrides,
  pickWindowOverrides,
  pickDoorframeOverrides,
  isWallMaskClass,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

function component(label: number, areaPx: number, touchesBorder = false): RasterRoomComponent {
  return {
    label,
    areaPx,
    touchesBorder,
    bbox: { x: 0, y: 0, width: 1, height: 1 },
  }
}

describe('classifyFacesByInkCoverage', () => {
  it('classificeert lage inkt-dekking als surface', () => {
    const labelsData = new Int32Array([
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ])
    const referenceData = new Uint8Array([
      0, 0, 255, 255, 255,
      255, 255, 255, 255, 255,
    ])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [component(1, 10)],
      parentMap: new Map(),
      threshold: 0.8,
    })

    expect(result.classificationByLabel.get(1)).toBe('surface')
    expect(result.surfaceCount).toBe(1)
    expect(result.wallCount).toBe(0)
  })

  it('classificeert hoge inkt-dekking als wall', () => {
    const labelsData = new Int32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const referenceData = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 255, 255])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [component(1, 10)],
      parentMap: new Map(),
      threshold: 0.8,
    })
    expect(result.classificationByLabel.get(1)).toBe('wall')
    expect(result.wallCount).toBe(1)
    expect(result.surfaceCount).toBe(0)
  })

  it('classificeert exact op 80% als wall', () => {
    const labelsData = new Int32Array([1, 1, 1, 1, 1])
    const referenceData = new Uint8Array([0, 0, 0, 0, 255])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [component(1, 5)],
      parentMap: new Map(),
      threshold: 0.8,
    })
    expect(result.classificationByLabel.get(1)).toBe('wall')
  })

  it('geeft child-labels met zelfde parent één classificatie', () => {
    const labelsData = new Int32Array([
      2, 2, 3, 3,
      2, 2, 3, 3,
    ])
    const referenceData = new Uint8Array([
      0, 0, 0, 0,
      0, 0, 255, 255,
    ])
    const parentMap = new Map<number, number>([
      [2, 1],
      [3, 1],
    ])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [component(1, 8), component(2, 4), component(3, 4)],
      parentMap,
      threshold: 0.8,
    })
    expect(result.classificationByLabel.get(1)).toBe('surface')
    expect(result.classificationByLabel.get(2)).toBeUndefined()
    expect(result.classificationByLabel.get(3)).toBeUndefined()
  })

  it('component mode: merged siblings krijgen eigen classificatie', () => {
    const labelsData = new Int32Array([
      2, 2, 3, 3,
      2, 2, 3, 3,
    ])
    const referenceData = new Uint8Array([
      255, 255, 0, 0,
      255, 255, 255, 255,
    ])
    const parentMap = new Map<number, number>([
      [2, 1],
      [3, 1],
    ])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [component(1, 8), component(2, 4), component(3, 4)],
      parentMap,
      threshold: 0.8,
      groupBy: 'component',
    })
    expect(result.classificationByLabel.get(2)).toBe('surface')
    expect(result.classificationByLabel.get(3)).toBe('surface')
    expect(result.classificationByLabel.get(1)).toBeUndefined()
  })

  it('omsloten micro-vlak wordt nooit buiten (zonder merge naar rand-parent)', () => {
    const labelsData = new Int32Array([
      1, 1, 1, 1,
      3, 3, 2, 2,
      3, 3, 2, 2,
    ])
    const referenceData = new Uint8Array([
      255, 255, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [
        component(1, 4, true),
        component(2, 4, false),
        component(3, 4, false),
      ],
      parentMap: new Map(),
      threshold: 0.8,
    })
    expect(result.classificationByLabel.get(3)).not.toBe('outside')
    expect(result.classificationByLabel.get(1)).toBe('outside')
  })

  it('component mode: erft touchesBorder van merged groep', () => {
    const labelsData = new Int32Array([
      2, 2, 3, 3,
      2, 2, 3, 3,
    ])
    const referenceData = new Uint8Array([
      0, 0, 0, 0,
      0, 0, 0, 0,
    ])
    const parentMap = new Map<number, number>([
      [2, 1],
      [3, 1],
    ])
    const result = classifyFacesByInkCoverage({
      labelsData,
      referenceData,
      components: [
        component(1, 8, true),
        component(2, 4, false),
        component(3, 4, false),
      ],
      parentMap,
      threshold: 0.8,
      groupBy: 'component',
    })
    expect(result.classificationByLabel.get(2)).toBe('outside')
    expect(result.classificationByLabel.get(3)).toBe('outside')
  })
})

describe('classifyFaceLabelsSubset', () => {
  it('behoudt frozen labels en autoclass alleen geraakte', () => {
    const labelsData = new Int32Array([
      1, 1, 2, 2,
      1, 1, 2, 2,
    ])
    const referenceData = new Uint8Array([
      0, 0, 255, 255,
      0, 0, 255, 255,
    ])
    const frozen = new Map<number, 'wall' | 'surface'>([
      [1, 'surface'],
      [2, 'surface'],
    ])

    const result = classifyFaceLabelsSubset({
      labelsData,
      referenceData,
      components: [component(1, 4), component(2, 4)],
      parentMap: new Map(),
      width: 4,
      height: 2,
      threshold: 0.8,
      groupBy: 'component',
      affectedLabels: new Set([1]),
      frozenClassification: frozen,
    })

    expect(result.classificationByLabel.get(1)).toBe('wall')
    expect(result.classificationByLabel.get(2)).toBe('surface')
  })

  it('zet ontbrekend affected label op unknown', () => {
    const labelsData = new Int32Array([1, 1, 0, 0])
    const referenceData = new Uint8Array([255, 255, 255, 255])
    const result = classifyFaceLabelsSubset({
      labelsData,
      referenceData,
      components: [component(1, 2)],
      parentMap: new Map(),
      width: 4,
      height: 1,
      threshold: 0.8,
      groupBy: 'component',
      affectedLabels: new Set([99]),
      frozenClassification: new Map([[1, 'surface']]),
    })

    expect(result.classificationByLabel.get(1)).toBe('surface')
    expect(result.classificationByLabel.get(99)).toBe('unknown')
  })

  it('classificeert border-face correct met expliciete beeldbreedte', () => {
    const width = 100
    const height = 1
    const labelsData = new Int32Array(width)
    for (let x = 0; x < 10; x += 1) labelsData[x] = 1
    for (let x = 10; x < width; x += 1) labelsData[x] = 2

    const referenceData = new Uint8Array(width).fill(255)
    referenceData[0] = 0
    referenceData[1] = 0

    const result = classifyFaceLabelsSubset({
      labelsData,
      referenceData,
      components: [
        { label: 1, areaPx: 10, bbox: { x: 0, y: 0, width: 10, height: 1 }, touchesBorder: true },
        { label: 2, areaPx: 90, bbox: { x: 10, y: 0, width: 90, height: 1 }, touchesBorder: true },
      ],
      parentMap: new Map(),
      width,
      height,
      threshold: 0.8,
      groupBy: 'component',
      affectedLabels: new Set([1]),
      frozenClassification: new Map([[2, 'surface']]),
    })

    expect(result.classificationByLabel.get(1)).toBe('outside')
    expect(result.classificationByLabel.get(2)).toBe('surface')
  })

  it('buiten-split fragment erft outside van prior topologie', () => {
    const width = 8
    const height = 1
    const labelsData = new Int32Array([3, 3, 1, 1, 1, 1, 1, 1])
    const priorLabels = new Int32Array([1, 1, 1, 1, 1, 1, 1, 1])
    const priorEffective = new Map<number, 'wall' | 'surface' | 'outside'>([
      [1, 'outside'],
    ])
    const componentsByLabel = new Map([
      [
        3,
        {
          label: 3,
          areaPx: 2,
          bbox: { x: 0, y: 0, width: 2, height: 1 },
          touchesBorder: false,
        },
      ],
      [
        1,
        {
          label: 1,
          areaPx: 6,
          bbox: { x: 2, y: 0, width: 6, height: 1 },
          touchesBorder: true,
        },
      ],
    ])

    const cls = resolveExteriorClassForAffectedLabel({
      label: 3,
      component: componentsByLabel.get(3)!,
      autoclass: 'surface',
      labelsData,
      width,
      height,
      componentsByLabel,
      frozenClassification: new Map([[1, 'outside']]),
      priorLabels,
      priorEffectiveClass: priorEffective,
    })

    expect(cls).toBe('outside')
  })

  it('afgescheiden pocket wordt surface i.p.v. outside', () => {
    const width = 10
    const height = 1
    const labelsData = new Int32Array([1, 1, 0, 3, 3, 3, 3, 0, 1, 1])
    const priorLabels = new Int32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const priorEffective = new Map<number, 'wall' | 'surface' | 'outside'>([
      [1, 'outside'],
    ])
    const componentsByLabel = new Map([
      [
        3,
        {
          label: 3,
          areaPx: 4,
          bbox: { x: 3, y: 0, width: 4, height: 1 },
          touchesBorder: false,
        },
      ],
      [
        1,
        {
          label: 1,
          areaPx: 4,
          bbox: { x: 0, y: 0, width: 2, height: 1 },
          touchesBorder: true,
        },
      ],
    ])

    const cls = resolveExteriorClassForAffectedLabel({
      label: 3,
      component: componentsByLabel.get(3)!,
      autoclass: 'surface',
      labelsData,
      width,
      height,
      componentsByLabel,
      frozenClassification: new Map([[1, 'outside']]),
      priorLabels,
      priorEffectiveClass: priorEffective,
    })

    expect(cls).toBe('surface')
  })
})

describe('cycleFaceClassification', () => {
  it('wisselt wall ↔ unknown', () => {
    expect(cycleFaceClassification('wall')).toBe('unknown')
    expect(cycleFaceClassification('unknown')).toBe('wall')
  })

  it('zet surface naar wall', () => {
    expect(cycleFaceClassification('surface')).toBe('wall')
  })

  it('zet door naar unknown (daarna wall ↔ unknown)', () => {
    expect(cycleFaceClassification('door')).toBe('unknown')
  })

  it('zet window naar wall', () => {
    expect(cycleFaceClassification('window')).toBe('wall')
  })

  it('zet doorframe naar wall', () => {
    expect(cycleFaceClassification('doorframe')).toBe('wall')
  })
})

describe('toWallPipelineClass', () => {
  it('map door naar unknown; window/doorframe naar wall; overige classes blijven', () => {
    expect(toWallPipelineClass('door')).toBe('unknown')
    expect(toWallPipelineClass('window')).toBe('wall')
    expect(toWallPipelineClass('doorframe')).toBe('wall')
    expect(toWallPipelineClass('wall')).toBe('wall')
    expect(toWallPipelineClass('unknown')).toBe('unknown')
    expect(toWallPipelineClass('surface')).toBe('surface')
    expect(toWallPipelineClass('outside')).toBe('outside')
  })

  it('isWallMaskClass: wall + window + doorframe in mask; door niet', () => {
    expect(isWallMaskClass('wall')).toBe(true)
    expect(isWallMaskClass('window')).toBe(true)
    expect(isWallMaskClass('doorframe')).toBe(true)
    expect(isWallMaskClass('door')).toBe(false)
    expect(isWallMaskClass('unknown')).toBe(false)
    expect(isWallMaskClass('surface')).toBe(false)
    expect(isWallMaskClass('outside')).toBe(false)
  })

  it('mapClassesForWallPipeline + pickDoor/Window/DoorframeOverrides', () => {
    const input = new Map<number, RoomRasterClass>([
      [1, 'door'],
      [2, 'wall'],
      [3, 'unknown'],
      [4, 'window'],
      [5, 'doorframe'],
    ])
    const mapped = mapClassesForWallPipeline(input)
    expect(mapped.get(1)).toBe('unknown')
    expect(mapped.get(2)).toBe('wall')
    expect(mapped.get(3)).toBe('unknown')
    expect(mapped.get(4)).toBe('wall')
    expect(mapped.get(5)).toBe('wall')
    expect([...pickDoorOverrides(input).entries()]).toEqual([[1, 'door']])
    expect([...pickWindowOverrides(input).entries()]).toEqual([[4, 'window']])
    expect([...pickDoorframeOverrides(input).entries()]).toEqual([[5, 'doorframe']])
  })
})

describe('applyFaceClassificationOverrides', () => {
  it('overschrijft alleen opgegeven roots', () => {
    const base = new Map([[1, 'wall' as const], [2, 'surface' as const]])
    const merged = applyFaceClassificationOverrides(base, new Map([[2, 'unknown']]))
    expect(merged.get(1)).toBe('wall')
    expect(merged.get(2)).toBe('unknown')
  })
})

describe('remapClassificationForParentMap', () => {
  it('behoudt wall-classificatie na merge onder nieuwe root', () => {
    const components = [
      component(1, 100),
      component(2, 4),
    ]
    const priorParentMap = new Map<number, number>()
    const parentMap = new Map<number, number>([[2, 1]])
    const classificationByLabel = new Map([
      [1, 'surface' as const],
      [2, 'wall' as const],
    ])

    const remapped = remapClassificationForParentMap({
      classificationByLabel,
      components,
      priorParentMap,
      parentMap,
    })

    expect(remapped.get(1)).toBe('wall')
  })
})

describe('resolvePixelClassification', () => {
  it('valt terug op surface i.p.v. outside bij onbekende root', () => {
    expect(
      resolvePixelClassification(5, new Map([[5, 3]]), new Map(), 'merged'),
    ).toBe('surface')
  })
})
