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
  | 'slash'
  | 'origin'
  | 'text'
  | 'text_bold'
  | 'text_italic'
  | 'text_outline'
  | 'fit'
  | 'fullscreen'
  | 'fullscreen_exit'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'clear'
  | 'check'
  | 'hinge'
  | 'swing'
  | 'grid'
  | 'dims'
  | 'mirror_h'
  | 'mirror_v'
  | 'rotate_90'
  | 'menu'
  | 'upload'
  | 'download'
  | 'sanitize'
  | 'edit'
  | 'inspect'
  | 'settings'
  | 'axis'
  | 'move'
  | 'close_menu'
  | 'close_plan'
  | 'rescale'
  | 'mirror_plan'
  | 'rotate_plan_cw'
  | 'rotate_plan_ccw'
  | 'underlay_move'
  | 'mirror_underlay'

export interface ToolbeltItem {
  id: CanvasToolId
  icon: ToolbeltIconName | string
  label: string
  showSize?: boolean
  /** Onafhankelijke aan/uit-knop — niet mutually exclusive met activeTool. */
  toggle?: boolean
}

export type InkToolId = 'eraser' | 'brush' | 'line' | 'rect'

export type FaceToolId = 'box_unknown' | 'box_wall'
