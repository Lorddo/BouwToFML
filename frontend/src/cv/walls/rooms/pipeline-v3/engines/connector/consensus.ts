function weightedAxisConsensus(arms: Array<{ axis: number; lengthPx: number }>): number | null {
  if (arms.length === 0) return null
  let sum = 0
  let weight = 0
  for (const arm of arms) {
    sum += arm.axis * arm.lengthPx
    weight += arm.lengthPx
  }
  return weight > 0 ? sum / weight : null
}

export function resolveLayer6HvConsensusTarget(
  hs: Array<{ axis: number; lengthPx: number }>,
  vs: Array<{ axis: number; lengthPx: number }>,
): { x: number; y: number } | null {
  const x = weightedAxisConsensus(vs)
  const y = weightedAxisConsensus(hs)
  if (x == null || y == null) return null
  return { x, y }
}
