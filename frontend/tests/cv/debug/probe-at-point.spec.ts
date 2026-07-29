import { describe, expect, it } from 'vitest'
import {
  flattenLayersFromOutput,
  type FlattenedProbeLayers,
} from '@/cv/debug/flatten-output-layers'
import {
  formatProbeClipboardText,
  probeLayersAtPoint,
  probeLayersInRegion,
} from '@/cv/debug/probe-at-point'
import { probeFaceAtPoint, probeFacesInRegion } from '@/cv/debug/probe-faces'

const v2Layers: FlattenedProbeLayers = {
  pipelineVersion: 'v3',
  layerOrder: ['1', '8'],
  layers: {
    '1': {
      segments: [
        {
          a: { x: 100, y: 200 },
          b: { x: 150, y: 200 },
          lengthPx: 50,
        },
      ],
      junctions: [{ x: 100, y: 200, kind: 'L', angleDeg: 90 }],
    },
    '8': {
      segments: [
        {
          a: { x: 1130, y: 1220 },
          b: { x: 1132, y: 1225 },
          lengthPx: 5,
        },
      ],
      junctions: [{ x: 1131, y: 1226, kind: 'T', angleDeg: 0 }],
    },
  },
}

describe('flattenLayersFromOutput', () => {
  it('gebruikt pipelineV3Debug layer1/layer2', () => {
    const flat = flattenLayersFromOutput({
      candidates: [],
      meta: { wallPipelineVersion: 'v3', extractorId: 'geometry-lbe', elapsedMs: 1 },
      pipelineV3Debug: {
        pipelineVersion: 'v3',
        layers: {
          layer1: {
            segments: [
              { type: 'wall', a: { x: 1, y: 2 }, b: { x: 10, y: 2 }, confidence: 1 },
              { type: 'wall', a: { x: 10, y: 2 }, b: { x: 20, y: 4 }, confidence: 1 },
            ],
            junctions: [{ x: 10, y: 2, kind: 'L', angleDeg: 12 }],
          },
          layer2: {
            segments: [{ type: 'wall', a: { x: 1, y: 2 }, b: { x: 20, y: 4 }, confidence: 1 }],
            junctions: [],
          },
        },
      },
    })
    expect(flat.pipelineVersion).toBe('v3')
    expect(flat.layerOrder).toEqual(['1', '2'])
    expect(flat.layers['1']?.segments).toHaveLength(2)
    expect(flat.layers['2']?.segments).toHaveLength(1)
  })
})

describe('probe-at-point', () => {
  it('vindt segmenten en junctions bij punt', () => {
    const result = probeLayersAtPoint(v2Layers, { x: 1131, y: 1225 }, { radiusPx: 20 })
    expect(result.kind).toBe('point')
    expect(result.pipelineVersion).toBe('v3')
    expect(result.faces).toEqual([])
    expect(result.segments.some((hit) => hit.layer === '8')).toBe(true)
    expect(result.junctions.some((hit) => hit.junction.kind === 'T')).toBe(true)
  })

  it('vindt elementen in gebied', () => {
    const result = probeLayersInRegion(v2Layers, { x: 90, y: 190, width: 70, height: 20 })
    expect(result.kind).toBe('region')
    expect(result.faces).toEqual([])
    expect(result.segments.some((hit) => hit.layer === '1')).toBe(true)
    expect(result.junctions.some((hit) => hit.layer === '1')).toBe(true)
  })

  it('formatteert klembordtekst V2 met Laag 1/8 en JSON-paden', () => {
    const result = probeLayersAtPoint(v2Layers, { x: 1131, y: 1225 })
    const text = formatProbeClipboardText({
      imageName: '2D_3E.jpg',
      planSize: { width: 1384, height: 2456 },
      flowStep: 'Detectie (stap 3)',
      result,
    })
    expect(text).toContain('2D_3E.jpg')
    expect(text).toContain('Laag 8 #0')
    expect(text).toContain('layer-debug.json')
  })

  it('formatteert klembordtekst V3 met Laag 2 en JSON-paden', () => {
    const layers: FlattenedProbeLayers = {
      pipelineVersion: 'v3',
      layerOrder: ['1', '2'],
      layers: {
        '1': {
          segments: [{ a: { x: 1517, y: 1357 }, b: { x: 1517, y: 1518 }, lengthPx: 161 }],
          junctions: [{ x: 1517, y: 1518, kind: 'L', angleDeg: 30 }],
        },
        '2': {
          segments: [
            { a: { x: 1517, y: 1357 }, b: { x: 1517, y: 1518 }, lengthPx: 161 },
            { a: { x: 1534, y: 1547 }, b: { x: 1517, y: 1518 }, lengthPx: 34 },
          ],
          junctions: [{ x: 1517, y: 1518, kind: 'L', angleDeg: 30 }],
        },
      },
    }
    const result = probeLayersInRegion(layers, { x: 1457, y: 1490, width: 119, height: 77 })
    const text = formatProbeClipboardText({
      imageName: 'BouwTek11.png',
      planSize: { width: 1583, height: 2000 },
      flowStep: 'Detectie (stap 3)',
      result,
    })
    expect(text).toContain('Pipeline: v3')
    expect(text).toContain('Laag 2 #')
    expect(text).toContain('layers.layer2.segments')
    expect(text).toContain('layer-debug.json')
  })

  it('formatteert FaceID in klembordtekst', () => {
    const result = probeLayersInRegion(v2Layers, { x: 90, y: 190, width: 70, height: 20 })
    result.wallInkFaces = [
      {
        faceId: 210,
        rawLabel: 210,
        className: 'wall',
        pixelCount: 42,
        bbox: { x: 970, y: 999, width: 50, height: 8 },
      },
    ]
    result.faceSourceMissing = false
    const text = formatProbeClipboardText({
      imageName: '2D_3E.jpg',
      planSize: { width: 1384, height: 2456 },
      flowStep: 'Detectie (stap 3)',
      result,
    })
    expect(text).toContain('### Wall-ink faces')
    expect(text).toContain('FaceID 210 · wall · 42px')
    expect(text).toContain('bbox 50×8 @ (970,999)')
  })

  it('meldt ontbrekende face-labels expliciet', () => {
    const result = probeLayersAtPoint(v2Layers, { x: 10, y: 10 }, { radiusPx: 5 })
    result.faceSourceMissing = true
    const text = formatProbeClipboardText({
      imageName: '2D_3E.jpg',
      planSize: { width: 1384, height: 2456 },
      flowStep: 'Detectie (stap 3)',
      result,
    })
    expect(text).toContain('Geen face-labels beschikbaar')
    expect(text).toContain('roomClassifyState')
  })
})

describe('probe-faces', () => {
  it('lost FaceID + class op bij punt en in gebied', () => {
    const width = 8
    const height = 4
    const labelsData = new Int32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 4; x += 1) labelsData[y * width + x] = 5
      for (let x = 4; x < width; x += 1) labelsData[y * width + x] = y >= 2 ? 9 : 5
    }
    const source = {
      width,
      height,
      labelsData,
      parentMap: new Map<number, number>(),
      classificationByLabel: new Map([
        [5, 'surface' as const],
        [9, 'wall' as const],
      ]),
    }

    const at = probeFaceAtPoint(source, { x: 1, y: 1 })
    expect(at).toMatchObject({ faceId: 5, className: 'surface', pixelCount: 1 })

    const region = probeFacesInRegion(source, { x: 0, y: 0, width: 8, height: 4 })
    expect(region.map((f) => f.faceId)).toEqual([5, 9])
    expect(region[0]?.className).toBe('surface')
    expect(region[1]?.className).toBe('wall')
    expect(region[1]?.bbox).toEqual({ x: 4, y: 2, width: 4, height: 2 })
  })
})
