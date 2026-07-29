export type CanvasToolId = string

export interface ToolbeltItem {
  id: CanvasToolId
  icon: string
  label: string
  showSize?: boolean
}

export type InkToolId = 'eraser' | 'brush' | 'line' | 'rect'

export type FaceToolId = 'box_unknown' | 'box_wall'
