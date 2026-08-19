import type { Point2D } from '@/core/fml/types'
import type { RenderJunction } from './fml-preview-render-types'

export interface HitTestApi {
  hitTestWallAtCm: (cm: Point2D) => string | null
  hitTestDoorAtCm: (cm: Point2D) => string | null
  hitTestOpeningAtCm: (cm: Point2D) => string | null
  hitTestSurfaceAtCm: (cm: Point2D) => string | null
  hitTestAreaAtCm: (cm: Point2D) => string | null
  hitTestLabelAtCm: (cm: Point2D) => string | null
  hitTestLineAtCm: (cm: Point2D) => string | null
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  hitTestItemAtCm: (cm: Point2D) => string | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  containerRectToCmBBox: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number
    y: number
    width: number
    height: number
  } | null
}
