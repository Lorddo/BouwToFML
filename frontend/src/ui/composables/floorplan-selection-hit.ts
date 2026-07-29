import type { SelectionRect } from '@/platform/selection'

export function findSelectionRectAt(
  point: { x: number; y: number },
  rects: SelectionRect[],
): SelectionRect | null {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const rect = rects[i]
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      return rect
    }
  }
  return null
}
