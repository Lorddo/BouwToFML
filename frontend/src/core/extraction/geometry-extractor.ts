import type { ExtractionInput, ExtractionOutput, ExtractorPlugin } from './types'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { runGeometryPipeline } from '@/cv/pipeline/geometry-pipeline'
import { yieldToMain } from '@/platform/image'

const geometryExtractor: ExtractorPlugin = {
  capabilities: {
    id: 'geometry-lbe',
    name: 'Geometry LBE',
    supports: ['wall'],
    needsExamples: false,
  },
  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const cv = await waitForOpenCV()
    await yieldToMain()
    return runGeometryPipeline({
      cv,
      image: input.image,
      examples: input.examples,
      preprocess: input.preprocess ?? {
        brightness: 0,
        contrast: 1,
        threshold: 150,
        useAdaptive: true,
        rotate180: false,
      },
      config: {
        detectWalls: input.detectTargets?.walls !== false,
        wallStyle: input.pipelineOptions?.wallStyle,
        referenceWallThicknessPx: input.pipelineOptions?.referenceWallThicknessPx,
        bandBoundariesPx: input.pipelineOptions?.bandBoundariesPx,
        referenceWallMeasureRect: input.pipelineOptions?.referenceWallMeasureRect,
        roomInkCoverageThreshold: input.pipelineOptions?.roomInkCoverageThreshold,
        roomPipelinePhase: input.pipelineOptions?.roomPipelinePhase,
        wallPipelineVersion: input.pipelineOptions?.wallPipelineVersion,
        roomClassifyState: input.pipelineOptions?.roomClassifyState,
        faceOverrides: input.pipelineOptions?.faceOverrides,
        pinnedRoots: input.pipelineOptions?.pinnedRoots,
      },
      eraserMask: input.eraserMask,
      precomposedWallBw: input.precomposedWallBw,
      wallStampMask: input.wallStampMask,
      workScale: input.workScale ?? 1,
      originalWidth: input.originalWidth,
      originalHeight: input.originalHeight,
    })
  },
}

export function createGeometryExtractor(): ExtractorPlugin {
  return geometryExtractor
}
