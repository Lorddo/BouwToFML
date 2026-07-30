/// <reference lib="webworker" />
import type { ExtractionInput, ExtractionOutput } from '@/core/extraction'
import { getExtractor, noopExtractor } from '@/core/extraction'
import { registerAllExtractors } from '@/core/extraction/register-all-extractors'
import { resetRunJournal, summarizeRunJournal, type RunJournalSummary } from '@/core/diagnostics'
import { installWorkerDomPolyfills } from '@/cv/port/canvasEnv'
import { setPipelineProgressListener } from '@/cv/pipeline/pipeline-progress'

installWorkerDomPolyfills()
registerAllExtractors()

type WorkerRequest = {
  requestId: number
  extractorId: string
  width: number
  height: number
  imageData?: ImageData
  /** Finalize gebruikt alleen classify-state — geen beeld nodig. */
  skipImage?: boolean
  input: Omit<ExtractionInput, 'image'>
}

type WorkerResponse =
  | { requestId: number; output: ExtractionOutput; journal: RunJournalSummary }
  | { requestId: number; error: string; journal: RunJournalSummary }
  | { requestId: number; progress: string }

function imageFromData(payload: WorkerRequest & { imageData: ImageData }): OffscreenCanvas {
  const canvas = new OffscreenCanvas(payload.width, payload.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Worker canvas context niet beschikbaar')
  ctx.putImageData(payload.imageData, 0, 0)
  return canvas
}

function resolveWorkerImage(payload: WorkerRequest): OffscreenCanvas {
  if (payload.skipImage || !payload.imageData) {
    return new OffscreenCanvas(Math.max(1, payload.width), Math.max(1, payload.height))
  }
  return imageFromData(payload as WorkerRequest & { imageData: ImageData })
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const payload = event.data
  setPipelineProgressListener((step) => {
    const progress: WorkerResponse = { requestId: payload.requestId, progress: step }
    self.postMessage(progress)
  })
  // Eigen module-instantie hier: het journaal reist met het antwoord mee terug (anders zouden
  // alle CV-tellers in de worker blijven hangen).
  resetRunJournal(`worker:${payload.extractorId}`)
  try {
    const plugin = getExtractor(payload.extractorId) ?? noopExtractor
    const image = resolveWorkerImage(payload)
    const output = await plugin.extract({
      ...payload.input,
      image: image,
    })
    const response: WorkerResponse = {
      requestId: payload.requestId,
      output,
      journal: summarizeRunJournal(),
    }
    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      requestId: payload.requestId,
      error: error instanceof Error ? error.message : 'Worker extractie mislukt',
      journal: summarizeRunJournal(),
    }
    self.postMessage(response)
  } finally {
    setPipelineProgressListener(null)
  }
}
