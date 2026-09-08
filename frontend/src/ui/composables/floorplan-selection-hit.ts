import type { SelectionRect } from '@/platform/selection'
import { pointInOrientedRect } from '@/platform/selection/oriented-rect'

export function findSelectionRectAt(
  point: { x: number; y: number },
  rects: SelectionRect[],
): SelectionRect | null {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const rect = rects[i]
    if (pointInOrientedRect(point, rect)) return rect
  }
  return null
}
