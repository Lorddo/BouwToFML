import type { Worker } from 'tesseract.js'
import type { OcrTextCandidate } from '@/core/extraction'
import {
  filterAndMergeOcrHits,
  type OcrScanPass,
  type OcrWordHit,
} from '@/cv/port/ocrTextFilters'
import { getOcrWorker } from '@/cv/port/ocrWorker'

function asBoundingBox(word: any): OcrTextCandidate | null {
  if (!word?.bbox) return null
  const x0 = Number(word.bbox.x0 ?? 0)
  const y0 = Number(word.bbox.y0 ?? 0)
  const x1 = Number(word.bbox.x1 ?? 0)
  const y1 = Number(word.bbox.y1 ?? 0)
  const width = Math.max(0, x1 - x0)
  const height = Math.max(0, y1 - y0)
  const text = String(word.text ?? '').trim()
  const confidence = Number(word.confidence ?? 0)
  if (!text || width < 2 || height < 2) return null
  return { x: x0, y: y0, width, height, text, confidence }
}

function unionCandidates(words: OcrTextCandidate[]): OcrTextCandidate | null {
  if (words.length === 0) return null
  const x0 = Math.min(...words.map((w) => w.x))
  const y0 = Math.min(...words.map((w) => w.y))
  const x1 = Math.max(...words.map((w) => w.x + w.width))
  const y1 = Math.max(...words.map((w) => w.y + w.height))
  const text = words
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join('')
  const confidence =
    words.reduce((sum, w) => sum + w.confidence, 0) / Math.max(1, words.length)
  if (!text) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, text, confidence }
}

function flattenWords(resultData: any): OcrTextCandidate[] {
  const directWords = Array.isArray(resultData?.words) ? resultData.words : []
  if (directWords.length > 0) {
    return directWords
      .map(asBoundingBox)
      .filter((word: OcrTextCandidate | null): word is OcrTextCandidate => word !== null)
  }

  const blocks = Array.isArray(resultData?.blocks) ? resultData.blocks : []
  const words: OcrTextCandidate[] = []
  for (const block of blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : []
    for (const paragraph of paragraphs) {
      const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : []
      for (const line of lines) {
        const lineWords = Array.isArray(line?.words) ? line.words : []
        const parsed = lineWords
          .map(asBoundingBox)
          .filter((word: OcrTextCandidate | null): word is OcrTextCandidate => word !== null)
        if (parsed.length >= 2) {
          const merged = unionCandidates(parsed)
          if (merged) words.push(merged)
        }
        words.push(...parsed)
      }
    }
  }
  return words
}

function rotateCanvasForOcr(
  source: HTMLCanvasElement,
  rotation: 90 | 270,
): {
  canvas: HTMLCanvasElement
  mapBack: (word: OcrTextCandidate) => OcrTextCandidate
} {
  const rotated = document.createElement('canvas')
  rotated.width = source.height
  rotated.height = source.width
  const ctx = rotated.getContext('2d')
  if (!ctx) {
    return {
      canvas: source,
      mapBack: (word) => word,
    }
  }

  if (rotation === 90) {
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(source, 0, 0)
    return {
      canvas: rotated,
      mapBack: (word) => {
        const x0 = word.x
        const y0 = word.y
        const x1 = word.x + word.width
        const y1 = word.y + word.height
        const p1 = { x: y0, y: source.height - x0 }
        const p2 = { x: y1, y: source.height - x1 }
        const minX = Math.min(p1.x, p2.x)
        const maxX = Math.max(p1.x, p2.x)
        const minY = Math.min(p1.y, p2.y)
        const maxY = Math.max(p1.y, p2.y)
        return { ...word, x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      },
    }
  }

  ctx.translate(0, rotated.height)
  ctx.rotate(-Math.PI / 2)
  ctx.drawImage(source, 0, 0)
  return {
    canvas: rotated,
    mapBack: (word) => {
      const x0 = word.x
      const y0 = word.y
      const x1 = word.x + word.width
      const y1 = word.y + word.height
      const p1 = { x: source.width - y0, y: x0 }
      const p2 = { x: source.width - y1, y: x1 }
      const minX = Math.min(p1.x, p2.x)
      const maxX = Math.max(p1.x, p2.x)
      const minY = Math.min(p1.y, p2.y)
      const maxY = Math.max(p1.y, p2.y)
      return { ...word, x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    },
  }
}

function tagWords(words: OcrTextCandidate[], pass: OcrScanPass): OcrWordHit[] {
  return words.map((word) => ({ ...word, pass }))
}

async function recognizeWords(params: {
  worker: Worker
  image: HTMLCanvasElement
  mode: 'general' | 'numbers'
  pageSegMode?: string
}): Promise<OcrTextCandidate[]> {
  const config: Record<string, string> = {}
  if (params.pageSegMode) {
    config.tessedit_pageseg_mode = params.pageSegMode
  }
  if (params.mode === 'numbers') {
    config.tessedit_char_whitelist = '0123456789.,-+xX/:'
    config.classify_bln_numeric_mode = '1'
  }
  const recognized = await params.worker.recognize(
    params.image,
    {},
    { blocks: true, config } as any,
  )
  return flattenWords((recognized as any).data)
}

async function recognizeWordsMultiPsm(params: {
  worker: Worker
  image: HTMLCanvasElement
  mode: 'general' | 'numbers'
  /** Horizontaal: auto + sparse; verticaal: alleen sparse. */
  verticalPass?: boolean
}): Promise<OcrTextCandidate[]> {
  if (params.verticalPass) {
    return recognizeWords({ ...params, pageSegMode: '11' })
  }
  const auto = await recognizeWords({ ...params, pageSegMode: '3' })
  const sparse = await recognizeWords({ ...params, pageSegMode: '11' })
  const merged = [...auto, ...sparse]
  const kept: OcrTextCandidate[] = []
  for (const word of merged) {
    const cx = word.x + word.width / 2
    const cy = word.y + word.height / 2
    const duplicate = kept.some((k) => {
      const dist = Math.hypot(cx - (k.x + k.width / 2), cy - (k.y + k.height / 2))
      const textSame = k.text.toLowerCase() === word.text.toLowerCase()
      return textSame && dist < 14
    })
    if (!duplicate) kept.push(word)
  }
  return kept
}

async function collectPassHits(params: {
  worker: Worker
  image: HTMLCanvasElement
  mode: 'general' | 'numbers'
  detectVertical: boolean
}): Promise<OcrWordHit[]> {
  const hits: OcrWordHit[] = []

  const horizontal = await recognizeWordsMultiPsm({
    worker: params.worker,
    image: params.image,
    mode: params.mode,
    verticalPass: false,
  })
  hits.push(...tagWords(horizontal, 'horizontal'))

  if (!params.detectVertical) return hits

  const r90 = rotateCanvasForOcr(params.image, 90)
  const r90Words = await recognizeWordsMultiPsm({
    worker: params.worker,
    image: r90.canvas,
    mode: params.mode,
    verticalPass: true,
  })
  hits.push(...r90Words.map((word) => ({ ...r90.mapBack(word), pass: 'vertical' as const })))

  const r270 = rotateCanvasForOcr(params.image, 270)
  const r270Words = await recognizeWordsMultiPsm({
    worker: params.worker,
    image: r270.canvas,
    mode: params.mode,
    verticalPass: true,
  })
  hits.push(...r270Words.map((word) => ({ ...r270.mapBack(word), pass: 'vertical' as const })))

  return hits
}

export async function collectOcrRawHits(params: {
  image: HTMLCanvasElement
  /** Optioneel grayscale-beeld (zelfde dimensies) — beter op pixel/rounded fonts. */
  grayscaleImage?: HTMLCanvasElement | null
  language: string
  mode?: 'general' | 'numbers'
  detectVertical?: boolean
}): Promise<OcrWordHit[]> {
  const worker = await getOcrWorker(params.language)
  const mode = params.mode ?? 'general'
  const detectVertical = params.detectVertical ?? false

  const allHits: OcrWordHit[] = await collectPassHits({
    worker,
    image: params.image,
    mode,
    detectVertical,
  })

  if (params.grayscaleImage) {
    const grayHits = await collectPassHits({
      worker,
      image: params.grayscaleImage,
      mode,
      detectVertical,
    })
    allHits.push(...grayHits)
  }

  return allHits
}

export function filterOcrTextCandidates(
  allHits: OcrWordHit[],
  params: {
    minConfidence: number
    mode?: 'general' | 'numbers'
    underlayMaxEdgePx?: number
  },
): OcrTextCandidate[] {
  const mode = params.mode ?? 'general'
  return filterAndMergeOcrHits(allHits, {
    minConfidence: params.minConfidence,
    mode,
    underlayMaxEdgePx: params.underlayMaxEdgePx,
  })
}
