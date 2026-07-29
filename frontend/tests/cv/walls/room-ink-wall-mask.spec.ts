import { describe, expect, it } from 'vitest'
import { buildInkWallMaskData } from '@/cv/walls/rooms/room-ink-wall-mask'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import {
  runRoomTopologyRefinePass,
  applyTopologyRefineToClassification,
} from '@/cv/walls/rooms/room-refine-topology'

function buildMaskInput(width: number, height: number, fill = 255): Uint8Array {
  return new Uint8Array(width * height).fill(fill)
}

describe('buildInkWallMaskData', () => {
  it('sluit corridor-inkt uit wanneer resolve die aan surface toewijst', () => {
    const width = 9
    const height = 5
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x <= 2) labels[y * width + x] = 1
        else if (x >= 6) labels[y * width + x] = 2
        if (x >= 3 && x <= 5) {
          wallMat[y * width + x] = 0
          labels[y * width + x] = x <= 4 ? 1 : 2
        }
      }
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([
        [1, 1],
        [2, 2],
      ]),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
      ]),
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
    })

    for (let y = 0; y < height; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        expect(mask[y * width + x]).toBe(0)
      }
    }
  })

  it('neemt alleen inkt mee die aan wall-vlak is toegewezen', () => {
    const width = 9
    const height = 5
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x <= 2) labels[y * width + x] = 1
        else if (x >= 6) labels[y * width + x] = 2
        if (x >= 3 && x <= 5) {
          wallMat[y * width + x] = 0
          labels[y * width + x] = 9
        }
      }
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([
        [1, 1],
        [2, 2],
        [9, 9],
      ]),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
        [9, 'wall'],
      ]),
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
    })

    for (let y = 0; y < height; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        expect(mask[y * width + x]).toBe(255)
      }
    }
  })

  it('sluit maatlijn-inkt uit die aan surface is toegewezen', () => {
    const width = 9
    const height = 5
    const labels = new Int32Array(width * height).fill(1)
    const wallMat = buildMaskInput(width, height, 255)
    for (let x = 1; x <= 7; x += 1) {
      wallMat[2 * width + x] = 0
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([[1, 1]]),
      classificationByLabel: new Map<number, RoomRasterClass>([[1, 'surface']]),
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
    })

    for (let x = 1; x <= 7; x += 1) {
      expect(mask[2 * width + x]).toBe(0)
    }
  })

  it('houdt witte gap-pixels binnen wall-face in mask', () => {
    const width = 7
    const height = 5
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)
    for (let y = 1; y <= 3; y += 1) {
      labels[y * width + 3] = 9
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([[9, 9]]),
      classificationByLabel: new Map<number, RoomRasterClass>([[9, 'wall']]),
      width,
      height,
      referenceWallThicknessPx: 10,
      groupBy: 'component',
    })

    for (let y = 1; y <= 3; y += 1) {
      expect(mask[y * width + 3]).toBe(255)
    }
  })

  it('sluit door-faces uit van muurmasker (zelfde als unknown tot L11/L12)', () => {
    const width = 6
    const height = 3
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        labels[y * width + x] = 1
        wallMat[y * width + x] = 0
      }
      for (let x = 3; x < width; x += 1) {
        labels[y * width + x] = 2
        wallMat[y * width + x] = 0
      }
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([
        [1, 1],
        [2, 2],
      ]),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'wall'],
        [2, 'door'],
      ]),
      width,
      height,
      groupBy: 'component',
    })

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(mask[y * width + x]).toBe(255)
      }
      for (let x = 3; x < width; x += 1) {
        expect(mask[y * width + x]).toBe(0)
      }
    }
  })

  it('neemt window-faces mee in muurmasker (L0; deuren niet)', () => {
    const width = 6
    const height = 3
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        labels[y * width + x] = 1
        wallMat[y * width + x] = 0
      }
      for (let x = 3; x < width; x += 1) {
        labels[y * width + x] = 2
        wallMat[y * width + x] = 0
      }
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([
        [1, 1],
        [2, 2],
      ]),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'wall'],
        [2, 'window'],
      ]),
      width,
      height,
      groupBy: 'component',
    })

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        expect(mask[y * width + x]).toBe(255)
      }
    }
  })

  it('sluit inkt uit die aan surface is toegewezen ook naast muur', () => {
    const width = 10
    const height = 5
    const labels = new Int32Array(width * height).fill(2)
    const wallMat = buildMaskInput(width, height, 255)
    for (let y = 0; y < height; y += 1) {
      labels[y * width] = 1
    }
    for (let x = 1; x <= 7; x += 1) {
      wallMat[2 * width + x] = 0
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([
        [1, 1],
        [2, 2],
      ]),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'wall'],
        [2, 'surface'],
      ]),
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
    })

    for (let x = 1; x <= 7; x += 1) {
      expect(mask[2 * width + x]).toBe(0)
    }
  })

  it('sluit buitenrand-inkt uit ook wanneer resolve die aan outside toewijst', () => {
    const width = 8
    const height = 4
    const labels = new Int32Array(width * height)
    const wallMat = buildMaskInput(width, height, 255)
    for (let y = 0; y < height; y += 1) {
      labels[y * width] = 2
      labels[y * width + 1] = 2
      wallMat[y * width + 1] = 0
    }

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([[2, 2]]),
      classificationByLabel: new Map<number, RoomRasterClass>([[2, 'outside']]),
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
      borderLabels: new Set([2]),
    })

    for (let y = 0; y < height; y += 1) {
      expect(mask[y * width + 1]).toBe(0)
    }
    expect(mask[2 * width + 4]).toBe(0)
  })

  it('sluit border-face uit zelfs bij wall-classificatie', () => {
    const width = 6
    const height = 4
    const labels = new Int32Array(width * height).fill(3)
    const wallMat = buildMaskInput(width, height, 255)
    wallMat[2 * width + 2] = 0

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: labels,
      parentMap: new Map([[3, 3]]),
      classificationByLabel: new Map<number, RoomRasterClass>([[3, 'wall']]),
      width,
      height,
      groupBy: 'component',
      borderLabels: new Set([3]),
    })

    expect(mask[2 * width + 2]).toBe(0)
  })

  it('behoudt manual wall override via toegewezen wall-label', () => {
    const width = 7
    const height = 3
    const rawLabels = new Int32Array([
      1, 1, 1, 0, 2, 2, 2, 1, 1, 1, 0, 2, 2, 2, 1, 1, 1, 0, 2, 2, 2,
    ])
    const wallMat = new Uint8Array([
      255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 0, 255, 255,
      255,
    ])
    const components = [
      { label: 1, areaPx: 9, bbox: { x: 0, y: 0, width: 3, height: 3 }, touchesBorder: false },
      { label: 2, areaPx: 9, bbox: { x: 4, y: 0, width: 3, height: 3 }, touchesBorder: false },
    ]

    const refine = runRoomTopologyRefinePass({
      components,
      rawLabelsData: rawLabels,
      width,
      height,
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
      ]),
      faceOverrides: new Map<number, RoomRasterClass>([[1, 'wall']]),
      priorParentMap: new Map(),
      referenceWallThicknessPx: 12,
    })
    const lockedClassification = applyTopologyRefineToClassification({
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
      ]),
      faceOverrides: new Map<number, RoomRasterClass>([[1, 'wall']]),
      refine,
    })

    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: refine.labelsData,
      parentMap: refine.parentMap,
      classificationByLabel: lockedClassification,
      width,
      height,
      referenceWallThicknessPx: 12,
      groupBy: 'component',
    })

    expect(mask[3]).toBe(255)
    expect(mask[width + 3]).toBe(255)
    expect(mask[2 * width + 3]).toBe(255)
    expect(mask[4]).toBe(0)
    expect(mask[width + 4]).toBe(0)
    expect(mask[2 * width + 4]).toBe(0)
  })
})
