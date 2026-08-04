import { tGlobal } from '@/ui/i18n'
import type { FaceToolId, InkToolId } from './canvas-toolbelt.types'

export function resolveInkToolbeltHint(tool: InkToolId): string {
  const suffix = tGlobal('toolbelt.hints.panZoomSuffix')
  switch (tool) {
    case 'brush':
      return `${tGlobal('toolbelt.hints.inkBrush')}${suffix}`
    case 'eraser':
      return `${tGlobal('toolbelt.hints.inkEraser')}${suffix}`
    case 'line':
      return `${tGlobal('toolbelt.hints.inkLine')}${suffix}`
    case 'rect':
      return `${tGlobal('toolbelt.hints.inkRect')}${suffix}`
  }
}

export function resolveFaceToolbeltHint(tool: FaceToolId): string {
  const suffix = tGlobal('toolbelt.hints.panZoomSuffix')
  if (tool === 'box_unknown') {
    return `${tGlobal('toolbelt.hints.faceUnknown')}${suffix}`
  }
  return `${tGlobal('toolbelt.hints.faceWall')}${suffix}`
}
