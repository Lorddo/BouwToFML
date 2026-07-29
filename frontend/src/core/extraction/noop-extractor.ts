import type { ExtractorPlugin, ExtractionInput, ExtractionOutput } from './types'

export const noopExtractor: ExtractorPlugin = {
  capabilities: {
    id: 'noop',
    name: 'Geen extractor (stub)',
    supports: ['wall', 'door', 'window'],
    needsExamples: true,
  },
  async extract(_input: ExtractionInput): Promise<ExtractionOutput> {
    const t0 = performance.now()
    return {
      candidates: [],
      segments: [],
      masks: [],
      meta: {
        extractorId: 'noop',
        elapsedMs: performance.now() - t0,
        workScale: 1,
      },
    }
  },
}
