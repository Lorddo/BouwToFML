import { describe, expect, it } from 'vitest'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { buildInkEaterLabelClassFromEffective } from '@/cv/walls/rooms/room-ink-classify'
import { buildInkWallMaskData } from '@/cv/walls/rooms/room-ink-wall-mask'
import { resolveInkBetweenFaces } from '@/cv/walls/rooms/room-ink-resolve'
import { demoteExteriorPocketFaces } from '@/cv/walls/rooms/room-exterior-pocket'

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
  touchesBorder = false,
): RasterRoomComponent {
  return {
    label,
    bbox,
    areaPx: bbox.width * bbox.height,
    touchesBorder,
  }
}

function fillRect(
  labels: Int32Array,
  width: number,
  rect: { x: number; y: number; width: number; height: number },
  label: number,
) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      labels[y * width + x] = label
    }
  }
}

function buildPocketScene() {
  const width = 12
  const height = 12
  const labels = new Int32Array(width * height).fill(0)
  const top = component(2, { x: 4, y: 1, width: 4, height: 3 }, true)
  const left = component(3, { x: 1, y: 4, width: 3, height: 4 }, true)
  const right = component(4, { x: 8, y: 4, width: 3, height: 4 }, true)
  const bottom = component(5, { x: 4, y: 8, width: 4, height: 3 }, true)
  const pocket = component(9, { x: 5, y: 5, width: 2, height: 2 }, false)
  const components = [top, left, right, bottom, pocket]
  for (const c of components) fillRect(labels, width, c.bbox, c.label)
  const parentMap = new Map<number, number>()
  const classes = new Map<number, RoomRasterClass>([
    [2, 'outside'],
    [3, 'outside'],
    [4, 'outside'],
    [5, 'wall'],
    [9, 'surface'],
  ])
  return { width, height, labels, components, parentMap, classes }
}

describe('demoteExteriorPocketFaces', () => {
  it('demote niet bij 3x outside + 1x wall — alle 4 zijden moeten outside zijn', () => {
    const scene = buildPocketScene()
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    expect(result.classificationByLabel.get(9)).toBe('surface')
    expect(result.demotedLabels).toHaveLength(0)
  })

  it('demote klein pocket-vlak met 4x outside', () => {
    const scene = buildPocketScene()
    scene.classes.set(5, 'outside')
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    expect(result.classificationByLabel.get(9)).toBe('outside')
    expect(result.demotedLabels).toContain(9)
  })

  it('demote niet wanneer een buur surface is', () => {
    const scene = buildPocketScene()
    scene.classes.set(4, 'surface')
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    expect(result.classificationByLabel.get(9)).toBe('surface')
    expect(result.demotedLabels).toHaveLength(0)
  })

  it('demote niet boven max bbox', () => {
    const scene = buildPocketScene()
    scene.components[4] = component(9, { x: 2, y: 2, width: 51, height: 2 }, false)
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    expect(result.classificationByLabel.get(9)).toBe('surface')
  })

  it('respecteert handmatige face override', () => {
    const scene = buildPocketScene()
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
      faceOverrides: new Map([[9, 'wall']]),
    })
    expect(result.classificationByLabel.get(9)).toBe('surface')
  })

  it('demoted pocket-inkt komt niet in muurmasker', () => {
    const scene = buildPocketScene()
    scene.classes.set(5, 'outside')
    const demoted = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    const labelClass = buildInkEaterLabelClassFromEffective(
      scene.components,
      demoted.classificationByLabel,
    )
    const resolved = resolveInkBetweenFaces({
      labelsData: scene.labels,
      components: scene.components,
      width: scene.width,
      height: scene.height,
      labelClass,
    })
    const wallMat = new Uint8Array(scene.width * scene.height).fill(255)
    wallMat[6 * scene.width + 6] = 0
    const mask = buildInkWallMaskData({
      wallMatData: wallMat,
      labelsData: resolved.labelsData,
      parentMap: scene.parentMap,
      classificationByLabel: demoted.classificationByLabel,
      width: scene.width,
      height: scene.height,
      groupBy: 'component',
      borderLabels: new Set([2, 3, 4, 5]),
    })
    expect(mask[6 * scene.width + 6]).toBe(0)
  })

  it('skip touchesBorder component', () => {
    const scene = buildPocketScene()
    scene.components[4] = component(9, { x: 0, y: 5, width: 2, height: 2 }, true)
    fillRect(scene.labels, scene.width, scene.components[4].bbox, 9)
    const result = demoteExteriorPocketFaces({
      components: scene.components,
      rawLabelsData: scene.labels,
      width: scene.width,
      height: scene.height,
      classificationByLabel: scene.classes,
      parentMap: scene.parentMap,
    })
    expect(result.classificationByLabel.get(9)).toBe('surface')
  })
})
