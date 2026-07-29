import type { FaceToolId, InkToolId } from './canvas-toolbelt.types'

const PAN_ZOOM = ' · spatie + sleep = pan · scroll = zoom'

export function resolveInkToolbeltHint(tool: InkToolId): string {
  switch (tool) {
    case 'brush':
      return `Klik + sleep om inkt te tekenen${PAN_ZOOM}`
    case 'eraser':
      return `Klik + sleep om inkt te wissen${PAN_ZOOM}`
    case 'line':
      return `Sleep een lijn${PAN_ZOOM}`
    case 'rect':
      return `Sleep een rechthoek${PAN_ZOOM}`
  }
}

export function resolveFaceToolbeltHint(tool: FaceToolId): string {
  if (tool === 'box_unknown') {
    return `Sleep een box — vlakken volledig binnen de selectie worden onbekend${PAN_ZOOM}`
  }
  return `Sleep een box — vlakken volledig binnen de selectie worden muur${PAN_ZOOM}`
}
