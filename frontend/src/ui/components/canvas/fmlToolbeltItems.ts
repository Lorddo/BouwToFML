import { tGlobal } from '@/ui/i18n'
import type { ToolbeltItem } from './canvas-toolbelt.types'

export type FmlToolId =
  'box_select' | 'measure' | 'nulpunt' | 'draw_wall' | 'draw_room' | 'add_door' | 'add_window'

export function getFmlSelectTools(): ToolbeltItem[] {
  return [
    { id: 'box_select', icon: 'rect', label: tGlobal('toolbelt.fml.boxSelect') },
    { id: 'measure', icon: 'ruler', label: tGlobal('toolbelt.fml.measure') },
    { id: 'nulpunt', icon: 'origin', label: tGlobal('toolbelt.fml.nulpunt') },
  ]
}

export function getFmlEditTools(): ToolbeltItem[] {
  return [
    { id: 'draw_wall', icon: 'wall', label: tGlobal('toolbelt.fml.drawWall') },
    { id: 'draw_room', icon: 'room', label: tGlobal('toolbelt.fml.drawRoom') },
    { id: 'add_door', icon: 'door', label: tGlobal('toolbelt.fml.addDoor') },
    { id: 'add_window', icon: 'window', label: tGlobal('toolbelt.fml.addWindow') },
  ]
}

/** @deprecated Prefer getFmlSelectTools() so locale updates apply. */
export const FML_SELECT_TOOLS: ToolbeltItem[] = getFmlSelectTools()

/** @deprecated Prefer getFmlEditTools() so locale updates apply. */
export const FML_EDIT_TOOLS: ToolbeltItem[] = getFmlEditTools()
