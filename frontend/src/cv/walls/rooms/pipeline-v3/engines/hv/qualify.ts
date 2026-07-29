import type { Segment } from '@/cv/port/wallGraph'
import {
  isDominantHorizontal,
  isDominantVertical,
  isFlatHorizontal,
  isFlatVertical,
} from '@/cv/walls/rooms/wall-segment-geometry'

export type HvOrientation = 'H' | 'V' | null

export function classifyHvOrientation(segment: Segment, bandPx: number): HvOrientation {
  if (isFlatHorizontal(segment, bandPx) && isDominantHorizontal(segment)) return 'H'
  if (isFlatVertical(segment, bandPx) && isDominantVertical(segment)) return 'V'
  return null
}
