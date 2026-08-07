import type { RefBBox, RefFace, RefPoint } from './types'

export type SwingHingeAxis = {
  a: RefPoint
  b: RefPoint
  angleDeg: number
  supportLength: number
}

export type SwingHingeResult = {
  hinge: RefPoint
  axes: [SwingHingeAxis, SwingHingeAxis]
  angleDeg: number
  sectorPolygon: RefPoint[]
  sectorBBox: RefBBox
}

type WallAxisAlignment = 'h' | 'v'

export type SwingHingeOptions = {
  axisBandPx?: number
  minSeedLenPx?: number
  /**
   * Minimale as-hoek. Default = alleen anti-parallel (`DEGENERATE_AXIS_SEPARATION_DEG`).
   * Bij kandidaten: zet via `resolveMinAxisSeparationDeg(ref.swingAngleDeg)`.
   */
  minAxisSeparationDeg?: number
  /** Verwachte booghoek uit deur-ref; paren dichterbij deze hoek winnen. */
  expectedAngleDeg?: number
  /**
   * Voorkeur muur-as H/V (uit face-bbox: breed→h, hoog→v).
   * Straft verkeerde as zodat tip-scharnier minder snel wint.
   */
  preferredWallAxis?: WallAxisAlignment
}

export type SwingSectorFacePick = {
  face: RefFace
  cropBBox: RefBBox
  cropWidth: number
  cropHeight: number
  labels: Int32Array
  rankedFaces: RefFace[]
}

export {
  computeSwingHinge,
  hasArcLikeContour,
  resolveMinAxisSeparationDeg,
  resolveSwingHingeFromPolygon,
  SWING_HINGE_SIMPLIFY_EPS_RATIOS,
} from './ref-swing-hinge-resolve'

export { renderSwingHingeOverlayRgba } from './ref-swing-hinge-render'
