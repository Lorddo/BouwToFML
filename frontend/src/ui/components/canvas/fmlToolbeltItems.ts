import type { ToolbeltItem } from './canvas-toolbelt.types'

export type FmlToolId =
  | 'box_select'
  | 'measure'
  | 'draw_wall'
  | 'draw_room'
  | 'add_door'
  | 'add_window'

/** FML-viewer tools — volgt het canvas-toolbelt-patroon van stap 2/3. */
export const FML_SELECT_TOOLS: ToolbeltItem[] = [
  { id: 'box_select', icon: 'rect', label: 'Muren selecteren (box)' },
  { id: 'measure', icon: 'ruler', label: 'Maatlijn plaatsen' },
]

export const FML_EDIT_TOOLS: ToolbeltItem[] = [
  { id: 'draw_wall', icon: 'wall', label: 'Losse muur (2 eindpunten)' },
  { id: 'draw_room', icon: 'room', label: 'Kamer tool (4 verbonden eindpunten)' },
  { id: 'add_door', icon: 'door', label: 'Deur toevoegen' },
  { id: 'add_window', icon: 'window', label: 'Raam toevoegen' },
]
