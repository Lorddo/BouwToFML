/** Stage-px config voor Konva underlay (groep: flip-as + rotatie-as). */
export type FmlUnderlayStageGeom = {
  /** Buitenste groep: linker rand (verticaal midden) — scaleX −1 spiegelt hierover. */
  flip: { x: number; y: number; scaleX: number }
  /** Binnenste groep: midden van de plaat t.o.v. de linkerrand — rotatie om het center. */
  rotate: { x: number; y: number; rotation: number }
  /** Image t.o.v. het rotate-center. */
  image: { x: number; y: number; width: number; height: number }
}

const ROTATION_EPS_DEG = 0.001

/**
 * Plaats underlay in stage-ruimte.
 * Rotatie altijd om het midden; spiegel altijd over de linker rand (zodat de hoek blijft).
 */
export function buildUnderlayStageGeom(params: {
  topLeftStage: { x: number; y: number }
  widthStage: number
  heightStage: number
  rotationDeg?: number | null
  flipX?: boolean | null
}): FmlUnderlayStageGeom {
  const { topLeftStage, widthStage, heightStage, rotationDeg, flipX } = params
  const rot = rotationDeg ?? 0
  const mirror = flipX === true
  return {
    flip: {
      x: topLeftStage.x,
      y: topLeftStage.y + heightStage / 2,
      scaleX: mirror ? -1 : 1,
    },
    rotate: {
      x: widthStage / 2,
      y: 0,
      rotation: Math.abs(rot) >= ROTATION_EPS_DEG ? rot : 0,
    },
    image: {
      x: -widthStage / 2,
      y: -heightStage / 2,
      width: widthStage,
      height: heightStage,
    },
  }
}

export type UnderlayContentBounds = {
  minX: number
  minY: number
  spanX: number
  spanY: number
}

/** FML-cm bbox van de onderlegger (rotatie-AABB + optionele spiegel over de linkerrand). */
export function underlayContentBoundsCm(params: {
  cmOrigin: { x: number; y: number } | null
  underlayWidthPx: number
  underlayHeightPx: number
  pxPerMmX: number
  pxPerMmY: number
  rotationDeg?: number | null
  flipX?: boolean | null
}): UnderlayContentBounds | null {
  const { underlayWidthPx, underlayHeightPx, pxPerMmX, pxPerMmY } = params
  if (!(underlayWidthPx > 0) || !(underlayHeightPx > 0)) return null
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) return null
  const origin = params.cmOrigin ?? { x: 0, y: 0 }
  const widthCm = underlayWidthPx / pxPerMmX / 10
  const heightCm = underlayHeightPx / pxPerMmY / 10
  if (!(widthCm > 0) || !(heightCm > 0)) return null
  const minX = origin.x === 0 ? 0 : -origin.x
  const minY = origin.y === 0 ? 0 : -origin.y
  const rot = params.rotationDeg ?? 0
  let spanX = widthCm
  let spanY = heightCm
  let boxMinX = minX
  let boxMinY = minY
  if (Math.abs(rot) >= ROTATION_EPS_DEG) {
    const rad = (rot * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    spanX = widthCm * cos + heightCm * sin
    spanY = widthCm * sin + heightCm * cos
    const cx = minX + widthCm / 2
    const cy = minY + heightCm / 2
    boxMinX = cx - spanX / 2
    boxMinY = cy - spanY / 2
  }
  if (params.flipX === true) {
    const left = minX
    const boxMaxX = boxMinX + spanX
    boxMinX = 2 * left - boxMaxX
  }
  return { minX: boxMinX, minY: boxMinY, spanX, spanY }
}
