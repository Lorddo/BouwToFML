import { describe, expect, it } from 'vitest'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  applyMergedWallChildInheritance,
  buildEffectiveComponentClassification,
  buildInkEaterLabelClassFromEffective,
  extendInkEaterClassAfterMerge,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { runRoomTopologyRefinePass, prepareRoomFinalizeState } from '@/cv/walls/rooms/room-refine-topology'

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
  touchesBorder = false,
): RasterRoomComponent {
  return { label, areaPx: bbox.width * bbox.height, bbox, touchesBorder }
}

describe('room-refine-topology', () => {
  it('manual wall override wordt eater in refine-pass', () => {
    const width = 7
    const height = 3
    const labelsData = new Int32Array([
      1, 1, 1, 0, 2, 2, 2,
      1, 1, 1, 0, 2, 2, 2,
      1, 1, 1, 0, 2, 2, 2,
    ])
    const components = [
      component(1, { x: 0, y: 0, width: 3, height: 3 }),
      component(2, { x: 4, y: 0, width: 3, height: 3 }),
    ]
    const classificationByLabel = new Map([
      [1, 'surface' as const],
      [2, 'wall' as const],
    ])
    const faceOverrides = new Map([[1, 'wall' as const]])

    const refine = runRoomTopologyRefinePass({
      components,
      rawLabelsData: labelsData,
      width,
      height,
      classificationByLabel,
      faceOverrides,
      priorParentMap: new Map(),
      referenceWallThicknessPx: 16,
    })

    const inherited = applyMergedWallChildInheritance({
      classificationByLabel,
      parentMap: refine.parentMap,
      faceOverrides,
    })
    expect(inherited.get(1)).toBe('wall')
  })

  it('tweede ink-resolve wijst inkt toe tussen manual wall faces', () => {
    const width = 5
    const height = 3
    const rawLabels = new Int32Array([
      1, 0, 2, 0, 3,
      1, 0, 2, 0, 3,
      1, 0, 2, 0, 3,
    ])
    const components = [
      component(1, { x: 0, y: 0, width: 1, height: 3 }),
      component(2, { x: 2, y: 0, width: 1, height: 3 }),
      component(3, { x: 4, y: 0, width: 1, height: 3 }),
    ]

    const refine = runRoomTopologyRefinePass({
      components,
      rawLabelsData: rawLabels,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'wall' as const],
        [2, 'surface' as const],
        [3, 'wall' as const],
      ]),
      faceOverrides: new Map([
        [1, 'wall' as const],
        [3, 'wall' as const],
      ]),
      priorParentMap: new Map(),
      referenceWallThicknessPx: 16,
    })

    expect(refine.inkResolveStats.assignedPx).toBeGreaterThan(0)
    expect(refine.labelsData[1]).toBeGreaterThan(0)
    expect(refine.labelsData[3]).toBeGreaterThan(0)
  })

  it('buildInkEaterLabelClassFromEffective respecteert overrides', () => {
    const components = [component(1, { x: 0, y: 0, width: 4, height: 4 })]
    const effective = buildEffectiveComponentClassification({
      components,
      classificationByLabel: new Map([[1, 'surface']]),
      faceOverrides: new Map([[1, 'wall']]),
      priorParentMap: new Map(),
    })
    const eaters = buildInkEaterLabelClassFromEffective(components, effective)
    expect(eaters.get(1)).toBe('wall')
  })

  it('manual override wint van touchesBorder outside-default', () => {
    const components = [component(1, { x: 0, y: 0, width: 4, height: 4 }, true)]
    const effective = buildEffectiveComponentClassification({
      components,
      classificationByLabel: new Map([[1, 'outside']]),
      faceOverrides: new Map([[1, 'wall']]),
      priorParentMap: new Map(),
    })
    expect(effective.get(1)).toBe('wall')
    const eaters = buildInkEaterLabelClassFromEffective(components, effective)
    expect(eaters.get(1)).toBe('wall')
  })

  it('extendInkEaterClassAfterMerge zet gemerged kind op wall', () => {
    const components = [
      component(1, { x: 0, y: 0, width: 2, height: 2 }),
      component(2, { x: 2, y: 0, width: 2, height: 2 }),
    ]
    const parentMap = new Map<number, number>([[2, 1]])
    const effective = new Map([
      [1, 'wall' as const],
      [2, 'surface' as const],
    ])
    const labelClass = buildInkEaterLabelClassFromEffective(components, effective)
    const extended = extendInkEaterClassAfterMerge({
      components,
      parentMap,
      labelClass,
      faceOverrides: new Map(),
      effectiveClass: effective,
    })
    expect(extended.get(2)).toBe('wall')
  })

  it('resolveMergedLabel blijft stabiel na refine parentMap', () => {
    const parentMap = new Map([
      [2, 1],
      [3, 1],
    ])
    expect(resolveMergedLabel(3, parentMap)).toBe(1)
  })

  it('manual surface override blijft in effectiveFaceOverrides', () => {
    const width = 7
    const height = 3
    const labelsData = new Int32Array([
      1, 1, 1, 0, 2, 2, 2,
      1, 1, 1, 0, 2, 2, 2,
      1, 1, 1, 0, 2, 2, 2,
    ])
    const components = [
      component(1, { x: 0, y: 0, width: 3, height: 3 }),
      component(2, { x: 4, y: 0, width: 3, height: 3 }),
    ]

    const refine = runRoomTopologyRefinePass({
      components,
      rawLabelsData: labelsData,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'wall' as const],
        [2, 'wall' as const],
      ]),
      faceOverrides: new Map([[1, 'surface' as const]]),
      priorParentMap: new Map(),
      referenceWallThicknessPx: 16,
    })

    expect(refine.effectiveFaceOverrides.get(1)).toBe('surface')
  })

  it('finalize gebruikt handmatige classificatie zonder auto ink-classify', () => {
    const width = 5
    const height = 3
    const rawLabelsData = new Int32Array([
      1, 1, 0, 2, 2,
      1, 1, 0, 2, 2,
      1, 1, 0, 2, 2,
    ])
    const priorParentMap = new Map([[3, 1]])

    const prepared = prepareRoomFinalizeState({
      classify: {
        width,
        height,
        rawLabelsData,
        parentMap: priorParentMap,
        components: [
          component(1, { x: 0, y: 0, width: 2, height: 3 }),
          component(2, { x: 3, y: 0, width: 2, height: 3 }),
        ],
        classificationByLabel: new Map([
          [1, 'surface'],
          [2, 'surface'],
        ]),
      },
      faceOverrides: new Map([[1, 'wall']]),
    })

    expect(prepared.classificationByLabel.get(1)).toBe('wall')
    expect(prepared.classificationByLabel.get(2)).toBe('surface')
    expect(prepared.labelsData[2]).toBe(1)
    expect(prepared.parentMap).toBe(priorParentMap)
  })
})
