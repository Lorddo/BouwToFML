import { ref, toRaw } from 'vue'
import type { ExampleSample, ExtractionInput, ExtractionOutput } from '@/core/extraction'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import { getExtractor, noopExtractor } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { SelectionRect } from '@/platform/selection'
import {
  createWorkCanvas,
  scaleBoxesToOriginal,
  scaleBoxesToWork,
  scaleSegmentsToOriginal,
  scaleWallGraphToOriginal,
  type WorkCanvasSource,
} from '@/platform/image'
import { scaleMaskRleNearest } from '@/cv/util/binary-mask-rle'
import { formatCvError } from '@/cv/formatCvError'
import { preparePreprocessMasks, type PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import { scaleMaskToSize } from '@/cv/tools/polygon'
import { mergeRunJournalSummary, type RunJournalSummary } from '@/core/diagnostics'
import { setPipelineProgressListener } from '@/cv/pipeline/pipeline-progress'

function scaleValue(value: number | undefined, scale: number): number | undefined {
  if (value == null) return value
  if (scale >= 1) return value
  return Math.max(1, Math.round(value * scale))
}

function scaleRange(
  range: { min: number; max: number } | undefined,
  scale: number,
): { min: number; max: number } | undefined {
  if (!range) return range
  if (scale >= 1) return range
  const min = Math.max(1, Math.round(range.min * scale))
  const max = Math.max(min + 1, Math.round(range.max * scale))
  return { min, max }
}

function scaleSignatureToWork(
  signature: GeometricSignature | undefined,
  scale: number,
): GeometricSignature | undefined {
  if (!signature) return signature
  if (scale >= 1) return signature
  if (signature.wall) {
    return {
      ...signature,
      wall: {
        ...signature.wall,
        thicknessPx: scaleValue(signature.wall.thicknessPx, scale) ?? signature.wall.thicknessPx,
        parallelSpacingPx: scaleValue(signature.wall.parallelSpacingPx, scale),
        minLengthPx: scaleValue(signature.wall.minLengthPx, scale) ?? signature.wall.minLengthPx,
        closeKernelPx: scaleValue(signature.wall.closeKernelPx, scale),
        lineFingerprint: signature.wall.lineFingerprint
          ? {
              ...signature.wall.lineFingerprint,
              medianLengthPx:
                scaleValue(signature.wall.lineFingerprint.medianLengthPx, scale) ??
                signature.wall.lineFingerprint.medianLengthPx,
              spacingPx: scaleValue(signature.wall.lineFingerprint.spacingPx, scale),
            }
          : undefined,
      },
    }
  }
  if (signature.door) {
    return {
      ...signature,
      door: {
        ...signature.door,
        openingWidthPx:
          scaleRange(signature.door.openingWidthPx, scale) ?? signature.door.openingWidthPx,
        arcRadiusPx: scaleRange(signature.door.arcRadiusPx, scale),
        symbolDepthPx:
          scaleValue(signature.door.symbolDepthPx, scale) ?? signature.door.symbolDepthPx,
      },
    }
  }
  if (signature.window) {
    return {
      ...signature,
      window: {
        ...signature.window,
        openingWidthPx:
          scaleRange(signature.window.openingWidthPx, scale) ?? signature.window.openingWidthPx,
        symbolDepthPx:
          scaleValue(signature.window.symbolDepthPx, scale) ?? signature.window.symbolDepthPx,
      },
    }
  }
  return signature
}

function formatExtractionStatus(output: ExtractionOutput, effectiveEdge: number): string {
  const openings = output.candidates.length
  const walls = output.wallMatches?.length ?? output.segments?.length ?? 0
  const parts: string[] = []
  if (openings > 0) parts.push(`${openings} opening(en)`)
  if (walls > 0) parts.push(`${walls} muurmasker(s)`)
  const kernels = output.meta?.templateKernels
  if (kernels?.length) {
    parts.push(`kernel LBE: ${kernels.map((k) => `${k}px`).join(' / ')}`)
  }
  if (output.meta?.lineCount != null) {
    parts.push(`${output.meta.lineCount} lijnen`)
  }
  if (output.meta?.gapCount != null) {
    parts.push(`${output.meta.gapCount} gaps`)
  }
  if (output.meta?.textSuppressedCount) {
    parts.push(`tekstfilter: ${output.meta.textSuppressedCount}`)
  }
  if (output.meta?.ocrWordCount != null) {
    parts.push(`OCR woorden: ${output.meta.ocrWordCount}`)
  }
  if (output.meta?.wallSignatureCount != null) {
    parts.push(
      `signatures W/D/R: ${output.meta.wallSignatureCount}/${output.meta.doorSignatureCount ?? 0}/${output.meta.windowSignatureCount ?? 0}`,
    )
  }
  if (parts.length === 0) {
    return `Klaar — geen resultaten (detectie ${effectiveEdge}px)`
  }
  return `Klaar — ${parts.join(', ')} (detectie ${effectiveEdge}px)`
}

type PipelineProgress = { step: string; progress: number } | null

type WorkerRequestPayload = {
  extractorId: string
  width: number
  height: number
  imageData?: ImageData
  skipImage?: boolean
  input: Omit<ExtractionInput, 'image'>
  onProgress?: (step: string) => void
}

let cvWorker: Worker | null = null
let workerSeq = 1

function supportsCvWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function getCvWorker(): Worker {
  if (!cvWorker) {
    cvWorker = new Worker(new URL('../../cv/worker/cv-pipeline.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return cvWorker
}

/** Vue reactive proxies kunnen niet via structured clone naar een Worker. */
function deproxyForWorker<T>(value: T): T {
  const raw = toRaw(value)
  if (raw === null || typeof raw !== 'object') return raw
  if (raw instanceof ImageData) return raw
  if (ArrayBuffer.isView(raw)) return raw
  if (Array.isArray(raw)) return raw.map((item) => deproxyForWorker(item)) as T
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    result[key] = deproxyForWorker((raw as Record<string, unknown>)[key])
  }
  return result as T
}

function runExtractionInWorker(payload: WorkerRequestPayload): Promise<ExtractionOutput> {
  const worker = getCvWorker()
  const requestId = workerSeq++
  const { imageData, onProgress, ...rest } = payload
  const message = { ...deproxyForWorker(rest), requestId, imageData }
  const transfer: Transferable[] = imageData && !payload.skipImage ? [imageData.data.buffer] : []
  return new Promise((resolve, reject) => {
    const handleMessage = (
      event: MessageEvent<{
        requestId: number
        output?: ExtractionOutput
        error?: string
        progress?: string
        journal?: RunJournalSummary
      }>,
    ) => {
      if (event.data.requestId !== requestId) return
      if (event.data.progress) {
        onProgress?.(event.data.progress)
        return
      }
      worker.removeEventListener('message', handleMessage)
      if (event.data.journal) mergeRunJournalSummary(event.data.journal)
      if (event.data.error) {
        reject(new Error(event.data.error))
        return
      }
      resolve(event.data.output as ExtractionOutput)
    }
    worker.addEventListener('message', handleMessage)
    worker.postMessage(message, transfer)
  })
}

export function useExtraction(activeExtractorId = 'geometry-lbe') {
  const running = ref(false)
  const status = ref('')
  const error = ref<string | null>(null)
  const lastOutput = ref<ExtractionOutput | null>(null)
  const pipelineProgress = ref<PipelineProgress>(null)

  async function run(
    image: WorkCanvasSource,
    rects: SelectionRect[],
    preprocess: PreprocessConfig,
    detectTargets?: ExtractionInput['detectTargets'],
    masks?: PreprocessMaskInput,
    pipelineOptions?: ExtractionInput['pipelineOptions'],
  ): Promise<ExtractionOutput> {
    const plugin = getExtractor(activeExtractorId) ?? noopExtractor
    running.value = true
    error.value = null
    pipelineProgress.value = null
    status.value = `Extractie (${plugin.capabilities.name})…`

    const onPipelineProgress = (step: string) => {
      pipelineProgress.value = { step, progress: 0 }
      status.value = step
    }

    try {
      const safePipelineOptions = pipelineOptions ? deproxyForWorker(pipelineOptions) : undefined
      const canUseWorker = supportsCvWorker() && activeExtractorId === 'geometry-lbe'
      const examples: ExampleSample[] = rects.map((r) => ({
        id: r.id,
        type: r.type,
        bbox: { x: r.x, y: r.y, width: r.width, height: r.height },
        signature: r.signature,
      }))

      const work = createWorkCanvas(image)
      const workMaxDimension = Math.max(work.workWidth, work.workHeight)
      const hasPrecomposed =
        masks?.precomposedWallBw != null &&
        masks.precomposedWallBw.length === work.originalWidth * work.originalHeight
      const preparedMasks = preparePreprocessMasks({
        eraserMask: masks?.eraserMask,
        ocrMask: masks?.ocrMask,
        // OCR zit al in precomposedWallBw — niet opnieuw mergen in eraser.
        includeOcrMask: !hasPrecomposed,
        srcWidth: work.originalWidth,
        srcHeight: work.originalHeight,
        dstWidth: work.workWidth,
        dstHeight: work.workHeight,
      })
      let precomposedWallBw: Uint8Array | undefined
      if (hasPrecomposed && masks?.precomposedWallBw) {
        precomposedWallBw =
          work.scale >= 1
            ? masks.precomposedWallBw
            : scaleMaskToSize(
                masks.precomposedWallBw,
                work.originalWidth,
                work.originalHeight,
                work.workWidth,
                work.workHeight,
              )
      }
      const scaledExamples: ExampleSample[] = examples.map((e) => ({
        ...e,
        bbox: scaleBoxesToWork([e.bbox], work.scale)[0],
        signature: scaleSignatureToWork(e.signature, work.scale),
      }))

      const input: ExtractionInput = {
        image: work.canvas,
        examples: scaledExamples,
        preprocess,
        workMaxDimension,
        workScale: work.scale,
        originalWidth: work.originalWidth,
        originalHeight: work.originalHeight,
        detectTargets,
        eraserMask: preparedMasks.eraserMask,
        precomposedWallBw,
        pipelineOptions: safePipelineOptions,
      }

      let raw: ExtractionOutput
      if (canUseWorker) {
        const ctx = work.canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context niet beschikbaar voor worker-extractie.')
        const imageData = ctx.getImageData(0, 0, work.workWidth, work.workHeight)
        raw = await runExtractionInWorker({
          extractorId: activeExtractorId,
          width: work.workWidth,
          height: work.workHeight,
          imageData,
          onProgress: onPipelineProgress,
          input: {
            examples: scaledExamples,
            preprocess,
            workMaxDimension,
            workScale: work.scale,
            originalWidth: work.originalWidth,
            originalHeight: work.originalHeight,
            detectTargets,
            eraserMask: preparedMasks.eraserMask,
            precomposedWallBw,
            pipelineOptions: safePipelineOptions,
          },
        })
      } else {
        setPipelineProgressListener(onPipelineProgress)
        try {
          raw = await plugin.extract(input)
        } finally {
          setPipelineProgressListener(null)
        }
      }
      const output: ExtractionOutput = {
        ...raw,
        candidates: raw.candidates.map((c) => ({
          ...c,
          bbox: scaleBoxesToOriginal([c.bbox], work.scale)[0],
        })),
        segments: raw.segments ? scaleSegmentsToOriginal(raw.segments, work.scale) : raw.segments,
        wallGraph: raw.wallGraph
          ? scaleWallGraphToOriginal(raw.wallGraph, work.scale)
          : raw.wallGraph,
        debugRawInk: raw.debugRawInk
          ? scaleSegmentsToOriginal(raw.debugRawInk, work.scale)
          : raw.debugRawInk,
        debugSkeleton: raw.debugSkeleton
          ? scaleSegmentsToOriginal(raw.debugSkeleton, work.scale)
          : raw.debugSkeleton,
        debugLines: raw.debugLines
          ? scaleSegmentsToOriginal(raw.debugLines, work.scale)
          : raw.debugLines,
        debugGaps: raw.debugGaps
          ? raw.debugGaps.map((g) => ({
              ...g,
              ...scaleBoxesToOriginal(
                [{ x: g.x, y: g.y, width: g.width, height: g.height }],
                work.scale,
              )[0],
            }))
          : raw.debugGaps,
        pipelineV3Debug: raw.pipelineV3Debug
          ? {
              ...raw.pipelineV3Debug,
              layers: Object.fromEntries(
                Object.entries(raw.pipelineV3Debug.layers).map(([key, layer]) => {
                  if (!layer) return [key, layer]
                  const faces =
                    layer.faces && work.scale < 1
                      ? layer.faces.map((face) => ({
                          ...face,
                          bbox: scaleBoxesToOriginal([face.bbox], work.scale)[0],
                          areaPx: Math.round(face.areaPx / (work.scale * work.scale)),
                        }))
                      : layer.faces
                  return [
                    key,
                    {
                      ...layer,
                      segments: scaleSegmentsToOriginal(layer.segments, work.scale),
                      junctions: layer.junctions.map((junction) => ({
                        ...junction,
                        x: work.scale >= 1 ? junction.x : Math.round(junction.x / work.scale),
                        y: work.scale >= 1 ? junction.y : Math.round(junction.y / work.scale),
                      })),
                      ...(faces ? { faces } : {}),
                    },
                  ]
                }),
              ),
            }
          : raw.pipelineV3Debug,
        wallMatches: raw.wallMatches
          ? raw.wallMatches.map((m) => ({
              ...m,
              bbox: scaleBoxesToOriginal([m.bbox], work.scale)[0],
            }))
          : raw.wallMatches,
        roomWallMaskRle: raw.roomWallMaskRle
          ? scaleMaskRleNearest(raw.roomWallMaskRle, work.originalWidth, work.originalHeight)
          : raw.roomWallMaskRle,
        meta: {
          ...raw.meta,
          extractorId: raw.meta?.extractorId ?? plugin.capabilities.id,
          elapsedMs: raw.meta?.elapsedMs ?? 0,
          workScale: work.scale,
        },
      }
      lastOutput.value = output
      const effectiveEdge = Math.max(work.workWidth, work.workHeight)
      status.value = formatExtractionStatus(output, effectiveEdge)
      return output
    } catch (e) {
      error.value = formatCvError(e)
      status.value = ''
      throw e
    } finally {
      running.value = false
    }
  }

  return { running, status, error, lastOutput, pipelineProgress, run }
}
