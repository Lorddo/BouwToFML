/**
 * L6 connector-detect — candidate DTO.
 */
import type { Segment } from '@/cv/port/wallGraph'

export interface Layer6ConnectorCandidate {
  connectorIndex: number
  hSegmentIndex: number
  vSegmentIndex: number
  lengthPx: number
  /** Chamfer-ketting T-branch: V is synthetisch langs ketting-tip i.p.v. echt segment. */
  syntheticVSegment?: Segment
  /** Expliciet branch-eindpunt (H×V-chamfer brug); anders via ketting-walk. */
  branchTipPoint?: { x: number; y: number }
}
