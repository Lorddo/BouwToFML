import { describe, expect, it } from 'vitest'
import type { ExtractionOutput } from '@/core/extraction/types'
import {
  buildSemanticWallsForOutput,
  ensureSemanticWallsOnTabOutputs,
} from '@/cv/walls/rooms/build-semantic-walls-output'
import { emptyTabOutputs } from '@/cv/pipeline/merge-tab-outputs'

function v3ReadyOutput(
  segments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>,
): ExtractionOutput {
  return {
    candidates: [],
    meta: { extractorId: 'test', elapsedMs: 0, wallPipelineVersion: 'v3' },
    pipelineV3Debug: {
      pipelineVersion: 'v3',
      layers: {
        layer10: {
          segments: segments.map((s) => ({ type: 'wall' as const, ...s, confidence: 1 })),
          junctions: [],
        },
      },
      summary: {
        fmlReady: true,
        completedThroughLayer: 10,
        incompleteLayers: [],
        bridgeMode: 'native',
      },
    },
  }
}

describe('buildSemanticWallsForOutput', () => {
  it('gebruikt V3 L10 segmenten voor semantic graph', async () => {
    const walls = v3ReadyOutput([{ a: { x: 0, y: 20 }, b: { x: 100, y: 20 } }])

    const result = await buildSemanticWallsForOutput(walls, { force: true })

    expect(result.built).toBe(true)
    expect(result.usedLayerBFallback).toBe(false)
    expect(result.output.semanticWallGraph?.segments.length).toBe(1)
    const segment = result.output.semanticWallGraph?.segments[0]
    expect(segment?.a.y).toBe(20)
    expect(segment?.b.y).toBe(20)
    expect(segment?.b.x).toBe(100)
    expect(result.output.wallGraph).toBeDefined()
    expect(result.output.wallGraph?.edges.length).toBe(1)
    expect(result.output.wallGraph?.nodes.length).toBe(2)
    expect(segment?.junctionAId).toBe(result.output.wallGraph?.edges[0]?.a)
    expect(segment?.junctionBId).toBe(result.output.wallGraph?.edges[0]?.b)
  })

  it('bouwt graph uit L10 met meerdere collinear stukken via junction graph', async () => {
    const walls = v3ReadyOutput([
      { a: { x: 0, y: 20 }, b: { x: 50, y: 20 } },
      { a: { x: 50, y: 20 }, b: { x: 100, y: 20 } },
    ])

    const result = await buildSemanticWallsForOutput(walls, { force: true })

    expect(result.built).toBe(true)
    expect(result.output.semanticWallGraph?.segments.length).toBeGreaterThanOrEqual(1)
    const semantic = result.output.semanticWallGraph!
    const wallGraph = result.output.wallGraph!
    expect(wallGraph.edges.length).toBe(semantic.segments.length)
    expect(wallGraph.nodes.length).toBe(semantic.junctions.length)
    for (const seg of semantic.segments) {
      expect(wallGraph.edges.some((e) => e.a === seg.junctionAId && e.b === seg.junctionBId)).toBe(
        true,
      )
    }
  })

  it('slaat over zonder V3 fmlReady L10', async () => {
    const walls: ExtractionOutput = {
      candidates: [],
      meta: { extractorId: 'test', elapsedMs: 0, wallPipelineVersion: 'v3' },
      pipelineV3Debug: {
        pipelineVersion: 'v3',
        layers: {
          layer8: {
            segments: [{ type: 'wall', a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, confidence: 1 }],
            junctions: [],
          },
        },
        summary: {
          fmlReady: false,
          completedThroughLayer: 8,
          incompleteLayers: [9, 10],
          bridgeMode: 'native',
        },
      },
    }

    const result = await buildSemanticWallsForOutput(walls, { force: true })

    expect(result.built).toBe(false)
  })
})

describe('ensureSemanticWallsOnTabOutputs', () => {
  it('schrijft semantic graph terug op tabOutputs.walls', async () => {
    const walls = v3ReadyOutput([{ a: { x: 0, y: 10 }, b: { x: 80, y: 10 } }])
    const outputs = { ...emptyTabOutputs(), walls }

    const result = await ensureSemanticWallsOnTabOutputs(outputs, { force: true })

    expect(result.built).toBe(true)
    expect(result.outputs.walls?.semanticWallGraph?.segments.length).toBe(1)
    expect(result.outputs.walls).not.toBe(walls)
  })

  it('doet niets zonder walls-tab', async () => {
    const result = await ensureSemanticWallsOnTabOutputs(emptyTabOutputs(), { force: true })
    expect(result.built).toBe(false)
    expect(result.outputs.walls).toBeNull()
  })
})
