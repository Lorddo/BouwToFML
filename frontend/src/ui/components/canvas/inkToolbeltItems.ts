import { tGlobal } from '@/ui/i18n'
import type { ToolbeltItem } from './canvas-toolbelt.types'

export function getInkToolbeltItems(): ToolbeltItem[] {
  return [
    { id: 'eraser', icon: 'eraser', label: tGlobal('toolbelt.ink.eraser'), showSize: true },
    { id: 'brush', icon: 'brush', label: tGlobal('toolbelt.ink.brush'), showSize: true },
    { id: 'line', icon: 'line', label: tGlobal('toolbelt.ink.line'), showSize: true },
    { id: 'rect', icon: 'rect', label: tGlobal('toolbelt.ink.rect'), showSize: true },
  ]
}

/** @deprecated Prefer getInkToolbeltItems() so locale updates apply. */
export const INK_TOOLBELT_ITEMS: ToolbeltItem[] = getInkToolbeltItems()
