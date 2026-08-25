import { describe, expect, it } from 'vitest'
import { pairDemoteDoorHypotheses, type DoorSwingHypothesis } from '@/cv/doors'
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

function paintFace(
  labelsData: Int32Array,
  imageWidth: number,
  imageHeight: number,
  face: FaceDef,
): void {
  for (let y = face.y; y < face.y + face.height; y += 1) {
    if (y < 0 || y >= imageHeight) continue
    for (let x = face.x; x < face.x + face.width; x += 1) {
      if (x < 0 || x >= imageWidth) continue
      labelsData[y * imageWidth + x] = face.label
    }
  }
}

function makeHyp(params: {
  id: string
  faceIds: number[]
  bbox: { x: number; y: number; width: number; height: number }
}): DoorSwingHypothesis {
  return {
    id: params.id,
    faceIds: params.faceIds,
    unionBBox: params.bbox,
    filledAreaPx: params.bbox.width * params.bbox.height,
    score: 0.9,
    source: 'single',
    matchedRefIndex: 0,
  }
}

/** Probe-achtig: H-kozijn tussen twee muren + swing eronder (kamer). */
function createFrameSwingPairScene(): {
  hypotheses: DoorSwingHypothesis[]
  components: RasterRoomComponent[]
  classificationByLabel: Map<number, RoomRasterClass>
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
} {
  const width = 220
  const height = 160
  const labelsData = new Int32Array(width * height)
  // Room above (surface), walls L/R, frame between, swing below into room.
  const faces: FaceDef[] = [
    { label: 10, x: 40, y: 20, width: 140, height: 40 }, // surface above
    { label: 17, x: 40, y: 60, width: 20, height: 30 }, // wall left
    { label: 19, x: 160, y: 60, width: 20, height: 30 }, // wall right
    { label: 268, x: 60, y: 60, width: 100, height: 24 }, // frame (between walls)
    { label: 285, x: 70, y: 84, width: 80, height: 28 }, // swing (below frame)
    { label: 11, x: 40, y: 112, width: 140, height: 30 }, // surface below
  ]
  for (const face of faces) paintFace(labelsData, width, height, face)
  const components = faces.map((face) => makeComponent(face))
  const classificationByLabel = new Map<number, RoomRasterClass>([
    [10, 'surface'],
    [11, 'surface'],
    [17, 'wall'],
    [19, 'wall'],
    [268, 'door'],
    [285, 'door'],
  ])
  const hypotheses = [
    makeHyp({
      id: 'door-frame-268',
      faceIds: [268],
      bbox: { x: 60, y: 60, width: 100, height: 24 },
    }),
    makeHyp({
      id: 'door-swing-285',
      faceIds: [285],
      bbox: { x: 70, y: 84, width: 80, height: 28 },
    }),
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

describe('door-pair-demote (D-62)', () => {
  it('pair: kozijn tussen muren + adjacent swing → 1 deur + doorframe IDs', () => {
    const scene = createFrameSwingPairScene()
    const adjacency = buildLabelAdjacency({
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
    })

    const result = pairDemoteDoorHypotheses({
      hypotheses: scene.hypotheses,
      components: scene.components,
      labelsData: scene.labelsData,
      width: scene.width,
      height: scene.height,
      parentMap: scene.parentMap,
      classificationByLabel: scene.classificationByLabel,
      classificationGroupBy: 'component',
      adjacency,
    })

    expect(result.swings).toHaveLength(1)
    expect(result.swings[0]?.id).toBe('door-swing-285')
    expect(result.swings[0]?.doorframeFaceIds).toEqual([268])
    expect(result.demotedDoorframeFaceIds).toEqual([268])
    expect(result.demotedWallFaceIds).toEqual([])
    expect(result.byHypothesisId.get('door-swing-285')).toEqual([268])
  })

  it('tegenoverliggende deuren (niet adjacent) → geen paar', () => {
    const width = 240
    const height = 120
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 1, x: 20, y: 40, width: 20, height: 40 }, // wall
      { label: 2, x: 40, y: 40, width: 30, height: 40 }, // swing left
      { label: 3, x: 170, y: 40, width: 30, height: 40 }, // swing right
      { label: 4, x: 200, y: 40, width: 20, height: 40 }, // wall
      { label: 5, x: 70, y: 40, width: 100, height: 40 }, // surface between
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [1, 'wall'],
      [2, 'door'],
      [3, 'door'],
      [4, 'wall'],
      [5, 'surface'],
    ])
    const hypotheses = [
      makeHyp({ id: 'swing-l', faceIds: [2], bbox: faces[1] }),
      makeHyp({ id: 'swing-r', faceIds: [3], bbox: faces[2] }),
    ]
    const adjacency = buildLabelAdjacency({
      labelsData,
      width,
      height,
      parentMap: new Map(),
    })

    const result = pairDemoteDoorHypotheses({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel,
      adjacency,
    })

    expect(result.swings).toHaveLength(2)
    expect(result.demotedDoorframeFaceIds).toEqual([])
  })

  it('twee adjacent bogen (geen betweenWalls) → geen paar', () => {
    const width = 200
    const height = 120
    const labelsData = new Int32Array(width * height)
    // Two side-by-side swings in a room, touching a wall only on one side.
    const faces: FaceDef[] = [
      { label: 1, x: 20, y: 20, width: 160, height: 20 }, // wall top
      { label: 2, x: 40, y: 40, width: 50, height: 40 }, // swing A
      { label: 3, x: 90, y: 40, width: 50, height: 40 }, // swing B (adjacent)
      { label: 4, x: 20, y: 80, width: 160, height: 20 }, // surface
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [1, 'wall'],
      [2, 'door'],
      [3, 'door'],
      [4, 'surface'],
    ])
    const hypotheses = [
      makeHyp({ id: 'arc-a', faceIds: [2], bbox: faces[1] }),
      makeHyp({ id: 'arc-b', faceIds: [3], bbox: faces[2] }),
    ]
    const adjacency = buildLabelAdjacency({
      labelsData,
      width,
      height,
      parentMap: new Map(),
    })

    const result = pairDemoteDoorHypotheses({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel,
      adjacency,
    })

    expect(result.swings).toHaveLength(2)
    expect(result.demotedDoorframeFaceIds).toEqual([])
  })

  it('wees-kozijn tussen muren → wall (geen doorframe), geen swing', () => {
    const width = 200
    const height = 100
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 17, x: 40, y: 30, width: 20, height: 30 },
      { label: 268, x: 60, y: 30, width: 80, height: 24 },
      { label: 19, x: 140, y: 30, width: 20, height: 30 },
      { label: 10, x: 40, y: 10, width: 120, height: 20 },
      { label: 11, x: 40, y: 54, width: 120, height: 30 },
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [17, 'wall'],
      [19, 'wall'],
      [268, 'door'],
      [10, 'surface'],
      [11, 'surface'],
    ])
    const hypotheses = [
      makeHyp({
        id: 'orphan-frame',
        faceIds: [268],
        bbox: { x: 60, y: 30, width: 80, height: 24 },
      }),
    ]
    const adjacency = buildLabelAdjacency({
      labelsData,
      width,
      height,
      parentMap: new Map(),
    })

    const result = pairDemoteDoorHypotheses({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel,
      adjacency,
    })

    expect(result.swings).toHaveLength(0)
    expect(result.demotedDoorframeFaceIds).toEqual([])
    expect(result.demotedWallFaceIds).toEqual([268])
    expect(result.byHypothesisId.size).toBe(0)
  })

  it('pair: micro-wall fragments (arcering) tellen als betweenTwoWalls', () => {
    // Verticale jamb tussen micro-walls boven/onder (≤3% short-side) + swing links.
    // cardinalNeighborRoots zou micros skippen → surface; D-62 moet wallish minis wel zien.
    const width = 400
    const height = 400
    const labelsData = new Int32Array(width * height)
    const faces: FaceDef[] = [
      { label: 10, x: 40, y: 40, width: 120, height: 80 },
      { label: 234, x: 160, y: 100, width: 20, height: 50 },
      { label: 245, x: 160, y: 150, width: 20, height: 100 },
      { label: 264, x: 160, y: 250, width: 20, height: 50 },
      { label: 247, x: 120, y: 160, width: 40, height: 80 },
      { label: 11, x: 180, y: 100, width: 80, height: 200 },
    ]
    for (const face of faces) paintFace(labelsData, width, height, face)
    const components = faces.map((face) => makeComponent(face))
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [10, 'surface'],
      [11, 'surface'],
      [234, 'wall'],
      [245, 'door'],
      [264, 'wall'],
      [247, 'door'],
    ])
    const hypotheses = [
      makeHyp({
        id: 'jamb-245',
        faceIds: [245],
        bbox: { x: 160, y: 150, width: 20, height: 100 },
      }),
      makeHyp({
        id: 'swing-247',
        faceIds: [247],
        bbox: { x: 120, y: 160, width: 40, height: 80 },
      }),
    ]
    const adjacency = buildLabelAdjacency({
      labelsData,
      width,
      height,
      parentMap: new Map(),
    })

    const result = pairDemoteDoorHypotheses({
      hypotheses,
      components,
      labelsData,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel,
      adjacency,
    })

    expect(result.swings).toHaveLength(1)
    expect(result.swings[0]?.id).toBe('swing-247')
    expect(result.swings[0]?.doorframeFaceIds).toEqual([245])
    expect(result.demotedDoorframeFaceIds).toEqual([245])
    expect(result.demotedWallFaceIds).toEqual([])
  })
})
