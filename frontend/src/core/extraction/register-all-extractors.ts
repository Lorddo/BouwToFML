import { registerExtractor } from './registry'
import { createGeometryExtractor } from './geometry-extractor'

let registered = false

/** Registreer CV-extractors — aanroepen in main thread én Web Worker. */
export function registerAllExtractors(): void {
  if (registered) return
  registerExtractor(createGeometryExtractor())
  registered = true
}
