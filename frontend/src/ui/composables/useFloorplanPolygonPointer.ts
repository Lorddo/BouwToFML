import type { PolygonPoint } from '@/cv/tools/polygon'
import { isNearPoint } from '@/cv/tools/polygon'

type Point = { x: number; y: number }

export function useFloorplanPolygonPointer(deps: {
  polygonDraftPoints: () => PolygonPoint[]
  spacePressed: () => boolean
  isPolygonMode: () => boolean
  polygonCloseThreshold: () => number
  onPolygonPoint: (x: number, y: number) => void
  onPolygonComplete: (points: PolygonPoint[]) => void
  onPolygonCancel: () => void
  onPolygonUndoPoint: () => void
}) {
  function completePolygonDraft() {
    if (deps.polygonDraftPoints().length < 3) return
    deps.onPolygonComplete([...deps.polygonDraftPoints()])
  }

  function onPolygonKeyDown(e: KeyboardEvent) {
    if (!deps.isPolygonMode() || deps.spacePressed()) return
    if (e.key === 'Escape') {
      deps.onPolygonCancel()
    } else if (e.key === 'Enter') {
      completePolygonDraft()
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      deps.onPolygonUndoPoint()
    }
  }

  /** @returns true when the click was consumed by polygon tooling */
  function onPolygonMouseDown(p: Point): boolean {
    if (!deps.isPolygonMode() || deps.spacePressed()) return false
    if (deps.polygonDraftPoints().length >= 3) {
      const first = deps.polygonDraftPoints()[0]
      if (isNearPoint(p, first, deps.polygonCloseThreshold())) {
        completePolygonDraft()
        return true
      }
    }
    deps.onPolygonPoint(p.x, p.y)
    return true
  }

  /** @returns true when dblclick completed the polygon draft */
  function onPolygonDblClick(): boolean {
    if (!deps.isPolygonMode() || deps.spacePressed()) return false
    completePolygonDraft()
    return true
  }

  return {
    completePolygonDraft,
    onPolygonKeyDown,
    onPolygonMouseDown,
    onPolygonDblClick,
  }
}
