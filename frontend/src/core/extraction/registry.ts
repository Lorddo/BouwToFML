import type { ExtractorPlugin } from './types'
import { noopExtractor } from './noop-extractor'

const registry = new Map<string, ExtractorPlugin>()

registry.set(noopExtractor.capabilities.id, noopExtractor)

export function registerExtractor(plugin: ExtractorPlugin): void {
  registry.set(plugin.capabilities.id, plugin)
}

export function getExtractor(id: string): ExtractorPlugin | undefined {
  return registry.get(id)
}
