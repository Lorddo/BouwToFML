export type CanvasToolId = string

/** Shared toolbelt / FML-context icon keys (`ToolbeltIcon.vue`). */
export type ToolbeltIconName =
  | 'eraser'
  | 'brush'
  | 'line'
  | 'rect'
  | 'unknown'
  | 'wall'
  | 'door'
  | 'window'
  | 'room'
  | 'delete'
  | 'split'
  | 'ruler'
  | 'origin'
  | 'fit'
  | 'undo'
  | 'copy'
  | 'clear'
  | 'hinge'
  | 'swing'

export interface ToolbeltItem {
  id: CanvasToolId
  icon: ToolbeltIconName | string
  label: string
  showSize?: boolean
}

export type InkToolId = 'eraser' | 'brush' | 'line' | 'rect'

export type FaceToolId = 'box_unknown' | 'box_wall'
