/** Bepaal welke face-labels geraakt zijn door inkt/gum-wijzigingen. */

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

/**
 * BFS-dilatatie vanuit diff-seeds — O(diffOppervlak × margin), niet O(beeld × margin).
 */
export function dilateDiffMask(params: {
  diffMask: Uint8Array
  width: number
  height: number
  marginPx: number
}): Uint8Array {
  const { diffMask, width, height } = params
  const margin = Math.max(0, Math.round(params.marginPx))
  const impact = new Uint8Array(diffMask)
  if (margin === 0) return impact

  let frontier: number[] = []
  for (let i = 0; i < diffMask.length; i += 1) {
    if (diffMask[i]) frontier.push(i)
  }
  if (frontier.length === 0) return impact

  for (let pass = 0; pass < margin; pass += 1) {
    const nextFrontier: number[] = []
    for (const idx of frontier) {
      const cx = idx % width
      const cy = (idx / width) | 0
      for (let dir = 0; dir < 4; dir += 1) {
        const nx = cx + CARDINAL_DX[dir]
        const ny = cy + CARDINAL_DY[dir]
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighbor = ny * width + nx
        if (impact[neighbor]) continue
        impact[neighbor] = 1
        nextFrontier.push(neighbor)
      }
    }
    if (nextFrontier.length === 0) break
    frontier = nextFrontier
  }

  return impact
}

function collectLabelsInMask(labelsData: Int32Array, impactMask: Uint8Array): Set<number> {
  const labels = new Set<number>()
  for (let i = 0; i < labelsData.length; i += 1) {
    if (!impactMask[i]) continue
    const label = labelsData[i] ?? 0
    if (label > 0) labels.add(label)
  }
  return labels
}

function collectLabelSet(labelsData: Int32Array): Set<number> {
  const labels = new Set<number>()
  for (const label of labelsData) {
    if (label > 0) labels.add(label)
  }
  return labels
}

/**
 * Labels die door inkt-diff geraakt zijn en opnieuw geclassificeerd moeten worden.
 * Ongeraakte labels blijven frozen (incl. handmatige overrides).
 */
export function collectAffectedFaceLabels(params: {
  labelsData: Int32Array
  priorLabels: Int32Array
  diffMask: Uint8Array
  marginPx: number
  width: number
  height: number
}): Set<number> {
  const { labelsData, priorLabels, diffMask, width, height } = params
  const impactMask = dilateDiffMask({
    diffMask,
    width,
    height,
    marginPx: params.marginPx,
  })

  const affected = new Set<number>([
    ...collectLabelsInMask(labelsData, impactMask),
    ...collectLabelsInMask(priorLabels, impactMask),
  ])
  const priorLabelSet = collectLabelSet(priorLabels)
  const currentLabelSet = collectLabelSet(labelsData)

  for (const label of currentLabelSet) {
    if (!priorLabelSet.has(label)) affected.add(label)
  }
  for (const label of priorLabelSet) {
    if (!currentLabelSet.has(label)) affected.add(label)
  }

  return affected
}

/** Verwijder labels die niet meer in topologie bestaan. */
export function pruneStaleLabelMaps(params: {
  labelsData: Int32Array
  classificationByLabel: Map<number, unknown>
  faceOverrides: Map<number, unknown>
  pinnedRoots: Set<number>
}): void {
  const existing = new Set<number>()
  for (const label of params.labelsData) {
    if (label > 0) existing.add(label)
  }
  for (const label of [...params.classificationByLabel.keys()]) {
    if (!existing.has(label)) params.classificationByLabel.delete(label)
  }
  for (const label of [...params.faceOverrides.keys()]) {
    if (!existing.has(label)) params.faceOverrides.delete(label)
  }
  for (const label of [...params.pinnedRoots]) {
    if (!existing.has(label)) params.pinnedRoots.delete(label)
  }
}
