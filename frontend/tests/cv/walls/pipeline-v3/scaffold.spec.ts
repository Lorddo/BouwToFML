import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WALL_PIPELINE_VERSION,
  isWallPipelineVersion,
  loadWallPipelineVersion,
  storeWallPipelineVersion,
} from '@/platform/wall-pipeline-version'
import { layer1RawPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-1'
import { layer2JitterPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-2'
import { layer4HvPolicy, layer4WeldPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-4'
import { layer5WeldPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-5'
import { layer6ConnectorPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-6'
import { resolveLayer6Scale } from '@/cv/walls/rooms/pipeline-v3/engines/connector/constants'
import { layer7CollapsePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-7'
import { layer8HvPolicy, layer8WeldPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-8'
import { layer9CollapsePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-9'
import { resolvePipelineScale } from '@/cv/walls/rooms/pipeline-v3/engines/scale'
import {
  V3_NATIVE_THROUGH_LAYER,
  isV3FmlReady,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'
import { resolveActivePipelineDebug } from '@/cv/walls/rooms/pipeline-debug'
import { resolveFmlSourceLayer, hasFmlSemanticSource } from '@/cv/walls/rooms/build-semantic-walls-source'
import type { ExtractionOutput, PipelineV3Debug } from '@/core/extraction/types'

describe('wall-pipeline-version', () => {
  it('defaults to v3', () => {
    expect(DEFAULT_WALL_PIPELINE_VERSION).toBe('v3')
    expect(isWallPipelineVersion('v2')).toBe(false)
    expect(isWallPipelineVersion('v3')).toBe(true)
    expect(isWallPipelineVersion('v1')).toBe(false)
  })

  it('roundtrips localStorage when available', () => {
    if (typeof localStorage === 'undefined') return
    storeWallPipelineVersion('v3')
    expect(loadWallPipelineVersion()).toBe('v3')
    // Pre-cutover stale v2 is migrated to v3
    localStorage.setItem('bouwtofml.wallPipelineVersion', 'v2')
    expect(loadWallPipelineVersion()).toBe('v3')
  })
})

describe('pipeline-v3 progressive stop', () => {
  const scale30 = resolvePipelineScale(30)

  it('natively completes through L10', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBe(10)
    expect(listIncompleteLayers()).toEqual([])
    expect(isV3FmlReady()).toBe(true)
  })

  it('owns L1/L2 policies (no V2 type coupling)', () => {
    expect(layer1RawPolicy.layerId).toBe(1)
    expect(layer1RawPolicy.junctionGraphSnapPx).toBe(scale30.layer1JunctionGraphSnapPx)
    expect(layer2JitterPolicy.layerId).toBe(2)
    expect(layer2JitterPolicy.preserveMinAngleDeg).toBe(25)
    expect(layer2JitterPolicy.structuralAngleDeg).toBe(26)
    expect(layer2JitterPolicy.tArmMinBranchPx).toBe(scale30.layer2TArmMinBranchPx)
  })

  it('gives distinct layerIds and L4≠L8 weld ownership', () => {
    expect(layer4WeldPolicy.layerId).toBe(4)
    expect(layer5WeldPolicy.layerId).toBe(5)
    expect(layer8WeldPolicy.layerId).toBe(8)
    expect(layer4HvPolicy.layerId).toBe(4)
    expect(layer8HvPolicy.layerId).toBe(8)
    expect(layer8HvPolicy.postPositionSnapPx).toBe(0)
    expect(layer4HvPolicy.flatBandPx).toBe(scale30.hvBandPx)
    expect(layer8HvPolicy.prePositionSnapPx).toBe(scale30.hvPrePositionSnapPx)
  })

  it('keeps L7 stub-collapse off and L9 on', () => {
    expect(layer7CollapsePolicy.enableStubCollapse).toBe(false)
    expect(layer9CollapsePolicy.enableStubCollapse).toBe(true)
    expect(layer9CollapsePolicy.enableParallelCover).toBe(true)
  })

  it('keeps L6 connector iterations configured', () => {
    expect(layer6ConnectorPolicy.maxIterations).toBeGreaterThan(0)
    // Live L6 uses resolveLayer6Scale().armDetectPx (ref=30 → 30), not the
    // deprecated static connector policy field (ref×0.5 → 15).
    expect(resolveLayer6Scale().armDetectPx).toBeGreaterThanOrEqual(22)
    expect(layer6ConnectorPolicy.armDetectMinPx).toBe(15)
  })
})

describe('V3 FML gate', () => {
  const incompleteV3: PipelineV3Debug = {
    pipelineVersion: 'v3',
    layers: {
      layer1: { segments: [], junctions: [] },
      layer2: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer3: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer4: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer5: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer6: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer7: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer8: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
      layer9: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
    },
    summary: {
      incompleteLayers: [10],
      completedThroughLayer: 9,
      fmlReady: false,
      bridgeMode: 'native',
    },
  }

  const completeV3: PipelineV3Debug = {
    pipelineVersion: 'v3',
    layers: {
      layer10: {
        segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
        junctions: [],
      },
    },
    summary: {
      incompleteLayers: [],
      completedThroughLayer: 10,
      fmlReady: true,
      bridgeMode: 'native',
    },
  }

  it('blocks FML while V3 is incomplete (no L8/L9 fallback)', () => {
    const output = {
      pipelineV3Debug: incompleteV3,
      meta: { extractorId: 'geometry-lbe', elapsedMs: 10, wallPipelineVersion: 'v3' },
    } as ExtractionOutput
    expect(resolveFmlSourceLayer(output)).toBeUndefined()
    expect(hasFmlSemanticSource(output)).toBe(false)
  })

  it('allows FML only when V3 fmlReady + L10 segments', () => {
    const output = {
      pipelineV3Debug: completeV3,
      meta: { extractorId: 'geometry-lbe', elapsedMs: 10, wallPipelineVersion: 'v3' },
    } as ExtractionOutput
    expect(resolveFmlSourceLayer(output)?.segments).toHaveLength(1)
    expect(hasFmlSemanticSource(output)).toBe(true)
  })

  it('resolves active pipeline debug from V3 only', () => {
    const output = {
      pipelineV3Debug: incompleteV3,
    } as ExtractionOutput
    expect(resolveActivePipelineDebug(output)?.pipelineVersion).toBe('v3')
    expect(resolveActivePipelineDebug({ candidates: [], meta: { extractorId: 'x', elapsedMs: 0 } })).toBeUndefined()
  })
})
