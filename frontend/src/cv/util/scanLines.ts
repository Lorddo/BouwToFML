/** Gelijk verdeelde scanposities tussen start en end (inclusief). */
export function sampleScanLines(start: number, end: number, count: number): number[] {
  if (end <= start) return [start]
  const n = Math.max(1, Math.min(count, end - start + 1))
  if (n === 1) return [Math.round((start + end) / 2)]
  const lines: number[] = []
  for (let i = 0; i < n; i += 1) {
    lines.push(Math.round(start + (i / (n - 1)) * (end - start)))
  }
  return lines
}
