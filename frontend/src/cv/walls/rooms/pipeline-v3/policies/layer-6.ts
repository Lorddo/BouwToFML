import type {
  ConnectorPolicy,
  WeldPolicy,
  TopologyPolicy,
  JunctionGraphPolicy,
  Layer6RepairPolicy,
} from '../engines/policy-types'
import {
  LAYER6_CONNECTOR_MAX_ITERATIONS,
  LAYER6_AXIS_CHAIN_RATIO,
  resolveLayer6Scale,
  resolveLayer6ThicknessMarginPx,
  resolveLayer6ReferencePx,
} from '../engines/connector/constants'

const layer6WeldPolicyBase: Omit<WeldPolicy, 'nearEndpointGapPx' | 'endpointEpsPx'> = {
  layerId: 6,
  repairMaxGapPx: 0,
}

const layer6TopologyPolicyBase: Omit<TopologyPolicy, 'endpointEpsPx'> = {
  layerId: 6,
  /** Kind-accept; connectivity only as debug metric if needed. */
  enforceINodeCheck: false,
  junctionSnapPx: 0,
  weldBeforeGraph: true,
}

const layer6JunctionPolicy: JunctionGraphPolicy = {
  layerId: 6,
  snapPx: 0,
  weldBeforeGraph: true,
}

export function resolveLayer6RepairPolicy(referenceWallThicknessPx?: number): Layer6RepairPolicy {
  const ref = resolveLayer6ReferencePx(referenceWallThicknessPx)
  const scale = resolveLayer6Scale(ref)
  return {
    layerId: 6,
    maxIterations: LAYER6_CONNECTOR_MAX_ITERATIONS,
    thicknessMarginPx: resolveLayer6ThicknessMarginPx(ref),
    connector: {
      layerId: 6,
      connectorMaxPx: scale.connectorMaxPx,
      armDetectMinPx: Math.max(1, Math.round(ref * 0.5)),
      maxIterations: LAYER6_CONNECTOR_MAX_ITERATIONS,
      axisChainRatio: LAYER6_AXIS_CHAIN_RATIO,
    },
    weld: {
      ...layer6WeldPolicyBase,
      nearEndpointGapPx: scale.endpointSnapPx,
      endpointEpsPx: scale.endpointSnapPx,
    },
    topology: {
      ...layer6TopologyPolicyBase,
      endpointEpsPx: scale.endpointSnapPx,
    },
    junction: { ...layer6JunctionPolicy },
  }
}

/** @deprecated Prefer resolveLayer6RepairPolicy(ref).connector — kept for static imports. */
export const layer6ConnectorPolicy: ConnectorPolicy = {
  layerId: 6,
  connectorMaxPx: resolveLayer6Scale().connectorMaxPx,
  armDetectMinPx: Math.max(1, Math.round(resolveLayer6ReferencePx() * 0.5)),
  maxIterations: LAYER6_CONNECTOR_MAX_ITERATIONS,
  axisChainRatio: LAYER6_AXIS_CHAIN_RATIO,
}
