import { describe, expect, it } from 'vitest'
import {
  findDoorBridgeWallFaces,
  type DoorSwingHypothesis,
} from '@/cv/doors'
import { buildLabelAdjacency } from '@/cv/walls/rooms/label-adjacency'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

type FaceDef = {
  label: number
  x: number
  y: number
  width: number
  height: number
}

function makeComponent(face: FaceDef): RasterRoomComponent {
  return {
    label: face.label,
    areaPx: face.width * face.height,
    bbox: { x: face.x, y: face.y, width: face.width, height: face.height },
    touchesBorder: false,
  }
}

function paintFace(labelsData: Int32Array, imageWidth: number, imageHeight: number, face: FaceDef): void {
  for (let y = face.y; y < face.y + face.height; y += 1) {
    if (y < 0 || y >= imageHeight) continue
    for (let x = face.x; x < face.x + face.width; x += 1) {
      if (x < 0 || x >= imageWidth) continue
      labelsData[y * imageWidth + x] = face.label
    }
  }
}

function createProbeScene(): {
  hypotheses: DoorSwingHypothesis[]
  components: RasterRoomComponent[]
  classificationByLabel: Map<number, RoomRasterClass>
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
} {
  const width = 240
  const height = 180
  const labelsData = new Int32Array(width * height)
  // Seed 18 raakt deur 12 (y=50); 34 raakt 18; 42 is te dik voor band.
  const faces: FaceDef[] = [
    { label: 12, x: 80, y: 20, width: 100, height: 30 },
    { label: 17, x: 68, y: 50, width: 12, height: 38 },
    { label: 19, x: 180, y: 50, width: 12, height: 38 },
    { label: 18, x: 80, y: 50, width: 100, height: 23 },
    { label: 34, x: 80, y: 73, width: 100, height: 22 },
    { label: 42, x: 80, y: 95, width: 100, height: 58 },
  ]
  for (const face of faces) {
    paintFace(labelsData, width, height, face)
  }
  const components = faces.map((face) => makeComponent(face))
  const classificationByLabel = new Map<number, RoomRasterClass>([
    [12, 'door'],
    [17, 'wall'],
    [19, 'wall'],
    [18, 'surface'],
    [34, 'surface'],
    [42, 'surface'],
  ])
  const hypotheses: DoorSwingHypothesis[] = [
    {
      id: 'door-swing-single-12',
      faceIds: [12],
      unionBBox: { x: 80, y: 20, width: 100, height: 30 },
      filledAreaPx: 3000,
      score: 0.92,
      source: 'single',
      matchedRefIndex: 0,
    },
  ]

  return {
    hypotheses,
    components,
    classificationByLabel,
    labelsData,
    width,
    height,
    parentMap: new Map(),
  }
}

describe('door-bridge-wall-promote', () => {
  it('promoot seed + in-band buur, maar niet de dikke room-face', () => {
    const scene = createProbeScene()
    const adjacency = buildLabelAdjacency({
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
    })

    const result = findDoorBridgeWallFaces({
      hypotheses: scene.hypotheses,
      components: scene.components,
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
      classificationByLabel: scene.classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
      referenceWallThicknessPx: 16,
    })

    expect(result.allFaceIds).toEqual([18, 34])
    expect(result.allFaceIds).not.toContain(42)
    expect(result.byHypothesisId.get('door-swing-single-12')).toEqual([18, 34])
  })

  it('dropt seed wanneer tweede muur-einde ontbreekt', () => {
    const scene = createProbeScene()
    scene.classificationByLabel.set(19, 'surface')
    const adjacency = buildLabelAdjacency({
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
    })

    const result = findDoorBridgeWallFaces({
      hypotheses: scene.hypotheses,
      components: scene.components,
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
      classificationByLabel: scene.classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
      referenceWallThicknessPx: 16,
    })

    expect(result.allFaceIds).toEqual([])
    expect(result.byHypothesisId.size).toBe(0)
  })

  it('promoot geen veraf face die alleen bbox-dichtbij een V-deur lijkt (2D_3E face169)', () => {
    // Geen adjacency met deur → geen seed, ook niet bij X-kolom-overlap.
    const width = 1000
    const height = 1300
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 94, x: 899, y: 489, width: 47, height: 83 },
      { label: 90, x: 880, y: 489, width: 12, height: 83 },
      { label: 91, x: 955, y: 489, width: 12, height: 83 },
      { label: 169, x: 780, y: 1101, width: 81, height: 78 },
      { label: 160, x: 780, y: 1080, width: 81, height: 12 },
      { label: 170, x: 780, y: 1185, width: 81, height: 12 },
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [94, 'door'],
      [90, 'wall'],
      [91, 'wall'],
      [169, 'unknown'],
      [160, 'wall'],
      [170, 'wall'],
    ])
    const hypotheses: DoorSwingHypothesis[] = [
      {
        id: 'door-swing-single-7',
        faceIds: [94],
        unionBBox: { x: 899, y: 489, width: 47, height: 83 },
        filledAreaPx: 2154,
        score: 0.98,
        source: 'single',
        matchedRefIndex: 1,
      },
    ]
    const parentMap = new Map<number, number>()
    const adjacency = buildLabelAdjacency({ labelsData, width, height, parentMap })

    const result = findDoorBridgeWallFaces({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap,
      classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
      referenceWallThicknessPx: 77,
    })

    expect(result.allFaceIds).not.toContain(169)
  })

  it('springt geen gap over: bbox-dichtbij zonder raken → geen promote (face169 vs single-6)', () => {
    // Deur @ y=1270; kandidaat @ y=1065 met 60px gap + tussenliggende wall-faces.
    // Oude bbox-gap seed pakte dit; adjacency-only mag niet.
    const width = 1000
    const height = 1600
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 203, x: 645, y: 1270, width: 153, height: 164 },
      { label: 200, x: 630, y: 1270, width: 12, height: 164 },
      { label: 201, x: 801, y: 1270, width: 12, height: 164 },
      { label: 180, x: 700, y: 1210, width: 100, height: 28 },
      { label: 181, x: 700, y: 1238, width: 100, height: 32 },
      { label: 169, x: 742, y: 1065, width: 148, height: 145 },
      { label: 160, x: 730, y: 1065, width: 12, height: 145 },
      { label: 170, x: 890, y: 1065, width: 12, height: 145 },
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [203, 'door'],
      [200, 'wall'],
      [201, 'wall'],
      [180, 'wall'],
      [181, 'wall'],
      [169, 'unknown'],
      [160, 'wall'],
      [170, 'wall'],
    ])
    const hypotheses: DoorSwingHypothesis[] = [
      {
        id: 'door-swing-single-6',
        faceIds: [203],
        unionBBox: { x: 645, y: 1270, width: 153, height: 164 },
        filledAreaPx: 19270,
        score: 0.98,
        source: 'single',
        matchedRefIndex: 0,
      },
    ]
    const parentMap = new Map<number, number>()
    const adjacency = buildLabelAdjacency({ labelsData, width, height, parentMap })

    expect(adjacency.get(203)?.has(169)).toBe(false)

    const result = findDoorBridgeWallFaces({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap,
      classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
      referenceWallThicknessPx: 28,
    })

    expect(result.allFaceIds).not.toContain(169)
    expect(result.allFaceIds).toEqual([])
  })

  it('koppelt sticky class=doorframe buren zonder opnieuw te promoten', () => {
    const width = 240
    const height = 120
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 12, x: 80, y: 20, width: 40, height: 80 },
      { label: 27, x: 68, y: 20, width: 12, height: 80 },
      { label: 17, x: 50, y: 20, width: 18, height: 80 },
      { label: 19, x: 120, y: 20, width: 18, height: 80 },
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [12, 'door'],
      [27, 'doorframe'],
      [17, 'wall'],
      [19, 'wall'],
    ])
    const hypotheses: DoorSwingHypothesis[] = [
      {
        id: 'door-swing-angle-rescue-12',
        faceIds: [12],
        unionBBox: { x: 80, y: 20, width: 40, height: 80 },
        filledAreaPx: 3200,
        score: 0.8,
        source: 'angle_rescue',
        matchedRefIndex: 0,
      },
    ]
    const parentMap = new Map<number, number>()
    const adjacency = buildLabelAdjacency({ labelsData, width, height, parentMap })

    const result = findDoorBridgeWallFaces({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap,
      classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
      referenceWallThicknessPx: 16,
    })

    expect(result.allFaceIds).toEqual([])
    expect(result.byHypothesisId.get('door-swing-angle-rescue-12')).toEqual([27])
  })
})
