/** Mediaan van een getallenreeks; lege input geeft `fallback`. */
export function median(values: number[], fallback = 0): number {
  if (values.length === 0) return fallback
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}
