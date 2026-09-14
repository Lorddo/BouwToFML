import type { Point2D } from '@/core/plan/types'
import type { RenderJunction } from './plan-canvas-render-types'

export interface HitTestApi {
  hitTestWallAtCm: (cm: Point2D) => string | null
  hitTestDoorAtCm: (cm: Point2D, preferId?: string | null) => string | null
  hitTestOpeningAtCm: (cm: Point2D, preferId?: string | null) => string | null
  hitTestSurfaceAtCm: (cm: Point2D) => string | null
  hitTestAreaAtCm: (cm: Point2D) => string | null
  /** Benaming-box (centroid + name_x/y), ook buiten de poly. */
  hitTestAreaNameAtCm: (cm: Point2D) => { kind: 'area' | 'surface'; id: string } | null
  hitTestLabelAtCm: (cm: Point2D) => string | null
  hitTestLineAtCm: (cm: Point2D) => string | null
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  hitTestItemAtCm: (cm: Point2D) => string | null
  /** Knoop-/dakpunt-handle in wereld-cm (18 px, touch 32 px). */
  handleHitTolCm: () => number
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  containerRectToCmBBox: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number
    y: number
    width: number
    height: number
  } | null
}
