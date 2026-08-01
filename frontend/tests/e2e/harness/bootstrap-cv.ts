import { waitForOpenCV, type OpenCV } from '@/cv/loadOpenCV'

let cached: OpenCV | null = null

/** Eenmalig per process: OpenCV in Node (geen jsdom/canvas/imread). */
export async function bootstrapCv(): Promise<OpenCV> {
  if (cached) return cached
  cached = await waitForOpenCV()
  return cached
}
