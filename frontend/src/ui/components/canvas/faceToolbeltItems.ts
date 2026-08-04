import { tGlobal } from '@/ui/i18n'
import type { ToolbeltItem } from './canvas-toolbelt.types'

export function getFaceToolbeltItems(): ToolbeltItem[] {
  return [
    { id: 'box_unknown', icon: 'unknown', label: tGlobal('toolbelt.face.boxUnknown') },
    { id: 'box_wall', icon: 'wall', label: tGlobal('toolbelt.face.boxWall') },
  ]
}

/** @deprecated Prefer getFaceToolbeltItems() so locale updates apply. */
export const FACE_TOOLBELT_ITEMS: ToolbeltItem[] = getFaceToolbeltItems()
