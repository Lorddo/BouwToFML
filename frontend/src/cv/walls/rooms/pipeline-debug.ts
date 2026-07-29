import type { ExtractionOutput, PipelineV3Debug, PipelineWallDebug } from '@/core/extraction/types'

/** Prefer V3 debug blob (only active wall pipeline). */
export function resolveActivePipelineDebug(
  output: ExtractionOutput | null | undefined,
): PipelineWallDebug | undefined {
  return output?.pipelineV3Debug
}

export type { PipelineV3Debug }
