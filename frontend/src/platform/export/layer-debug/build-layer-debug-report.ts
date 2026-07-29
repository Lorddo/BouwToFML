import type { LayerDebugReport } from './types.ts'
import { LAYER_DEBUG_VERSION } from './types.ts'
import { compareAllLayerTransitions } from './compare-layer-transition.ts'
import { enrichTransitionsWithEffects } from './classify-transition-effects.ts'

export function buildLayerDebugReportFromLayers(
  params: Omit<LayerDebugReport, 'version' | 'transitions'> & {
    transitions?: LayerDebugReport['transitions']
  },
): LayerDebugReport {
  const transitions = params.transitions ?? enrichTransitionsWithEffects(compareAllLayerTransitions(params.layers))
  return {
    version: LAYER_DEBUG_VERSION,
    ...params,
    transitions,
  }
}
