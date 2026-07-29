import { describe, expect, it } from 'vitest'
import { buildFaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { prepareOpeningPipeDual } from '@/cv/walls/rooms/opening-pipe-dual'
import {
  extractWallInkComponents,
  mergeOpeningWhiteWithWallInk,
} from '@/cv/walls/rooms/opening-white-space'
import {
  DOOR_SPACE_POLICY,
  buildDoorMergedForPipe,
  runDoorSwingFilter,
} from '@/cv/doors'

describe('door dual-space policy + merge', () => {
  it('DOOR_SPACE_POLICY defaults: Stage1 white measure; cluster ink; rescue Either ink|white', () => {
    expect(DOOR_SPACE_POLICY.stage1Measure).toBe('white')
    expect(DOOR_SPACE_POLICY.stage1ClusterBridge).toBe('ink')
    expect(DOOR_SPACE_POLICY.wallRescueMeasure).toBe('ink')
    expect(DOOR_SPACE_POLICY.wallRescueMatchSpaces).toEqual(['ink', 'white'])
    expect(DOOR_SPACE_POLICY.wallFillMeasure).toBe('ink')
    expect(DOOR_SPACE_POLICY.surroundLabels).toBe('ink')
    expect(DOOR_SPACE_POLICY.wallTouchLabels).toBe('ink')
    expect(DOOR_SPACE_POLICY.bridgeBetweenWalls).toBe('ink')
    expect(DOOR_SPACE_POLICY.resolvePaint).toBe('ink')
    expect(DOOR_SPACE_POLICY.overlayPaint).toBe('ink')
    expect(DOOR_SPACE_POLICY.refSwingMeasure).toBe('white')
    expect(DOOR_SPACE_POLICY.refFramingMeasure).toBe('ink')
    expect(DOOR_SPACE_POLICY.angleRescueMeasurePrefer).toBe('white')
  })

  it('buildDoorMergedForPipe: opening white area; wall rescue uses ink geom', () => {
    const width = 5
    const height = 3
    const raw = new Int32Array(width * height)
    raw[1 * width + 1] = 1
    raw[1 * width + 2] = 1
    raw[0 * width + 0] = 2
    const ink = new Int32Array(width * height)
    ink[1 * width + 1] = 1
    ink[1 * width + 2] = 1
    ink[0 * width + 0] = 2
    ink[0 * width + 1] = 2
    ink[1 * width + 0] = 2

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'surface'],
        [2, 'wall'],
      ]),
    })

    expect(dual.geom(1, DOOR_SPACE_POLICY.stage1Measure)?.areaPx).toBe(2)
    expect(dual.geom(2, DOOR_SPACE_POLICY.wallRescueMeasure)?.areaPx).toBe(3)

    const merged = buildDoorMergedForPipe(dual)
    const wallComp = merged.components.find((c) => c.label === 2)
    const surfaceComp = merged.components.find((c) => c.label === 1)
    expect(surfaceComp?.areaPx).toBe(2)
    expect(wallComp?.areaPx).toBe(3)
    expect(merged.classificationByLabel.get(2)).toBe('wall')
    expect(merged.parentMap).toBe(dual.white.parentMap)

    // Bit-gelijk aan handmatige white+ink merge (oude unpack-pad).
    const inkSpace = dual.space(DOOR_SPACE_POLICY.wallRescueMeasure)
    const wallInk = extractWallInkComponents({
      labelsData: inkSpace.labelsData,
      width: inkSpace.width,
      height: inkSpace.height,
      classificationByLabel: inkSpace.classificationByLabel,
      parentMap: inkSpace.parentMap,
    })
    const legacyComponents = mergeOpeningWhiteWithWallInk({
      whiteComponents: dual.white.components,
      wallInkComponents: wallInk,
    })
    expect(merged.components.map((c) => [c.label, c.areaPx])).toEqual(
      legacyComponents.map((c) => [c.label, c.areaPx]),
    )
  })

  it('prepareOpeningPipeDual: white adjacency herbonden; ink geom stabiel; Stage-1 filter OK', () => {
    const width = 4
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    raw[1] = 2
    const inkLabels = new Int32Array(width * height)
    inkLabels[0] = 1
    inkLabels[1] = 2
    inkLabels[2] = 2
    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: inkLabels,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'surface'],
        [2, 'surface'],
      ]),
    })
    const inkAreaBefore = dual.ink.byId.get(2)?.areaPx
    const merged = buildDoorMergedForPipe(dual)
    const { pipeDual } = prepareOpeningPipeDual(dual, merged)
    expect(pipeDual.white.adjacency).toBeInstanceOf(Map)
    expect(pipeDual.ink.byId.get(2)?.areaPx).toBe(inkAreaBefore)
    expect(pipeDual.geom(1, DOOR_SPACE_POLICY.stage1Measure)?.areaPx).toBe(
      dual.geom(1, 'white')?.areaPx,
    )

    const filtered = runDoorSwingFilter({
      components: merged.components,
      parentMap: pipeDual.white.parentMap,
      classificationByLabel: pipeDual.white.classificationByLabel,
      refBands: [{ aspectRef: 2, swingWpx: 70, swingHpx: 35, areaPx: 800 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
      adjacency: pipeDual.white.adjacency,
    })
    expect(filtered.stats.rootCount).toBeGreaterThanOrEqual(1)
  })
})
