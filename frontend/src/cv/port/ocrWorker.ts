import { createWorker, type Worker } from 'tesseract.js'

export const OCR_DEFAULT_LANGUAGE = 'eng+nld'
const TESSERACT_ASSET_PREFIX = '/tesseract/'

let activeWorker: Worker | null = null
let activeLanguage = ''
const warmUpPromises = new Map<string, Promise<void>>()

export function resolveOcrLanguage(languages?: string | null): string {
  const trimmed = languages?.trim()
  return trimmed || OCR_DEFAULT_LANGUAGE
}

/** Same-origin worker/core/lang — IndexedDB-cache blijft actief (idb-keyval). */
export function getTesseractWorkerOptions(): {
  workerPath: string
  corePath: string
  langPath: string
  workerBlobURL: boolean
  gzip: boolean
} {
  const prefix = TESSERACT_ASSET_PREFIX
  return {
    workerPath: `${prefix}worker.min.js`,
    corePath: `${prefix}core`,
    langPath: `${prefix}lang`,
    workerBlobURL: false,
    gzip: true,
  }
}

async function createOcrWorker(language: string): Promise<Worker> {
  return createWorker(language, undefined, getTesseractWorkerOptions())
}

export async function getOcrWorker(language: string): Promise<Worker> {
  const resolved = resolveOcrLanguage(language)
  if (activeWorker && activeLanguage === resolved) return activeWorker
  if (activeWorker) {
    await activeWorker.terminate()
    activeWorker = null
    activeLanguage = ''
  }
  activeWorker = await createOcrWorker(resolved)
  activeLanguage = resolved
  return activeWorker
}

/** Laadt WASM + taalmodellen vóór de eerste scan (hergebruikt IndexedDB-cache). */
export function warmUpOcrWorker(language?: string | null): Promise<void> {
  const resolved = resolveOcrLanguage(language)
  const existing = warmUpPromises.get(resolved)
  if (existing) return existing

  const promise = getOcrWorker(resolved)
    .then(() => undefined)
    .catch((error) => {
      warmUpPromises.delete(resolved)
      throw error
    })
  warmUpPromises.set(resolved, promise)
  return promise
}